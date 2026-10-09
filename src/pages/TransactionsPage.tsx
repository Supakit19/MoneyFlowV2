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

export default function TransactionsPage() {
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
  const term = search.trim().toLocaleLowerCase('th-TH');
  const filteredTransactions = transactions.filter((t) =>
    (t.merchant + ' ' + (t.category_name || '') + ' ' + (t.note || ''))
      .toLocaleLowerCase('th-TH')
      .includes(term),
  );
  return (
    <>
      {sectionTitle(
        'รายการทั้งหมด',
        'ดู ค้นหา และจัดการธุรกรรมของคุณ',
        <button className="button primary" onClick={() => open('transaction')}>
          <Plus size={17} /> เพิ่มรายการ
        </button>,
      )}
      <div className="panel list-page">
        <div className="list-toolbar">
          <div className="search-box">
            <Search size={19} />
            <input
              aria-label="ค้นหารายการการเงิน"
              type="search"
              placeholder="ค้นหาชื่อร้าน หมวดหมู่ หรือโน้ต..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="month-control small">
            <button aria-label="ดูเดือนก่อนหน้า" onClick={() => switchMonth(-1)}>
              <ChevronLeft size={16} />
            </button>
            <b>
              {new Date(month + '-15').toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}
            </b>
            <button aria-label="ดูเดือนถัดไป" onClick={() => switchMonth(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="list-summary" aria-live="polite">
          <span>
            {term ? 'ผลการค้นหา' : 'รายการในเดือนนี้'}{' '}
            <strong>{filteredTransactions.length.toLocaleString('th-TH')}</strong> รายการ
          </span>
          {term && (
            <button type="button" onClick={() => setSearch('')}>
              ล้างคำค้นหา
            </button>
          )}
        </div>
        {filteredTransactions.map(row)}
        {term && filteredTransactions.length === 0 && (
          <div className="empty empty-action">
            <Search size={29} />
            <strong>ไม่พบรายการที่ค้นหา</strong>
            <p>ลองใช้ชื่อร้านหรือหมวดหมู่อื่น หรือเปลี่ยนเดือนที่เลือก</p>
            <button className="button outline" onClick={() => setSearch('')}>
              ล้างคำค้นหา
            </button>
          </div>
        )}
        {!term && !transactions.length && (
          <div className="empty empty-action">
            <ReceiptText size={29} />
            <strong>เริ่มบันทึกรายการแรกของคุณ</strong>
            <p>เมื่อมีรายรับหรือรายจ่าย จะค้นหาและดูย้อนหลังจากหน้านี้ได้</p>
            <button className="button primary" onClick={() => open('transaction')}>
              <Plus size={17} /> เพิ่มรายการแรก
            </button>
          </div>
        )}
      </div>
    </>
  );
}
