import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, ShieldCheck } from 'lucide-react';

type GoogleCredential = { credential?: string };
type GoogleIdentityAPI = {
  initialize: (args: {
    client_id: string;
    callback: (response: GoogleCredential) => void;
    auto_select?: boolean;
  }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityAPI } };
  }
}

type GoogleConfig = {
  enabled: boolean;
  clientId: string;
};

type Props = {
  mode?: 'login' | 'link';
  onSuccess: (result: { created: boolean }) => Promise<void> | void;
  onError: (message: string) => void;
};

/**
 * Google Identity Services account chooser. It only sends the short-lived
 * Google ID token to the same-origin backend. Sessions are HttpOnly cookies.
 * New Google accounts are provisioned with separate finance data automatically.
 */
export default function GoogleSignIn({ onSuccess, onError, mode = 'login' }: Props) {
  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [originCopied, setOriginCopied] = useState(false);
  const [clientCopied, setClientCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const browserOrigin = typeof window === 'undefined' ? 'http://localhost:5178' : window.location.origin;
  const usingIp = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1';
  const localhostOrigin = usingIp ? browserOrigin.replace('127.0.0.1', 'localhost') : browserOrigin;
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const actions = useRef({ onSuccess, onError });
  actions.current = { onSuccess, onError };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch('/api/auth/google/config', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('ไม่สามารถโหลดการตั้งค่า Google ได้');
        const body = (await response.json()) as GoogleConfig;
        if (alive) setConfig(body);
      } catch (e: any) {
        if (alive) actions.current.onError(e.message || 'Google Sign-In ไม่พร้อมใช้งาน');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!config?.enabled) return;
    let disposed = false;
    let initialized = false;
    let lastRenderedWidth = 0;
    const paint = () => {
      const host = buttonRef.current;
      if (disposed || !window.google || !host) return;
      // Google embeds a pixel-sized control. Its width must follow the parent
      // whenever the user rotates their phone or resizes the browser.
      const width = Math.min(350, Math.floor(host.clientWidth));
      if (width < 180 || lastRenderedWidth === width) return;
      if (!initialized) {
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          auto_select: false,
          callback: async (response) => {
            if (!response.credential) return actions.current.onError('Google ไม่ส่งข้อมูลยืนยันตัวตน');
            setSigningIn(true);
            try {
              const result = await fetch(
                mode === 'link' ? '/api/auth/google/link' : '/api/auth/google',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'same-origin',
                  body: JSON.stringify({ credential: response.credential }),
                },
              );
              const data = await result.json();
              if (!result.ok || !data.ok)
                throw new Error(data.error || 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
              await actions.current.onSuccess({ created: data.created === true });
            } catch (e: any) {
              actions.current.onError(e.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
            } finally {
              setSigningIn(false);
            }
          },
        });
        initialized = true;
      }
      host.replaceChildren();
      lastRenderedWidth = width;
      window.google.accounts.id.renderButton(host, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width,
      });
    };

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
    if (buttonRef.current) observer?.observe(buttonRef.current);

    window.addEventListener('resize', paint);
    const scriptId = 'moneyflow-google-identity-sdk';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    const handleLoad = () => paint();
    const handleError = () => {
      if (!disposed) setScriptError(true);
    };
    if (!existing) {
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
    }
    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);
    if (!existing) document.head.appendChild(script);
    paint();

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', paint);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, [config?.clientId, config?.enabled, mode]);

  const copyValue = async (value: string, kind: 'origin' | 'client') => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'origin') setOriginCopied(true);
      else setClientCopied(true);
    } catch {
      setCopyError(true);
    }
  };

  if (loading) return <div className="google-auth-loading">กำลังเตรียม Google Sign-In...</div>;

  if (!config?.enabled)
    return (
      <div className="google-auth-note">
        <strong>Google Sign-In พร้อมรอการตั้งค่า</strong>
        <p>
          สร้าง Google OAuth Client ID (ชนิด Web application) แล้วใส่ค่า <code>GOOGLE_CLIENT_ID</code> ใน{' '}
          <code>Desktop/moneyflow/.env</code> จากนั้นทุกคนจะสามารถเข้าสู่ระบบหรือสมัครใช้ด้วยบัญชี Google
          ของตนเองได้
        </p>
        <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">
          ไปที่ Google Cloud <ArrowUpRight size={14} />
        </a>
      </div>
    );

  const localDevelopment = ['localhost', '127.0.0.1'].includes(
    typeof window === 'undefined' ? '' : window.location.hostname,
  );

  return (
    <div className="google-auth-area">
      <div className="google-auth-heading">
        <span className="google-auth-heading-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <strong>{mode === 'link' ? 'เชื่อม Google กับบัญชีนี้' : 'ไม่ต้องจำรหัสผ่าน'}</strong>
          <p>
            {mode === 'link'
              ? 'เลือก Google ที่ต้องการใช้เข้าสู่บัญชีการเงินเดิม'
              : 'เลือกบัญชี Google เพื่อเข้าสู่ระบบอย่างปลอดภัย'}
          </p>
        </div>
      </div>
      <div className="google-auth-button" ref={buttonRef} />
      {signingIn && (
        <div className="google-auth-progress" role="status">
          กำลังยืนยันตัวตนกับ Google...
        </div>
      )}
      {scriptError && (
        <div className="google-auth-error" role="alert">
          โหลดปุ่ม Google ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้าเว็บ
        </div>
      )}
      <div className="google-auth-data-note">
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>
          {mode === 'link'
            ? 'บัญชี Google นี้จะใช้กลับเข้าสู่ข้อมูลการเงินเดิมของคุณได้'
            : 'ผู้ใช้แต่ละคนมีข้อมูลการเงินแยกจากกัน'}
        </span>
      </div>

      <details className="google-origin-help">
        <summary>
          <span className="google-origin-help-icon" aria-hidden="true">
            <CircleHelp size={19} />
          </span>
          <span className="google-origin-help-title">
            <strong>เข้า Google ไม่ได้?</strong>
            <small>ดูวิธีแก้ปัญหาการเข้าสู่ระบบ</small>
          </span>
          <ChevronDown className="google-origin-chevron" size={19} aria-hidden="true" />
        </summary>
        <div className="google-origin-help-content">
          <p className="google-help-intro">
            ลองทำตามขั้นตอนเหล่านี้ก่อน หากยังเข้าไม่ได้ คุณสามารถเลือก อีเมลหรือ LINE
            ที่เคยเชื่อมไว้เพื่อเข้าสู่ระบบแทน
          </p>
          <div className="google-help-steps">
            <div>
              <span className="google-help-step-number">1</span>
              <p>
                <strong>ตรวจสอบอินเทอร์เน็ต</strong> แล้วลองกดปุ่ม Google อีกครั้ง
              </p>
            </div>
            <div>
              <span className="google-help-step-number">2</span>
              <p>
                <strong>ลองเปิดเว็บผ่าน Chrome</strong> หรือหน้าต่างปกติ
                หากมีส่วนขยายที่บล็อกการเข้าสู่ระบบให้ลองปิดชั่วคราว
              </p>
            </div>
            <div>
              <span className="google-help-step-number">3</span>
              <p>
                <strong>พบ Error 400: origin_mismatch?</strong> เป็นปัญหาการตั้งค่าเว็บไซต์
                ไม่ใช่รหัสผ่าน Google ของคุณ กรุณาแจ้งผู้ดูแลระบบ
              </p>
            </div>
          </div>
          {usingIp && (
            <a
              className="google-help-quick-fix"
              href={`${localhostOrigin}${window.location.pathname}${window.location.search}`}
            >
              ลองเปิด MoneyFlow ผ่าน localhost
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          {localDevelopment && (
            <details className="google-admin-help">
              <summary>
                <span>สำหรับผู้ดูแลระบบ: ตั้งค่า Google OAuth</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <div className="google-admin-help-content">
                <p>
                  หากพบ <code>origin_mismatch</code> ให้เปิด Google Cloud → Google Auth Platform →
                  Clients → OAuth Client ประเภท <strong>Web application</strong> และเพิ่ม URL
                  ที่ใช้อยู่ใน
                  <strong> Authorized JavaScript origins</strong>
                  (ไม่ใช่ Redirect URIs) แล้วกด Save
                </p>
                <span className="google-origin-label">URL ที่ใช้อยู่ตอนนี้</span>
                <div className="google-origin-copy">
                  <code>{browserOrigin}</code>
                  <button type="button" onClick={() => void copyValue(browserOrigin, 'origin')}>
                    {originCopied ? 'คัดลอกแล้ว' : 'คัดลอก URL'}
                  </button>
                </div>
                <span className="google-origin-label">Google OAuth Client ID</span>
                <div className="google-origin-copy">
                  <code>{config.clientId}</code>
                  <button type="button" onClick={() => void copyValue(config.clientId, 'client')}>
                    {clientCopied ? 'คัดลอกแล้ว' : 'คัดลอก ID'}
                  </button>
                </div>
                {copyError && (
                  <p className="google-help-copy-error" role="status">
                    คัดลอกอัตโนมัติไม่ได้ สามารถเลือกและคัดลอกข้อความด้านบนได้เลย
                  </p>
                )}
                {usingIp && (
                  <p>
                    สำหรับการพัฒนา คุณอาจลอง <a href={localhostOrigin}>เปิดผ่าน localhost</a> ได้
                    หากอนุญาต Origin นั้นใน Google Cloud แล้ว
                  </p>
                )}
                <a
                  className="google-origin-cloud"
                  href="https://console.cloud.google.com/auth/clients"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  เปิด Google OAuth Clients <ArrowUpRight size={16} />
                </a>
              </div>
            </details>
          )}
        </div>
      </details>
    </div>
  );
}
