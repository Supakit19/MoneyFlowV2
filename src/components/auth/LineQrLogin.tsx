import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

type Challenge = {
  id: string;
  secret: string;
  expiresMinutes: number;
  scanUrl: string;
};
type Props = {
  onAuthenticated: (message: string) => Promise<void>;
  onError: (message: string) => void;
};
type Config = { ok: boolean; enabled: boolean; reason: string | null };
type Status = {
  ok: boolean;
  approved: boolean;
  awaitingConfirm?: boolean;
  failed?: boolean;
  message?: string | null;
};

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || 'เชื่อมต่อ MoneyFlow ไม่สำเร็จ');
  return result as T;
}

/**
 * The QR opens LINE Login OAuth, not a prefilled chat message. LINE verifies
 * the linked user on the scanning phone. Only THIS browser has the challenge
 * secret needed to complete its session; neither a code nor a chat is needed.
 */
export default function LineQrLogin({ onAuthenticated, onError }: Props) {
  const [config, setConfig] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [configReason, setConfigReason] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [status, setStatus] = useState('รอยืนยันตัวตนผ่าน LINE...');
  const [finishing, setFinishing] = useState(false);
  const callbacks = useRef({ onAuthenticated, onError });
  callbacks.current = { onAuthenticated, onError };

  const expired = Boolean(challenge && secondsLeft <= 0);
  const clock =
    Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (secondsLeft % 60).toString().padStart(2, '0');
  const showError = (message: string) => callbacks.current.onError(message);

  async function checkConfig() {
    setConfig('loading');
    try {
      const response = await fetch('/api/auth/line/qr/config', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('ไม่สามารถตรวจสอบการตั้งค่า LINE Login ได้');
      const result = (await response.json()) as Config;
      setConfig(result.enabled ? 'ready' : 'missing');
      setConfigReason(result.reason || '');
    } catch {
      setConfig('missing');
      setConfigReason('เชื่อมต่อระบบ LINE Login ไม่สำเร็จ กรุณาลองใหม่');
    }
  }
  useEffect(() => {
    void checkConfig();
  }, []);

  async function start() {
    if (busy || finishing || config !== 'ready') return;
    setBusy(true);
    callbacks.current.onError('');
    try {
      if (challenge) {
        try {
          await post('/auth/line/qr/cancel', { id: challenge.id, secret: challenge.secret });
        } catch {
          /* Expired QR is already invalid. */
        }
      }
      const next = await post<Challenge>('/auth/line/qr/start', {});
      setChallenge(next);
      const duration = Math.max(1, next.expiresMinutes * 60);
      setExpiresAt(Date.now() + duration * 1000);
      setSecondsLeft(duration);
      setStatus('เปิด LINE เพื่อยืนยันตัวตน ระบบจะเข้าสู่บัญชีให้อัตโนมัติ');
      setFinishing(false);
    } catch (e: any) {
      showError(e.message || 'สร้าง QR Code ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!challenge || !expiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [challenge?.id, expiresAt]);

  useEffect(() => {
    if (!challenge || expired) return;
    let disposed = false,
      checking = false,
      done = false;
    const identity = { id: challenge.id, secret: challenge.secret };
    const check = async () => {
      if (disposed || checking || done) return;
      checking = true;
      try {
        const result = await post<Status>('/auth/line/qr/status', identity);
        if (disposed || done) return;
        if (result.failed) {
          done = true;
          setStatus('ยืนยัน LINE ไม่สำเร็จ กรุณาสร้าง QR ใหม่');
          showError(result.message || 'LINE ยืนยันตัวตนไม่สำเร็จ');
          setSecondsLeft(0);
          return;
        }
        if (result.awaitingConfirm) {
          setStatus('LINE ยืนยันตัวตนแล้ว กรุณาแตะ “อนุญาต” บนมือถือ');
          return;
        }
        if (!result.approved) return;
        done = true;
        setFinishing(true);
        setStatus('LINE ยืนยันสำเร็จ กำลังเข้าสู่บัญชีเดิม...');
        await post('/auth/line/qr/complete', identity);
        if (!disposed)
          await callbacks.current.onAuthenticated('เข้าสู่บัญชี MoneyFlow เดิมด้วย LINE สำเร็จ');
      } catch (e: any) {
        if (disposed) return;
        done = true;
        showError(e.message || 'LINE ยืนยันตัวตนไม่สำเร็จ');
        setStatus('มีปัญหาการเชื่อมต่อ กรุณาสร้าง QR ใหม่');
        setSecondsLeft(0);
      } finally {
        checking = false;
        if (!disposed) setFinishing(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    const timer = window.setInterval(() => void check(), 2200);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [challenge?.id, expired]);

  return (
    <div className="line-qr-login">
      <div className="auth-lineicon">
        <MessageCircle size={25} aria-hidden="true" />
      </div>
      <h3>เข้าสู่ระบบด้วย LINE</h3>
      <p className="line-qr-description">
        สแกน QR แล้วยืนยันผ่านแอป LINE จากนั้นเว็บจะเข้าสู่บัญชีเดิมโดยอัตโนมัติ
        ไม่ต้องพิมพ์เลขหรือส่งข้อความ
      </p>

      {config === 'loading' ? (
        <div className="line-qr-config-message" role="status">
          <RefreshCw size={22} className="line-qr-loading-icon" />
          <strong>กำลังตรวจสอบ LINE Login...</strong>
        </div>
      ) : config === 'missing' ? (
        <div className="line-qr-config-message" role="status">
          <ShieldCheck size={29} aria-hidden="true" />
          <strong>LINE QR Login ยังไม่เปิดใช้งาน</strong>
          <p>
            ต้องตั้งค่า LINE Login Channel และเว็บไซต์ HTTPS ก่อน
            จึงจะสแกนเพื่อเข้าสู่ระบบโดยไม่พิมพ์รหัสได้
          </p>
          <details>
            <summary>สำหรับผู้ดูแลระบบ</summary>
            <p>{configReason}</p>
            <p>
              เพิ่ม LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET และ APP_PUBLIC_URL ใน .env
              แล้วลงทะเบียน Callback URL ตามคู่มือ
            </p>
          </details>
          <button className="line-qr-config-retry" type="button" onClick={() => void checkConfig()}>
            <RefreshCw size={16} /> ตรวจสอบอีกครั้ง
          </button>
        </div>
      ) : !challenge ? (
        <div className="line-qr-intro">
          <div className="line-qr-intro-visual" aria-hidden="true">
            <div className="line-qr-mini">
              <QrCode size={50} strokeWidth={1.7} />
            </div>
            <div className="line-qr-intro-join">
              <ArrowRight size={17} />
            </div>
            <div className="line-qr-phone">
              <Smartphone size={38} strokeWidth={1.7} />
              <CheckCircle2 size={17} />
            </div>
          </div>
          <strong>สแกน QR แล้วเข้าสู่ระบบ ไม่ต้องพิมพ์รหัส</strong>
          <p>สแกน QR ยืนยัน LINE แล้วแตะอนุญาตบนมือถือหนึ่งครั้ง เว็บจะเข้าสู่บัญชีให้อัตโนมัติ</p>
          <button
            className="button primary wide line-qr-main-action"
            type="button"
            onClick={() => void start()}
            disabled={busy}
          >
            <QrCode size={19} /> {busy ? 'กำลังสร้าง QR Code...' : 'สร้าง QR Code เข้าสู่ระบบ'}
            {!busy && <ArrowRight size={17} />}
          </button>
          <div className="line-qr-safety-note">
            <ShieldCheck size={16} aria-hidden="true" />
            เพื่อความปลอดภัย ต้องเป็น LINE ที่เชื่อมกับบัญชี MoneyFlow ไว้แล้ว
          </div>
        </div>
      ) : (
        <div className="line-qr-challenge">
          <div className="line-qr-status-header" role="status">
            <span
              className={
                'line-qr-state-dot ' + (expired ? 'expired' : finishing ? 'success' : 'waiting')
              }
            />
            <div className="line-qr-status-copy">
              <strong>
                {expired ? 'QR Code หมดอายุแล้ว' : finishing ? 'กำลังเข้าสู่ระบบ' : 'พร้อมให้สแกนแล้ว'}
              </strong>
              <span>{expired ? 'สร้าง QR ใหม่เพื่อดำเนินการต่อ' : status}</span>
            </div>
            <div
              className={'line-qr-clock ' + (secondsLeft < 60 ? 'ending' : '')}
              aria-label={'เวลาที่เหลือ ' + clock}
            >
              <Clock3 size={15} /> {clock}
            </div>
          </div>
          <div className="line-qr-display">
            <div className={'line-qr-square ' + (expired ? 'is-expired' : '')}>
              <QRCodeSVG
                value={challenge.scanUrl}
                size={216}
                fgColor="#174D3A"
                bgColor="#ffffff"
                level="M"
                marginSize={3}
                title="สแกนเพื่อยืนยันตัวตนด้วย LINE Login และเข้าสู่ MoneyFlow"
              />
              {expired && <div className="line-qr-expired-cover">QR หมดอายุแล้ว</div>}
            </div>
            <p>
              {expired
                ? 'QR นี้ใช้งานไม่ได้แล้ว กดสร้าง QR ใหม่'
                : 'ใช้กล้องมือถือสแกน QR เพื่อเปิด LINE Login'}
            </p>
            {!expired && (
              <>
                <div className="line-qr-steps" aria-label="ขั้นตอน QR Login">
                  <span>
                    <b>1</b> สแกน QR
                  </span>
                  <span>
                    <b>2</b> แตะอนุญาต
                  </span>
                  <span>
                    <b>3</b> เข้าเว็บทันที
                  </span>
                </div>
                <a
                  className="line-qr-open-chat"
                  href={challenge.scanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={18} /> ใช้มือถือเครื่องนี้? เข้าสู่ระบบด้วย LINE{' '}
                  <ExternalLink size={15} />
                </a>
              </>
            )}
          </div>
          <div className="line-qr-footer">
            <div className="line-qr-security">
              <ShieldCheck size={15} /> QR ใช้ได้ครั้งเดียว อายุ {challenge.expiresMinutes} นาที
            </div>
            <button
              type="button"
              className={expired ? 'line-qr-regenerate primary' : 'line-qr-regenerate'}
              disabled={busy || finishing}
              onClick={() => void start()}
            >
              <RefreshCw size={16} />{' '}
              {busy ? 'กำลังสร้างใหม่...' : expired ? 'สร้าง QR ใหม่' : 'เปลี่ยน QR Code'}
            </button>
          </div>
        </div>
      )}
      <p className="line-qr-unlinked">
        หากยังไม่เคยเชื่อม LINE ให้เข้าสู่ระบบด้วยอีเมลหรือ Google แล้วเชื่อมที่หน้า
        <strong> บัญชีและความปลอดภัย</strong> ก่อน
      </p>
    </div>
  );
}
