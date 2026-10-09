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

export default function BudgetsPage() {
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
        'วางแผนงบประมาณ',
        'กำหนดเป้าหมายแต่ละหมวดหมู่และควบคุมการใช้จ่าย',
        <button className="button primary" onClick={() => open('budget')}>
          <Plus size={17} /> ตั้งงบใหม่
        </button>,
      )}
      <div className="mf-budget-layout">
        <WeeklyOverview
          overview={overview}
          onConfigure={() =>
            document
              .getElementById('mf-budget-settings')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
        <div id="mf-budget-settings">
          <FinanceSettings
            overview={overview}
            variant="weekly"
            onSaved={async () => {
              await reload();
            }}
            disabled={demoMode}
          />
        </div>
        <FinanceCharts overview={overview} />
      </div>
      <div className="budget-head">
        <div>
          <span>งบที่ตั้งไว้</span>
          <h2>
            {baht(
              live.budgets
                .filter((b) => b.month === month)
                .reduce((s, b) => s + amount(b.limit_satang), 0),
            )}
          </h2>
        </div>
        <div>
          <span>ใช้ไปแล้ว</span>
          <h2>{baht(expense)}</h2>
        </div>
        <div>
          <span>งบคงเหลือ</span>
          <h2>
            {baht(
              live.budgets
                .filter((b) => b.month === month)
                .reduce((s, b) => s + amount(b.limit_satang), 0) - expense,
            )}
          </h2>
        </div>
      </div>
      <div className="budget-cards">
        {live.budgets
          .filter((b) => b.month === month)
          .map((b) => {
            const c = live.categories.find((c) => c.id === b.category_id);
            const spent = spentCats.find((s) => s.id === b.category_id)?.total || 0;
            const limit = amount(b.limit_satang);
            return (
              <div className="panel budget-tile" key={b.id}>
                <div className="budget-tile-head">
                  <span
                    className="category-icon"
                    style={{ background: c?.color + '19', color: c?.color }}
                  >
                    <ShoppingBag size={20} />
                  </span>
                  <b>{c?.name}</b>
                  <span className={'budget-badge ' + (spent > limit ? 'over' : '')}>
                    {limit ? Math.round((spent / limit) * 100) : 0}%
                  </span>
                </div>
                <div className="budget-tile-numbers">
                  <strong>{short(spent)}</strong>
                  <span>จาก {short(limit)}</span>
                </div>
                <div className="progress large">
                  <i
                    style={{
                      width: Math.min(100, limit ? (spent / limit) * 100 : 0) + '%',
                      background: spent > limit ? '#eb8a72' : c?.color,
                    }}
                  />
                </div>
                <p>
                  {spent > limit
                    ? 'ใช้เกินงบ ' + short(spent - limit)
                    : 'เหลืองบอีก ' + short(limit - spent)}
                </p>
              </div>
            );
          })}
        {!live.budgets.filter((b) => b.month === month).length && (
          <div className="empty empty-action panel">
            <ChartNoAxesCombined size={29} />
            <strong>ยังไม่ได้ตั้งงบรายหมวด</strong>
            <p>เริ่มจากหมวดที่ใช้บ่อย เช่น อาหารหรือเดินทาง เพื่อดูว่าเดือนนี้เหลืองบอีกเท่าไหร่</p>
            <button className="button primary" onClick={() => open('budget')}>
              <Plus size={17} /> ตั้งงบแรก
            </button>
          </div>
        )}
      </div>
    </>
  );
}
