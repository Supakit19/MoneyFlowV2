/**
 * Explicit LOCAL DEVELOPMENT reset. This tool is not an HTTP route.
 *
 * Default: read-only inventory. --apply requires a literal confirmation,
 * the MoneyFlow API/LINEJS Workers to be stopped, and a VERIFIED full backup.
 * Never use it against hosted or production MoneyFlow.
 *
 * Usage:
 *  bun --env-file=.env scripts/reset-local-data.ts
 *  MONEYFLOW_RESET_CONFIRM=ERASE_ALL_LOCAL_MONEYFLOW_DATA \
 *    bun --env-file=.env scripts/reset-local-data.ts --apply
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  closeSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import postgres from 'postgres';

const knownTables = [
  'users',
  'sessions',
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'recurring_rules',
  'recurring_executions',
  'line_links',
  'pair_codes',
  'line_events',
  'pending',
  'google_links',
  'line_login_challenges',
  'line_qr_oauth_challenges',
  'finance_preferences',
  'coach_alert_history',
  'daily_digest_history',
  'bank_linejs_settings',
  'bank_linejs_events',
];
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some((arg) => arg !== '--apply')) {
  console.error('Supported arguments: --apply (default is safe read-only preview)');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') throw Error('Refusing to reset production mode');
const url = new URL(process.env.DATABASE_URL || '');
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
if (!local || url.port !== '55432' || url.pathname !== '/moneyflow')
  throw Error('Refusing to reset a database outside the exact local MoneyFlow port/name');

const db = postgres(url.toString(), { max: 1, connect_timeout: 6 });
const hostedDataDirectory = process.env.LINEJS_HOSTED_DATA_DIR || '';
if (hostedDataDirectory && hostedDataDirectory !== join(homedir(), '.moneyflow-linejs-hosted')) {
  throw Error(
    'Custom hosted LINEJS directory detected; local reset refuses to overlook another session location',
  );
}
async function verifyApiIsStopped() {
  try {
    await fetch('http://127.0.0.1:3011/api/health', {
      signal: AbortSignal.timeout(1200),
    });
    throw Error('MoneyFlow API is running. Stop it and LINEJS workers before any reset');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('MoneyFlow API is running')) throw error;
    // Expected: connection refused while the development API is stopped.
  }
}
function command(name: string, args: string[], error: string, input?: Buffer) {
  const r = spawnSync(name, args, {
    input,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
  if (r.error || r.status !== 0) throw Error(error);
  return r.stdout || Buffer.alloc(0);
}
function backupFile(folder: string, file: string, args: string[]) {
  const filename = join(folder, file);
  const fd = openSync(filename, 'wx', 0o600);
  try {
    const r = spawnSync('docker', args, {
      stdio: ['ignore', fd, 'pipe'],
      timeout: 180_000,
    });
    if (r.error || r.status !== 0) throw Error('Database backup failed: nothing was erased');
  } finally {
    closeSync(fd);
  }
  if (statSync(filename).size < 100) throw Error('Database backup is empty: nothing was erased');
  const data = readFileSync(filename);
  command(
    'docker',
    ['exec', '-i', 'moneyflow-postgres', 'pg_restore', '--list'],
    'Database backup verification failed: nothing was erased',
    data,
  );
}
function ensureStopped() {
  let lines = '';
  try {
    lines = execFileSync('/bin/ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
      timeout: 1500,
    });
  } catch {
    throw Error('Cannot verify that API and LINEJS workers are stopped');
  }
  for (const line of lines.split('\n')) {
    // Avoid mistakenly matching this reset script or shell itself.
    if (
      /^\s*\d+\s+.*(?:bun --watch server\/index\.ts|node (?:--env-file=\.env )?worker\.ts)(?:\s|$)/.test(
        line,
      )
    )
      throw Error('Stop the MoneyFlow API and LINEJS Workers before resetting');
  }
}

try {
  const rows = await db`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  `;
  const actual = rows.map((x) => String(x.tablename)).sort();
  if (actual.length !== knownTables.length || actual.some((n) => !knownTables.includes(n)))
    throw Error('Unknown PostgreSQL schema detected. Refusing to truncate any table.');
  const counts = await db`
    SELECT (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM transactions) AS transactions,
           (SELECT count(*)::int FROM bank_linejs_events) AS bank_events,
           (SELECT count(*)::int FROM line_links) AS line_links,
           (SELECT count(*)::int FROM bank_linejs_settings) AS connectors
  `;
  console.log('LOCAL_MONEYFLOW_INVENTORY', JSON.stringify(counts[0]));
  if (!apply) {
    console.log('DRY_RUN_ONLY: database and LINE sessions are unchanged');
    console.log(
      'RESET_SCOPE: all users, finance records, sessions, LINE links, bank events and connector settings',
    );
    console.log('PROTECTED: source code, .env API configuration, Docker/PostgreSQL schema');
  } else {
    if (process.env.MONEYFLOW_RESET_CONFIRM !== 'ERASE_ALL_LOCAL_MONEYFLOW_DATA')
      throw Error('Explicit confirmation environment variable is missing');
    await verifyApiIsStopped();
    ensureStopped();
    const root = join(homedir(), '.moneyflow-private-backups');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    const folder = join(root, 'reset-' + new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(folder, { mode: 0o700 });
    backupFile(folder, 'moneyflow.dump', [
      'exec',
      'moneyflow-postgres',
      'pg_dump',
      '-U',
      'moneyflow',
      '-d',
      'moneyflow',
      '-Fc',
    ]);
    const paths = [
      { path: join(homedir(), '.moneyflow-linejs'), archive: 'legacy-linejs.tar.gz' },
      { path: join(homedir(), '.moneyflow-linejs-hosted'), archive: 'hosted-linejs.tar.gz' },
    ];
    for (const item of paths) {
      if (existsSync(item.path)) {
        const result = spawnSync(
          'tar',
          ['-czf', join(folder, item.archive), '-C', homedir(), item.path.split('/').pop()!],
          { stdio: 'ignore', timeout: 90000 },
        );
        if (result.error || result.status !== 0)
          throw Error('LINEJS session backup failed; nothing erased');
        chmodSync(join(folder, item.archive), 0o600);
      }
    }
    const localEnv = join(import.meta.dir, '../integrations/linejs/.env');
    if (existsSync(localEnv)) {
      copyFileSync(localEnv, join(folder, 'legacy-worker.env'));
      chmodSync(join(folder, 'legacy-worker.env'), 0o600);
    }
    console.log('PRIVATE_BACKUP_VERIFIED', folder);
    await db.begin((tx) =>
      tx.unsafe(
        'TRUNCATE TABLE ' +
          knownTables.map((x) => '"' + x + '"').join(', ') +
          ' RESTART IDENTITY CASCADE',
      ),
    );
    for (const item of paths) {
      if (existsSync(item.path)) rmSync(item.path, { recursive: true, force: true });
    }
    if (existsSync(localEnv)) rmSync(localEnv, { force: true });
    console.log('LOCAL_MONEYFLOW_DATA_CLEARED: log in as a new user to begin onboarding');
    console.log('BACKUP_IS_PRIVATE_AND_SENSITIVE: do not upload it or share it publicly');
  }
} finally {
  await db.end();
}
