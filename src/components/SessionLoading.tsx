import BrandMark from './BrandMark';
export default function SessionLoading() {
  return (
    <main className="session-loading" role="status" aria-live="polite" aria-label="กำลังตรวจสอบบัญชี">
      <div className="session-loading-card">
        <div className="session-loading-brand">
          <BrandMark />
          <strong>
            moneyflow<span>.</span>
          </strong>
        </div>
        <span className="session-spinner" aria-hidden="true" />
        <h1>กำลังตรวจสอบการเข้าสู่ระบบ</h1>
        <p>รอสักครู่ เรากำลังเชื่อมต่อบัญชีและข้อมูลการเงินของคุณ</p>
      </div>
    </main>
  );
}
