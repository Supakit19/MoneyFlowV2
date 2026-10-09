import React from 'react';
import { AlertTriangle, ArrowDownUp, CheckCheck, LockKeyhole, Monitor, ShieldAlert } from 'lucide-react';
import LineJsBankAutomation from '../components/LineJsBankAutomation';
import './LineJsPage.css';

export default function LineJsPage() {
  return (
    <div className="mf-linejs-page">
      <div className="mf-linejs-hero">
        <div className="mf-linejs-hero-copy">
          <span className="mf-linejs-eyebrow">
            <span /> EXPERIMENTAL INTEGRATION
          </span>
          <h1>
            เชื่อมธนาคาร <em>ผ่าน LINE</em>
          </h1>
          <p>
            เข้าสู่ระบบด้วย LINE ของคุณเอง เลือกแชตธนาคารและบัญชีเงิน จากนั้น MoneyFlow
            จะช่วยบันทึกเงินเข้า–ออกอัตโนมัติ โดยไม่ต้องเปิดหน้าเว็บค้างไว้
          </p>
          <div className="mf-linejs-hero-pills">
            <span>
              <ArrowDownUp size={15} /> รับแจ้งเตือนอัตโนมัติ
            </span>
            <span>
              <CheckCheck size={15} /> + เงินเข้า / - เงินออก
            </span>
            <span>
              <LockKeyhole size={15} /> จำกัดผู้ส่งที่อนุญาต
            </span>
          </div>
        </div>
        <div className="mf-linejs-hero-visual" aria-hidden="true">
          <div className="mf-linejs-visual-orbit">
            <Monitor size={42} />
          </div>
          <div className="mf-linejs-visual-tag">LINE → MoneyFlow</div>
        </div>
      </div>

      <div className="mf-linejs-risk" role="note">
        <div className="mf-linejs-risk-icon">
          <ShieldAlert size={22} />
        </div>
        <div>
          <strong>
            <AlertTriangle size={16} /> โปรดอ่านก่อนเชื่อมบัญชี LINE ส่วนตัว
          </strong>
          <p>
            LINEJS เป็นเครื่องมือที่ไม่ใช่ SDK อย่างเป็นทางการของ LINE อาจทำให้บัญชี LINE
            ถูกจำกัดการใช้งานหรือเซสชันถูกเพิกถอน ตัวรับข้อความเข้าถึงข้อมูลจาก LINE
            ส่วนตัวบนเครื่องที่ติดตั้ง และข้อความธนาคารอาจมาไม่ครบหรืออ่านยอดผิดได้
            ห้ามใช้ข้อมูลนี้แทนรายการเดินบัญชีจริง ตรวจทานยอดกับธนาคารเสมอ
          </p>
          <small>
            ไม่ต้องกรอกรหัสผ่านธนาคาร • ไม่แสดงรหัสผ่านหรือ Session LINE ใน MoneyFlow •
            หยุดการเชื่อมต่อได้ทุกเมื่อ
          </small>
        </div>
      </div>

      <LineJsBankAutomation />
    </div>
  );
}
