import { useEffect, useState } from 'react';
import { Download, Laptop, RefreshCw, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import './SessionExportPanel.css';
import { askConfirm } from '../ConfirmDialog';

type Session = {
  id: string;
  auth_method: string;
  signed_in_at: string;
  expires_at: string;
  current: boolean;
};
export default function SessionExportPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const result = await api('/security/sessions');
      setSessions(result.sessions || []);
    } catch (e: any) {
      setError(e.message || 'โหลดรายการเข้าระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const submit = async (path: string, body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(path, 'POST', body);
      await load();
    } catch (e: any) {
      setError(e.message || 'ยกเลิกเซสชันไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mf-security-tools">
      <header>
        <span>
          <ShieldCheck size={18} /> ความปลอดภัยและข้อมูลของฉัน
        </span>
        <h2>จัดการการเข้าสู่ระบบและส่งออกข้อมูล</h2>
        <p>
          ตรวจเซสชันที่ยังเข้าสู่ระบบอยู่ ยกเลิกเซสชันอื่น และนำรายการรายรับรายจ่ายของคุณออกเป็นไฟล์ CSV
        </p>
      </header>
      <div className="mf-security-tools-grid">
        <div className="mf-security-tool-card">
          <div className="mf-security-card-head">
            <Laptop size={22} />
            <div>
              <h3>เซสชันที่ยังเข้าสู่ระบบ</h3>
              <p>ข้อมูลเวลาและวิธีเข้าใช้งาน ไม่ใช่การระบุตัวอุปกรณ์จริง</p>
            </div>
            <button aria-label="รีเฟรชเซสชัน" onClick={() => void load()} disabled={busy || loading}>
              <RefreshCw size={17} />
            </button>
          </div>
          {error && (
            <p role="alert" className="mf-security-tool-error">
              {error}
            </p>
          )}
          {loading ? (
            <p>กำลังโหลด...</p>
          ) : sessions.length === 0 ? (
            <p>ไม่พบเซสชันที่ใช้งาน</p>
          ) : (
            <div className="mf-security-session-list">
              {sessions.map((session) => (
                <div key={session.id} className="mf-security-session">
                  <Smartphone size={19} />
                  <div>
                    <strong>
                      {session.auth_method === 'google'
                        ? 'Google'
                        : session.auth_method === 'line'
                          ? 'LINE'
                          : 'อีเมล'}
                      {session.current ? ' · เซสชันนี้' : ''}
                    </strong>
                    <small>
                      เข้าสู่ระบบ{' '}
                      {new Date(session.signed_in_at).toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </small>
                  </div>
                  {!session.current && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submit('/security/sessions/revoke', { id: session.id })}
                    >
                      <XCircle size={16} /> ยกเลิก
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {sessions.some((s) => !s.current) && (
            <button
              type="button"
              className="mf-security-revoke"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  if (
                    await askConfirm({
                      title: 'ออกจากระบบทุกเซสชันอื่น?',
                      description: 'เซสชันที่กำลังใช้อยู่นี้จะไม่ถูกออกจากระบบ',
                      confirmLabel: 'ยกเลิกเซสชันอื่น',
                    })
                  )
                    await submit('/security/sessions/revoke-others', {});
                })()
              }
            >
              ยกเลิกเซสชันอื่นทั้งหมด
            </button>
          )}
        </div>
        <div className="mf-security-tool-card">
          <div className="mf-security-card-head">
            <Download size={22} />
            <div>
              <h3>ส่งออกรายการการเงิน</h3>
              <p>ดาวน์โหลดข้อมูลของคุณเป็น CSV เปิดใน Excel หรือ Google Sheets ได้</p>
            </div>
          </div>
          <label className="mf-security-export-label">
            ช่วงข้อมูล
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">ทุกปี (สูงสุด 20,000 รายการ)</option>
              {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <a
            className="mf-security-export-button"
            href={'/api/finance/export.csv' + (year ? '?year=' + year : '')}
          >
            <Download size={17} /> ดาวน์โหลดรายการ CSV
          </a>
          <small>
            ดาวน์โหลดผ่านบัญชีที่ล็อกอินอยู่เท่านั้น ระบบจะไม่ส่งไฟล์ให้บุคคลอื่นโดยอัตโนมัติ
          </small>
        </div>
      </div>
    </section>
  );
}
