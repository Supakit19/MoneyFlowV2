import { AlertCircle, RefreshCw } from 'lucide-react';
import BrandMark from './BrandMark';
export default function SessionError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="session-loading" role="alert">
      <div className="session-loading-card session-error">
        <div className="session-loading-brand">
          <BrandMark />
          <strong>
            moneyflow<span>.</span>
          </strong>
        </div>
        <AlertCircle size={30} color="#ce6b52" />
        <h1>เชื่อมต่อ MoneyFlow ไม่สำเร็จ</h1>
        <p>ยังตรวจสอบบัญชีไม่ได้ในขณะนี้ ข้อมูลของคุณยังอยู่ครบ กรุณาลองใหม่อีกครั้ง</p>
        <button className="button primary" onClick={onRetry}>
          <RefreshCw size={16} /> ลองใหม่
        </button>
      </div>
    </main>
  );
}
