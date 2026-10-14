import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { openVault, vaultKey } from '../shared/linejs-vault.ts';

export type HostedMode = 'discovery' | 'listening';
type State = 'stopped' | 'starting' | 'waiting_qr' | 'connected' | 'listening' | 'error';
export type HostedConfig = {
  userId: string;
  tokenEncrypted: string;
  enabled: boolean;
  senderMid: string | null;
  accountId: string | null;
  extraSenderMids?: string[];
};
type Running = {
  child: ChildProcess | null;
  token: string;
  mode: HostedMode;
  mid: string | null;
  mids: string[];
  desired: boolean;
  state: State;
  qrUrl: string;
  pin: string;
  candidateMid: string;
  candidateMids: string[];
  eventCount: number;
  observedCount: number;
  skippedCount: number;
  historyChecks: number;
  historyFailures: number;
  historyRecent: number;
  historyState: string;
  lastOutcome: string;
  lastError: string;
  restarts: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
};
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validMid = (v: string | null) => /^u[0-9a-f]{32}$/i.test(v || '');
const workerDir = resolve(import.meta.dir, '../integrations/linejs');
const secureDir = (p: string) => {
  if (existsSync(p) && lstatSync(p).isSymbolicLink())
    throw Error('LINEJS cannot use a symlinked data directory');
  mkdirSync(p, { recursive: true, mode: 0o700 });
  chmodSync(p, 0o700);
};

export class HostedLineJsManager {
  private readonly sessions = new Map<string, Running>();
  readonly maxWorkers = (() => {
    const value = Number(process.env.LINEJS_HOSTED_MAX_WORKERS || 4);
    return Number.isFinite(value) ? Math.max(1, Math.min(8, Math.floor(value))) : 4;
  })();
  readonly root = resolve(
    process.env.LINEJS_HOSTED_DATA_DIR || join(homedir(), '.moneyflow-linejs-hosted'),
  );

  get available() {
    if (process.env.LINEJS_HOSTED_ENABLED !== '1') return false;
    try {
      vaultKey(process.env.LINEJS_SESSION_ENCRYPTION_KEY);
      return (
        existsSync(join(workerDir, 'worker.ts')) &&
        existsSync(join(workerDir, 'node_modules', '@evex', 'linejs'))
      );
    } catch {
      return false;
    }
  }
  get reason() {
    if (process.env.LINEJS_HOSTED_ENABLED !== '1') return 'ผู้ดูแลระบบยังไม่เปิดการรับแจ้งเตือนธนาคาร';
    return this.available ? '' : 'ระบบรับแจ้งเตือนธนาคารยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล MoneyFlow';
  }
  private sessionPath(userId: string) {
    if (!uuid(userId)) throw Error('Invalid user identifier');
    secureDir(this.root);
    const path = join(this.root, userId.toLowerCase());
    secureDir(path);
    return path;
  }
  decryptToken(userId: string, encrypted: string) {
    const token = openVault(
      encrypted,
      vaultKey(process.env.LINEJS_SESSION_ENCRYPTION_KEY),
      userId,
      'bridge-token',
    );
    if (!/^mfbank_[0-9a-f]{64}$/.test(token)) throw Error('LINEJS bridge token invalid');
    return token;
  }
  private newSession(token: string, mode: HostedMode, mid: string | null, mids: string[]): Running {
    return {
      child: null,
      token,
      mode,
      mid,
      mids,
      desired: true,
      state: 'stopped',
      qrUrl: '',
      pin: '',
      candidateMid: '',
      candidateMids: [],
      eventCount: 0,
      observedCount: 0,
      skippedCount: 0,
      historyChecks: 0,
      historyFailures: 0,
      historyRecent: 0,
      historyState: 'not_checked',
      lastOutcome: '',
      lastError: '',
      restarts: 0,
      retryTimer: null,
    };
  }
  status(userId: string) {
    const r = this.sessions.get(userId);
    return {
      available: this.available,
      reason: this.reason,
      maxWorkers: this.maxWorkers,
      runningWorkers: [...this.sessions.values()].filter((x) => !!x.child).length,
      running: !!r?.child,
      state: r?.state || 'stopped',
      mode: r?.mode || 'discovery',
      qrUrl: r?.child ? r.qrUrl : '',
      pin: r?.child ? r.pin : '',
      candidateMid: r?.candidateMid || '',
      candidateMids: r?.candidateMids || [],
      eventCount: r?.eventCount || 0,
      observedCount: r?.observedCount || 0,
      skippedCount: r?.skippedCount || 0,
      historyChecks: r?.historyChecks || 0,
      historyFailures: r?.historyFailures || 0,
      historyRecent: r?.historyRecent || 0,
      historyState: r?.historyState || 'not_checked',
      lastOutcome: r?.lastOutcome || '',
      lastError: r?.lastError || '',
    };
  }
  private launch(userId: string, r: Running) {
    const dir = this.sessionPath(userId);
    r.state = 'starting';
    r.qrUrl = '';
    r.pin = '';
    r.candidateMid = '';
    r.candidateMids = [];
    const child = spawn(process.env.LINEJS_NODE_BIN || 'node', ['worker.ts'], {
      cwd: workerDir,
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: homedir(),
        LANG: process.env.LANG || 'en_US.UTF-8',
        TMPDIR: process.env.TMPDIR || '/tmp',
        LINEJS_WORKER_ENABLED: '1',
        LINEJS_HOSTED_USER_ID: userId,
        LINEJS_SESSION_DIR: dir,
        LINEJS_SESSION_ENCRYPTION_KEY: process.env.LINEJS_SESSION_ENCRYPTION_KEY || '',
        LINEJS_DISCOVER_SENDER: r.mode === 'discovery' ? '1' : '0',
        LINEJS_BANK_SENDER_MID: r.mid || '',
        LINEJS_BANK_SENDER_MIDS: r.mids.join(','),
        MONEYFLOW_BANK_INGEST_TOKEN: r.token,
        MONEYFLOW_BANK_API: 'http://127.0.0.1:' + (process.env.APP_PORT || '3011'),
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    r.child = child;
    child.on('message', (message: unknown) => {
      if (r.child !== child || !message || typeof message !== 'object') return;
      const x = message as Record<string, unknown>;
      if (
        x.type === 'qr' &&
        typeof x.url === 'string' &&
        x.url.length < 1500 &&
        /^(line:\/\/|https:\/\/line\.me\/)/.test(x.url)
      ) {
        r.qrUrl = x.url;
        r.pin = '';
        r.state = 'waiting_qr';
      } else if (x.type === 'pin' && typeof x.pin === 'string' && /^\d{4,8}$/.test(x.pin)) {
        r.pin = x.pin;
        r.state = 'waiting_qr';
      } else if (x.type === 'login') {
        r.state = 'connected';
        r.qrUrl = '';
        r.pin = '';
        r.restarts = 0;
      } else if (x.type === 'push') r.state = 'listening';
      else if (x.type === 'discovery' && typeof x.mid === 'string' && validMid(x.mid)) {
        const mid = x.mid.toLowerCase();
        r.candidateMid = mid;
        // A personal LINE user can receive both KBank and Krungthai alerts.
        // Keep recently found MIDs separately, scoped to this session.
        if (!r.mids.includes(mid) && !r.candidateMids.includes(mid))
          r.candidateMids = [...r.candidateMids, mid].slice(-8);
      } else if (x.type === 'observed') r.observedCount++;
      else if (x.type === 'skipped') r.skippedCount++;
      else if (x.type === 'bank') {
        r.eventCount++;
        r.lastOutcome = String(x.outcome || 'received').slice(0, 30);
        if (x.outcome === 'ignored') r.skippedCount++;
      } else if (x.type === 'history') {
        const n = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
        r.historyChecks = n(x.checks);
        r.historyFailures = n(x.failures);
        r.historyRecent = n(x.recent);
        r.historyState = ['ok', 'fetch_error', 'bank_chat_unavailable'].includes(String(x.state))
          ? String(x.state)
          : 'not_checked';
      }
    });
    child.on('error', () => {
      if (r.child === child) {
        r.state = 'error';
        r.lastError = 'ไม่สามารถเริ่ม Hosted Worker ได้';
      }
    });
    child.on('close', () => {
      if (r.child !== child) return;
      r.child = null;
      r.qrUrl = '';
      r.pin = '';
      if (!r.desired) {
        r.state = 'stopped';
        return;
      }
      r.state = 'error';
      if (++r.restarts > 5) {
        r.desired = false;
        r.lastError = 'LINEJS เชื่อมต่อไม่สำเร็จหลายครั้ง กรุณากดเริ่มใหม่';
        return;
      }
      r.lastError = 'LINEJS หลุด กำลังเชื่อมต่อใหม่';
      r.retryTimer = setTimeout(
        () => {
          r.retryTimer = null;
          if (this.sessions.get(userId) === r && r.desired) this.launch(userId, r);
        },
        Math.min(60_000, 2_000 * 2 ** r.restarts),
      );
    });
  }
  async start(conf: HostedConfig) {
    if (!this.available) throw Error(this.reason);
    if (!uuid(conf.userId)) throw Error('Invalid user identifier');
    const token = this.decryptToken(conf.userId, conf.tokenEncrypted);
    const primary = conf.accountId && validMid(conf.senderMid) ? [conf.senderMid!.toLowerCase()] : [];
    const extras = (conf.extraSenderMids || []).filter((x) => validMid(x)).map((x) => x.toLowerCase());
    const mids = [...new Set([...primary, ...extras])].sort();
    const mode: HostedMode = conf.enabled && mids.length ? 'listening' : 'discovery';
    let r = this.sessions.get(conf.userId);
    if (
      r?.child &&
      r.mode === mode &&
      r.token === token &&
      JSON.stringify(r.mids) === JSON.stringify(mids)
    )
      return;
    if (r) await this.stop(conf.userId);
    if ([...this.sessions.values()].filter((x) => !!x.child).length >= this.maxWorkers)
      throw Error('ใช้งาน LINEJS ครบ ' + this.maxWorkers + ' บัญชีพร้อมกันแล้ว');
    r = this.newSession(
      token,
      mode,
      mode === 'listening' ? conf.senderMid : null,
      mode === 'listening' ? mids : [],
    );
    this.sessions.set(conf.userId, r);
    this.launch(conf.userId, r);
  }
  async stop(userId: string) {
    const r = this.sessions.get(userId);
    if (!r) return;
    r.desired = false;
    if (r.retryTimer) clearTimeout(r.retryTimer);
    r.retryTimer = null;
    r.state = 'stopped';
    r.qrUrl = '';
    r.pin = '';
    const child = r.child;
    r.child = null;
    if (child) {
      const closed = new Promise<void>((done) => {
        if (child.exitCode !== null || child.signalCode !== null) return done();
        child.once('close', () => done());
      });
      child.kill('SIGTERM');
      await Promise.race([closed, new Promise<void>((done) => setTimeout(done, 2500))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    this.sessions.delete(userId);
  }
  async remove(userId: string) {
    await this.stop(userId);
    if (!uuid(userId)) return;
    const dir = join(this.root, userId.toLowerCase());
    if (existsSync(dir) && !lstatSync(dir).isSymbolicLink())
      rmSync(dir, { recursive: true, force: true });
  }
  async restore(configs: HostedConfig[]) {
    if (!this.available) return;
    for (const conf of configs.slice(0, this.maxWorkers)) {
      try {
        await this.start(conf);
      } catch {
        console.warn('[LINEJS] A hosted connector could not resume');
      }
    }
  }
  dispose() {
    for (const r of this.sessions.values()) {
      r.desired = false;
      if (r.retryTimer) clearTimeout(r.retryTimer);
      if (r.child) r.child.kill('SIGTERM');
    }
  }
}
export const hostedLineJsManager = new HostedLineJsManager();
process.on('exit', () => hostedLineJsManager.dispose());
