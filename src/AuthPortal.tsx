import React, { useState } from 'react';
import { Mail, MessageCircle, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import GoogleSignIn from './GoogleSignIn';
import { pushToast } from './feedback';
import { validateAuthForm, type FieldErrors } from './validation';
import LineCodeLogin from './components/auth/LineCodeLogin';

type LoginProvider = 'email' | 'google' | 'line';

const api = async (path: string, body: any) => {
  const response = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw Error(result.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
  return result;
};

export default function AuthPortal({
  onAuthenticated,
  onError,
}: {
  onAuthenticated: (message: string) => Promise<void>;
  onError: (error: string) => void;
}) {
  const [provider, setProvider] = useState<LoginProvider>('email');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const clearField = (name: string) => {
    setFieldErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
    onError('');
  };
  const reportError = (message: string) => {
    onError(message);
    pushToast('error', message);
  };
  const [busy, setBusy] = useState(false);
  const changeProvider = (which: LoginProvider) => {
    setProvider(which);
    setFieldErrors({});
    onError('');
  };

  async function emailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError('');
    if (busy) return;
    const errors = validateAuthForm(mode, { name, email, password, confirm });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      pushToast('error', 'กรุณาตรวจสอบช่องที่กรอกไม่ครบหรือไม่ถูกต้อง');
      const form = e.currentTarget;
      requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      const path = mode === 'register' ? '/auth/email/register' : '/auth/email/login';
      await api(
        path,
        mode === 'register'
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password },
      );
      await onAuthenticated(
        mode === 'register' ? 'สร้างบัญชี MoneyFlow สำเร็จ ยินดีต้อนรับครับ!' : 'เข้าสู่ระบบสำเร็จ',
      );
    } catch (err: any) {
      reportError(err.message || 'ไม่สามารถเข้าสู่ระบบได้');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-portal">
      <div className="auth-authswitch">
        <button
          type="button"
          aria-pressed={provider === 'email'}
          className={provider === 'email' ? 'chosen' : ''}
          onClick={() => changeProvider('email')}
        >
          <Mail size={16} /> อีเมล
        </button>
        <button
          type="button"
          aria-pressed={provider === 'google'}
          className={provider === 'google' ? 'chosen' : ''}
          onClick={() => changeProvider('google')}
        >
          <span className="google-g">G</span> Google
        </button>
        <button
          type="button"
          aria-pressed={provider === 'line'}
          className={provider === 'line' ? 'chosen' : ''}
          onClick={() => changeProvider('line')}
        >
          <MessageCircle size={16} /> LINE
        </button>
      </div>

      {provider === 'email' && (
        <div className="auth-formpanel">
          <div className="auth-formheading">
            <h3>{mode === 'register' ? 'สร้างบัญชีของคุณ' : 'เข้าสู่ระบบ MoneyFlow'}</h3>
            <p>
              {mode === 'register'
                ? 'สมัครฟรี ใช้อีเมลและรหัสผ่านของคุณ'
                : 'เข้าสู่ระบบเพื่อดูข้อมูลการเงินของคุณ'}
            </p>
          </div>
          <form noValidate onSubmit={emailSubmit}>
            {mode === 'register' && (
              <>
                <label htmlFor="auth-name">
                  ชื่อที่ต้องการแสดง <span className="mf-required">*</span>
                </label>
                <input
                  id="auth-name"
                  maxLength={100}
                  autoComplete="name"
                  value={name}
                  placeholder="เช่น Supakit"
                  className={fieldErrors.name ? 'mf-invalid' : ''}
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby={fieldErrors.name ? 'mf-auth-name-error' : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearField('name');
                  }}
                />
                {fieldErrors.name && (
                  <p className="mf-field-error" id="mf-auth-name-error" role="alert">
                    {fieldErrors.name}
                  </p>
                )}
              </>
            )}
            <label htmlFor="auth-email">
              อีเมล <span className="mf-required">*</span>
            </label>
            <input
              id="auth-email"
              type="email"
              maxLength={254}
              autoComplete="email"
              placeholder="you@gmail.com"
              value={email}
              className={fieldErrors.email ? 'mf-invalid' : ''}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'mf-auth-email-error' : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                clearField('email');
              }}
            />
            {fieldErrors.email && (
              <p className="mf-field-error" id="mf-auth-email-error" role="alert">
                {fieldErrors.email}
              </p>
            )}
            <label htmlFor="auth-password">
              รหัสผ่าน <span className="mf-required">*</span>
            </label>
            <div className="auth-password-field">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                minLength={mode === 'register' ? 10 : 1}
                maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'อย่างน้อย 10 ตัวอักษร' : 'กรอกรหัสผ่าน'}
                value={password}
                className={fieldErrors.password ? 'mf-invalid' : ''}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'mf-auth-password-error' : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearField('password');
                }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="mf-field-error" id="mf-auth-password-error" role="alert">
                {fieldErrors.password}
              </p>
            )}
            {mode === 'register' && (
              <>
                <label htmlFor="auth-confirm">
                  ยืนยันรหัสผ่าน <span className="mf-required">*</span>
                </label>
                <input
                  id="auth-confirm"
                  type={showPassword ? 'text' : 'password'}
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  value={confirm}
                  className={fieldErrors.confirm ? 'mf-invalid' : ''}
                  aria-invalid={!!fieldErrors.confirm}
                  aria-describedby={fieldErrors.confirm ? 'mf-auth-confirm-error' : undefined}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    clearField('confirm');
                  }}
                />
                {fieldErrors.confirm && (
                  <p className="mf-field-error" id="mf-auth-confirm-error" role="alert">
                    {fieldErrors.confirm}
                  </p>
                )}
              </>
            )}
            <button className="button primary wide auth-submit" disabled={busy} type="submit">
              {busy ? 'กำลังดำเนินการ...' : mode === 'register' ? 'สมัครสมาชิกฟรี' : 'เข้าสู่ระบบ'}{' '}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-linkrow">
            <span>{mode === 'register' ? 'มีบัญชีแล้ว?' : 'ยังไม่มีบัญชี?'}</span>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                setPassword('');
                setConfirm('');
                setFieldErrors({});
                onError('');
              }}
            >
              {mode === 'register' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>
          </div>
          {mode === 'login' && (
            <button type="button" className="auth-recovery-link" onClick={() => changeProvider('line')}>
              <ShieldCheck size={15} /> ลืมรหัสผ่าน? ใช้ LINE ที่เคยเชื่อมไว้
            </button>
          )}
          {mode === 'register' && (
            <p className="auth-footnote">
              หลังสมัคร คุณสามารถเชื่อม Google หรือ LINE เพิ่มได้ภายหลัง ไม่จำเป็นต้องเชื่อมทุกช่องทาง
            </p>
          )}
        </div>
      )}

      {provider === 'google' && (
        <div className="auth-formpanel auth-providerpanel">
          <h3>เข้าสู่ระบบด้วย Google</h3>
          <p>หากไม่เคยใช้งานมาก่อน ระบบจะสร้างพื้นที่การเงินส่วนตัวให้คุณอัตโนมัติ</p>
          <GoogleSignIn
            onSuccess={async (result) =>
              onAuthenticated(
                result.created ? 'สร้างบัญชีด้วย Google สำเร็จ' : 'เข้าสู่ระบบด้วย Google สำเร็จ',
              )
            }
            onError={reportError}
          />
        </div>
      )}

      {provider === 'line' && (
        <div className="auth-formpanel auth-providerpanel">
          <LineCodeLogin
            onAuthenticated={onAuthenticated}
            onError={(message) => {
              if (message) reportError(message);
              else onError('');
            }}
          />
        </div>
      )}
    </div>
  );
}
