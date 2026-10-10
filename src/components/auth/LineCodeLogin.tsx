import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  Copy,
  ExternalLink,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { buildLineLoginChatUrl, formatLineLoginCommand } from '../../../shared/line-login.ts';
import { pushToast } from '../../feedback';
import './LineCodeLogin.css';

type Challenge = {
  id: string;
  secret: string;
  code: string;
  expiresMinutes: number;
  lineBasicId?: string | null;
};
type Props = {
  onAuthenticated: (message: string) => Promise<void>;
  onError: (message: string) => void;
};

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || 'ไม่สามารถเชื่อมต่อ MoneyFlow ได้');
  }
  return result as T;
}

/** LINE sign-up/sign-in via the verified OA chat, with direct LIFF sign-in on mobile. */
export default function LineCodeLogin({ onAuthenticated, onError }: Props) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pollNote, setPollNote] = useState('รอข้อความยืนยันจาก LINE');
  const [miniUrl, setMiniUrl] = useState<string | null>(null);
  const handlers = useRef({ onAuthenticated, onError });
  const qrDialogRef = useRef<HTMLDialogElement | null>(null);
  handlers.current = { onAuthenticated, onError };

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/mini/config', { signal: controller.signal, credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (
          !controller.signal.aborted &&
          value?.enabled === true &&
          typeof value.liffId === 'string' &&
          /^[0-9]{5,20}-[A-Za-z0-9]{5,64}$/.test(value.liffId)
        ) {
          setMiniUrl('https://liff.line.me/' + value.liffId);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const expired = Boolean(challenge && secondsLeft === 0);
  const command = challenge ? formatLineLoginCommand(challenge.code) : '';
  const chatUrl = challenge ? buildLineLoginChatUrl(challenge.lineBasicId, challenge.code) : null;
  const time =
    Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (secondsLeft % 60).toString().padStart(2, '0');

  async function createCode() {
    if (busy || finishing) return;
    setBusy(true);
    handlers.current.onError('');
    try {
      if (challenge) {
        try {
          await post('/auth/line/cancel', { id: challenge.id, secret: challenge.secret });
        } catch {
          // A used or expired code cannot be reused regardless.
        }
      }
      const next = await post<Challenge>('/auth/line/start', {});
      setChallenge(next);
      setExpiresAt(Date.now() + next.expiresMinutes * 60_000);
      setSecondsLeft(next.expiresMinutes * 60);
      setCopied(false);
      setPollNote('รอข้อความยืนยันจาก LINE');
    } catch (error: any) {
      handlers.current.onError(error.message || 'สร้างรหัสเข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!challenge || !expiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [challenge?.id, expiresAt]);

  useEffect(() => {
    if (!challenge || expired) return;
    let inactive = false;
    let checking = false;
    let completed = false;
    const identity = { id: challenge.id, secret: challenge.secret };

    const check = async () => {
      if (inactive || checking || completed) return;
      checking = true;
      try {
        const result = await post<{ approved: boolean }>('/auth/line/status', identity);
        if (!result.approved || inactive || completed) return;
        completed = true;
        setFinishing(true);
        setPollNote('ยืนยันสำเร็จแล้ว กำลังเข้าสู่ระบบ...');
        await post('/auth/line/complete', identity);
        if (!inactive)
          await handlers.current.onAuthenticated('เข้าสู่ระบบหรือสมัครบัญชีด้วย LINE สำเร็จ');
      } catch (error: any) {
        if (inactive) return;
        const message = String(error.message || '');
        if (message.includes('หมดอายุ') || message.includes('ถูกใช้')) {
          setSecondsLeft(0);
        } else if (completed) {
          handlers.current.onError(message || 'เข้าสู่ระบบผ่าน LINE ไม่สำเร็จ กรุณาสร้างรหัสใหม่');
          setSecondsLeft(0);
        } else {
          setPollNote('กำลังรอ LINE ตอบกลับ ระบบจะลองตรวจสอบให้อัตโนมัติ');
        }
      } finally {
        checking = false;
        if (!inactive) setFinishing(false);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    const interval = window.setInterval(() => void check(), 2200);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      inactive = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [challenge?.id, expired]);

  async function copyCode() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      pushToast('success', 'คัดลอกข้อความ Login พร้อมรหัสแล้ว');
    } catch {
      handlers.current.onError('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกข้อความที่แสดง');
    }
  }

  return (
    <div className="line-code-login">
      <div className="auth-lineicon">
        <MessageCircle size={25} aria-hidden="true" />
      </div>
      <h3>เข้าสู่ระบบด้วย LINE</h3>
      <p className="line-code-description">
        ใช้ LINE สมัครบัญชีใหม่หรือเข้าสู่บัญชีเดิมได้เลย ไม่ต้องตั้งรหัสผ่าน
      </p>

      {!challenge ? (
        <>
          {miniUrl && (
            <div className="line-direct-signin">
              <div className="line-direct-signin-label">ใช้ LINE บนมือถือ</div>
              <a
                className="button primary wide line-direct-signin-button"
                href={miniUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={18} /> เปิด MoneyFlow ผ่าน LINE <ArrowRight size={17} />
              </a>
              <p>เข้าใช้งานครั้งแรก ระบบจะสร้างสมุดเงินให้ทันที ไม่ต้องกรอกอีเมล</p>
            </div>
          )}
          <div className="line-code-divider">
            <span>หรือยืนยันจากแชต LINE เพื่อใช้บนคอมพิวเตอร์</span>
          </div>
          <div className="auth-line-instructions">
            <div className="auth-line-step">
              <span className="auth-line-step-number">1</span>
              <p>
                เปิดแชต <strong>MoneyFlow</strong> ในแอป LINE
              </p>
            </div>
            <div className="auth-line-step">
              <span className="auth-line-step-number">2</span>
              <p>
                กดสร้างรหัส แล้วส่งข้อความ <strong>Login ตามด้วยรหัส 8 หลัก</strong> ในแชต
              </p>
            </div>
            <div className="auth-line-step">
              <span className="auth-line-step-number">3</span>
              <p>เมื่อ LINE ยืนยันสำเร็จ จะสมัครบัญชีใหม่หรือเข้าสู่บัญชีเดิมให้โดยอัตโนมัติ</p>
            </div>
          </div>
          <button
            className="button primary wide auth-line-start"
            type="button"
            onClick={() => void createCode()}
            disabled={busy}
          >
            {busy ? 'กำลังสร้างรหัส...' : 'สร้างรหัสยืนยันผ่าน LINE'}
            {!busy && <ArrowRight size={17} />}
          </button>
          <p className="line-code-existing-warning">
            มีบัญชีอีเมลหรือ Google ที่เคยบันทึกเงินไว้แล้ว? ให้เข้าสู่บัญชีเดิมแล้วเชื่อม LINE
            ที่หน้าบัญชีและความปลอดภัยก่อน เพื่อใช้สมุดเงินเดิมโดยไม่สร้างบัญชีแยก
          </p>
        </>
      ) : (
        <div className="auth-line-challenge">
          <div className="line-code-header">
            <span className="auth-challenge-caption">
              {expired ? 'รหัสนี้หมดอายุแล้ว' : 'ส่งข้อความนี้ใน LINE MoneyFlow'}
            </span>
            <span className="line-code-clock" aria-label={'เวลาที่เหลือ ' + time}>
              <Clock3 size={15} /> {time}
            </span>
          </div>

          {!expired && (
            <>
              <div className="auth-challenge-code">
                <code>
                  <b>Login</b> <strong>{challenge.code}</strong>
                </code>
                <button className="auth-copy-command" type="button" onClick={() => void copyCode()}>
                  <Copy size={15} /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด'}
                </button>
              </div>
              <p className="auth-line-command-note">
                ต้องส่ง <strong>ทั้งคำว่า Login และตัวเลข</strong> เช่นข้อความด้านบน ไม่ใช่ส่งเฉพาะเลข 8
                หลัก
              </p>
              {chatUrl && (
                <div className="line-code-actions">
                  <button
                    className="line-code-qr-trigger"
                    type="button"
                    onClick={() => qrDialogRef.current?.showModal()}
                  >
                    <QrCode size={19} /> สแกน QR Code
                  </button>
                  <a
                    className="line-code-chat-link"
                    href={chatUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={17} /> เปิดแชต LINE
                    <ExternalLink size={15} />
                  </a>
                </div>
              )}
              <div className="auth-waiting" role="status">
                <span className="auth-waiting-dot" aria-hidden="true" />
                {finishing ? 'กำลังเข้าสู่ระบบ...' : pollNote}
              </div>
            </>
          )}

          <button
            className="auth-newcode"
            type="button"
            onClick={() => void createCode()}
            disabled={busy || finishing}
          >
            <RefreshCw size={15} />{' '}
            {busy ? 'กำลังสร้างใหม่...' : expired ? 'สร้างรหัสใหม่' : 'เปลี่ยนรหัสใหม่'}
          </button>
        </div>
      )}

      {challenge && chatUrl && (
        <dialog
          ref={qrDialogRef}
          className="line-code-qr-dialog"
          aria-labelledby="line-code-qr-dialog-title"
          aria-describedby="line-code-qr-dialog-desc"
          onClick={(event) => {
            if (event.target === event.currentTarget) qrDialogRef.current?.close();
          }}
        >
          <div className="line-code-qr-dialog-inner">
            <button
              className="line-code-qr-close"
              type="button"
              aria-label="ปิดหน้าสแกน QR Code"
              onClick={() => qrDialogRef.current?.close()}
            >
              <X size={19} />
            </button>
            <div className="line-code-qr-icon" aria-hidden="true">
              <QrCode size={24} />
            </div>
            <h3 id="line-code-qr-dialog-title">สแกน QR เพื่อเข้าสู่ระบบ</h3>
            <p id="line-code-qr-dialog-desc">
              เปิดกล้องหรือ LINE บนมือถืออีกเครื่อง แล้วสแกน QR นี้เพื่อเปิดแชต MoneyFlow
            </p>
            <div className={'line-code-qr-sheet' + (expired ? ' is-expired' : '')}>
              <QRCodeSVG
                value={chatUrl}
                size={220}
                bgColor="#ffffff"
                fgColor="#174d3a"
                level="M"
                marginSize={3}
                title="สแกนเพื่อเปิดแชต LINE MoneyFlow พร้อมข้อความเข้าสู่ระบบ"
              />
              {expired && <div className="line-code-qr-expired">QR หมดอายุแล้ว</div>}
            </div>
            <div className="line-code-qr-countdown" role="status">
              <Clock3 size={15} /> {expired ? 'รหัสหมดอายุแล้ว' : 'ใช้ได้อีก ' + time + ' นาที'}
            </div>
            {!expired ? (
              <>
                <div className="line-code-qr-help">
                  <span>1. สแกน QR</span>
                  <span>2. เปิด LINE</span>
                  <span>3. กดส่งข้อความ</span>
                </div>
                <p className="line-code-qr-reminder">
                  LINE จะเตรียมข้อความ <strong>{command}</strong> ให้ในแชต คุณต้องกด <strong>ส่ง</strong>{' '}
                  เพื่อยืนยัน จากนั้นเว็บจะเข้าสู่ระบบเอง
                </p>
                <a
                  className="line-code-chat-link line-code-qr-mobile-link"
                  href={chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={17} /> ใช้มือถือเครื่องนี้? เปิด LINE <ExternalLink size={15} />
                </a>
              </>
            ) : (
              <button
                className="line-code-qr-renew"
                type="button"
                onClick={() => void createCode()}
                disabled={busy || finishing}
              >
                <RefreshCw size={17} /> {busy ? 'กำลังสร้างรหัสใหม่...' : 'สร้างรหัสใหม่'}
              </button>
            )}
          </div>
        </dialog>
      )}

      <div className="auth-line-tip">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          <strong>ปลอดภัย</strong> — รหัสใช้ได้ครั้งเดียว อายุ 5 นาที หากยังไม่เคยเชื่อม LINE
          ให้เข้าสู่ระบบด้วยอีเมลหรือ Google แล้วเชื่อมที่หน้า <strong>บัญชีและความปลอดภัย</strong> ก่อน
        </span>
      </div>
    </div>
  );
}
