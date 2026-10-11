import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  CircleAlert,
  House,
  Landmark,
  List,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Data, Entry } from '../lib/finance';
import type { FinanceOverview } from '../MoneyWellness';
import FlowLoader from '../components/FlowLoader';
import { websiteFallbackForPocket } from '../app/entry-routes';
import { budgetProjection } from '../lib/budgetForecast';
import './MiniApp.css';

type Tab = 'home' | 'history' | 'wallets' | 'review';
type Kind = 'expense' | 'income';
const cash = (satang: number | string) =>
  '฿' +
  (Number(satang || 0) / 100).toLocaleString('th-TH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
  });
const monthKey = (date: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date(date));
const monthTitle = () =>
  new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date());

export default function MiniApp() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<Data | null>(null);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [name, setName] = useState('คุณ');
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'setup' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<Kind>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);
  const [weeklyLimit, setWeeklyLimit] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState('');
  const [reviewItems, setReviewItems] = useState<
    Array<{
      id: string;
      bank: string;
      kind: 'income' | 'expense' | null;
      amountSatang: number | null;
      accountId: string | null;
      reason: string | null;
    }>
  >([]);
  const [reviewTransfers, setReviewTransfers] = useState<
    Array<{
      outId: string;
      inId: string;
      amountSatang: number;
      sourceName: string;
      destinationName: string;
    }>
  >([]);
  const [reviewDraft, setReviewDraft] = useState<
    Record<string, { kind: 'income' | 'expense'; amount: string }>
  >({});
  const [reviewBusy, setReviewBusy] = useState(false);

  async function refresh() {
    const [money, summary, profile] = await Promise.all([
      api('/data'),
      api('/finance/overview'),
      api('/me'),
    ]);
    setData(money as Data);
    setOverview(summary as FinanceOverview);
    setName(String(profile.display_name || 'คุณ'));
    setPageState('ready');
    return money as Data;
  }

  async function bootstrap() {
    setPageState('loading');
    setMessage('');
    try {
      const config = (await api('/mini/config')) as { enabled: boolean; liffId: string };
      if (!config.enabled || !config.liffId) {
        // The Pocket view is exclusively for the LINE app, not website login.
        navigate('/login', { replace: true });
        return;
      }

      const liff = (await import('@line/liff')).default;
      // LINE explicitly supports isInClient() before init(). Do not initialize
      // or attempt LIFF Login from a regular website browser; it must keep
      // the normal /login -> /welcome|/dashboard flow instead.
      const websiteDestination = websiteFallbackForPocket(liff.isInClient());
      if (websiteDestination) {
        navigate(websiteDestination, { replace: true });
        return;
      }
      // LIFF Pocket always verifies the active LINE identity, even when
      // a web session already exists on the device.
      await liff.init({ liffId: config.liffId });
      if (!liff.isLoggedIn()) throw Error('LINE_LOGIN_REQUIRED');
      const idToken = liff.getIDToken();
      if (!idToken) throw Error('LINE_ID_TOKEN_MISSING');
      const signedIn = (await api('/mini/auth', 'POST', { idToken })) as {
        ok: boolean;
        created?: boolean;
      };
      await refresh();
      if (signedIn.created) setToast('ยินดีต้อนรับสู่ MoneyFlow! สมุดเงินของคุณพร้อมแล้ว');
    } catch (error: any) {
      setMessage(
        error?.status === 403
          ? 'คำขอยืนยันตัวตนไม่ผ่านการตรวจสอบ กรุณาเปิด MoneyFlow ผ่าน LINE ใหม่อีกครั้ง'
          : 'ไม่สามารถยืนยันตัวตนผ่าน LINE ได้ กรุณาลองใหม่หรือเข้าสู่ระบบบนเว็บไซต์',
      );
      setPageState('error');
    }
  }
  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (tab !== 'review' || pageState !== 'ready') return;
    void loadReviews();
  }, [tab, pageState]);

  async function loadReviews() {
    try {
      const result = await api('/finance/inbox');
      setReviewItems(result.review || []);
      setReviewTransfers(result.transfers || []);
      setReviewDraft((previous) => {
        const next = { ...previous };
        for (const row of result.review || []) {
          if (!next[row.id])
            next[row.id] = {
              kind: row.kind || 'expense',
              amount: row.amountSatang ? String(row.amountSatang / 100) : '',
            };
        }
        return next;
      });
    } catch (e: any) {
      setToast(e.message || 'โหลดรายการตรวจสอบไม่สำเร็จ');
    }
  }

  async function approveReview(row: { id: string; accountId: string | null }) {
    if (reviewBusy) return;
    const draft = reviewDraft[row.id],
      amountValue = draft?.amount || '';
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amountValue) || Number(amountValue) <= 0 || !row.accountId) {
      setToast('กรุณาตรวจสอบยอดและบัญชีที่ผูกธนาคาร');
      return;
    }
    setReviewBusy(true);
    try {
      await api('/finance/inbox/' + row.id + '/confirm', 'POST', {
        kind: draft.kind,
        amountSatang: Math.round(Number(amountValue) * 100),
        accountId: row.accountId,
      });
      await Promise.all([refresh(), loadReviews()]);
      setToast('บันทึกรายการที่ตรวจสอบแล้ว');
    } catch (e: any) {
      setToast(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setReviewBusy(false);
    }
  }
  async function rejectReview(row: { id: string }) {
    if (reviewBusy || !window.confirm('ไม่บันทึกแจ้งเตือนนี้ใช่ไหม?')) return;
    setReviewBusy(true);
    try {
      await api('/finance/inbox/' + row.id + '/reject', 'POST', {});
      await loadReviews();
      setToast('ไม่บันทึกแจ้งเตือนนี้แล้ว');
    } catch (e: any) {
      setToast(e.message || 'ทำรายการไม่สำเร็จ');
    } finally {
      setReviewBusy(false);
    }
  }
  async function approveTransfer(pair: { outId: string; inId: string }) {
    if (reviewBusy || !window.confirm('ยืนยันว่าเป็นการโอนเงินระหว่างบัญชีของคุณเองจริงหรือไม่?'))
      return;
    setReviewBusy(true);
    try {
      await api('/finance/transfers/confirm', 'POST', pair);
      await Promise.all([refresh(), loadReviews()]);
      setToast('จับคู่เป็นรายการโอนเรียบร้อย');
    } catch (e: any) {
      setToast(e.message || 'จับคู่ไม่สำเร็จ');
    } finally {
      setReviewBusy(false);
    }
  }

  const accounts = data?.accounts || [];
  const categories = data?.categories || [];
  const transactions = data?.transactions || [];
  const thisMonth = useMemo(
    () =>
      transactions.filter((item) => {
        try {
          return monthKey(item.transacted_at) === monthKey(new Date().toISOString());
        } catch {
          return false;
        }
      }),
    [transactions],
  );
  const monthExpense =
    overview?.month.expenseSatang ??
    thisMonth.filter((r) => r.kind === 'expense').reduce((s, r) => s + Number(r.amount_satang), 0);
  const monthIncome =
    overview?.month.incomeSatang ??
    thisMonth.filter((r) => r.kind === 'income').reduce((s, r) => s + Number(r.amount_satang), 0);
  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance_satang), 0);
  const week = overview?.week;
  const forecast = week ? budgetProjection(week, overview?.settings.coach_tone) : null;
  const spentPercent = week?.limitSatang
    ? Math.max(0, Math.round((week.spentSatang / week.limitSatang) * 100))
    : 0;

  function openForm(nextKind: Kind = 'expense') {
    if (!accounts.length || !categories.some((c) => c.kind === nextKind)) {
      setToast('กรุณาเพิ่มบัญชีและหมวดหมู่ผ่านเว็บไซต์ก่อนบันทึก');
      return;
    }
    setKind(nextKind);
    setDescription('');
    setAmount('');
    setAccountId(accounts[0].id);
    setCategoryId(categories.find((c) => c.kind === nextKind)?.id || '');
    setFormError('');
    setAdding(true);
  }
  function updateKind(next: Kind) {
    setKind(next);
    setCategoryId(categories.find((c) => c.kind === next)?.id || '');
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const baht = Number(amount);
    if (
      !description.trim() ||
      description.length > 120 ||
      !Number.isFinite(baht) ||
      baht <= 0 ||
      !/^\d{1,8}(?:\.\d{1,2})?$/.test(amount.trim()) ||
      !accountId ||
      !categoryId
    ) {
      setFormError('กรุณากรอกชื่อรายการ ยอดเงิน และเลือกบัญชีให้ครบ');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await api('/transactions', 'POST', {
        kind,
        amount: baht,
        merchant: description.trim(),
        account_id: accountId,
        category_id: categoryId,
        transacted_at: new Date().toISOString(),
        note: '',
      });
      await refresh();
      setAdding(false);
      setToast('บันทึกรายการเรียบร้อยแล้ว');
      setTab('home');
    } catch (error: any) {
      setFormError(error.message || 'ยังบันทึกไม่ได้ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  async function saveBudget(e: React.FormEvent) {
    e.preventDefault();
    if (budgetSaving) return;
    const baht = Number(weeklyLimit);
    if (
      !Number.isFinite(baht) ||
      baht < 0 ||
      baht > 10000000 ||
      !/^\d{1,8}(?:\.\d{1,2})?$/.test(weeklyLimit.trim())
    ) {
      setBudgetError('กรุณากรอกงบเป็นจำนวนเงินที่ถูกต้อง หรือใส่ 0 เพื่อยกเลิกงบ');
      return;
    }
    setBudgetError('');
    setBudgetSaving(true);
    try {
      await api('/finance/preferences', 'PUT', { weekly_limit: baht });
      await refresh();
      setEditingBudget(false);
      setToast('บันทึกงบรายสัปดาห์แล้ว');
    } catch (error: any) {
      setBudgetError(error.message || 'บันทึกงบไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setBudgetSaving(false);
    }
  }
  function openBudget() {
    setWeeklyLimit(String(Number(overview?.week.limitSatang || 0) / 100));
    setBudgetError('');
    setEditingBudget(true);
  }

  return (
    <div className="mf-mini">
      <div className="mf-mini-frame">
        {pageState !== 'ready' ? (
          <div className="mf-mini-gate">
            {pageState === 'loading' ? (
              <FlowLoader message="เรากำลังเตรียมภาพรวมการเงินของคุณ" />
            ) : (
              <>
                <div className="mf-mini-gate-logo">
                  <span>
                    m<span className="mf-mini-dot">.</span>
                  </span>
                </div>
                <h1>MoneyFlow</h1>
                <p className="mf-mini-gate-kicker">พื้นที่จัดการเงินของคุณ</p>
                <div className="mf-mini-gate-card">
                  {pageState === 'setup' ? <Sparkles size={26} /> : <CircleAlert size={26} />}
                  <h2>
                    {pageState === 'setup' ? 'หน้าจัดการเงินบนมือถือพร้อมแล้ว' : 'เปิดหน้านี้ไม่สำเร็จ'}
                  </h2>
                  <p>
                    {pageState === 'setup'
                      ? 'ยังไม่ได้เปิดใช้งาน MoneyFlow Pocket กรุณาใช้เว็บไซต์ก่อน'
                      : message}
                  </p>
                  <a className="mf-mini-main-link" href="/login">
                    ไปที่เว็บไซต์ MoneyFlow <ArrowRight size={17} />
                  </a>
                </div>
                <button className="mf-mini-retry" onClick={() => void bootstrap()}>
                  <RefreshCw size={16} /> ลองอีกครั้ง
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <header className="mf-mini-head">
              <div className="mf-mini-brand">
                <span className="mf-mini-brand-icon">m.</span> moneyflow
                <span className="mf-mini-brand-stop">.</span>
              </div>
              <span className="mf-mini-line-pill">
                <span /> จัดการเงินของฉัน
              </span>
            </header>
            <main className="mf-mini-main">
              {tab === 'home' && (
                <>
                  <section className="mf-mini-welcome">
                    <p>
                      สวัสดี, {name.split(' ')[0]} <span aria-hidden="true">✦</span>
                    </p>
                    <h1>
                      เงินของฉัน <em>วันนี้</em>
                    </h1>
                    <small>สรุปยอดจากรายการที่บันทึกไว้</small>
                  </section>
                  <section className="mf-mini-balance">
                    <div className="mf-mini-balance-top">
                      <span>ยอดเงินรวมทุกบัญชี</span>
                      <Wallet size={19} />
                    </div>
                    <strong>{cash(totalBalance)}</strong>
                    <div className="mf-mini-balance-line">
                      <span>{accounts.length} บัญชีที่ติดตามอยู่</span>
                      <span>อัปเดตล่าสุด</span>
                    </div>
                    <div className="mf-mini-balance-pattern" aria-hidden="true" />
                  </section>
                  <div className="mf-mini-two-stats">
                    <div className="mf-mini-stat in">
                      <span>
                        <ArrowDownLeft size={16} /> เงินเข้าเดือนนี้
                      </span>
                      <strong>{cash(monthIncome)}</strong>
                    </div>
                    <div className="mf-mini-stat out">
                      <span>
                        <ArrowUpRight size={16} /> ใช้ไปเดือนนี้
                      </span>
                      <strong>{cash(monthExpense)}</strong>
                    </div>
                  </div>
                  <div className="mf-mini-section-heading">
                    <h2>งบสัปดาห์นี้</h2>
                    <button onClick={openBudget}>
                      ปรับงบ <ChevronRight size={16} />
                    </button>
                  </div>
                  <section className="mf-mini-week">
                    {week?.limitSatang ? (
                      <>
                        <div className="mf-mini-week-top">
                          <div>
                            <small>ยังใช้ได้อีก</small>
                            <strong>{cash(Math.max(0, week.remainingSatang))}</strong>
                          </div>
                          <span
                            className={spentPercent >= 100 ? 'over' : spentPercent >= 85 ? 'near' : ''}
                          >
                            {spentPercent >= 100
                              ? 'ใช้ครบแล้ว'
                              : spentPercent >= 85
                                ? 'ใกล้ครบแล้ว'
                                : 'ยังอยู่ในงบ'}
                          </span>
                        </div>
                        <div className="mf-mini-track">
                          <i style={{ width: Math.min(100, spentPercent) + '%' }} />
                        </div>
                        <p>
                          ใช้ไป {cash(week.spentSatang)} จาก {cash(week.limitSatang)} ({spentPercent}%)
                        </p>
                      </>
                    ) : (
                      <div className="mf-mini-week-empty">
                        <span>ยังไม่ได้กำหนดงบรายสัปดาห์</span>
                        <button className="mf-mini-budget-setup" onClick={openBudget}>
                          ตั้งงบเลย <ChevronRight size={15} />
                        </button>
                      </div>
                    )}
                  </section>
                  {forecast && (
                    <div className="mf-mini-budget-projection">
                      <strong>✦ แนวโน้มการใช้เงิน</strong>
                      <p>{forecast.message}</p>
                      <small>
                        ประมาณการใช้ทั้งสัปดาห์ {cash(forecast.projectedSatang)} · ใช้ต่อได้วันละ{' '}
                        {cash(forecast.dailyAllowanceSatang)}
                      </small>
                    </div>
                  )}
                  <div className="mf-mini-section-heading">
                    <h2>หมดไปกับอะไรบ้าง</h2>
                    <span>{monthTitle()}</span>
                  </div>
                  <section className="mf-mini-category-list">
                    {overview?.categories.categories.length ? (
                      overview.categories.categories.slice(0, 4).map((category) => (
                        <div className="mf-mini-category" key={category.label}>
                          <div>
                            <strong>{category.label}</strong>
                            <span>{cash(category.spentSatang)}</span>
                          </div>
                          <div className="mf-mini-category-bar">
                            <i
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    (category.spentSatang / Math.max(monthExpense, 1)) * 100,
                                  ) + '%',
                              }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="mf-mini-empty">ยังไม่มีรายจ่ายในเดือนนี้</div>
                    )}
                  </section>
                  <div className="mf-mini-section-heading">
                    <h2>รายการล่าสุด</h2>
                    <button onClick={() => setTab('history')}>
                      ดูทั้งหมด <ChevronRight size={17} />
                    </button>
                  </div>
                  <section className="mf-mini-transaction-list">
                    {transactions.length ? (
                      transactions
                        .slice(0, 4)
                        .map((item) => <TransactionItem key={item.id} item={item} />)
                    ) : (
                      <div className="mf-mini-empty">ยังไม่มีรายการ เริ่มบันทึกค่าใช้จ่ายแรกได้เลย</div>
                    )}
                  </section>
                </>
              )}
              {tab === 'history' && (
                <>
                  <section className="mf-mini-tab-title">
                    <small>การเคลื่อนไหวเงิน</small>
                    <h1>รายการของฉัน</h1>
                    <p>บันทึกแล้ว {transactions.length} รายการล่าสุด</p>
                  </section>
                  <div className="mf-mini-section-heading">
                    <h2>รายการที่บันทึกไว้</h2>
                    <span>{monthTitle()}</span>
                  </div>
                  <section className="mf-mini-transaction-list">
                    {transactions.length ? (
                      transactions
                        .slice(0, 80)
                        .map((item) => <TransactionItem key={item.id} item={item} />)
                    ) : (
                      <div className="mf-mini-empty">ยังไม่มีรายการบันทึก</div>
                    )}
                  </section>
                </>
              )}
              {tab === 'review' && (
                <>
                  <section className="mf-mini-tab-title">
                    <small>ตรวจเองก่อนบันทึก</small>
                    <h1>รายการรอตรวจสอบ</h1>
                    <p>ยอดไม่ชัดเจนหรืออาจเป็นการโอนเงินระหว่างบัญชีจะรอให้คุณยืนยันที่นี่</p>
                  </section>
                  {reviewItems.length === 0 && reviewTransfers.length === 0 && (
                    <div className="mf-mini-empty">ยังไม่มีรายการที่ต้องตรวจสอบ</div>
                  )}
                  {reviewItems.map((row) => {
                    const draft = reviewDraft[row.id] || {
                      kind: row.kind || 'expense',
                      amount: row.amountSatang ? String(row.amountSatang / 100) : '',
                    };
                    return (
                      <section className="mf-mini-review" key={row.id}>
                        <strong>{row.bank}</strong>
                        <p>{row.reason || 'กรุณาตรวจข้อมูลในแอปธนาคารก่อนยืนยัน'}</p>
                        <label className="mf-mini-form-label">
                          เงินเข้า / เงินออก
                          <select
                            value={draft.kind}
                            onChange={(e) =>
                              setReviewDraft((s) => ({
                                ...s,
                                [row.id]: { ...draft, kind: e.target.value as 'income' | 'expense' },
                              }))
                            }
                          >
                            <option value="expense">เงินออก</option>
                            <option value="income">เงินเข้า</option>
                          </select>
                        </label>
                        <label className="mf-mini-form-label">
                          จำนวนเงิน (บาท)
                          <input
                            inputMode="decimal"
                            value={draft.amount}
                            placeholder="0.00"
                            onChange={(e) =>
                              setReviewDraft((s) => ({
                                ...s,
                                [row.id]: { ...draft, amount: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <p>
                          บัญชี:{' '}
                          {accounts.find((a) => a.id === row.accountId)?.name ||
                            'ต้องตั้งค่าบัญชีธนาคารในเว็บก่อน'}
                        </p>
                        <div className="mf-mini-review-actions">
                          <button
                            disabled={reviewBusy || !row.accountId}
                            onClick={() => void approveReview(row)}
                          >
                            ยืนยันยอด
                          </button>
                          <button
                            disabled={reviewBusy}
                            className="skip"
                            onClick={() => void rejectReview(row)}
                          >
                            ไม่บันทึก
                          </button>
                        </div>
                      </section>
                    );
                  })}
                  {reviewTransfers.map((pair) => (
                    <section key={pair.outId + '-' + pair.inId} className="mf-mini-review">
                      <strong>อาจเป็นการโอนระหว่างบัญชีของฉัน</strong>
                      <h2>{cash(pair.amountSatang)}</h2>
                      <p>
                        {pair.sourceName} → {pair.destinationName}
                      </p>
                      <p>ตรวจสอบยอดทั้งสองฝั่งในแอปธนาคารก่อนกดจับคู่</p>
                      <button disabled={reviewBusy} onClick={() => void approveTransfer(pair)}>
                        จับคู่เป็นรายการโอน
                      </button>
                    </section>
                  ))}
                  <button className="mf-mini-outline-link" onClick={() => void loadReviews()}>
                    โหลดรายการล่าสุด <RefreshCw size={16} />
                  </button>
                </>
              )}
              {tab === 'wallets' && (
                <>
                  <section className="mf-mini-tab-title">
                    <small>ทุกบัญชีในที่เดียว</small>
                    <h1>บัญชีของฉัน</h1>
                    <p>ยอดคงเหลือจากรายการที่คุณบันทึกไว้ ไม่ใช่ยอดจากธนาคารโดยตรง</p>
                  </section>
                  <section className="mf-mini-account-list">
                    {accounts.map((account) => (
                      <div className="mf-mini-account" key={account.id}>
                        <span className="mf-mini-account-icon">
                          <Landmark size={19} />
                        </span>
                        <div>
                          <strong>{account.name}</strong>
                          <small>
                            {account.kind === 'cash'
                              ? 'เงินสด'
                              : account.kind === 'wallet'
                                ? 'กระเป๋าเงิน'
                                : 'บัญชีธนาคาร'}
                          </small>
                        </div>
                        <b>{cash(account.balance_satang)}</b>
                      </div>
                    ))}
                  </section>
                  <a className="mf-mini-outline-link" href="/accounts">
                    จัดการบัญชีทั้งหมดบนเว็บไซต์ <ArrowRight size={17} />
                  </a>
                  <div className="mf-mini-privacy">
                    <ShieldCheck size={18} />
                    <span>ข้อมูลส่วนตัวของคุณใช้ร่วมกับบัญชี MoneyFlow เดิม ไม่ต้องสร้างข้อมูลซ้ำ</span>
                  </div>
                </>
              )}
              <p className="mf-mini-footnote">MoneyFlow · จัดการเงินในแบบของคุณ</p>
            </main>
            <button className="mf-mini-add" onClick={() => openForm()} aria-label="บันทึกรายการใหม่">
              <Plus size={25} />
            </button>
            <nav className="mf-mini-tabs" aria-label="เมนูจัดการเงิน">
              <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>
                <House size={21} />
                <span>หน้าแรก</span>
              </button>
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
                <List size={21} />
                <span>รายการ</span>
              </button>
              <span className="mf-mini-add-space" aria-hidden="true" />
              <button className={tab === 'wallets' ? 'active' : ''} onClick={() => setTab('wallets')}>
                <Wallet size={21} />
                <span>บัญชี</span>
              </button>
              <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
                <ClipboardCheck size={21} />
                <span>ตรวจสอบ</span>
              </button>
            </nav>
          </>
        )}
        {toast && (
          <div className="mf-mini-toast" role="status" onClick={() => setToast('')}>
            <Check size={17} /> {toast}
            <button aria-label="ปิดการแจ้งเตือน">
              <X size={13} />
            </button>
          </div>
        )}
        {editingBudget && (
          <div
            className="mf-mini-sheet-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !budgetSaving) setEditingBudget(false);
            }}
          >
            <form className="mf-mini-sheet" onSubmit={(e) => void saveBudget(e)}>
              <div className="mf-mini-sheet-grip" aria-hidden="true" />
              <div className="mf-mini-sheet-heading">
                <div>
                  <small>กำหนดได้เอง เปลี่ยนได้ทุกเมื่อ</small>
                  <h2>ตั้งงบรายสัปดาห์</h2>
                </div>
                <button
                  type="button"
                  aria-label="ปิด"
                  disabled={budgetSaving}
                  onClick={() => setEditingBudget(false)}
                >
                  <X size={22} />
                </button>
              </div>
              <p className="mf-mini-budget-hint">
                กำหนดจำนวนเงินที่อยากใช้ไม่เกินในแต่ละสัปดาห์ เมื่อเริ่มสัปดาห์ใหม่จะใช้งบนี้ต่ออัตโนมัติ
              </p>
              <label className="mf-mini-form-label">
                งบรายสัปดาห์ (บาท)
                <div className="mf-mini-amount-input">
                  <span>฿</span>
                  <input
                    inputMode="decimal"
                    value={weeklyLimit}
                    onChange={(e) => setWeeklyLimit(e.target.value)}
                    placeholder="2000"
                    required
                  />
                </div>
              </label>
              {budgetError && (
                <p className="mf-mini-form-error" role="alert">
                  {budgetError}
                </p>
              )}
              <button type="submit" className="mf-mini-submit" disabled={budgetSaving}>
                {budgetSaving ? 'กำลังบันทึก...' : 'บันทึกงบของฉัน'} <Check size={18} />
              </button>
            </form>
          </div>
        )}
        {adding && (
          <div
            className="mf-mini-sheet-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !saving) setAdding(false);
            }}
          >
            <form className="mf-mini-sheet" onSubmit={(e) => void save(e)}>
              <div className="mf-mini-sheet-grip" aria-hidden="true" />
              <div className="mf-mini-sheet-heading">
                <div>
                  <small>จดง่าย ๆ ในไม่กี่วินาที</small>
                  <h2>บันทึกรายการ</h2>
                </div>
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={() => setAdding(false)}
                  disabled={saving}
                >
                  <X size={22} />
                </button>
              </div>
              <div className="mf-mini-switch-kind">
                <button
                  type="button"
                  className={kind === 'expense' ? 'active' : ''}
                  onClick={() => updateKind('expense')}
                >
                  เงินออก
                </button>
                <button
                  type="button"
                  className={kind === 'income' ? 'active' : ''}
                  onClick={() => updateKind('income')}
                >
                  เงินเข้า
                </button>
              </div>
              <label className="mf-mini-form-label">
                จำนวนเงิน (บาท)
                <div className="mf-mini-amount-input">
                  <span>฿</span>
                  <input
                    inputMode="decimal"
                    pattern="\\d+(\\.\\d{1,2})?"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </label>
              <label className="mf-mini-form-label">
                จ่ายหรือรับเงินค่าอะไร
                <input
                  value={description}
                  placeholder={kind === 'expense' ? 'เช่น กาแฟ' : 'เช่น เงินเดือน'}
                  maxLength={120}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </label>
              <label className="mf-mini-form-label">
                บันทึกในบัญชี
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mf-mini-form-label">
                หมวดหมู่
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  {categories
                    .filter((c) => c.kind === kind)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              {formError && (
                <p className="mf-mini-form-error" role="alert">
                  <CircleAlert size={16} /> {formError}
                </p>
              )}
              <button type="submit" className="mf-mini-submit" disabled={saving}>
                {saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'} <ArrowRight size={18} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionItem({ item }: { item: Entry }) {
  const income = item.kind === 'income';
  return (
    <div className="mf-mini-transaction">
      <span className={'mf-mini-transaction-icon ' + (income ? 'income' : '')}>
        {income ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
      </span>
      <div className="mf-mini-transaction-name">
        <strong>{item.merchant || (income ? 'เงินเข้า' : 'โอนเงิน')}</strong>
        <small>
          {item.category_name || item.account_name || 'รายการเงิน'} · {shortDate(item.transacted_at)}
        </small>
      </div>
      <b className={income ? 'income' : ''}>
        {income ? '+' : '-'}
        {cash(item.amount_satang)}
      </b>
    </div>
  );
}
