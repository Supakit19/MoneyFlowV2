import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CircleHelp,
  CreditCard,
  Landmark,
  LockKeyhole,
  MessageCircle,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import './BankConnectionIntroDialog.css';

const STORAGE_KEY = 'moneyflow-bank-connection-explanation-v1';

function readPreviousAcknowledgment() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === 'seen';
  } catch {
    return false;
  }
}

export default function BankConnectionIntroDialog({ onSkip }: { onSkip?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => !readPreviousAcknowledgment());
  const dialogRef = useRef<HTMLDivElement>(null);
  const reopenButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const close = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, 'seen');
    } catch {
      /* Storage can be disabled. */
    }
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('.mf-bank-intro-close')?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),[tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.removeEventListener('keydown', handleKeys);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <button
        ref={reopenButtonRef}
        type="button"
        className="mf-bank-intro-reopen"
        onClick={() => setOpen(true)}
      >
        <CircleHelp size={16} aria-hidden="true" />
        เชื่อมธนาคารผ่าน LINE คืออะไร? ต้องใช้ไหม
      </button>
      {open && (
        <div
          className="mf-bank-intro-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            className="mf-bank-intro-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mf-bank-intro-title"
            aria-describedby="mf-bank-intro-description"
          >
            <button
              type="button"
              className="mf-bank-intro-close"
              onClick={close}
              aria-label="ปิดคำแนะนำการเชื่อมธนาคาร"
            >
              <X size={20} />
            </button>
            <div className="mf-bank-intro-art" aria-hidden="true">
              <span className="mf-bank-intro-orbit orbit-a" />
              <span className="mf-bank-intro-orbit orbit-b" />
              <span className="mf-bank-intro-art-icon">
                <Landmark size={27} />
              </span>
              <span className="mf-bank-intro-art-line">
                LINE <ArrowRight size={16} /> MoneyFlow
              </span>
            </div>
            <header className="mf-bank-intro-head">
              <div className="mf-bank-intro-eyebrow">
                <ShieldCheck size={16} /> รู้ก่อนเชื่อม · ใช้หรือไม่ใช้ก็ได้
              </div>
              <h2 id="mf-bank-intro-title">เชื่อมธนาคาร... จำเป็นไหม?</h2>
              <p id="mf-bank-intro-description">
                ไม่จำเป็นเลยครับ! MoneyFlow ใช้ได้ตามปกติแม้ไม่เปิดฟีเจอร์นี้
                ส่วนนี้มีไว้ช่วยจดเงินเข้า–ออกให้อัตโนมัติจากข้อความแจ้งเตือนที่ส่งเข้า LINE เท่านั้น
              </p>
            </header>
            <div className="mf-bank-intro-choice-grid">
              <section className="mf-bank-intro-option">
                <div className="mf-bank-intro-option-symbol no-link">
                  <Check size={19} />
                </div>
                <strong>ไม่เชื่อม ก็ใช้งานได้ครบ</strong>
                <p>
                  บันทึกรายรับ–รายจ่ายเองผ่านเว็บ หรือส่งข้อความให้ MoneyFlow ทาง LINE OA ดู Dashboard
                  งบประมาณ กราฟ และสรุปการเงินได้เหมือนเดิม
                </p>
              </section>
              <section className="mf-bank-intro-option auto-link">
                <div className="mf-bank-intro-option-symbol">
                  <Bell size={19} />
                </div>
                <strong>เชื่อมแล้วได้อะไรเพิ่ม?</strong>
                <p>
                  เมื่อธนาคารส่งข้อความเงินเข้า–ออกมาใน LINE ระบบจะช่วยอ่านยอดและบันทึกแยกตามบัญชี
                  MoneyFlow ที่คุณเลือก ลดการพิมพ์เอง
                </p>
              </section>
            </div>
            <section className="mf-bank-intro-trust">
              <div className="mf-bank-intro-trust-title">
                <LockKeyhole size={17} /> เรื่องความปลอดภัยที่ควรรู้
              </div>
              <ul>
                <li>
                  <Check size={15} /> ฟีเจอร์นี้ <strong>ไม่เชื่อมต่อระบบธนาคารโดยตรง</strong>{' '}
                  ไม่ขอรหัสผ่านธนาคาร, PIN หรือ OTP
                </li>
                <li>
                  <Check size={15} /> ใช้เพื่ออ่าน <strong>แจ้งเตือนข้อความใน LINE</strong>{' '}
                  ไม่สามารถสั่งโอน ถอน หรือหักเงินจากบัญชีธนาคารได้
                </li>
                <li>
                  <ShieldAlert size={15} /> การเชื่อมใช้บัญชี LINE ส่วนตัวผ่านวิธีที่ไม่ใช่บริการทางการ
                  ซึ่งอาจเข้าถึงข้อมูล LINE ได้กว้างกว่าแชตธนาคาร จึงต้องพิจารณาความเสี่ยงก่อนอนุญาต
                </li>
                <li>
                  <MessageCircle size={15} /> ต้องเปิดรับแจ้งเตือนจากธนาคารใน LINE ไว้ก่อน
                  และตรวจชื่อแชตที่เลือกให้ถูกต้อง รายการที่อ่านไม่ชัดต้องตรวจสอบก่อนบันทึก
                </li>
                <li>
                  <CreditCard size={15} /> ยอดที่บันทึกอาจไม่ครบหรือคลาดเคลื่อน
                  ควรเทียบกับแอปธนาคารจริงเสมอ และคุณหยุดเชื่อมได้ภายหลัง
                </li>
              </ul>
            </section>
            <footer className="mf-bank-intro-actions">
              <button
                type="button"
                className="mf-bank-intro-skip"
                onClick={() => {
                  close();
                  if (onSkip) onSkip();
                  else navigate('/dashboard');
                }}
              >
                <ArrowLeft size={16} /> ไม่ใช้ตอนนี้ กลับหน้าหลัก
              </button>
              <button type="button" className="mf-bank-intro-proceed" onClick={close}>
                เข้าใจแล้ว ดูขั้นตอนเชื่อม <ArrowRight size={17} />
              </button>
            </footer>
            <p className="mf-bank-intro-disclaimer">
              การกด “เข้าใจแล้ว” เป็นเพียงการปิดคำอธิบาย ไม่ใช่การยินยอมให้เข้าถึง LINE
              หรือเริ่มบันทึกข้อมูลอัตโนมัติ
            </p>
          </div>
        </div>
      )}
    </>
  );
}
