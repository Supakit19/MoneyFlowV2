import React from 'react';
import { AlertTriangle, ArrowDownUp, CheckCheck, LockKeyhole, Monitor, ShieldAlert } from 'lucide-react';
import LineJsBankAutomation from '../components/LineJsBankAutomation';
import BankConnectionIntroDialog from '../components/BankConnectionIntroDialog';
import './LineJsPage.css';

export default function LineJsPage() {
  return (
    <div className="mf-linejs-page">
      <BankConnectionIntroDialog />
      <div className="mf-linejs-hero">
        <div className="mf-linejs-hero-copy">
          <span className="mf-linejs-eyebrow">
            <span /> เชื่อมแชตธนาคาร
          </span>
          <h1>
            เชื่อมธนาคาร <em>ผ่าน LINE</em>
          </h1>
          <p>
            เชื่อม LINE ที่คุณใช้รับข้อความจากธนาคาร แล้วเลือกว่าจะให้เงินเข้าและเงินออกของแต่ละธนาคาร
            บันทึกลงบัญชีไหนใน MoneyFlow ไม่ต้องเปิดหน้าเว็บค้างไว้
          </p>
          <div className="mf-linejs-hero-pills">
            <span>
              <ArrowDownUp size={15} /> รับแจ้งเตือนอัตโนมัติ
            </span>
            <span>
              <CheckCheck size={15} /> + เงินเข้า / - เงินออก
            </span>
            <span>
              <LockKeyhole size={15} /> บันทึกเฉพาะแชตที่คุณเลือก
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
            วิธีอ่านแจ้งเตือนนี้ไม่ได้รับการรับรองอย่างเป็นทางการจาก LINE หรือธนาคาร
            และต้องได้รับสิทธิ์เข้าถึงข้อความใน LINE ส่วนตัวของคุณ บัญชี LINE อาจถูกจำกัดการใช้งาน
            หรือหลุดจากการเชื่อมต่อได้ บางแจ้งเตือนอาจมาไม่ครบหรืออ่านยอดผิด
            กรุณาเทียบกับรายการจริงในแอปธนาคารเสมอ
          </p>
          <small>
            ไม่ต้องกรอกรหัสผ่านธนาคาร • ระบบเก็บข้อมูลสำหรับเชื่อมต่ออย่างปลอดภัย •
            หยุดการเชื่อมต่อได้ทุกเมื่อ
          </small>
        </div>
      </div>

      <LineJsBankAutomation />
    </div>
  );
}
