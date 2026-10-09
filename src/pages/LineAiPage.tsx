import React from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  ChartNoAxesCombined,
  Settings,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowUpRight,
  ArrowDownLeft,
  MoreHorizontal,
  Trash2,
  Check,
  LockKeyhole,
  LogOut,
  Menu,
  X,
  MessageCircle,
  BrainCircuit,
  Sparkles,
  ShieldCheck,
  ReceiptText,
  TrendingUp,
  TrendingDown,
  Repeat2,
  CreditCard,
  Copy,
  Link2,
  RefreshCw,
  Send,
  House,
  ShoppingBag,
  Utensils,
  Coffee,
  Car,
  Heart,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { WeeklyOverview, FinanceCharts, FinanceSettings, SavingsOverview } from '../MoneyWellness';
import { amount, baht, short } from '../lib/finance';
import { sectionTitle } from '../components/SectionTitle';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';

export default function LineAiPage() {
  const {
    live,
    overview,
    month,
    transactions,
    expenses,
    incomes,
    income,
    expense,
    balance,
    spentCats,
    chart,
    switchMonth,
    open,
    setView,
    search,
    setSearch,
    demoMode,
    notify,
    api,
    reload,
    delRecurring,
    lineStatus,
    setLineStatus,
    pair,
    setPair,
    parseText,
    setParseText,
    parseError,
    setParseError,
    parsed,
    setParsed,
    parseWithAi,
    row,
  } = useFinancePage();
  return (
    <>
      {sectionTitle('LINE & AI', 'ทุกการใช้จ่าย บันทึกได้ง่ายแค่ส่งข้อความ')}
      <div className="integration-hero">
        <div className="integration-content">
          <span className="integration-label">
            <span /> SMART FINANCE, SIMPLIFIED
          </span>
          <h2>
            จัดการเงินผ่าน LINE
            <br />
            <em>ง่ายกว่าที่เคย.</em>
          </h2>
          <p>
            พิมพ์ข้อความหรือส่งรูปใบเสร็จ ให้ Gemini AI ช่วยอ่านและจัดหมวดหมู่
            จากนั้นตรวจสอบก่อนบันทึกลงบัญชี หรือเลือกบันทึกอัตโนมัติได้ในตั้งค่า
          </p>
          <div className="integration-features">
            <span>
              <CheckCircle2 size={16} /> ส่งข้อความ
            </span>
            <span>
              <CheckCircle2 size={16} /> อ่านใบเสร็จ
            </span>
            <span>
              <CheckCircle2 size={16} /> ถามยอดเงิน
            </span>
          </div>
        </div>
        <div className="chat-art">
          <div className="chat-bubble right">วันนี้กาแฟ 65 บาท ☕</div>
          <div className="chat-bubble left">
            🧾 ตรวจสอบรายการ
            <br />
            กาแฟ ฿65 (อาหาร)
            <br />
            พิมพ์ “ยืนยัน” เพื่อบันทึก
          </div>
          <div className="chat-bubble right">ยืนยัน ✅</div>
          <div className="chat-bubble left">บันทึกรายการเรียบร้อย!</div>
        </div>
      </div>
      <div className="integration-grid">
        <div className="panel connection-panel">
          <div className="panel-header">
            <div>
              <h3>
                <MessageCircle size={20} /> LINE Official Account
              </h3>
              <p>เชื่อม LINE กับบัญชี MoneyFlow ของคุณ</p>
            </div>
            <span className={'status ' + (live.lineConnected ? 'connected' : '')}>
              {live.lineConnected ? '● เชื่อมต่อแล้ว' : '○ ยังไม่เชื่อมต่อ'}
            </span>
          </div>
          {lineStatus && !lineStatus.webhookActive && (
            <div className="line-user-notice" role="status">
              <AlertTriangle size={19} />
              <div>
                <strong>LINE ยังไม่พร้อมรับข้อความในขณะนี้</strong>
                <p>
                  ระบบเชื่อมต่อ LINE กำลังมีปัญหา กรุณาลองใหม่อีกครั้งภายหลัง
                  หรือบันทึกรายจ่ายผ่านหน้าเว็บไปก่อน
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setLineStatus(await api('/line/status'));
                      notify('ตรวจสอบการเชื่อมต่อ LINE ล่าสุดแล้ว', 'info');
                    } catch (e: any) {
                      notify(e.message || 'ตรวจสอบไม่สำเร็จ', 'error');
                    }
                  }}
                >
                  ลองตรวจสอบใหม่ <RefreshCw size={15} />
                </button>
              </div>
            </div>
          )}
          {!live.lineConnected && (
            <div className="steps line-connection-steps">
              <div>
                <span>01</span>
                <p>
                  <strong>เปิดแชต MoneyFlow Official Account</strong> ใน LINE หากยังไม่ได้เป็นเพื่อน
                  ให้เพิ่มเพื่อนก่อน
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  กด <strong>สร้างรหัสเชื่อมต่อ</strong> ด้านล่าง และคัดลอกข้อความที่ระบบแสดง
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  ส่งข้อความ <strong>เชื่อม ตามด้วยรหัส</strong> ไปที่แชต LINE เช่น{' '}
                  <code>เชื่อม 123456</code> เพื่อผูกกับบัญชีนี้
                </p>
              </div>
            </div>
          )}
          {!live.lineConnected && (
            <button
              className="button primary"
              disabled={!!lineStatus && !lineStatus.webhookActive}
              onClick={async () => {
                if (demoMode) return notify('กรุณาเริ่มใช้งานจริงก่อน', 'warning');
                try {
                  const x = await api('/line/pair', 'POST');
                  setPair(x.code);
                  notify('สร้างรหัสเชื่อม LINE เรียบร้อยแล้ว', 'info');
                } catch (e: any) {
                  notify(e.message, 'error');
                }
              }}
            >
              <Link2 size={17} /> สร้างรหัสเชื่อมต่อ
            </button>
          )}
          {pair && (
            <div className="pair-code">
              <div>
                <small>รหัสเชื่อมต่อ (ใช้ได้ 10 นาที)</small>
                <strong>{pair}</strong>
              </div>
              <button
                className="iconbtn"
                type="button"
                aria-label="คัดลอกข้อความเชื่อม LINE"
                onClick={() => {
                  void navigator.clipboard
                    .writeText('เชื่อม ' + pair)
                    .then(() => notify('คัดลอกข้อความเชื่อม LINE แล้ว', 'info'))
                    .catch(() => notify('คัดลอกไม่สำเร็จ กรุณาคัดลอกข้อความด้วยตนเอง', 'error'));
                }}
              >
                <Copy size={19} />
              </button>
            </div>
          )}
          {live.lineConnected && (
            <div className="mf-line-linked-controls">
              <div className="mf-linked-note">
                <CheckCircle2 size={18} /> LINE นี้เชื่อมกับบัญชีของคุณแล้ว ระบบตอบกลับและล็อกอินผ่าน
                LINE ได้
              </div>
              <button
                className="button outline disconnect"
                onClick={async () => {
                  if (
                    !(await askConfirm({
                      title: 'ยกเลิกการเชื่อม LINE?',
                      description:
                        'หลังยกเลิก จะไม่สามารถบันทึกรายจ่ายหรือเข้าสู่บัญชีนี้ผ่าน LINE ได้ จนกว่าจะเชื่อม LINE อีกครั้ง',
                      confirmLabel: 'ยกเลิกการเชื่อม',
                      tone: 'danger',
                    }))
                  )
                    return;
                  try {
                    await api('/line/link', 'DELETE');
                    setPair('');
                    await reload();
                    notify('ยกเลิกการเชื่อม LINE เรียบร้อยแล้ว');
                  } catch (e: any) {
                    notify(e.message, 'error');
                  }
                }}
              >
                ยกเลิกการเชื่อมต่อ
              </button>
            </div>
          )}
        </div>
        <div className="panel ai-panel">
          <div className="panel-header">
            <div>
              <h3>
                <BrainCircuit size={20} /> Gemini AI Assistant
              </h3>
              <p>ทดลองให้ AI แยกรายการจากข้อความ</p>
            </div>
            <span className="ai-badge">
              <Sparkles size={13} /> AI
            </span>
          </div>
          <label>
            ลองพิมพ์ข้อความ <span className="mf-required">*</span>
          </label>
          <textarea
            rows={4}
            maxLength={2000}
            aria-label="ข้อความให้ AI วิเคราะห์"
            aria-invalid={!!parseError}
            aria-describedby={parseError ? 'mf-ai-parse-error' : undefined}
            className={parseError ? 'mf-invalid' : ''}
            placeholder="เช่น วันนี้กินข้าว 65 กาแฟ 45 ค่ารถ 30"
            value={parseText}
            onChange={(e) => {
              setParseText(e.target.value);
              setParseError('');
              setParsed(null);
            }}
          />
          {parseError && (
            <p className="mf-field-error" id="mf-ai-parse-error" role="alert">
              {parseError}
            </p>
          )}
          <button className="button dark" onClick={parseWithAi}>
            <Sparkles size={17} /> ทดลองแยกรายการ
          </button>
          {parsed && (
            <div className="ai-result">
              <b>ผลการอ่านข้อมูล</b>
              {parsed.items?.length ? (
                parsed.items.map((x: any, i: number) => (
                  <p key={i}>
                    {x.merchant} · {baht(x.amount)} · {x.category}
                  </p>
                ))
              ) : (
                <p>ไม่พบรายการใช้จ่าย หรือเป็นคำถามสรุปยอด</p>
              )}
              <small>AI แค่แยกข้อมูล ไม่บันทึกโดยอัตโนมัติ</small>
            </div>
          )}
          <div className="env-note">
            <ShieldCheck size={18} />
            <span>
              AI ช่วยอ่านและจัดหมวดหมู่รายการเท่านั้น กรุณาตรวจสอบจำนวนเงินและข้อมูลก่อนบันทึกจริง
            </span>
          </div>
        </div>
      </div>
      <FinanceSettings
        overview={overview}
        variant="line"
        onSaved={async () => {
          await reload();
        }}
        disabled={demoMode}
      />
    </>
  );
}
