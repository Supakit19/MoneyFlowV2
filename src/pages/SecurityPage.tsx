import SecurityPanel from '../SecurityPanel';
import SessionExportPanel from '../components/SessionExportPanel';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useFinancePage } from '../app/FinanceContext';
export default function SecurityPage() {
  const { live, demoMode, reload, notify, setView } = useFinancePage();
  return (
    <>
      <SecurityPanel
        key={live.profile?.id || 'demo'}
        profile={
          live.profile || {
            id: 'demo',
            display_name: 'ตัวอย่างบัญชี',
            email: null,
            avatar_url: null,
            google_linked: false,
            line_connected: false,
            email_login_enabled: false,
            password_set: false,
          }
        }
        onRefresh={async () => {
          await reload();
        }}
        onToast={notify}
        onOpenLine={() => setView('integrations')}
        demo={demoMode}
      />
      {!demoMode && <SessionExportPanel />}
      {!demoMode && (
        <section className="welcome-revisit panel">
          <div className="welcome-revisit-icon">
            <Sparkles size={22} />
          </div>
          <div>
            <h3>ตั้งค่า MoneyFlow ใหม่อีกครั้ง</h3>
            <p>กลับไปดูขั้นตอนเริ่มต้น ปรับชื่อบัญชีหลัก วงเงินรายสัปดาห์ และวิธีเชื่อม LINE ได้เสมอ</p>
          </div>
          <Link to="/welcome" className="welcome-revisit-link">
            เปิดคู่มือเริ่มต้น <ArrowUpRight size={17} />
          </Link>
        </section>
      )}
    </>
  );
}
