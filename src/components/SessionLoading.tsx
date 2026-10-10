import FlowLoader from './FlowLoader';
export default function SessionLoading() {
  return (
    <main className="session-loading" role="status" aria-live="polite" aria-label="กำลังตรวจสอบบัญชี">
      <FlowLoader message="กำลังเชื่อมต่อข้อมูลการเงินที่เป็นของคุณ" />
    </main>
  );
}
