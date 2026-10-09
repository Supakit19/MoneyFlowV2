import React, { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
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
import { menu, toPagePath } from '../../app/navigation';
import { useFinancePage } from '../../app/FinanceContext';
import BrandMark from '../BrandMark';
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const {
    live,
    demoMode,
    realtime,
    view,
    menuOpen,
    setMenuOpen,
    setSearch,
    setView,
    logout,
    reload,
    notify,
    onExitDemo,
  } = useFinancePage();
  const currentName = live?.profile?.display_name || 'MoneyFlow';
  const currentEmail = live?.profile?.email || (demoMode ? 'บัญชีตัวอย่าง' : 'บัญชี Google');
  const avatar = (className: string) =>
    live?.profile?.avatar_url ? (
      <img className={className} src={live.profile.avatar_url} alt="Profile" />
    ) : (
      <span className={className}>{currentName.trim().slice(0, 1).toUpperCase() || 'M'}</span>
    );
  const mark = <BrandMark />;
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (menuOpen ? 'opened' : '')}>
        <div className="brand">
          {mark}
          <span>
            moneyflow<span className="brand-period">.</span>
          </span>
        </div>
        <div className="workspace-label">
          WORKSPACE <ChevronDown size={13} />
        </div>
        <div className="workspace">
          {avatar('workspace-avatar')}
          <div>
            <b>{currentName}</b>
            <small>{currentEmail}</small>
          </div>
          <MoreHorizontal size={18} />
        </div>
        <div className="nav-label">เมนูหลัก</div>
        <nav aria-label="เมนูหลัก">
          {menu.map((m) => (
            <NavLink
              key={m.id}
              to={toPagePath(m.id)}
              className={({ isActive }) => 'nav-item ' + (isActive ? 'active' : '')}
              onClick={() => {
                setMenuOpen(false);
                setSearch('');
              }}
            >
              <m.icon size={19} strokeWidth={1.85} />
              {m.label}
              {m.id === 'integrations' && <span className="mini-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-help">
            <div className="side-help-icon">
              <Sparkles size={20} />
            </div>
            <b>จัดการเงินได้ง่ายขึ้น</b>
            <p>บันทึกค่าใช้จ่ายผ่าน LINE แล้วให้ AI ช่วยจัดหมวดหมู่</p>
            <button onClick={() => setView('integrations')}>
              เชื่อมต่อ LINE <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="profile" onClick={logout}>
            {avatar('profile-avatar')}
            <span>
              <b>{currentName}</b>
              <small>{currentEmail}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu iconbtn"
            aria-label={menuOpen ? 'ปิดเมนูหลัก' : 'เปิดเมนูหลัก'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span className="breadcrumb-parent">My workspace</span>
            <ChevronRight className="breadcrumb-arrow" size={14} aria-hidden="true" />
            <b title={menu.find((m) => m.id === view)?.label}>
              {menu.find((m) => m.id === view)?.label}
            </b>
          </div>
          <div className="top-actions">
            <span
              className={'mf-sync ' + (realtime === 'online' ? 'is-online' : '')}
              title="อัปเดตแบบเรียลไทม์ผ่าน WebSocket"
            >
              <i />
              {demoMode
                ? 'PREVIEW'
                : realtime === 'online'
                  ? 'LIVE'
                  : realtime === 'connecting'
                    ? 'CONNECTING'
                    : 'OFFLINE'}
            </span>
            <span className="today">
              <CalendarDays size={16} />
              {new Date().toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              className="iconbtn refresh"
              title="รีเฟรช"
              aria-label="โหลดข้อมูลล่าสุด"
              onClick={() =>
                demoMode
                  ? notify('นี่คือข้อมูลตัวอย่าง')
                  : reload()
                      .then(() => notify('ข้อมูลล่าสุดแล้ว'))
                      .catch((e) => notify(e.message, 'error'))
              }
            >
              <RefreshCw size={18} />
            </button>
            {avatar('top-avatar')}
          </div>
        </header>
        <div className="content">
          {demoMode && (
            <div className="demo-banner">
              <Sparkles size={16} />
              <span className="demo-banner-message">
                กำลังแสดงข้อมูลตัวอย่าง — ยังไม่ใช่ข้อมูลการเงินจริง
              </span>
              <button onClick={onExitDemo}>
                เริ่มใช้งานจริง <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {children}
        </div>
      </main>
      {menuOpen && (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="ปิดเมนูหลัก"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
