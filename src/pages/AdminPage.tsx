import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Eye,
  EyeOff,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import BrandMark from '../components/BrandMark';
import './AdminPage.css';

type Overview = {
  members: number;
  newMembers30d: number;
  lineLinked: number;
  financeAccounts: number;
  activeSessions: number;
  visitors: number;
  pageviews: number;
  daily: { date: string; views: number; visitors: number }[];
};
type Section = 'overview' | 'traffic' | 'settings';
type Settings = { site_notice: string; support_email: string };

async function adminApi(path: string, method = 'GET', body?: unknown) {
  const response = await fetch('/api/admin/' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  return data;
}

const fmt = (value: number) => new Intl.NumberFormat('th-TH').format(value || 0);
const today = () =>
  new Intl.DateTimeFormat('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

function AdminLogo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={'mf-admin-logo' + (light ? ' is-light' : '')}>
      <span className="mf-admin-logo-image">
        <BrandMark />
      </span>
      <span className="mf-admin-wordmark">
        moneyflow<span>.</span>
      </span>
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  primary = false,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail: string;
  primary?: boolean;
}) {
  return (
    <article className={'mf-admin-stat' + (primary ? ' is-primary' : '')}>
      <div className="mf-admin-stat-heading">
        <span>{label}</span>
        <span className="mf-admin-stat-icon">
          <Icon size={19} strokeWidth={1.9} />
        </span>
      </div>
      <strong>{fmt(value)}</strong>
      <div className="mf-admin-stat-bottom">
        <span className="mf-admin-stat-dot" />
        {detail}
      </div>
      {primary && <span className="mf-admin-stat-rings" aria-hidden="true" />}
    </article>
  );
}

function TrafficChart({ overview, days }: { overview: Overview; days: 7 | 30 }) {
  const chartData = useMemo(() => {
    const map = new Map(overview.daily.map((item) => [item.date.slice(0, 10), item]));
    const anchor = new Date();
    const result: { date: string; label: string; visitors: number; views: number }[] = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const day = new Date(anchor.getTime() - offset * 86400000);
      const key = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(day);
      const record = map.get(key);
      result.push({
        date: key,
        label: key.slice(8, 10) + '/' + key.slice(5, 7),
        visitors: Number(record?.visitors || 0),
        views: Number(record?.views || 0),
      });
    }
    return result;
  }, [overview.daily, days]);
  const totalViews = chartData.reduce((sum, d) => sum + d.views, 0);
  const totalVisitors = chartData.reduce((sum, d) => sum + d.visitors, 0);

  return (
    <div className="mf-admin-traffic-chart">
      <div className="mf-admin-chart-summary">
        <div>
          <span>จำนวนการเปิดหน้าเว็บ</span>
          <strong>
            {fmt(totalViews)} <small>ครั้งใน {days} วัน</small>
          </strong>
        </div>
        <div className="mf-admin-chart-legend">
          <span>
            <i className="mf-admin-legend-green" /> ผู้เข้าชมรายวัน
          </span>
          <span>
            <i className="mf-admin-legend-lime" /> จำนวนเปิดหน้าเว็บ
          </span>
        </div>
      </div>
      <div
        className="mf-admin-chart-stage"
        role="img"
        aria-label={'กราฟสถิติการเข้าชมย้อนหลัง ' + days + ' วัน'}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={chartData} margin={{ top: 15, right: 8, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="mfAdminTrafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1ba47b" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#1ba47b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="mfAdminViewsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c0e88a" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#c0e88a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#eaf0e9" strokeDasharray="4 5" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#879b91', fontSize: 11 }}
              minTickGap={21}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#879b91', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid #e0ece4',
                borderRadius: 13,
                boxShadow: '0 14px 40px #103d311b',
                fontSize: 12,
              }}
              formatter={(value, name) => [
                fmt(Number(value)),
                name === 'visitors' ? 'ผู้เข้าชม' : 'เปิดหน้าเว็บ',
              ]}
              labelFormatter={(label) => 'วันที่ ' + label}
            />
            <Area
              name="views"
              type="monotone"
              dataKey="views"
              stroke="#a5c96d"
              strokeWidth={2}
              fill="url(#mfAdminViewsGradient)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              name="visitors"
              type="monotone"
              dataKey="visitors"
              stroke="#1b9f77"
              strokeWidth={3}
              fill="url(#mfAdminTrafficGradient)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mf-admin-chart-foot">
        <span>ผู้เข้าชมรายวันสะสม {fmt(totalVisitors)} เซสชัน*</span>
        <span>*อาจนับเซสชันเดิมซ้ำข้ามวัน ไม่ใช่จำนวนบุคคลจริง</span>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const loginPath = pathname.endsWith('/login');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings>({ site_notice: '', support_email: '' });
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [days, setDays] = useState<7 | 30>(30);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [stats, config] = await Promise.all([adminApi('overview'), adminApi('settings')]);
    setOverview(stats);
    setSettings({
      site_notice: config.settings?.site_notice || '',
      support_email: config.settings?.support_email || '',
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void adminApi('me')
      .then(async (me) => {
        if (cancelled) return;
        setEmail(me.email);
        if (loginPath) {
          navigate('/admin', { replace: true });
          return;
        }
        const [stats, config] = await Promise.all([adminApi('overview'), adminApi('settings')]);
        if (cancelled) return;
        setOverview(stats);
        setSettings({
          site_notice: config.settings?.site_notice || '',
          support_email: config.settings?.support_email || '',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setEmail(null);
          setOverview(null);
          if (!loginPath) navigate('/admin/login', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loginPath, navigate]);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await adminApi('login', 'POST', credentials);
      setCredentials({ email: '', password: '' });
      const me = await adminApi('me');
      setEmail(me.email);
      await load();
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setError('');
    try {
      await adminApi('logout', 'POST');
      setEmail(null);
      setOverview(null);
      navigate('/admin/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  };

  const refresh = async () => {
    setError('');
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setRefreshing(false);
    }
  };

  const save = async (key: keyof Settings) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const value = settings[key].trim();
      await adminApi('settings', 'PUT', { key, value });
      setSettings((current) => ({ ...current, [key]: value }));
      setMessage(key === 'site_notice' ? 'บันทึกประกาศเว็บไซต์แล้ว' : 'บันทึกอีเมลติดต่อแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const menu: { id: Section; label: string; icon: typeof LayoutDashboard; detail: string }[] = [
    { id: 'overview', label: 'ภาพรวมระบบ', icon: LayoutDashboard, detail: 'Dashboard' },
    { id: 'traffic', label: 'สถิติเข้าชม', icon: BarChart3, detail: 'Analytics' },
    { id: 'settings', label: 'ตั้งค่าเว็บไซต์', icon: Settings2, detail: 'Website' },
  ];
  const title = { overview: 'ภาพรวมระบบ', traffic: 'สถิติผู้เข้าชม', settings: 'ตั้งค่าเว็บไซต์' }[
    section
  ];

  if (loading) {
    return (
      <main className="mf-admin-root mf-admin-loading">
        <AdminLogo />
        <span className="mf-admin-loader" />
        <span className="mf-admin-loading-caption">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</span>
        <span className="mf-admin-loading-label">ADMIN CONSOLE</span>
      </main>
    );
  }

  if (!email) {
    return (
      <main className="mf-admin-root mf-admin-auth-shell">
        <section className="mf-admin-auth-showcase" aria-label="MoneyFlow Admin Console">
          <div className="mf-admin-auth-glow" aria-hidden="true" />
          <div className="mf-admin-auth-showcase-inner">
            <div className="mf-admin-auth-brand-row">
              <AdminLogo light />
              <span className="mf-admin-brand-separator" />
              <span>ADMIN CONSOLE</span>
            </div>
            <div className="mf-admin-auth-pitch">
              <span className="mf-admin-dark-kicker">
                <span className="mf-admin-kicker-dot" /> MONEYFLOW WORKSPACE
              </span>
              <h1>
                ทุกอย่างของระบบ
                <br />
                <em>อยู่ในมุมมองเดียว.</em>
              </h1>
              <p>
                ติดตามภาพรวมการใช้งาน ดูการเติบโตของสมาชิก และจัดการเว็บไซต์ด้วยประสบการณ์เดียวกับ
                MoneyFlow
              </p>
            </div>
            <div className="mf-admin-auth-preview" aria-hidden="true">
              <div className="mf-admin-preview-top">
                <span className="mf-admin-preview-logo">
                  <BrandMark />
                </span>
                <div>
                  <b>MoneyFlow Overview</b>
                  <small>พื้นที่จัดการเว็บไซต์</small>
                </div>
                <span className="mf-admin-preview-live">
                  <i /> LIVE
                </span>
              </div>
              <div className="mf-admin-preview-tiles">
                <div>
                  <span>
                    <Users size={15} /> สมาชิกทั้งหมด
                  </span>
                  <strong>—</strong>
                  <small>ดูข้อมูลล่าสุดใน Dashboard</small>
                </div>
                <div>
                  <span>
                    <TrendingUp size={15} /> การเติบโต
                  </span>
                  <strong>—</strong>
                  <small>อัปเดตจากข้อมูลจริง</small>
                </div>
              </div>
              <div className="mf-admin-preview-chart">
                <div>
                  <span>Website activity</span>
                  <span>30 DAYS</span>
                </div>
                <svg viewBox="0 0 420 112" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="mfAdminPreviewFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ccf5a1" stopOpacity=".3" />
                      <stop offset="100%" stopColor="#ccf5a1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 86 C35 70 55 96 90 68 S143 86 170 48 229 78 259 35 313 49 350 22 390 35 420 10 L420 112 L0 112Z"
                    fill="url(#mfAdminPreviewFill)"
                  />
                  <path
                    d="M0 86 C35 70 55 96 90 68 S143 86 170 48 229 78 259 35 313 49 350 22 390 35 420 10"
                    fill="none"
                    stroke="#cafa8a"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <div className="mf-admin-auth-bottom">
              <ShieldCheck size={17} /> เข้าถึงได้เฉพาะผู้ดูแลที่ได้รับอนุญาตเท่านั้น
            </div>
          </div>
        </section>
        <section className="mf-admin-auth-form-side">
          <div className="mf-admin-auth-form-top">
            <span>ระบบจัดการ MoneyFlow</span>
            <Link to="/">
              กลับหน้าเว็บไซต์ <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="mf-admin-auth-form-area">
            <div className="mf-admin-mobile-brand">
              <AdminLogo />
            </div>
            <div className="mf-admin-auth-icon">
              <LockKeyhole size={24} />
            </div>
            <div className="mf-admin-overline">WELCOME BACK</div>
            <h2>
              เข้าสู่ระบบ<span>ผู้ดูแล.</span>
            </h2>
            <p>ยินดีต้อนรับกลับมา เข้าสู่ระบบเพื่อดูภาพรวมและจัดการเว็บไซต์ MoneyFlow</p>
            <form className="mf-admin-login-form" onSubmit={login}>
              <label htmlFor="admin-email">อีเมลผู้ดูแลระบบ</label>
              <div className="mf-admin-field">
                <Mail size={19} />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="your@email.com"
                  value={credentials.email}
                  onChange={(e) => setCredentials((c) => ({ ...c, email: e.target.value }))}
                />
              </div>
              <label htmlFor="admin-password">รหัสผ่าน</label>
              <div className="mf-admin-field">
                <LockKeyhole size={19} />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  minLength={10}
                  required
                  autoComplete="current-password"
                  placeholder="กรอกรหัสผ่านของคุณ"
                  value={credentials.password}
                  onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="mf-admin-reveal"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  onClick={() => setShowPassword((show) => !show)}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {error && (
                <div className="mf-admin-alert is-error" role="alert">
                  {error}
                </div>
              )}
              <button className="mf-admin-login-submit" disabled={busy} type="submit">
                {busy ? (
                  'กำลังเข้าสู่ระบบ...'
                ) : (
                  <>
                    เข้าสู่ Admin Dashboard <ArrowRight size={19} />
                  </>
                )}
              </button>
            </form>
            <div className="mf-admin-auth-trust">
              <ShieldCheck size={16} />
              <span>แยกสิทธิ์ผู้ดูแลจากบัญชีสมาชิก ข้อมูลการเงินของสมาชิกยังเป็นส่วนตัว</span>
            </div>
          </div>
          <div className="mf-admin-auth-form-bottom">
            <span>© {new Date().getFullYear()} MoneyFlow</span>
            <Link to="/">
              <ArrowLeft size={15} /> กลับไปยังเว็บไซต์
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mf-admin-root mf-admin-workspace">
      <aside className="mf-admin-sidebar">
        <div className="mf-admin-sidebar-brand">
          <AdminLogo light />
        </div>
        <div className="mf-admin-workspace-picker">
          <span className="mf-admin-workspace-avatar">
            <ShieldCheck size={21} />
          </span>
          <div>
            <strong>Admin Workspace</strong>
            <small>MoneyFlow Management</small>
          </div>
          <span className="mf-admin-workspace-status" />
        </div>
        <div className="mf-admin-nav-group">
          <span className="mf-admin-nav-label">เมนูจัดการ</span>
          <nav aria-label="เมนูผู้ดูแลระบบ">
            {menu.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={'mf-admin-nav-item' + (section === id ? ' is-active' : '')}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => {
                  setSection(id);
                  setError('');
                  setMessage('');
                }}
              >
                <Icon size={19} strokeWidth={1.9} />
                <span>{label}</span>
                {section === id && <span className="mf-admin-nav-active-dot" />}
              </button>
            ))}
          </nav>
        </div>
        <div className="mf-admin-nav-group mf-admin-nav-external">
          <span className="mf-admin-nav-label">เว็บไซต์</span>
          <Link to="/" className="mf-admin-nav-item">
            <Globe2 size={19} /> <span>หน้าเว็บ MoneyFlow</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="mf-admin-sidebar-bottom">
          <div className="mf-admin-help-card">
            <span className="mf-admin-help-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>การจัดการที่ปลอดภัย</strong>
            <p>ดูสถิติและจัดการหน้าเว็บ โดยไม่เข้าถึงรายละเอียดการเงินส่วนตัวของสมาชิก</p>
          </div>
          <button className="mf-admin-side-profile" onClick={logout} type="button" title="ออกจากระบบ">
            <span className="mf-admin-profile-avatar">{email.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>ผู้ดูแลระบบ</b>
              <small>{email}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="mf-admin-main">
        <header className="mf-admin-topbar">
          <div className="mf-admin-breadcrumb">
            <span>MoneyFlow</span>
            <ChevronRight size={15} />
            <span>Admin</span>
            <ChevronRight size={15} />
            <b>{title}</b>
          </div>
          <div className="mf-admin-top-actions">
            <span className="mf-admin-date">
              <span className="mf-admin-live-dot" /> {today()}
            </span>
            <Link className="mf-admin-site-link" to="/">
              <Globe2 size={16} /> ดูเว็บไซต์ <ArrowUpRight size={13} />
            </Link>
            <span className="mf-admin-top-avatar">{email.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="mf-admin-mobile-nav" aria-label="เมนูผู้ดูแลระบบสำหรับมือถือ">
          {menu.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'is-active' : ''}
              onClick={() => {
                setSection(id);
                setError('');
                setMessage('');
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
          <button onClick={logout}>
            <LogOut size={17} /> ออก
          </button>
        </div>
        <div className="mf-admin-content">
          <div className="mf-admin-page-heading">
            <div>
              <div className="mf-admin-overline">
                <span className="mf-admin-heading-dot" /> MONEYFLOW ADMINISTRATION
              </div>
              <h1>
                {section === 'overview' ? (
                  <>
                    ภาพรวม<span> MoneyFlow.</span>
                  </>
                ) : section === 'traffic' ? (
                  <>
                    สถิติ<span>ผู้เข้าชม.</span>
                  </>
                ) : (
                  <>
                    ตั้งค่า<span>เว็บไซต์.</span>
                  </>
                )}
              </h1>
              <p>
                {section === 'overview'
                  ? 'ติดตามข้อมูลสำคัญของระบบทั้งหมดได้จากที่เดียว'
                  : section === 'traffic'
                    ? 'ดูแนวโน้มผู้เข้าชมเว็บไซต์และจำนวนการเปิดหน้าเว็บ'
                    : 'ปรับแต่งข้อความประกาศและข้อมูลติดต่อที่แสดงบนเว็บไซต์'}
              </p>
            </div>
            <button className="mf-admin-refresh" onClick={refresh} disabled={refreshing} type="button">
              <RefreshCw size={17} className={refreshing ? 'is-spinning' : ''} />
              {refreshing ? 'กำลังอัปเดต...' : 'รีเฟรชข้อมูล'}
            </button>
          </div>
          {error && (
            <div role="alert" className="mf-admin-alert is-error">
              {error}
            </div>
          )}
          {message && (
            <div role="status" className="mf-admin-alert is-success">
              <Check size={18} />
              {message}
            </div>
          )}
          {!overview ? (
            <section className="mf-admin-panel mf-admin-retry">
              <CircleHelp size={26} />
              <h2>ยังโหลดข้อมูลระบบไม่ได้</h2>
              <p>ลองรีเฟรชข้อมูลอีกครั้ง</p>
              <button onClick={refresh}>ลองใหม่</button>
            </section>
          ) : (
            <>
              {section === 'overview' && (
                <>
                  <section className="mf-admin-welcome-banner">
                    <div className="mf-admin-welcome-copy">
                      <div className="mf-admin-dark-kicker">
                        <span className="mf-admin-kicker-dot" /> SYSTEM OVERVIEW
                      </div>
                      <h2>
                        สวัสดี, ผู้ดูแลระบบ <span>✳</span>
                      </h2>
                      <p>
                        ยินดีต้อนรับสู่ศูนย์จัดการ MoneyFlow
                        <br />
                        ทุกความเคลื่อนไหวสำคัญของระบบรวมไว้ที่นี่แล้ว
                      </p>
                      <button type="button" onClick={() => setSection('traffic')}>
                        ดูสถิติการเข้าชม <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="mf-admin-welcome-art" aria-hidden="true">
                      <div className="mf-admin-welcome-orbit first" />
                      <div className="mf-admin-welcome-orbit second" />
                      <div className="mf-admin-welcome-art-card">
                        <span>
                          <BrandMark />
                        </span>
                        <div>
                          <b>MoneyFlow</b>
                          <small>Admin Workspace</small>
                        </div>
                        <span className="mf-admin-welcome-check">
                          <Check size={17} />
                        </span>
                      </div>
                    </div>
                  </section>
                  <section className="mf-admin-stat-grid" aria-label="สถิติภาพรวมระบบ">
                    <StatCard
                      primary
                      icon={Users}
                      label="สมาชิกทั้งหมด"
                      value={overview.members}
                      detail="บัญชีผู้ใช้ MoneyFlow"
                    />
                    <StatCard
                      icon={Eye}
                      label="ผู้เข้าชมเว็บไซต์"
                      value={overview.visitors}
                      detail="เซสชันไม่ซ้ำตั้งแต่เริ่มเก็บข้อมูล"
                    />
                    <StatCard
                      icon={BarChart3}
                      label="ยอดเปิดหน้าเว็บ"
                      value={overview.pageviews}
                      detail="จำนวนการเปิดหน้าทั้งหมด"
                    />
                    <StatCard
                      icon={UserPlus}
                      label="สมาชิกใหม่ (30 วัน)"
                      value={overview.newMembers30d}
                      detail="สมัครเข้าระบบใน 30 วันล่าสุด"
                    />
                  </section>
                  <div className="mf-admin-overview-grid">
                    <section className="mf-admin-panel">
                      <div className="mf-admin-panel-heading">
                        <div>
                          <div className="mf-admin-section-kicker">
                            <TrendingUp size={15} /> ANALYTICS
                          </div>
                          <h2>แนวโน้มการเข้าชม</h2>
                          <p>ดูการใช้งานเว็บในช่วง 30 วันล่าสุด</p>
                        </div>
                        <button className="mf-admin-text-link" onClick={() => setSection('traffic')}>
                          ดูทั้งหมด <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <TrafficChart overview={overview} days={30} />
                    </section>
                    <section className="mf-admin-panel mf-admin-connections">
                      <div className="mf-admin-panel-heading">
                        <div>
                          <div className="mf-admin-section-kicker">
                            <Activity size={15} /> ECOSYSTEM
                          </div>
                          <h2>การเชื่อมต่อระบบ</h2>
                          <p>ภาพรวมการใช้งานบริการของสมาชิก</p>
                        </div>
                      </div>
                      <div className="mf-admin-connection-row">
                        <span className="mf-admin-connection-icon is-line">
                          <MessageCircle size={19} />
                        </span>
                        <div>
                          <span>สมาชิกที่เชื่อม LINE</span>
                          <strong>
                            {fmt(overview.lineLinked)} <small>บัญชี</small>
                          </strong>
                        </div>
                        <ChevronRight size={17} />
                      </div>
                      <div className="mf-admin-connection-row">
                        <span className="mf-admin-connection-icon is-account">
                          <Wallet size={19} />
                        </span>
                        <div>
                          <span>บัญชีการเงินที่บันทึก</span>
                          <strong>
                            {fmt(overview.financeAccounts)} <small>บัญชี</small>
                          </strong>
                        </div>
                        <ChevronRight size={17} />
                      </div>
                      <div className="mf-admin-connection-row">
                        <span className="mf-admin-connection-icon is-session">
                          <Activity size={19} />
                        </span>
                        <div>
                          <span>สมาชิกที่มี Session ใช้งาน</span>
                          <strong>
                            {fmt(overview.activeSessions)} <small>บัญชี</small>
                          </strong>
                        </div>
                        <ChevronRight size={17} />
                      </div>
                      <div className="mf-admin-connection-note">
                        <ShieldCheck size={17} />
                        <span>จำนวน Session ที่ยังไม่หมดอายุ ไม่ได้หมายถึงผู้ใช้ออนไลน์ ณ ขณะนี้</span>
                      </div>
                    </section>
                  </div>
                  <section className="mf-admin-bottom-prompt">
                    <div className="mf-admin-bottom-prompt-icon">
                      <Settings2 size={22} />
                    </div>
                    <div>
                      <strong>ต้องการแก้ไขข้อมูลบนเว็บไซต์?</strong>
                      <p>จัดการข้อความประกาศและช่องทางติดต่อได้จากเมนูตั้งค่าเว็บไซต์</p>
                    </div>
                    <button onClick={() => setSection('settings')}>
                      ไปที่การตั้งค่า <ArrowRight size={17} />
                    </button>
                  </section>
                </>
              )}
              {section === 'traffic' && (
                <>
                  <section className="mf-admin-stat-grid is-traffic">
                    <StatCard
                      primary
                      icon={Eye}
                      label="ผู้เข้าชมที่ไม่ซ้ำ"
                      value={overview.visitors}
                      detail="เซสชันตั้งแต่เริ่มเก็บข้อมูล"
                    />
                    <StatCard
                      icon={BarChart3}
                      label="ยอดเปิดหน้าเว็บ"
                      value={overview.pageviews}
                      detail="การเปิดหน้าที่ติดตามทั้งหมด"
                    />
                    <StatCard
                      icon={Users}
                      label="สมาชิกในระบบ"
                      value={overview.members}
                      detail="บัญชี MoneyFlow ทั้งหมด"
                    />
                    <StatCard
                      icon={UserPlus}
                      label="สมาชิกใหม่ (30 วัน)"
                      value={overview.newMembers30d}
                      detail="บัญชีที่สมัครใน 30 วันล่าสุด"
                    />
                  </section>
                  <section className="mf-admin-panel mf-admin-full-chart">
                    <div className="mf-admin-panel-heading">
                      <div>
                        <div className="mf-admin-section-kicker">
                          <TrendingUp size={15} /> VISITOR INSIGHTS
                        </div>
                        <h2>ภาพรวมการเข้าชมเว็บไซต์</h2>
                        <p>
                          เริ่มเก็บสถิติตั้งแต่เปิดใช้ฟีเจอร์นี้ ไม่มีข้อมูลย้อนหลังที่ไม่เคยถูกบันทึก
                        </p>
                      </div>
                      <div
                        className="mf-admin-period-switch"
                        role="group"
                        aria-label="เลือกช่วงเวลาสถิติ"
                      >
                        <button
                          type="button"
                          className={days === 7 ? 'is-active' : ''}
                          onClick={() => setDays(7)}
                        >
                          7 วัน
                        </button>
                        <button
                          type="button"
                          className={days === 30 ? 'is-active' : ''}
                          onClick={() => setDays(30)}
                        >
                          30 วัน
                        </button>
                      </div>
                    </div>
                    <TrafficChart overview={overview} days={days} />
                  </section>
                  <div className="mf-admin-info-note">
                    <ShieldCheck size={18} />
                    <span>
                      ระบบนับการเข้าชมแบบไม่เก็บ IP หรือธุรกรรมการเงิน การเข้าชมที่นับเป็นเซสชัน
                      ไม่ใช่จำนวนบุคคลจริง
                    </span>
                  </div>
                </>
              )}
              {section === 'settings' && (
                <>
                  <div className="mf-admin-settings-intro">
                    <span>
                      <Settings2 size={22} />
                    </span>
                    <div>
                      <strong>Website settings</strong>
                      <p>การเปลี่ยนแปลงจะมีผลบนหน้าเว็บไซต์ MoneyFlow หลังจากกดบันทึก</p>
                    </div>
                    <span className="mf-admin-config-badge">
                      <Zap size={14} /> LIVE CONFIG
                    </span>
                  </div>
                  <div className="mf-admin-settings-grid">
                    <section className="mf-admin-panel mf-admin-setting-card">
                      <div className="mf-admin-panel-heading">
                        <div>
                          <div className="mf-admin-section-kicker">
                            <Globe2 size={15} /> HOMEPAGE
                          </div>
                          <h2>ประกาศบนเว็บไซต์</h2>
                          <p>ข้อความจะแสดงเป็นแถบประกาศบนหน้าแรกและหน้าเกี่ยวกับเรา</p>
                        </div>
                        <span className="mf-admin-setting-card-icon">
                          <MessageCircle size={21} />
                        </span>
                      </div>
                      <label htmlFor="site-notice">ข้อความประกาศ</label>
                      <textarea
                        id="site-notice"
                        maxLength={500}
                        rows={5}
                        value={settings.site_notice}
                        placeholder="เช่น ระบบจะปิดปรับปรุงวันที่..."
                        onChange={(e) => setSettings((s) => ({ ...s, site_notice: e.target.value }))}
                      />
                      <span className="mf-admin-input-help">
                        เว้นว่างหากไม่ต้องการแสดงประกาศ · {settings.site_notice.length}/500 ตัวอักษร
                      </span>
                      <button
                        className="mf-admin-setting-save"
                        disabled={busy}
                        onClick={() => void save('site_notice')}
                      >
                        <Save size={16} />
                        {busy ? 'กำลังบันทึก...' : 'บันทึกประกาศ'}
                      </button>
                    </section>
                    <section className="mf-admin-panel mf-admin-setting-card">
                      <div className="mf-admin-panel-heading">
                        <div>
                          <div className="mf-admin-section-kicker">
                            <Mail size={15} /> CONTACT
                          </div>
                          <h2>ช่องทางติดต่อ</h2>
                          <p>แสดงลิงก์ติดต่อฝ่ายสนับสนุนใน Footer ของหน้าเว็บ</p>
                        </div>
                        <span className="mf-admin-setting-card-icon">
                          <Mail size={21} />
                        </span>
                      </div>
                      <label htmlFor="support-email">อีเมลฝ่ายสนับสนุน</label>
                      <input
                        id="support-email"
                        type="email"
                        maxLength={254}
                        placeholder="support@yourdomain.com"
                        value={settings.support_email}
                        onChange={(e) => setSettings((s) => ({ ...s, support_email: e.target.value }))}
                      />
                      <span className="mf-admin-input-help">
                        ใช้อีเมลที่ติดต่อได้จริง หรือเว้นว่างเพื่อซ่อนลิงก์
                      </span>
                      <div className="mf-admin-contact-preview">
                        <span>ตัวอย่างบนเว็บไซต์</span>
                        <div>
                          <Mail size={17} />
                          {settings.support_email || 'ยังไม่ตั้งค่าอีเมล'}
                        </div>
                      </div>
                      <button
                        className="mf-admin-setting-save"
                        disabled={busy}
                        onClick={() => void save('support_email')}
                      >
                        <Save size={16} />
                        {busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูลติดต่อ'}
                      </button>
                    </section>
                  </div>
                  <div className="mf-admin-info-note">
                    <ShieldCheck size={18} />
                    <span>
                      การตั้งค่าเหล่านี้เกี่ยวข้องกับหน้าเว็บสาธารณะเท่านั้น
                      ไม่สามารถเปลี่ยนข้อมูลส่วนบุคคลหรือธุรกรรมของสมาชิก
                    </span>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="mf-admin-footer">
            <span>© {new Date().getFullYear()} MoneyFlow · Admin Console</span>
            <span>
              จัดการระบบอย่างปลอดภัย <ShieldCheck size={14} />
            </span>
          </footer>
        </div>
      </div>
    </main>
  );
}
