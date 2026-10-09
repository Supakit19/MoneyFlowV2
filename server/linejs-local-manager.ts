import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

type Mode = 'discovery' | 'listening';
type State = 'stopped' | 'starting' | 'waiting_qr' | 'connected' | 'listening' | 'error';
const directory = resolve(import.meta.dir, '../integrations/linejs');
const envPath = join(directory, '.env');
const privateDir = join(homedir(), '.moneyflow-linejs');
const ownerPath = join(privateDir, 'moneyflow-owner.json');
const enabledLocally =
  process.env.NODE_ENV !== 'production' &&
  ['127.0.0.1', 'localhost'].includes(process.env.LISTEN_HOST || '127.0.0.1') &&
  process.env.LINEJS_LOCAL_CONTROL !== '0';

function owner(): string {
  try {
    const data = JSON.parse(readFileSync(ownerPath, 'utf8'));
    return typeof data.userId === 'string' ? data.userId : '';
  } catch {
    return '';
  }
}

function agentWantsResume(): boolean {
  try {
    const data = JSON.parse(readFileSync(ownerPath, 'utf8'));
    // Older installations didn't track this preference. Their enabled
    // MoneyFlow Flow already constitutes opt-in to receiving notifications.
    return data.autoResume !== false;
  } catch {
    return false;
  }
}

function setResumePreference(userId: string, autoResume: boolean) {
  requireOwner(userId);
  const temp = ownerPath + '.' + randomBytes(5).toString('hex') + '.tmp';
  writeFileSync(temp, JSON.stringify({ userId, autoResume }), { mode: 0o600, flag: 'wx' });
  renameSync(temp, ownerPath);
  chmodSync(ownerPath, 0o600);
}

function requireOwner(userId: string) {
  if (!enabledLocally) throw Error('ควบคุม LINEJS ได้เฉพาะเซิร์ฟเวอร์ MoneyFlow ที่รันบน localhost');
  const bound = owner();
  if (bound && bound !== userId) throw Error('Local LINEJS ผูกกับบัญชี MoneyFlow อื่นอยู่');
  if (!bound) {
    mkdirSync(privateDir, { recursive: true, mode: 0o700 });
    writeFileSync(ownerPath, JSON.stringify({ userId }), { mode: 0o600, flag: 'wx' });
  }
}

function envValues() {
  const values: Record<string, string> = {};
  try {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return values;
}

function patchEnv(fields: Record<string, string>) {
  const current = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  const names = new Set(Object.keys(fields));
  const lines = current.filter((line) => line.trim() && !names.has(line.split('=')[0]));
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) throw Error('ข้อมูล Worker ไม่ถูกต้อง');
    lines.push(key + '=' + value);
  }
  const tmp = envPath + '.' + randomBytes(5).toString('hex') + '.tmp';
  writeFileSync(tmp, lines.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(tmp, envPath);
  chmodSync(envPath, 0o600);
}

function otherWorkerRunning(excluding?: number) {
  try {
    const listing = execFileSync('/bin/ps', ['-axo', 'pid=,command='], {
      encoding: 'utf8',
      timeout: 1600,
    });
    return listing.split('\n').some((line) => {
      const match = /^\s*(\d+)\s+(.+)$/.exec(line);
      if (!match || Number(match[1]) === excluding) return false;
      return /(?:^|\s)(?:node|\/[^\s]*\/node)\s+--env-file=\.env\s+worker\.ts(?:\s|$)/.test(match[2]);
    });
  } catch {
    return false;
  }
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

class LineJsLocalManager {
  ownerUserId(): string {
    return enabledLocally ? owner() : '';
  }

  resumeOnBoot(
    userId: string,
    tokenHash: string | null,
    flowEnabled: boolean,
    senderMid: string | null,
    apiPort: number,
  ): boolean {
    if (!enabledLocally || !userId || owner() !== userId || !agentWantsResume()) return false;
    if (!flowEnabled || !this.linked(tokenHash)) return false;
    if (!/^u[0-9a-f]{32}$/i.test(senderMid || '')) return false;
    this.start(userId, tokenHash, flowEnabled, senderMid, apiPort);
    return true;
  }

  private child: ChildProcess | null = null;
  private state: State = 'stopped';
  private mode: Mode = 'discovery';
  private qrUrl = '';
  private pin = '';
  private candidateMid = '';
  private eventCount = 0;
  private observedCount = 0;
  private skippedCount = 0;
  private historyChecks = 0;
  private historyFailures = 0;
  private historyRecent = 0;
  private historyState = 'not_checked';
  private historyLastCheckedAt = '';
  private lastOutcome = '';
  private lastError = '';

  availableFor(userId: string) {
    return enabledLocally && (!owner() || owner() === userId);
  }

  linked(tokenHash: string | null): boolean {
    const token = envValues().MONEYFLOW_BANK_INGEST_TOKEN || '';
    return !!tokenHash && /^mfbank_[0-9a-f]{64}$/.test(token) && sha(token) === tokenHash;
  }

  status(userId: string, tokenHash: string | null) {
    const available = this.availableFor(userId);
    return {
      available,
      running: available && !!this.child,
      state: available ? this.state : 'stopped',
      mode: available ? this.mode : 'discovery',
      linked: available && this.linked(tokenHash),
      externalRunning: available && !this.child && otherWorkerRunning(),
      qrUrl: available && this.child ? this.qrUrl : '',
      pin: available && this.child ? this.pin : '',
      candidateMid: available ? this.candidateMid : '',
      eventCount: available ? this.eventCount : 0,
      observedCount: available ? this.observedCount : 0,
      skippedCount: available ? this.skippedCount : 0,
      historyChecks: available ? this.historyChecks : 0,
      historyFailures: available ? this.historyFailures : 0,
      historyRecent: available ? this.historyRecent : 0,
      historyState: available ? this.historyState : 'not_checked',
      historyLastCheckedAt: available ? this.historyLastCheckedAt : '',
      lastOutcome: available ? this.lastOutcome : '',
      lastError: available ? this.lastError : '',
      reason: !enabledLocally
        ? 'การเริ่ม LINEJS จากหน้าเว็บรองรับเฉพาะ MoneyFlow บน localhost (ไม่เปิดใน VPS)'
        : !available
          ? 'เครื่องนี้ถูกผูกกับผู้ใช้ MoneyFlow อื่นแล้ว'
          : '',
    };
  }

  configure(userId: string, token: string, apiPort: number) {
    requireOwner(userId);
    if (this.child || otherWorkerRunning()) {
      throw Error('พบ Worker กำลังทำงาน กรุณาหยุด Worker เดิมก่อนเชื่อมต่อใหม่');
    }
    if (!/^mfbank_[0-9a-f]{64}$/.test(token)) throw Error('โทเค็น Worker ไม่ถูกต้อง');
    patchEnv({
      LINEJS_WORKER_ENABLED: '1',
      LINEJS_DISCOVER_SENDER: '1',
      LINEJS_BANK_SENDER_MID: '',
      MONEYFLOW_BANK_INGEST_TOKEN: token,
      MONEYFLOW_BANK_API: 'http://127.0.0.1:' + apiPort,
    });
    this.lastError = '';
  }

  start(
    userId: string,
    tokenHash: string | null,
    isFlowOn: boolean,
    senderMid: string | null,
    apiPort: number,
  ) {
    requireOwner(userId);
    if (this.child) return;
    if (otherWorkerRunning()) {
      throw Error('มี LINEJS เปิดค้างจาก Terminal อยู่ กรุณาปิดตัวเดิมก่อนเพื่อป้องกันข้อความซ้ำ');
    }
    if (!this.linked(tokenHash)) throw Error('กรุณากดเชื่อม Worker บน Mac ก่อน');
    const mid = String(senderMid || '').toLowerCase();
    this.mode = isFlowOn && /^u[0-9a-f]{32}$/.test(mid) ? 'listening' : 'discovery';
    setResumePreference(userId, true);
    patchEnv({
      LINEJS_WORKER_ENABLED: '1',
      LINEJS_DISCOVER_SENDER: this.mode === 'discovery' ? '1' : '0',
      LINEJS_BANK_SENDER_MID: mid,
      MONEYFLOW_BANK_API: 'http://127.0.0.1:' + apiPort,
    });
    this.qrUrl = '';
    this.pin = '';
    this.candidateMid = '';
    this.eventCount = 0;
    this.observedCount = 0;
    this.skippedCount = 0;
    this.historyChecks = 0;
    this.historyFailures = 0;
    this.historyRecent = 0;
    this.historyState = 'not_checked';
    this.historyLastCheckedAt = '';
    this.lastOutcome = '';
    this.lastError = '';
    this.state = 'starting';
    const child = spawn('node', ['--env-file=.env', 'worker.ts'], {
      cwd: directory,
      // Do not pass MoneyFlow's database, LINE OA or AI credentials to the unofficial worker.
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: homedir(),
        LANG: process.env.LANG || 'en_US.UTF-8',
        TMPDIR: process.env.TMPDIR || '/tmp',
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    this.child = child;
    child.on('message', (value: unknown) => {
      if (this.child !== child || !value || typeof value !== 'object') return;
      const data = value as {
        type?: string;
        url?: string;
        pin?: string;
        mid?: string;
        outcome?: string;
        checks?: number;
        failures?: number;
        recent?: number;
        state?: string;
        lastCheckedAt?: string;
      };
      if (
        data.type === 'qr' &&
        typeof data.url === 'string' &&
        data.url.length < 1500 &&
        /^(line:\/\/|https:\/\/line\.me\/)/.test(data.url)
      ) {
        this.qrUrl = data.url;
        this.pin = '';
        this.state = 'waiting_qr';
      } else if (data.type === 'pin' && /^\d{4,8}$/.test(data.pin || '')) {
        this.pin = data.pin!;
        this.state = 'waiting_qr';
      } else if (data.type === 'login') {
        this.state = 'connected';
        this.qrUrl = '';
        this.pin = '';
      } else if (data.type === 'push') {
        this.state = 'listening';
      } else if (data.type === 'observed') {
        this.observedCount += 1;
      } else if (data.type === 'skipped') {
        this.skippedCount += 1;
      } else if (data.type === 'history') {
        const cleanNumber = (n: unknown) =>
          typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
        this.historyChecks = cleanNumber(data.checks);
        this.historyFailures = cleanNumber(data.failures);
        this.historyRecent = cleanNumber(data.recent);
        this.historyState = ['ok', 'fetch_error', 'bank_chat_unavailable'].includes(data.state || '')
          ? data.state!
          : 'not_checked';
        this.historyLastCheckedAt =
          typeof data.lastCheckedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(data.lastCheckedAt)
            ? data.lastCheckedAt.slice(0, 28)
            : '';
      } else if (data.type === 'bank') {
        this.eventCount += 1;
        if (data.outcome === 'ignored') this.skippedCount += 1;
        this.lastOutcome = String(data.outcome || 'received').slice(0, 30);
      } else if (data.type === 'discovery' && /^u[0-9a-f]{32}$/.test(data.mid || '')) {
        this.candidateMid = data.mid!;
      }
    });
    // stdout/stderr are never forwarded to browsers: may contain authentication data.
    child.on('error', () => {
      if (this.child === child) {
        this.state = 'error';
        this.lastError = 'ไม่สามารถเปิด Worker ด้วย Node.js ได้';
      }
    });
    child.on('close', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.qrUrl = '';
      this.pin = '';
      if (this.state !== 'stopped') {
        this.state = 'error';
        this.lastError =
          code === 0
            ? 'Worker หยุดทำงาน กรุณาตรวจสอบการตั้งค่า Flow'
            : 'Worker หยุดทำงานผิดปกติ กรุณาลองอีกครั้ง';
      }
    });
  }

  stop(userId: string) {
    requireOwner(userId);
    setResumePreference(userId, false);
    this.state = 'stopped';
    this.qrUrl = '';
    this.pin = '';
    const running = this.child;
    if (running) running.kill('SIGTERM');
  }

  dispose() {
    if (this.child) this.child.kill('SIGTERM');
  }
}

export const lineJsLocalManager = new LineJsLocalManager();
process.on('exit', () => lineJsLocalManager.dispose());
