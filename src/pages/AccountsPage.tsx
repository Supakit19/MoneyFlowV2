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

export default function AccountsPage() {
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
        'บัญชีและกระเป๋า',
        'รวมยอดคงเหลือจากทุกบัญชีในที่เดียว',
        <button className="button primary" onClick={() => open('account')}>
          <Plus size={17} /> เพิ่มบัญชี
        </button>,
      )}
      <div className="account-summary">
        <span>ยอดคงเหลือรวมทุกบัญชี</span>
        <h2>{baht(balance)}</h2>
        <p>คำนวณจากยอดตั้งต้น รายรับ รายจ่าย และรายการโอน</p>
      </div>
      <div className="account-grid">
        {live.accounts.map((a) => (
          <div className="account-card" key={a.id}>
            <div className="account-icon" style={{ background: a.color + '19', color: a.color }}>
              <CreditCard size={23} />
            </div>
            <span className="account-kind">
              {a.kind === 'bank' ? 'บัญชีธนาคาร' : a.kind === 'cash' ? 'เงินสด' : 'กระเป๋าเงินดิจิทัล'}
            </span>
            <h3>{a.name}</h3>
            <strong>{baht(amount(a.balance_satang))}</strong>
            <div className="account-line" style={{ background: a.color }} />
          </div>
        ))}
      </div>
    </>
  );
}
