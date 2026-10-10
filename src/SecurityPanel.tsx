import React, { useState } from 'react';
import {
  Mail,
  MessageCircle,
  ShieldCheck,
  LockKeyhole,
  CheckCircle2,
  Copy,
  Link2,
  Unlink,
  ArrowUpRight,
  KeyRound,
} from 'lucide-react';
import GoogleSignIn from './GoogleSignIn';
import './SecurityPanel.css';
import { pushToast } from './feedback';
import { askConfirm } from './ConfirmDialog';
import { validateSecurityPassword, type FieldErrors } from './validation';

type Profile = {
  id: string;
  display_name: string;
  email: string | null;
  google_linked: boolean;
  line_connected: boolean;
  email_login_enabled: boolean;
  password_set: boolean;
  avatar_url: string | null;
};

async function api(path: string, method = 'POST', body?: any) {
  const result = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok || data.error) throw Error(data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
  return data;
}

export default function SecurityPanel({
  profile,
  onRefresh,
  onToast,
  onOpenLine,
  demo,
}: {
  profile: Profile;
  onRefresh: () => Promise<void>;
  onToast: (s: string) => void;
  onOpenLine: () => void;
  demo: boolean;
}) {
  const [email, setEmail] = useState(profile.email || '');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [pair, setPair] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const clearField = (name: string) => {
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setActionError('');
  };
  function submitPassword(e: React.FormEvent<HTMLFormElement>, connect: boolean) {
    e.preventDefault();
    const errors = validateSecurityPassword(
      connect ? password : newPassword,
      connect ? email : undefined,
    );
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      pushToast('error', 'กรุณากรอกข้อมูลให้ครบและถูกต้องก่อนบันทึก');
      const form = e.currentTarget;
      requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    void perform(
      () =>
        connect
          ? api('/auth/email/connect', 'POST', { email, password })
          : api('/auth/password/change', 'POST', { oldPassword, newPassword }),
      connect ? 'เชื่อมอีเมลและตั้งรหัสผ่านเรียบร้อยแล้ว' : 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว',
    );
  }
  async function checkLineConnection() {
    if (demo) return pushToast('warning', 'กรุณาเข้าสู่ระบบก่อนเชื่อม LINE');
    setActionError('');
    setLoading(true);
    try {
      const result = await api('/me', 'GET');
      if (result.line_connected) {
        setPair('');
        await onRefresh();
        onToast('เชื่อม LINE กับบัญชีเรียบร้อยแล้ว');
      } else {
        setActionError('ยังไม่พบการเชื่อม LINE กรุณาส่งข้อความเชื่อมพร้อมรหัสจากแชต LINE แล้วลองใหม่');
        pushToast('warning', 'ยังไม่พบการเชื่อม LINE กรุณาส่งข้อความจากแชต LINE ก่อน');
      }
    } catch (e: any) {
      setActionError(e.message || 'ตรวจการเชื่อมไม่สำเร็จ');
      pushToast('error', e.message || 'ตรวจการเชื่อมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }
  const status = (linked: boolean) =>
    linked ? (
      <span className="security-connected">
        <CheckCircle2 size={15} /> เชื่อมต่อแล้ว
      </span>
    ) : (
      <span className="security-unconnected">ยังไม่เชื่อมต่อ</span>
    );
  async function perform(fn: () => Promise<any>, success: string) {
    if (demo) return pushToast('warning', 'โหมดตัวอย่าง ไม่สามารถแก้ไขบัญชีได้');
    setActionError('');
    setLoading(true);
    try {
      await fn();
      try {
        await onRefresh();
      } catch {
        pushToast('warning', 'บันทึกสำเร็จ แต่ยังโหลดข้อมูลล่าสุดไม่ได้ กรุณารีเฟรชหน้าเว็บ');
      }
      onToast(success);
      setNewPassword('');
      setOldPassword('');
      setPassword('');
    } catch (e: any) {
      const message = e.message || 'ทำรายการไม่สำเร็จ';
      setActionError(message);
      pushToast('error', message);
    } finally {
      setLoading(false);
    }
  }
  async function createPair() {
    if (demo) return pushToast('warning', 'กรุณาเข้าสู่ระบบก่อนเชื่อม LINE');
    setLoading(true);
    setActionError('');
    try {
      const x = await api('/line/pair');
      setPair(x.code);
      pushToast('info', 'สร้างรหัสเชื่อม LINE สำเร็จ คัดลอกข้อความแล้วส่งใน LINE ได้เลย');
    } catch (e: any) {
      const message = e.message || 'สร้างรหัสเชื่อม LINE ไม่สำเร็จ';
      setActionError(message);
      pushToast('error', message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="security-page">
      <div className="security-intro">
        <span className="eyebrow">ACCOUNT & PRIVACY</span>
        <h2>
          บัญชีและความปลอดภัย<span className="dot-accent">.</span>
        </h2>
        <p>
          เชื่อมวิธีเข้าสู่ระบบเพิ่มเติมได้ตามต้องการ
          ทุกช่องทางที่เชื่อมจะพากลับเข้าข้อมูลการเงินชุดเดียวกัน
        </p>
      </div>
      {actionError && (
        <div className="security-error" role="alert">
          {actionError}
        </div>
      )}

      <div className="security-overview">
        <div className="security-avatar">{profile.display_name?.slice(0, 1).toUpperCase() || 'M'}</div>
        <div>
          <strong>{profile.display_name || 'บัญชีของคุณ'}</strong>
          <p>{profile.email || 'ยังไม่ได้เชื่อมอีเมล'}</p>
        </div>
        <div className="security-overview-safe">
          <ShieldCheck size={18} /> ข้อมูลส่วนตัวของคุณ
        </div>
      </div>

      <div className="security-providers">
        <div className="security-provider panel">
          <div className="security-provider-head">
            <span className="security-method-icon email">
              <Mail size={22} />
            </span>
            <div>
              <h3>อีเมลและรหัสผ่าน</h3>
              <p>เข้าสู่ระบบด้วยอีเมล หรือใช้เป็นวิธีสำรอง</p>
            </div>
            {status(profile.password_set)}
          </div>
          {profile.password_set ? (
            <div className="security-subpanel">
              <p>
                อีเมลเข้าสู่ระบบ: <strong>{profile.email || 'ไม่ระบุ'}</strong>
              </p>
              <h4>เปลี่ยนรหัสผ่าน</h4>
              <p>
                หากลืมรหัสผ่าน ให้เข้าสู่ระบบด้วย Google หรือ LINE ที่เชื่อมไว้ แล้วตั้งรหัสผ่านใหม่ภายใน
                15 นาทีหลังเข้าสู่ระบบ
              </p>
              <form noValidate onSubmit={(e) => submitPassword(e, false)}>
                <label>รหัสผ่านเดิม (เว้นว่างได้เมื่อเพิ่งเข้าสู่ระบบด้วย Google หรือ LINE)</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => {
                    setOldPassword(e.target.value);
                    setActionError('');
                  }}
                  placeholder="รหัสผ่านเดิม"
                />
                <label>
                  รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร) <span className="mf-required">*</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'mf-security-password-error' : undefined}
                  className={fieldErrors.password ? 'mf-invalid' : ''}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearField('password');
                  }}
                  placeholder="รหัสผ่านใหม่"
                />
                {fieldErrors.password && (
                  <p id="mf-security-password-error" className="mf-field-error" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
                <button className="button outline" disabled={loading} type="submit">
                  <KeyRound size={16} /> {loading ? 'กำลังบันทึก...' : 'อัปเดตรหัสผ่าน'}
                </button>
              </form>
            </div>
          ) : (
            <div className="security-subpanel">
              <p>
                ยังไม่ได้เพิ่มรหัสผ่านสำหรับบัญชีนี้ คุณสามารถเพิ่มอีเมลเดิมที่ Google
                ยืนยันแล้วและกำหนดรหัสผ่าน เพื่อเข้าสู่ระบบด้วยอีเมลภายหลังได้
              </p>
              <form noValidate onSubmit={(e) => submitPassword(e, true)}>
                <label>
                  อีเมล <span className="mf-required">*</span>
                </label>
                <input
                  type="email"
                  maxLength={254}
                  value={email}
                  placeholder="you@gmail.com"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'mf-security-email-error' : undefined}
                  className={fieldErrors.email ? 'mf-invalid' : ''}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearField('email');
                  }}
                />
                {fieldErrors.email && (
                  <p id="mf-security-email-error" className="mf-field-error" role="alert">
                    {fieldErrors.email}
                  </p>
                )}
                <label>
                  รหัสผ่านใหม่ <span className="mf-required">*</span>
                </label>
                <input
                  type="password"
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'mf-security-new-password-error' : undefined}
                  className={fieldErrors.password ? 'mf-invalid' : ''}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearField('password');
                  }}
                  placeholder="อย่างน้อย 10 ตัวอักษร"
                />
                {fieldErrors.password && (
                  <p id="mf-security-new-password-error" className="mf-field-error" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
                <button className="button primary" type="submit" disabled={loading}>
                  <Link2 size={16} /> เชื่อมอีเมล
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="security-provider panel">
          <div className="security-provider-head">
            <span className="security-method-icon google">G</span>
            <div>
              <h3>Google</h3>
              <p>เข้าบัญชีเดิมได้ด้วยปุ่ม Continue with Google</p>
            </div>
            {status(profile.google_linked)}
          </div>
          {profile.google_linked ? (
            <div className="security-subpanel">
              <p>เชื่อม Google แล้ว ครั้งต่อไปกด Google ก็จะเข้าบัญชีเดิม ไม่ต้องสร้างบัญชีใหม่</p>
            </div>
          ) : (
            <div className="security-subpanel">
              <p>เชื่อม Google กับบัญชีปัจจุบันเพื่อใช้ล็อกอินอีกช่องทาง</p>
              <GoogleSignIn
                mode="link"
                onSuccess={async () => {
                  await onRefresh();
                  onToast('เชื่อม Google กับบัญชีปัจจุบันสำเร็จ');
                }}
                onError={(message) => {
                  setActionError(message);
                  pushToast('error', message);
                }}
              />
            </div>
          )}
        </div>

        <div className="security-provider security-provider-line panel">
          <div className="security-provider-head">
            <span className="security-method-icon line">
              <MessageCircle size={22} />
            </span>
            <div className="security-provider-info">
              <h3>LINE</h3>
              <p>บันทึกรายจ่ายผ่านแชต หรือใช้เข้าเว็บตอนลืมรหัสผ่าน</p>
            </div>
            {status(profile.line_connected)}
          </div>
          {profile.line_connected ? (
            <div className="security-subpanel security-line-content">
              <div className="security-line-main">
                <div className="security-line-kicker">
                  <CheckCircle2 size={16} /> เชื่อมต่อพร้อมใช้งาน
                </div>
                <h4>MoneyFlow เชื่อมกับ LINE ของคุณแล้ว</h4>
                <p>บันทึกเงินผ่านแชตได้ และใช้ LINE เข้าสู่บัญชีเดิมได้ แม้ลืมรหัสผ่าน</p>
                <div className="security-inline-actions">
                  <button className="button outline" type="button" onClick={onOpenLine}>
                    เปิดหน้า LINE &amp; AI <ArrowUpRight size={16} />
                  </button>
                  {profile.google_linked || (profile.email_login_enabled && profile.password_set) ? (
                    <button
                      type="button"
                      className="security-danger"
                      disabled={loading}
                      onClick={async () => {
                        if (
                          await askConfirm({
                            title: 'ยกเลิกการเชื่อม LINE?',
                            description:
                              'คุณจะไม่สามารถเข้าสู่ระบบหรือบันทึกรายจ่ายผ่าน LINE ได้จนกว่าจะเชื่อมใหม่ แต่ข้อมูลการเงินเดิมยังอยู่ครบ',
                            confirmLabel: 'ยกเลิกการเชื่อม',
                            tone: 'danger',
                          })
                        )
                          await perform(() => api('/line/link', 'DELETE'), 'ยกเลิกเชื่อม LINE แล้ว');
                      }}
                    >
                      <Unlink size={15} /> ยกเลิกเชื่อม
                    </button>
                  ) : (
                    <span className="security-safety-note">
                      บัญชีนี้ใช้ LINE เป็นทางเข้าหลัก กรุณาเชื่อม Google ก่อนจึงจะยกเลิก LINE ได้
                    </span>
                  )}
                </div>
              </div>
              <aside className="security-line-guide is-connected" aria-label="การเข้าสู่ระบบผ่าน LINE">
                <span className="security-line-guide-tag">
                  <ShieldCheck size={16} /> วิธีเข้าบัญชีด้วย LINE
                </span>
                <strong>ลืมรหัสผ่านก็กลับมาได้</strong>
                <p>
                  จากหน้าเข้าสู่ระบบ เลือก LINE และพิมพ์ <b>Login ตามด้วยรหัส 8 หลัก</b> ที่หน้าเว็บแสดง
                  เช่น <code>Login 12345678</code>
                </p>
              </aside>
            </div>
          ) : (
            <div className="security-subpanel security-line-content">
              <div className="security-line-main">
                <div className="security-line-kicker">
                  <Link2 size={16} /> เพิ่มช่องทางเข้าสู่ระบบ
                </div>
                <h4>เชื่อม LINE เพื่อบันทึกเงินได้ง่ายขึ้น</h4>
                <p>
                  ไม่จำเป็นต้องเชื่อมก็ใช้ MoneyFlow ได้ แต่หากเชื่อมไว้จะใช้ LINE
                  เข้าบัญชีเดิมได้เมื่อจำรหัสผ่านไม่ได้
                </p>
                {!pair ? (
                  <div className="security-connect-actions">
                    <button
                      type="button"
                      className="button primary"
                      disabled={loading}
                      onClick={createPair}
                    >
                      <Link2 size={17} /> {loading ? 'กำลังสร้างรหัส...' : 'สร้างรหัสเชื่อม LINE'}
                    </button>
                    <button type="button" className="security-link-text" onClick={onOpenLine}>
                      ดูวิธีเชื่อม LINE &amp; AI <ArrowUpRight size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="security-pair">
                      <span>ส่งข้อความนี้หา MoneyFlow OA ใน LINE ภายใน 10 นาที</span>
                      <div>
                        <strong>เชื่อม {pair}</strong>
                        <button
                          title="คัดลอก"
                          type="button"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText('เชื่อม ' + pair)
                              .then(() => pushToast('info', 'คัดลอกข้อความเชื่อม LINE แล้ว'))
                              .catch(() => pushToast('error', 'คัดลอกไม่สำเร็จ กรุณาคัดลอกเอง'));
                          }}
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="security-link-text"
                        disabled={loading}
                        onClick={checkLineConnection}
                      >
                        ตรวจสอบสถานะการเชื่อม <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <div className="security-connect-actions">
                      <button type="button" className="security-link-text" onClick={onOpenLine}>
                        ดูวิธีเชื่อม LINE &amp; AI <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              <aside className="security-line-guide" aria-label="วิธีเชื่อมต่อ LINE">
                <span className="security-line-guide-tag">
                  <MessageCircle size={16} /> เริ่มต้นใน 3 ขั้นตอน
                </span>
                <ol>
                  <li>
                    <span>1</span>
                    <p>
                      กด <strong>สร้างรหัสเชื่อม LINE</strong> ที่หน้านี้
                    </p>
                  </li>
                  <li>
                    <span>2</span>
                    <p>
                      คัดลอกและส่งข้อความ <strong>เชื่อม พร้อมรหัส</strong> ไปที่ MoneyFlow OA
                    </p>
                  </li>
                  <li>
                    <span>3</span>
                    <p>รอ LINE ยืนยัน แล้วกลับมาที่หน้านี้เพื่อตรวจสอบสถานะ</p>
                  </li>
                </ol>
              </aside>
            </div>
          )}
        </div>
      </div>
      <div className="security-footer">
        <ShieldCheck size={18} />
        <p>
          การเชื่อมบัญชีคือการเพิ่มวิธีเข้าสู่บัญชีเดิม ไม่ใช่การรวมข้อมูลของบัญชี MoneyFlow
          สองบัญชีที่สร้างแยกไว้แล้ว ควรเชื่อมวิธีอื่นตั้งแต่ยังล็อกอินอยู่
        </p>
      </div>
    </div>
  );
}
