import React from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip,
  XAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
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

export default function DashboardPage() {
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
      <div className="greeting">
        <div>
          <div className="eyebrow date-eyebrow">
            <span className="live-dot" /> YOUR FINANCIAL OVERVIEW
          </div>
          <h1>
            ภาพรวมการเงิน<span className="dot-accent">.</span>
          </h1>
          <p>เห็นทุกการใช้จ่าย เข้าใจทุกการตัดสินใจ และวางแผนได้ดีขึ้น ✨</p>
        </div>
        <button className="button primary" onClick={() => open('transaction')}>
          <Plus size={18} /> เพิ่มรายการใหม่
        </button>
      </div>
      <div className="month-control">
        <button aria-label="ดูเดือนก่อนหน้า" onClick={() => switchMonth(-1)}>
          <ChevronLeft size={18} />
        </button>
        <b>{new Date(month + '-15').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</b>
        <button aria-label="ดูเดือนถัดไป" onClick={() => switchMonth(1)}>
          <ChevronRight size={18} />
        </button>
        <span className="month-tag">รายเดือน</span>
      </div>
      <div className="stat-grid">
        <div className="stat-card balance">
          <div className="stat-title">
            ยอดเงินคงเหลือทั้งหมด{' '}
            <span className="stat-icon">
              <Wallet size={19} />
            </span>
          </div>
          <div className="stat-value">{baht(balance)}</div>
          <div className="stat-footer">
            <span className="stat-pill">●</span> จากบัญชีทั้งหมด {live.accounts.length} บัญชี
          </div>
          <div className="card-decoration" />
        </div>
        <div className="stat-card">
          <div className="stat-title">
            รายรับเดือนนี้{' '}
            <span className="stat-icon green">
              <ArrowDownLeft size={19} />
            </span>
          </div>
          <div className="stat-value">{baht(income)}</div>
          <div className="stat-footer">
            <span className="tag success">↗ รายรับ</span> {incomes.length} รายการ
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-title">
            รายจ่ายเดือนนี้{' '}
            <span className="stat-icon orange">
              <ArrowUpRight size={19} />
            </span>
          </div>
          <div className="stat-value">{baht(expense)}</div>
          <div className="stat-footer">
            <span className="tag warm">↗ รายจ่าย</span> {expenses.length} รายการ
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-title">
            กระแสเงินสดสุทธิ{' '}
            <span className="stat-icon purple">
              <ChartNoAxesCombined size={19} />
            </span>
          </div>
          <div className="stat-value">{baht(income - expense)}</div>
          <div className="stat-footer">
            <span className={'tag ' + (income - expense >= 0 ? 'success' : 'warm')}>
              {income - expense >= 0 ? '↗ เป็นบวก' : '↘ ติดลบ'}
            </span>{' '}
            รายรับหักรายจ่าย
          </div>
        </div>
      </div>
      <div className="analytics-grid">
        <div className="panel chart-panel">
          <div className="panel-header">
            <div>
              <h3>แนวโน้มรายรับ & รายจ่าย</h3>
              <p>เปรียบเทียบกระแสเงินในเดือนนี้</p>
            </div>
            <button type="button" className="tiny-link" onClick={() => setView('transactions')}>
              ดูรายการ <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-green" /> รายรับ
            </span>
            <span>
              <i className="legend-amber" /> รายจ่าย
            </span>
          </div>
          <div className="chart-wrap">
            {transactions.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 15, right: 6, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#16a37d" stopOpacity=".19" />
                      <stop offset="1" stopColor="#16a37d" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#e4a55d" stopOpacity=".10" />
                      <stop offset="1" stopColor="#e4a55d" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e9eeea" strokeDasharray="4 6" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9daaa4', fontSize: 12 }}
                    tickMargin={14}
                  />
                  <Tooltip
                    formatter={(v: any) => baht(Number(v))}
                    contentStyle={{
                      borderRadius: 14,
                      border: '1px solid #eef0ed',
                      boxShadow: '0 12px 24px #162d2010',
                    }}
                  />
                  <Area
                    dataKey="income"
                    name="รายรับ"
                    type="monotone"
                    stroke="#149b74"
                    strokeWidth={3}
                    fill="url(#incomeFill)"
                    dot={false}
                  />
                  <Area
                    dataKey="expense"
                    name="รายจ่าย"
                    type="monotone"
                    stroke="#e9a057"
                    strokeWidth={2.7}
                    fill="url(#expenseFill)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="dashboard-chart-empty">
                <span className="dashboard-chart-icon">
                  <TrendingUp size={26} />
                </span>
                <strong>ยังไม่มีข้อมูลสำหรับกราฟ</strong>
                <p>เมื่อบันทึกรายรับหรือรายจ่าย กราฟจะช่วยให้เห็นแนวโน้มของแต่ละเดือน</p>
                <button type="button" className="button outline" onClick={() => open('transaction')}>
                  <Plus size={16} /> บันทึกรายการแรก
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="panel spending-panel">
          <div className="panel-header">
            <div>
              <h3>รายจ่ายตามหมวดหมู่</h3>
              <p>เงินถูกใช้ไปกับอะไรบ้าง</p>
            </div>
            <button className="tiny-link" onClick={() => setView('budgets')}>
              ดูงบประมาณ <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="donut-zone">
            <div className="donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      spentCats.length
                        ? spentCats
                        : [{ name: 'ไม่มีข้อมูล', total: 1, color: '#eaf0ec' }]
                    }
                    dataKey="total"
                    nameKey="name"
                    innerRadius="70%"
                    outerRadius="94%"
                    strokeWidth={0}
                    paddingAngle={spentCats.length ? 3 : 0}
                  >
                    {(spentCats.length ? spentCats : [{ color: '#eaf0ec' }]).map((c: any, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <small>รายจ่ายรวม</small>
                <strong>{short(expense)}</strong>
              </div>
            </div>
          </div>
          <div className="cat-list">
            {spentCats.length ? (
              spentCats.slice(0, 4).map((c) => (
                <div className="cat-item" key={c.id}>
                  <span className="cat-dot" style={{ background: c.color }} />
                  <span>{c.name}</span>
                  <b>{Math.round((c.total / expense) * 100)}%</b>
                  <strong>{short(c.total)}</strong>
                </div>
              ))
            ) : (
              <p className="empty-mini">ยังไม่มีรายจ่ายในเดือนนี้</p>
            )}
          </div>
        </div>
      </div>
      <div className="mf-dashboard-highlights">
        <WeeklyOverview compact overview={overview} onConfigure={() => setView('budgets')} />
        <SavingsOverview overview={overview} onConfigure={() => setView('budgets')} />
      </div>
      <div className="bottom-grid">
        <div className="panel transactions-panel">
          <div className="panel-header">
            <div>
              <h3>รายการล่าสุด</h3>
              <p>การเคลื่อนไหวทางการเงินของคุณ</p>
            </div>
            <button className="tiny-link" onClick={() => setView('transactions')}>
              ดูทั้งหมด <ArrowUpRight size={14} />
            </button>
          </div>
          {transactions.length ? (
            <>
              <div
                className="recent-transactions-scroll"
                role="region"
                aria-label="รายการล่าสุด เลื่อนดูรายการเพิ่มเติมได้"
                tabIndex={transactions.length > 6 ? 0 : -1}
              >
                {transactions.map(row)}
              </div>
              {transactions.length > 6 && (
                <p className="recent-transactions-hint">
                  เลื่อนเพื่อดูรายการเพิ่มเติม · ทั้งหมด {transactions.length} รายการในเดือนนี้
                </p>
              )}
            </>
          ) : (
            <div className="empty">
              <ReceiptText size={28} />
              <p>ยังไม่มีรายการในเดือนนี้</p>
              <button className="button primary" onClick={() => open('transaction')}>
                เพิ่มรายการแรก
              </button>
            </div>
          )}
        </div>
        <div className="right-stack">
          <div className="panel budget-panel">
            <div className="panel-header">
              <div>
                <h3>งบประมาณเดือนนี้</h3>
                <p>ติดตามแผนใช้จ่าย</p>
              </div>
              <button className="tiny-link" onClick={() => setView('budgets')}>
                จัดการ <ArrowUpRight size={14} />
              </button>
            </div>
            {live.budgets
              .filter((b) => b.month === month)
              .slice(0, 3)
              .map((b) => {
                const c = live.categories.find((c) => c.id === b.category_id);
                const spent = spentCats.find((s) => s.id === b.category_id)?.total || 0;
                const lim = amount(b.limit_satang);
                return (
                  <div className="budget-mini" key={b.id}>
                    <div>
                      <b>{c?.name}</b>
                      <span>
                        {short(spent)} <em>/ {short(lim)}</em>
                      </span>
                    </div>
                    <div className="progress">
                      <i
                        style={{
                          width: Math.min(100, lim ? (spent / lim) * 100 : 0) + '%',
                          background: spent > lim ? '#e68c70' : c?.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            {!live.budgets.filter((b) => b.month === month).length && (
              <p className="empty-mini">ยังไม่ได้ตั้งงบประมาณ</p>
            )}
          </div>
          <div className="line-cta">
            <div className="line-cta-icon">
              <MessageCircle size={23} />
            </div>
            <b>แค่พิมพ์ LINE ก็ลงบัญชีได้</b>
            <p>พิมพ์ “กาแฟ 65” หรือส่งรูปใบเสร็จ แล้วให้ AI ช่วยบันทึกให้คุณ</p>
            <button onClick={() => setView('integrations')}>
              เริ่มเชื่อมต่อ <ArrowUpRight size={17} />
            </button>
            <div className="cta-circle c1" />
            <div className="cta-circle c2" />
          </div>
        </div>
      </div>
    </>
  );
}
