import React from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowUpRight,
  ArrowDownLeft,
  MoreHorizontal,
  Trash2,
  Check,
  LockKeyhole,
  LogOut,
  Menu,
  X,
  MessageCircle,
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  ReceiptText,
  TrendingUp,
  TrendingDown,
  Repeat2,
  CreditCard,
  Copy,
  Link2,
  RefreshCw,
  Send,
  House,
  ShoppingBag,
  Utensils,
  Coffee,
  Car,
  Heart,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { WeeklyOverview, FinanceCharts, FinanceSettings, SavingsOverview } from '../MoneyWellness';
import { amount, baht, short } from '../lib/finance';
import { sectionTitle } from '../components/SectionTitle';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';

export default function RecurringPage() {
  const {
    live,
    overview,
    month,
    transactions,
    expenses,
    incomes,
    income,
    expense,
    balance,
    spentCats,
    chart,
    switchMonth,
    open,
    setView,
    search,
    setSearch,
    demoMode,
    notify,
    api,
    reload,
    delRecurring,
    lineStatus,
    setLineStatus,
    pair,
    setPair,
    parseText,
    setParseText,
    parseError,
    setParseError,
    parsed,
    setParsed,
    parseWithAi,
    row,
  } = useFinancePage();
  return (
    <>
      {sectionTitle(
        'รายการประจำ',
        'จัดการรายรับและบิลประจำเดือนแบบอัตโนมัติ',
        <div className="button-group">
          <button
            className="button outline"
            onClick={async () => {
              if (demoMode) return notify('โหมดตัวอย่างยังบันทึกข้อมูลจริงไม่ได้', 'warning');
              try {
                const r = await api('/recurring/run', 'POST');
                await reload();
                notify(
                  r.created
                    ? 'บันทึกรายการครบกำหนด ' + r.created + ' รายการเรียบร้อยแล้ว'
                    : 'ตรวจสอบแล้ว ยังไม่มีรายการประจำที่ถึงกำหนด',
                  r.created ? 'success' : 'info',
                );
              } catch (e: any) {
                notify(e.message || 'บันทึกรายการประจำไม่สำเร็จ', 'error');
              }
            }}
          >
            <RefreshCw size={16} /> บันทึกรายการที่ถึงกำหนด
          </button>
          <button className="button primary" onClick={() => open('recurring')}>
            <Plus size={17} /> เพิ่มรายการประจำ
          </button>
        </div>,
      )}
      <div className="panel recurring-list">
        {live.recurring.length ? (
          live.recurring.map((r) => (
            <div className="recurring-row" key={r.id}>
              <span className="tx-symbol transfer">
                <Repeat2 size={20} />
              </span>
              <div className="tx-desc">
                <strong>{r.title}</strong>
                <span>
                  ทุกวันที่ {r.day_of_month} ของเดือน ·{' '}
                  {live.categories.find((c) => c.id === r.category_id)?.name}
                </span>
              </div>
              <strong>{baht(amount(r.amount_satang))}</strong>
              <button
                className="iconbtn delete"
                aria-label={'ลบรายการประจำ ' + r.title}
                onClick={() => delRecurring(r.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty empty-action">
            <Repeat2 size={30} />
            <strong>ไม่ต้องจำวันจ่ายบิลเองอีกต่อไป</strong>
            <p>เพิ่มค่าเช่า ค่าน้ำ ค่าโทรศัพท์ หรือรายได้ประจำ แล้วบันทึกเมื่อถึงกำหนดได้จากหน้านี้</p>
            <button className="button primary" onClick={() => open('recurring')}>
              <Plus size={17} /> เพิ่มรายการประจำแรก
            </button>
          </div>
        )}
      </div>
      <div className="hint">
        <AlertTriangle size={16} /> รายการประจำจะถูกบันทึกเมื่อกดปุ่ม “บันทึกรายการที่ถึงกำหนด”
        ระบบป้องกันการบันทึกซ้ำในเดือนเดียวกัน
      </div>
    </>
  );
}
