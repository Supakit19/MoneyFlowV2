import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, BarChart3, CreditCard, LogOut, Save, ShieldCheck, Users, Eye, UserPlus, MessageCircle } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import './AdminPage.css';

type Overview = {
  members: number; newMembers30d: number; lineLinked: number;
  financeAccounts: number; activeSessions: number; visitors: number;
  pageviews: number; daily: { date: string; views: number; visitors: number }[];
};
async function adminApi(path: string, method = 'GET', body?: unknown) {
  const response = await fetch('/api/admin/' + path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
  return data;
}
const fmt = (n: number) => new Intl.NumberFormat('th-TH').format(n || 0);
export default function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState({ site_notice: '', support_email: '' });
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const loginPath = location.pathname.endsWith('/login');
  const load = async () => {
    const me = await adminApi('me');
    setEmail(me.email);
    const [stats, config] = await Promise.all([adminApi('overview'), adminApi('settings')]);
    setOverview(stats);
    setSettings({ site_notice: config.settings.site_notice || '', support_email: config.settings.support_email || '' });
  };
  useEffect(() => {
    let valid = true;
    adminApi('me').then(async (me) => {
      if (!valid) return;
      setEmail(me.email);
      if (loginPath) { navigate('/admin', { replace: true }); return; }
      await load();
    }).catch(() => { if (valid) setEmail(null); })
      .finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; };
  }, [loginPath, navigate]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await adminApi('login', 'POST', credentials);
      setCredentials({ email: '', password: '' });
      await load();
      navigate('/admin', { replace: true });
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    try { await adminApi('logout', 'POST'); } catch { /* expired session */ }
    setEmail(null); setOverview(null); navigate('/admin/login', { replace: true });
  };
  const save = async (key: 'site_notice' | 'support_email') => {
    setError(''); setMessage(''); setBusy(true);
    try {
      await adminApi('settings', 'PUT', { key, value: settings[key].trim() });
      setMessage('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  const stats = overview ? [
    { icon: Users, label: 'บัญชีสมาชิกทั้งหมด', value: overview.members, detail: 'บัญชีผู้ใช้ MoneyFlow' },
    { icon: Eye, label: 'ผู้เข้าชมเว็บไซต์', value: overview.visitors, detail: 'เซสชันผู้เข้าชมที่ไม่ซ้ำ ไม่ใช่จำนวนบุคคลจริง' },
    { icon: BarChart3, label: 'ยอดเปิดหน้าเว็บไซต์', value: overview.pageviews, detail: 'จำนวนการเปิดหน้าที่ติดตามทั้งหมด' },
    { icon: UserPlus, label: 'สมัครใหม่ 30 วัน', value: overview.newMembers30d, detail: 'บัญชีสมาชิกใหม่' },
    { icon: MessageCircle, label: 'เชื่อมบัญชี LINE', value: overview.lineLinked, detail: 'สมาชิกที่เชื่อม LINE' },
    { icon: CreditCard, label: 'บัญชีการเงินที่บันทึก', value: overview.financeAccounts, detail: 'บัญชีธนาคารและเงินสดในแอป' },
    { icon: Activity, label: 'สมาชิกที่มีเซสชันใช้งาน', value: overview.activeSessions, detail: 'มีเซสชันที่ยังไม่หมดอายุ (ไม่ใช่ผู้ใช้ออนไลน์)' },
  ] : [];
  return (
    <main className="mf-admin-root">
      <header className="mf-admin-header">
        <Link to="/" className="mf-admin-brand"><BrandMark /><strong>moneyflow<span>.</span></strong><small>ADMIN CONSOLE</small></Link>
        <div className="mf-admin-top-actions">{email && <span>{email}</span>}{email && <button onClick={logout}><LogOut size={17} /> ออกจากระบบ</button>}</div>
      </header>
      {loading ? <div className="mf-admin-center">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</div>
      : !email ? (
        <section className="mf-admin-login">
          <div className="mf-admin-login-icon"><ShieldCheck size={29} /></div>
          <div className="mf-admin-eyebrow">SECURE ADMIN ACCESS</div>
          <h1>เข้าสู่ระบบผู้ดูแล</h1>
          <p>ส่วนจัดการ MoneyFlow สำหรับผู้ดูแลที่ได้รับอนุญาตเท่านั้น แยกจากบัญชีผู้ใช้ทั่วไป</p>
          <form onSubmit={login}>
            <label htmlFor="admin-email">อีเมลผู้ดูแล</label>
            <input id="admin-email" type="email" autoComplete="username" required value={credentials.email} onChange={e => setCredentials(c => ({ ...c, email: e.target.value }))} placeholder="admin@example.com" />
            <label htmlFor="admin-password">รหัสผ่าน</label>
            <input id="admin-password" type="password" minLength={10} required autoComplete="current-password" value={credentials.password} onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))} placeholder="รหัสผ่านผู้ดูแลระบบ" />
            {error && <p role="alert" className="mf-admin-error">{error}</p>}
            <button className="mf-admin-primary" disabled={busy} type="submit">{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ Admin Dashboard'}</button>
          </form>
          <Link className="mf-admin-back" to="/"><ArrowLeft size={16} /> กลับหน้าเว็บไซต์</Link>
        </section>
      ) : <div className="mf-admin-content">
        <div className="mf-admin-heading"><div><div className="mf-admin-eyebrow">OVERVIEW & MANAGEMENT</div><h1>ภาพรวม MoneyFlow</h1><p>สถิติระบบและการตั้งค่าเว็บไซต์ โดยไม่เปิดเผยรายละเอียดการเงินส่วนตัวของสมาชิก</p></div><button className="mf-admin-refresh" onClick={() => void load().catch(e => setError(e.message))}>รีเฟรชข้อมูล</button></div>
        {error && <p role="alert" className="mf-admin-error">{error}</p>}
        {message && <p role="status" className="mf-admin-success">{message}</p>}
        <section className="mf-admin-stats" aria-label="สถิติการใช้งาน">
          {stats.map(({icon: Icon,label,value,detail}) => <article key={label} className="mf-admin-stat"><div className="mf-admin-stat-icon"><Icon size={20} /></div><span>{label}</span><strong>{fmt(value)}</strong><small>{detail}</small></article>)}
        </section>
        <section className="mf-admin-panel"><div className="mf-admin-panel-head"><div><h2>สถิติการเข้าชม 30 วันล่าสุด</h2><p>เริ่มนับหลังเปิดระบบติดตาม ไม่รวมผู้เข้าชมก่อนหน้านั้น</p></div></div>
          {overview?.daily.length ? <div className="mf-admin-chart" role="img" aria-label="กราฟยอดผู้เข้าชมแต่ละวัน">
            {overview.daily.map(day => <div key={day.date} className="mf-admin-bar-wrap" title={day.date + ' · ' + fmt(day.visitors) + ' ผู้เข้าชม · ' + fmt(day.views) + ' ครั้ง'}><span>{day.visitors}</span><div className="mf-admin-bar" style={{height: Math.max(5, day.visitors / Math.max(1,...overview.daily.map(d=>d.visitors))*150) + 'px'}}/><small>{day.date.slice(5)}</small></div>)}
          </div> : <div className="mf-admin-empty">ยังไม่มีข้อมูลการเข้าชม เริ่มเก็บสถิติเมื่อผู้ใช้เข้าเว็บหลังเปิดใช้ระบบนี้</div>}
        </section>
        <section className="mf-admin-panel">
          <div className="mf-admin-panel-head"><div><h2>ตั้งค่าเว็บไซต์</h2><p>แก้ไขข้อความประกาศและช่องทางติดต่อ โดยไม่แตะข้อมูลบัญชีของสมาชิก</p></div></div>
          <div className="mf-admin-setting"><div><label htmlFor="site-notice">ประกาศบนหน้าแรก</label><p>เว้นว่างเพื่อซ่อนข้อความประกาศ</p></div><div><textarea id="site-notice" maxLength={500} rows={3} value={settings.site_notice} onChange={e => setSettings(s => ({...s, site_notice: e.target.value}))}/><button disabled={busy} onClick={() => void save('site_notice')}><Save size={16}/> บันทึกประกาศ</button></div></div>
          <div className="mf-admin-setting"><div><label htmlFor="support-email">อีเมลติดต่อผู้ดูแล</label><p>สำหรับแสดงช่องทางช่วยเหลือบนเว็บไซต์</p></div><div><input id="support-email" type="email" maxLength={254} value={settings.support_email} onChange={e => setSettings(s => ({...s, support_email: e.target.value}))}/><button disabled={busy} onClick={() => void save('support_email')}><Save size={16}/> บันทึกอีเมล</button></div></div>
        </section>
      </div>}
    </main>
  );
}
