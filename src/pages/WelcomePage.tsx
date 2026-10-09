import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleHelp,
  Copy,
  Link2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import BrandMark from '../components/BrandMark';
import type { Data } from '../lib/finance';
import { amount, baht } from '../lib/finance';
import type { FinanceOverview } from '../MoneyWellness';
import { validateAmount } from '../validation';
import { api } from '../lib/api';
import './WelcomePage.css';

type Props = {
  data: Data;
  overview: FinanceOverview | null;
  onFinish: (state: 'completed' | 'skipped') => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error' | 'warning' | 'info') => void;
};
type FieldError = { name?: string; opening?: string; weekly?: string; savings?: string };

const steps = [
  { title: 'บัญชีเงิน', desc: 'เริ่มจากเงินที่มี', icon: Wallet },
  { title: 'งบของคุณ', desc: 'วางแผนตามสบาย', icon: Target },
  { title: 'เชื่อม LINE', desc: 'เชื่อมเมื่อพร้อม', icon: MessageCircle },
] as const;

const satang = (value: string) => Math.round(Number(value || '0') * 100);
const readableError = (e: unknown) =>
  e instanceof Error ? e.message : 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง';

export default function WelcomePage({ data, overview, onFinish, notify }: Props) {
  const primary = data.accounts.find((a) => a.name === 'บัญชีหลัก') || data.accounts[0];
  const [step, setStep] = useState(0);
  const [accountName, setAccountName] = useState(primary?.name || '');
  const [opening, setOpening] = useState(
    primary?.opening_satang ? String(amount(primary.opening_satang)) : '',
  );
  const [weekly, setWeekly] = useState(
    overview?.settings.weekly_limit_satang
      ? String(Number(overview.settings.weekly_limit_satang) / 100)
      : '',
  );
  const [savings, setSavings] = useState(
    overview?.settings.savings_goal_satang
      ? String(Number(overview.settings.savings_goal_satang) / 100)
      : '',
  );
  const [errors, setErrors] = useState<FieldError>({});
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState('');
  const [lineConnected, setLineConnected] = useState(Boolean(data.profile?.line_connected));
  const [codeBusy, setCodeBusy] = useState(false);

  const update = (name: keyof FieldError, value: string) => {
    if (name === 'name') setAccountName(value);
    if (name === 'opening') setOpening(value);
    if (name === 'weekly') setWeekly(value);
    if (name === 'savings') setSavings(value);
    setErrors((old) => ({ ...old, [name]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const nextErrors: FieldError = {};
    if (step === 0) {
      if (!accountName.trim()) nextErrors.name = 'กรุณากรอกชื่อบัญชี';
      else if (accountName.trim().length > 60) nextErrors.name = 'ชื่อบัญชีต้องไม่เกิน 60 ตัวอักษร';
      nextErrors.opening = validateAmount(opening || '0', { allowZero: true });
    }
    if (step === 1) {
      nextErrors.weekly = validateAmount(weekly || '0', { allowZero: true });
      nextErrors.savings = validateAmount(savings || '0', { allowZero: true });
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      notify('กรุณาตรวจสอบข้อมูลที่ไฮไลต์ก่อนดำเนินการต่อ', 'error');
      return;
    }
    setBusy(true);
    try {
      if (step === 0 && primary) {
        const updatedBalance = satang(opening);
        if (
          accountName.trim() !== primary.name ||
          updatedBalance !== Number(primary.opening_satang || 0)
        ) {
          await api('/accounts/' + primary.id, 'PATCH', {
            name: accountName.trim(),
            opening_satang: updatedBalance,
          });
        }
      }
      if (step === 1) {
        const weeklyValue = satang(weekly);
        const savingsValue = satang(savings);
        if (
          weeklyValue !== Number(overview?.settings.weekly_limit_satang || 0) ||
          savingsValue !== Number(overview?.settings.savings_goal_satang || 0)
        ) {
          await api('/finance/preferences', 'PUT', {
            weekly_limit: weekly || 0,
            savings_goal: savings || 0,
          });
        }
      }
      if (step === 2) {
        await onFinish('completed');
        return;
      }
      setStep((current) => Math.min(current + 1, 2));
      setErrors({});
    } catch (e) {
      notify(readableError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onFinish('skipped');
    } catch (e) {
      notify(readableError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const createPairCode = async () => {
    if (codeBusy) return;
    setCodeBusy(true);
    try {
      const result = await api('/line/pair', 'POST');
      setPair(result.code);
      notify('สร้างรหัสเชื่อม LINE แล้ว ใช้ได้ 10 นาที', 'info');
    } catch (e) {
      notify(readableError(e), 'error');
    } finally {
      setCodeBusy(false);
    }
  };

  const checkConnection = async () => {
    try {
      const result = await api('/me');
      const connected = Boolean(result.line_connected);
      setLineConnected(connected);
      notify(
        connected
          ? 'LINE เชื่อมกับ MoneyFlow เรียบร้อยแล้ว'
          : 'ยังไม่พบการเชื่อมต่อ ลองส่งข้อความใน LINE อีกครั้ง',
        connected ? 'success' : 'info',
      );
    } catch (e) {
      notify(readableError(e), 'error');
    }
  };

  return (
    <main className="welcome-shell">
      <div className="welcome-frame">
        <header className="welcome-topbar">
          <div className="welcome-brand">
            <BrandMark />
            <strong>
              moneyflow<span>.</span>
            </strong>
            <span className="welcome-topbar-label">SETUP GUIDE</span>
          </div>
          <button type="button" className="welcome-skip" disabled={busy} onClick={() => void skip()}>
            ข้ามการตั้งค่าตอนนี้ <X size={16} aria-hidden="true" />
          </button>
        </header>
        <section className="welcome-content" aria-labelledby="welcome-heading">
          <div className="welcome-main">
            <div className="welcome-intro">
              <span className="welcome-eyebrow">
                <Sparkles size={16} /> YOUR MONEY, YOUR WAY
              </span>
              <h1 id="welcome-heading">
                {step === 0
                  ? 'ยินดีต้อนรับสู่ MoneyFlow'
                  : step === 1
                    ? 'วางแผนเงินให้สบายใจ'
                    : 'ให้ LINE ช่วยจดรายจ่าย'}
              </h1>
              <p>
                {step === 0
                  ? 'เริ่มจากตั้งค่าบัญชีหลักของคุณ ไม่ถึง 2 นาทีก็พร้อมใช้งาน'
                  : step === 1
                    ? 'ตั้งงบแบบใช้ซ้ำทุกสัปดาห์ และเป้าหมายเงินออมของคุณเอง'
                    : 'จะเชื่อมตอนนี้หรือค่อยทำทีหลังก็ได้ ทุกอย่างจัดการได้ในเว็บ'}
              </p>
            </div>
            <nav className="welcome-progress" aria-label="ขั้นตอนเริ่มต้นใช้งาน">
              {steps.map((item, index) => (
                <div
                  key={item.title}
                  className={
                    'welcome-progress-item ' +
                    (index === step ? 'current' : index < step ? 'finished' : '')
                  }
                  aria-current={index === step ? 'step' : undefined}
                >
                  <span className="welcome-progress-count">
                    {index < step ? <Check size={15} /> : index + 1}
                  </span>
                  <span>{item.title}</span>
                </div>
              ))}
            </nav>
            <form
              className="welcome-card"
              onSubmit={(event) => void submit(event)}
              noValidate
              aria-busy={busy}
            >
              <div className="welcome-step-head">
                <span className="welcome-step-icon">
                  {step === 0 ? (
                    <Wallet size={25} />
                  ) : step === 1 ? (
                    <Target size={25} />
                  ) : (
                    <MessageCircle size={25} />
                  )}
                </span>
                <span className="welcome-step-number">ขั้นตอน {step + 1} จาก 3</span>
              </div>
              {step === 0 && (
                <div className="welcome-fields">
                  <h2>ตั้งค่าบัญชีหลัก</h2>
                  <p>
                    เราเตรียมบัญชีหลัก เงินสด และวอลเล็ตให้แล้ว คุณเปลี่ยนชื่อหรือใส่ยอดเงินที่มีได้เลย
                  </p>
                  <div className="welcome-field">
                    <label htmlFor="welcome-account">
                      ชื่อบัญชีหลัก <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="welcome-account"
                      value={accountName}
                      maxLength={60}
                      autoFocus
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? 'welcome-account-error' : undefined}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder="เช่น บัญชีเงินเดือน"
                    />
                    {errors.name && (
                      <small className="welcome-error" id="welcome-account-error">
                        {errors.name}
                      </small>
                    )}
                  </div>
                  <div className="welcome-field">
                    <label htmlFor="welcome-opening">ยอดตั้งต้นของบัญชี (บาท)</label>
                    <div className="welcome-input-money">
                      <span aria-hidden="true">฿</span>
                      <input
                        id="welcome-opening"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={opening}
                        aria-invalid={Boolean(errors.opening)}
                        aria-describedby={
                          errors.opening ? 'welcome-opening-error' : 'welcome-opening-hint'
                        }
                        onChange={(e) => update('opening', e.target.value)}
                      />
                    </div>
                    {errors.opening && (
                      <small className="welcome-error" id="welcome-opening-error">
                        {errors.opening}
                      </small>
                    )}
                    <small className="welcome-help" id="welcome-opening-hint">
                      ใส่ยอดตอนเริ่มบันทึกเงิน ไม่ใช่รายรับ หากเปลี่ยนภายหลัง ยอดคงเหลือจะปรับตาม
                      และเว้นว่างไว้ก่อนได้
                    </small>
                  </div>
                  <div className="welcome-note">
                    <ShieldCheck size={17} /> ข้อมูลการเงินของคุณจะแยกจากผู้ใช้อื่น
                  </div>
                </div>
              )}
              {step === 1 && (
                <div className="welcome-fields">
                  <h2>ตั้งงบรายสัปดาห์</h2>
                  <p>เลือกวงเงินที่เหมาะกับชีวิตจริงของคุณ ระบบจะเริ่มคำนวณใหม่ทุกวันจันทร์อัตโนมัติ</p>
                  <div className="welcome-field">
                    <label htmlFor="welcome-weekly">สัปดาห์หนึ่งอยากใช้ไม่เกิน (บาท)</label>
                    <div className="welcome-input-money">
                      <span aria-hidden="true">฿</span>
                      <input
                        id="welcome-weekly"
                        inputMode="decimal"
                        placeholder="เช่น 2,000"
                        value={weekly}
                        aria-invalid={Boolean(errors.weekly)}
                        aria-describedby={errors.weekly ? 'welcome-weekly-error' : 'welcome-weekly-hint'}
                        onChange={(e) => update('weekly', e.target.value)}
                      />
                    </div>
                    {errors.weekly && (
                      <small className="welcome-error" id="welcome-weekly-error">
                        {errors.weekly}
                      </small>
                    )}
                    <small id="welcome-weekly-hint" className="welcome-help">
                      ไม่กำหนดงบตอนนี้ก็ได้
                    </small>
                  </div>
                  <div className="welcome-presets" aria-label="วงเงินแนะนำ">
                    {[1000, 2000, 3000].map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={Number(weekly) === value ? 'selected' : ''}
                        aria-pressed={Number(weekly) === value}
                        onClick={() => update('weekly', String(value))}
                      >
                        ฿{value.toLocaleString('th-TH')}
                      </button>
                    ))}
                  </div>
                  <div className="welcome-field">
                    <label htmlFor="welcome-savings">เป้าหมายเงินออมต่อเดือน (บาท)</label>
                    <div className="welcome-input-money">
                      <span aria-hidden="true">฿</span>
                      <input
                        id="welcome-savings"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={savings}
                        aria-invalid={Boolean(errors.savings)}
                        aria-describedby={errors.savings ? 'welcome-savings-error' : undefined}
                        onChange={(e) => update('savings', e.target.value)}
                      />
                    </div>
                    {errors.savings && (
                      <small className="welcome-error" id="welcome-savings-error">
                        {errors.savings}
                      </small>
                    )}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="welcome-fields">
                  <h2>เชื่อม LINE ไว้จดเงินง่าย ๆ</h2>
                  <p>
                    ส่งข้อความ เช่น “กาแฟ 45” หรือส่งรูปใบเสร็จ ให้ระบบช่วยอ่านรายการ
                    ไม่จำเป็นต้องเชื่อมตอนนี้
                  </p>
                  <div className="welcome-line-preview">
                    <span>ตัวอย่างการใช้งาน</span>
                    <div className="welcome-chat-sent">วันนี้กาแฟ 45 บาท ☕</div>
                    <div className="welcome-chat-received">
                      รับทราบ! ช่วยบันทึกรายจ่าย ฿45 ให้คุณได้เลย 💚
                    </div>
                  </div>
                  {lineConnected ? (
                    <div className="welcome-line-success">
                      <CheckCircle2 size={21} /> เชื่อม LINE สำเร็จแล้ว พร้อมใช้งาน
                    </div>
                  ) : (
                    <>
                      <button
                        className="welcome-pair-button"
                        type="button"
                        disabled={busy || codeBusy}
                        onClick={() => void createPairCode()}
                      >
                        <Link2 size={18} />{' '}
                        {codeBusy
                          ? 'กำลังสร้างรหัส...'
                          : pair
                            ? 'ขอรหัสเชื่อม LINE ใหม่'
                            : 'สร้างรหัสเชื่อม LINE'}
                      </button>
                      {pair && (
                        <div className="welcome-pair-code" aria-live="polite">
                          <span>ส่งข้อความนี้ในแชต LINE ของ MoneyFlow ภายใน 10 นาที</span>
                          <strong>เชื่อม {pair}</strong>
                          <div className="welcome-pair-actions">
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText('เชื่อม ' + pair)
                                  .then(() => notify('คัดลอกข้อความแล้ว', 'info'))
                                  .catch(() => notify('คัดลอกไม่สำเร็จ กรุณาคัดลอกข้อความเอง', 'error'));
                              }}
                            >
                              <Copy size={16} /> คัดลอกข้อความ
                            </button>
                            <button type="button" onClick={() => void checkConnection()}>
                              <CheckCircle2 size={16} /> ตรวจสอบการเชื่อม
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="welcome-note">
                    <CircleHelp size={17} /> หากข้ามไปก่อน คุณเชื่อม LINE ได้ภายหลังจากหน้า LINE & AI
                  </div>
                </div>
              )}
              <div className="welcome-actions">
                {step > 0 ? (
                  <button
                    type="button"
                    className="welcome-back"
                    disabled={busy}
                    onClick={() => {
                      setErrors({});
                      setStep((s) => Math.max(0, s - 1));
                    }}
                  >
                    <ArrowLeft size={17} /> ย้อนกลับ
                  </button>
                ) : (
                  <span className="welcome-optional-label">ปรับค่าเหล่านี้ทีหลังได้เสมอ</span>
                )}
                <button className="welcome-primary" type="submit" disabled={busy}>
                  {busy ? 'กำลังบันทึก...' : step === 2 ? 'เสร็จสิ้น ไปที่ Dashboard' : 'บันทึกและไปต่อ'}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </div>
            </form>
            <p className="welcome-footnote">
              <ShieldCheck size={15} /> ทุกขั้นตอนเป็นทางเลือก ไม่มีการเรียกเก็บเงินจากการตั้งค่า
            </p>
          </div>
          <aside className="welcome-aside" aria-label="สรุปการตั้งค่าบัญชี">
            <div className="welcome-aside-top">
              <Sparkles size={17} /> MONEY MADE SIMPLE
            </div>
            <div className="welcome-deco-wallet">
              <Wallet size={66} strokeWidth={1.45} />
              <span>♥</span>
            </div>
            <h2>
              จัดการเงินได้
              <br />
              <em>ในแบบของคุณ.</em>
            </h2>
            <p>เริ่มต้นง่าย ๆ แล้วให้ MoneyFlow ช่วยดูภาพรวมรายรับ รายจ่าย และเป้าหมายของคุณ</p>
            <div className="welcome-aside-preview">
              <span>บัญชีหลัก</span>
              <strong>{baht(Number(opening || 0))}</strong>
              <div>
                <span>งบรายสัปดาห์</span>
                <b>{weekly ? baht(Number(weekly)) : 'ยังไม่ตั้งงบ'}</b>
              </div>
              <div>
                <span>LINE</span>
                <b>{lineConnected ? 'เชื่อมแล้ว ✓' : 'เชื่อมภายหลังได้'}</b>
              </div>
            </div>
            <div className="welcome-aside-bottom">
              <CheckCircle2 size={17} /> ตั้งค่าเสร็จก็เริ่มบันทึกรายการได้ทันที
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
