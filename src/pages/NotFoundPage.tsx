import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
export default function NotFoundPage() {
  return (
    <section className="not-found panel">
      <Compass size={34} />
      <h2>ไม่พบหน้านี้</h2>
      <p>ลิงก์ที่เปิดอาจไม่ถูกต้องหรือหน้านี้ถูกเปลี่ยนชื่อแล้ว</p>
      <Link to="/dashboard" className="button primary">
        <ArrowLeft size={16} /> กลับหน้าภาพรวม
      </Link>
    </section>
  );
}
