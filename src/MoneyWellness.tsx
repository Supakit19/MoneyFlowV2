import React, { useEffect, useState } from 'react';
import { pushToast } from './feedback';
import { budgetProjection } from './lib/budgetForecast';
import { validateWeeklyPreferences, validateLinePreferences, type FieldErrors } from './validation';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  CalendarDays,
  Target,
  SlidersHorizontal,
  Check,
  CheckCircle2,
  Save,
  MessageCircle,
  BarChart3,
  Bell,
  ShieldCheck,
  ArrowUpRight,
  Wallet,
  CircleDollarSign,
  Sparkles,
} from 'lucide-react';

type Settings = {
  weekly_limit_satang: string | number;
  savings_goal_satang: string | number;
  confirmation_mode: 'always' | 'smart' | 'auto';
  coach_tone: 'polite' | 'friend' | 'roast';
  coach_alerts: 'every' | 'once' | 'off';
  daily_digest_enabled: boolean;
  daily_digest_hour: number;
};
type Week = {
  start: string;
  end: string;
  limitSatang: number;
  spentSatang: number;
  remainingSatang: number;
  progress: number;
  tier: string;
  daysLeftInWeek: number;
  daysLeftInMonth: number;
  daily: { date: string; label: string; spentSatang: number }[];
};
export type FinanceOverview = {
  settings: Settings;
  week: Week;
  history: { start: string; label: string; spentSatang: number; limitSatang: number }[];
  month: { month: string; incomeSatang: number; expenseSatang: number; savedSatang: number };
  categories: { month: string; categories: { label: string; spentSatang: number }[] };
  goal: { targetSatang: number; savedSatang: number };
};
const baht = (n: number) =>
  '฿' + (n / 100).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const barColor = (percent: number) =>
  percent >= 1 ? '#d76e5c' : percent >= 0.9 ? '#D8A058' : '#16a17a';
const progress = (fraction: number) => Math.min(100, Math.max(0, Math.round(fraction * 100)));
const dateWeek = (week: Week) =>
  new Date(week.start + 'T12:00:00+07:00').toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
  }) +
  ' – ' +
  new Date(week.end + 'T12:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
const sentence = (week: Week) => {
  if (!week.limitSatang) return 'ตั้งงบรายสัปดาห์ครั้งเดียว ระบบจะเริ่มนับใหม่ทุกวันจันทร์โดยอัตโนมัติ';
  if (week.tier === 'critical' || week.tier === 'over')
    return 'เกินงบแล้ว ลองพักรายจ่ายที่ไม่จำเป็นในวันที่เหลือ';
  if (week.tier === 'reached') return 'ใช้ครบงบของสัปดาห์นี้แล้ว';
  if (week.tier === 'near') return 'ใกล้เต็มงบแล้ว วางแผนให้เงินพอจนถึงวันอาทิตย์';
  if (week.tier === 'ahead') return 'ใช้เงินเร็วกว่าแผน ลองดูแนวโน้มรายจ่ายด้านล่าง';
  return 'การใช้เงินยังอยู่ในแผน เยี่ยมเลย!';
};

export function WeeklyOverview({
  overview,
  compact = false,
  onConfigure,
}: {
  overview: FinanceOverview | null;
  compact?: boolean;
  onConfigure: () => void;
}) {
  if (!overview) return <div className="mf-week-card mf-week-skeleton">กำลังโหลดข้อมูลการเงิน...</div>;
  const w = overview.week;
  const pct = progress(w.progress);
  const forecast = budgetProjection(w, overview.settings.coach_tone);
  return (
    <section className={'mf-week-card ' + (compact ? 'compact' : 'detailed')} aria-label="งบรายสัปดาห์">
      <div className="mf-week-header">
        <div className="mf-week-heading">
          <span className="mf-kicker">
            <CalendarDays size={15} /> WEEKLY BUDGET
          </span>
          <h3>งบประมาณสัปดาห์นี้</h3>
          <p>{dateWeek(w)} · รีเซ็ตทุกวันจันทร์</p>
        </div>
        <button className="mf-quiet-action" onClick={onConfigure}>
          <SlidersHorizontal size={16} /> {w.limitSatang ? 'แก้ไขงบ' : 'ตั้งงบรายสัปดาห์'}
        </button>
      </div>
      <div className="mf-week-total">
        <div>
          <span>ใช้ไปแล้ว</span>
          <strong>{baht(w.spentSatang)}</strong>
        </div>
        <div className="mf-week-remain">
          <span>{!w.limitSatang ? 'สถานะงบ' : w.remainingSatang >= 0 ? 'เหลือใช้ได้' : 'เกินงบ'}</span>
          <strong
            className={!w.limitSatang ? 'mf-week-unset' : undefined}
            style={{ color: w.remainingSatang < 0 ? '#d76e5c' : undefined }}
          >
            {w.limitSatang ? baht(Math.abs(w.remainingSatang)) : 'ยังไม่ตั้งงบ'}
          </strong>
        </div>
      </div>
      <div
        className="mf-week-track"
        role="progressbar"
        aria-label="อัตราการใช้งบ"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: pct + '%', background: barColor(w.progress) }} />
      </div>
      <div className="mf-week-meta">
        <span>
          {w.limitSatang
            ? 'ใช้ไป ' + Math.round(w.progress * 100) + '% ของงบ ' + baht(w.limitSatang)
            : 'ยังไม่ได้ตั้งวงเงิน'}
        </span>
        <span>{w.daysLeftInWeek} วันก่อนสัปดาห์ใหม่</span>
      </div>
      <div className="mf-week-coach">
        <span>✦</span>
        <p>{sentence(w)}</p>
      </div>
      {forecast && (
        <div className="mf-week-projection" aria-label="ประมาณการงบรายสัปดาห์">
          <strong>✦ แนวโน้มใช้เงินสัปดาห์นี้</strong>
          <p>{forecast.message}</p>
          <div>
            <span>ใช้ต่อได้เฉลี่ยวันละ {baht(forecast.dailyAllowanceSatang)}</span>
            <span>คาดว่าจะใช้รวม {baht(forecast.projectedSatang)}</span>
          </div>
          <small>
            คำนวณจากค่าเฉลี่ยรายจ่าย {forecast.elapsedDays} วันที่ผ่านมา เป็นการประมาณ
            ไม่ใช่ยอดเงินที่เกิดขึ้นจริง
          </small>
        </div>
      )}
      <div className="mf-week-daily" aria-label="รายจ่ายรายวันในสัปดาห์">
        {w.daily.map((day) => {
          const top = Math.max(1, ...w.daily.map((x) => x.spentSatang));
          const height = Math.max(5, Math.round((day.spentSatang / top) * 100));
          return (
            <div className="mf-daybar" key={day.date} title={day.label + ' ' + baht(day.spentSatang)}>
              <div className="mf-daybar-column">
                <span style={{ height: height + '%', opacity: day.spentSatang ? 1 : 0.25 }} />
              </div>
              <small>{day.label}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function FinanceCharts({ overview }: { overview: FinanceOverview | null }) {
  if (!overview) return null;
  const history = overview.history.map((w) => ({
    week: w.label,
    spent: w.spentSatang / 100,
    limit: w.limitSatang / 100,
  }));
  const categories = overview.categories.categories.map((x) => ({
    name: x.label,
    spent: x.spentSatang / 100,
  }));
  return (
    <div className="mf-insights-grid">
      <section className="panel mf-insight">
        <div className="mf-insight-head">
          <div>
            <span className="mf-kicker">TREND ANALYTICS</span>
            <h3>8 สัปดาห์ที่ผ่านมา</h3>
          </div>
          <BarChart3 size={18} />
        </div>
        <p>เทียบการใช้จ่ายแต่ละสัปดาห์กับงบที่ตั้งไว้</p>
        <div className="mf-chart-container">
          {!history.length ? (
            <div className="mf-chart-empty">
              ยังไม่มีข้อมูลรายจ่ายย้อนหลัง เริ่มบันทึกรายการเพื่อดูกราฟแนวโน้มที่นี่
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 8, right: 0, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#EDF0EA" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#84988A' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#84988A' }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip
                  cursor={{ fill: '#F1F7F0' }}
                  formatter={(v: any) =>
                    '฿' + Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 })
                  }
                />
                <Bar
                  dataKey="spent"
                  name="รายจ่าย"
                  fill="#129D79"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
      <section className="panel mf-insight">
        <div className="mf-insight-head">
          <div>
            <span className="mf-kicker">SPENDING BREAKDOWN</span>
            <h3>รายจ่ายตามหมวดหมู่</h3>
          </div>
          <CircleDollarSign size={18} />
        </div>
        <p>เดือน {overview.categories.month} · หมวดที่ใช้งบมากที่สุด</p>
        <div className="mf-category-list">
          {categories.length ? (
            categories.map((cat, i) => {
              const max = Math.max(1, ...categories.map((c) => c.spent));
              return (
                <div className="mf-category-row" key={cat.name}>
                  <div>
                    <span>{cat.name}</span>
                    <strong>฿{cat.spent.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="mf-category-track">
                    <i
                      style={{
                        width: Math.max(1, (cat.spent / max) * 100) + '%',
                        background: i === 0 ? '#149E79' : i === 1 ? '#D3A261' : '#A4CAB3',
                      }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mf-chart-empty">
              ยังไม่มีรายจ่ายในเดือนนี้ เริ่มบันทึกรายการผ่านเว็บหรือ LINE ได้เลย
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const modes = [
  {
    value: 'always',
    name: 'ยืนยันทุกครั้ง',
    description: 'ให้ตรวจยอดและร้านค้าก่อนทุกครั้ง ปลอดภัยสำหรับเริ่มใช้',
  },
  { value: 'smart', name: 'อัจฉริยะ', description: 'รายการชัดเจนบันทึกเลย รูปหรือรายการกำกวมให้ยืนยัน' },
  {
    value: 'auto',
    name: 'อัตโนมัติ',
    description: 'บันทึกทันทีหาก AI อ่านข้อมูลชัดเจน พร้อมสรุปรายการ',
  },
] as const;
const tones = [
  { value: 'polite', name: 'สุภาพ 🌿', description: 'แนะนำอย่างเป็นมิตร' },
  { value: 'friend', name: 'เพื่อนสนิท 😎', description: 'แซวกวนๆ ให้กำลังใจ' },
  { value: 'roast', name: 'หัวร้อน 🔥', description: 'แซวแรงขึ้นเมื่อใช้งบเกิน' },
] as const;
const alerts = [
  { value: 'every', name: 'ทุกครั้งที่เกินเกณฑ์' },
  { value: 'once', name: 'ครั้งแรกของแต่ละระดับ' },
  { value: 'off', name: 'ปิดคำเตือน' },
] as const;

export function FinanceSettings({
  overview,
  variant,
  onSaved,
  disabled = false,
}: {
  overview: FinanceOverview | null;
  variant: 'weekly' | 'line';
  onSaved: () => Promise<void>;
  disabled?: boolean;
}) {
  const [limit, setLimit] = useState('0');
  const [goal, setGoal] = useState('0');
  const [mode, setMode] = useState<Settings['confirmation_mode']>('always');
  const [tone, setTone] = useState<Settings['coach_tone']>('friend');
  const [alert, setAlert] = useState<Settings['coach_alerts']>('every');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearField = (name: string) => {
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setNotice('');
    setNoticeError(false);
  };
  useEffect(() => {
    if (!overview) return;
    const s = overview.settings;
    setLimit(String(Number(s.weekly_limit_satang) / 100));
    setGoal(String(Number(s.savings_goal_satang) / 100));
    setMode(s.confirmation_mode);
    setTone(s.coach_tone);
    setAlert(s.coach_alerts);
  }, [overview?.settings]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return pushToast('warning', 'โหมดตัวอย่างไม่สามารถบันทึกการตั้งค่าได้');
    if (busy) return;
    const problems =
      variant === 'weekly'
        ? validateWeeklyPreferences(limit, goal)
        : validateLinePreferences({
            confirmation_mode: mode,
            coach_tone: tone,
            coach_alerts: alert,
          });
    setErrors(problems);
    if (Object.keys(problems).length) {
      setNotice('กรุณาตรวจสอบช่องที่มีกรอบสีแดง');
      setNoticeError(true);
      pushToast('error', 'ข้อมูลการตั้งค่าไม่ครบหรือไม่ถูกต้อง กรุณาแก้ไขก่อนบันทึก');
      const form = e.currentTarget;
      requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setNotice('');
    setNoticeError(false);
    try {
      const payload =
        variant === 'weekly'
          ? { weekly_limit: Number(limit), savings_goal: Number(goal) }
          : {
              confirmation_mode: mode,
              coach_tone: tone,
              coach_alerts: alert,
            };
      const r = await fetch('/api/finance/preferences', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw Error(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ');
      try {
        await onSaved();
      } catch {
        pushToast(
          'warning',
          'บันทึกการตั้งค่าสำเร็จ แต่ยังโหลดข้อมูลล่าสุดไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ',
        );
      }
      setNotice('บันทึกการตั้งค่าเรียบร้อยแล้ว');
      pushToast(
        'success',
        variant === 'weekly'
          ? 'บันทึกงบรายสัปดาห์และเป้าหมายออมเรียบร้อยแล้ว'
          : 'บันทึกการตั้งค่า LINE และ AI Coach เรียบร้อยแล้ว',
      );
    } catch (error: any) {
      const message = String(error?.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
      setNotice(message);
      setNoticeError(true);
      pushToast('error', message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mf-setting-card">
      <form noValidate onSubmit={save}>
        <div className="mf-setting-head">
          <div>
            <span className="mf-kicker">
              <SlidersHorizontal size={14} /> PERSONAL SETTINGS
            </span>
            <h3>{variant === 'weekly' ? 'วางแผนเงินของคุณ' : 'ตั้งค่า LINE และ AI Coach'}</h3>
            <p>
              {variant === 'weekly'
                ? 'ตั้งเพียงครั้งเดียว ระบบใช้ค่าต่อไปในทุกสัปดาห์และเก็บประวัติไว้'
                : 'ปรับการยืนยันรายการและบุคลิก AI ให้เหมาะกับคุณ'}
            </p>
          </div>
          <button type="submit" className="mf-save mf-desktop-save" disabled={busy || disabled}>
            {busy ? (
              'กำลังบันทึก...'
            ) : (
              <>
                <Save size={16} /> บันทึกการตั้งค่า
              </>
            )}
          </button>
        </div>
        {variant === 'weekly' ? (
          <>
            <div className="mf-fieldgrid">
              <label className={'mf-field ' + (errors.weekly_limit ? 'has-error' : '')}>
                <span>
                  <CalendarDays size={17} /> งบรายสัปดาห์ (บาท) <span className="mf-required">*</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={10000000}
                  step=".01"
                  inputMode="decimal"
                  aria-invalid={!!errors.weekly_limit}
                  aria-describedby={errors.weekly_limit ? 'mf-weekly-limit-error' : undefined}
                  className={errors.weekly_limit ? 'mf-invalid' : ''}
                  value={limit}
                  onChange={(e) => {
                    setLimit(e.target.value);
                    clearField('weekly_limit');
                  }}
                />
                {errors.weekly_limit && (
                  <small className="mf-field-error" id="mf-weekly-limit-error" role="alert">
                    {errors.weekly_limit}
                  </small>
                )}
                <small>วันจันทร์–อาทิตย์ · ใช้ค่าเดิมต่อเนื่องจนกว่าจะมาแก้</small>
              </label>
              <label className={'mf-field ' + (errors.savings_goal ? 'has-error' : '')}>
                <span>
                  <Target size={17} /> เป้าหมายออมต่อเดือน (บาท) <span className="mf-required">*</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={10000000}
                  step=".01"
                  inputMode="decimal"
                  aria-invalid={!!errors.savings_goal}
                  aria-describedby={errors.savings_goal ? 'mf-savings-goal-error' : undefined}
                  className={errors.savings_goal ? 'mf-invalid' : ''}
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    clearField('savings_goal');
                  }}
                />
                {errors.savings_goal && (
                  <small className="mf-field-error" id="mf-savings-goal-error" role="alert">
                    {errors.savings_goal}
                  </small>
                )}
                <small>เทียบกับรายรับหักรายจ่ายของเดือน · ตั้ง 0 เพื่อปิดเป้าหมาย</small>
              </label>
            </div>
            <div className="mf-setting-tip">
              <Target size={20} />
              <div>
                <strong>วางแผนเพื่อสิ้นเดือน</strong>
                <p>
                  ยอดในแต่ละสัปดาห์เป็นอิสระ ส่วนยอดเงินรายรับ–รายจ่ายและเป้าหมายออมยังเก็บตามเดือนเดิม
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mf-setting-section">
              <h4>
                <ShieldCheck size={18} /> ยืนยันก่อนบันทึก LINE
              </h4>
              <p>เลือกว่าต้องการตรวจรายการก่อนบันทึกทุกครั้งหรือให้ระบบบันทึกให้</p>
              <div className="mf-choicegrid triple">
                {modes.map((item) => (
                  <label
                    key={item.value}
                    className={'mf-choice ' + (mode === item.value ? 'selected' : '')}
                  >
                    <input
                      type="radio"
                      name="confirmation_mode"
                      value={item.value}
                      checked={mode === item.value}
                      onChange={() => setMode(item.value)}
                    />
                    <span className="mf-choice-dot">{mode === item.value && <Check size={13} />}</span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </label>
                ))}
              </div>
            </div>
            <div className="mf-setting-section">
              <h4>
                <Sparkles size={18} /> บุคลิก AI Money Coach
              </h4>
              <p>ระดับแซวที่คุณเลือกจะใช้เมื่อใกล้เต็มงบหรือใช้เกินงบเท่านั้น</p>
              <div className="mf-choicegrid triple">
                {tones.map((item) => (
                  <label
                    key={item.value}
                    className={'mf-choice ' + (tone === item.value ? 'selected' : '')}
                  >
                    <input
                      type="radio"
                      name="coach_tone"
                      value={item.value}
                      checked={tone === item.value}
                      onChange={() => setTone(item.value)}
                    />
                    <span className="mf-choice-dot">{tone === item.value && <Check size={13} />}</span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </label>
                ))}
              </div>
            </div>
            <div className="mf-setting-section">
              <h4>
                <Bell size={18} /> ความถี่การเตือน
              </h4>
              <div className="mf-choicegrid triple">
                {alerts.map((item) => (
                  <label
                    key={item.value}
                    className={'mf-choice concise ' + (alert === item.value ? 'selected' : '')}
                  >
                    <input
                      type="radio"
                      name="coach_alerts"
                      value={item.value}
                      checked={alert === item.value}
                      onChange={() => setAlert(item.value)}
                    />
                    <span className="mf-choice-dot">{alert === item.value && <Check size={13} />}</span>
                    <strong>{item.name}</strong>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="mf-setting-footer">
          <p className={noticeError ? 'mf-inline-error' : ''}>
            {notice ? (
              <>
                <CheckCircle2 size={16} /> {notice}
              </>
            ) : (
              <>
                <ShieldCheck size={16} /> เปลี่ยนการตั้งค่าได้ทุกเมื่อ ข้อมูลเก่าไม่ถูกลบ
              </>
            )}
          </p>
          <button type="submit" className="mf-save mf-mobile-save" disabled={busy || disabled}>
            {busy ? (
              'กำลังบันทึก...'
            ) : (
              <>
                <Save size={17} /> บันทึกการตั้งค่า
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
export function SavingsOverview({
  overview,
  onConfigure,
}: {
  overview: FinanceOverview | null;
  onConfigure: () => void;
}) {
  if (!overview) return null;
  const { targetSatang, savedSatang } = overview.goal;
  return (
    <section className="mf-savings-card">
      <div className="mf-savings-heading">
        <div>
          <span className="mf-kicker">SAVE FOR YOUR FUTURE</span>
          <h3>เป้าหมายการออม</h3>
        </div>
        <button className="mf-quiet-action" onClick={onConfigure}>
          <Target size={16} /> ตั้งเป้าหมาย
        </button>
      </div>
      <div className="mf-savings-numbers">
        <div>
          <span>ออมได้สุทธิเดือนนี้</span>
          <strong>{baht(savedSatang)}</strong>
        </div>
        <div>
          <span>เป้าหมาย</span>
          <strong>{baht(targetSatang)}</strong>
        </div>
      </div>
      <div className="mf-week-track">
        <div
          style={{
            width: targetSatang ? progress(savedSatang / targetSatang) + '%' : '0%',
            background: '#16a17a',
          }}
        />
      </div>
      <p>
        {targetSatang > 0
          ? savedSatang >= targetSatang
            ? 'ถึงเป้าหมายแล้ว เก่งมาก! 🎉'
            : 'อีก ' + baht(targetSatang - savedSatang) + ' จะถึงเป้าหมายเดือนนี้'
          : 'เริ่มตั้งเป้าหมายการออมได้ที่เมนูงบประมาณ'}
      </p>
    </section>
  );
}
