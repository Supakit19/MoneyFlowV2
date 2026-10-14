import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CircleHelp,
  CirclePlay,
  CircleStop,
  Link2,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';
import { BANK_CONNECTION_BUSY, bankConnectionAtCapacity, bankConnectionMessage } from '../lib/bankConnectionCopy';
import './LineJsLocalAgent.css';
import { bankChatCandidates, bankChatIdentity } from './bankChatCandidates';
import BankChatIdentityLabel from './BankChatIdentityLabel';

export type HostedStatus = {
  available: boolean;
  reason: string;
  running: boolean;
  state: string;
  mode: 'discovery' | 'listening';
  qrUrl: string;
  pin: string;
  candidateMid: string;
  candidateMids?: string[];
  lastError: string;
  eventCount: number;
  observedCount: number;
  skippedCount: number;
  historyState: string;
  historyChecks: number;
  maxWorkers: number;
  runningWorkers: number;
};
type HostedReply = {
  ok: boolean;
  connected: boolean;
  connectorMode: string;
  autoResume: boolean;
  agent: HostedStatus;
};
const states: Record<string, string> = {
  stopped: 'ไม่ได้ทำงาน',
  starting: 'กำลังเริ่มเชื่อมต่อ LINE',
  waiting_qr: 'รอสแกน QR จากมือถือ',
  connected: 'เชื่อม LINE สำเร็จ',
  listening: 'กำลังรับแจ้งเตือนธนาคาร',
  error: 'เชื่อมต่อไม่สำเร็จ',
};

export default function LineJsHostedAgent({
  onConnected,
  onCandidate,
}: {
  onConnected?: () => Promise<void>;
  onCandidate?: (mid: string) => void;
}) {
  const { api, notify, demoMode } = useFinancePage();
  const [result, setResult] = useState<HostedReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  async function refresh() {
    if (demoMode) return;
    try {
      const data = await api('/bank/linejs/connector/status');
      setResult(data);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }
  useEffect(() => {
    if (demoMode) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [demoMode]);

  async function action(name: 'connect' | 'start' | 'stop' | 'disconnect') {
    if (busy || demoMode) return;
    if (name === 'connect' || name === 'disconnect') {
      const consent = await askConfirm({
        title:
          name === 'connect' ? 'เชื่อม LINE ส่วนตัวเข้ากับ MoneyFlow?' : 'ยกเลิกการเชื่อม LINE นี้?',
        description:
          name === 'connect'
            ? 'คุณจะสแกน QR ด้วย LINE ของคุณเอง MoneyFlow จะอ่านเฉพาะแจ้งเตือนของธนาคารที่เลือก ข้อมูลสำหรับเชื่อมต่อจะถูกเข้ารหัสและแยกจากผู้ใช้อื่น'
            : 'MoneyFlow จะหยุดการรับแจ้งเตือนและลบข้อมูลสำหรับเชื่อมต่อ LINE ที่เก็บไว้ คุณควรถอนสิทธิ์อุปกรณ์ที่ LINE > ตั้งค่า > อุปกรณ์ที่เข้าสู่ระบบด้วย',
        confirmLabel: name === 'connect' ? 'ตกลง เชื่อม LINE' : 'ยกเลิกการเชื่อมต่อ',
        tone: name === 'connect' ? 'normal' : 'danger',
      });
      if (!consent) return;
    }
    setBusy(true);
    try {
      const data = await api('/bank/linejs/connector/' + name, 'POST');
      if (data.agent && result) setResult({ ...result, agent: data.agent });
      notify(
        name === 'connect'
          ? 'เริ่มเชื่อม LINE แล้ว สแกน QR เมื่อแสดง'
          : name === 'start'
            ? 'เริ่มรับแจ้งเตือนจากธนาคารแล้ว'
            : name === 'stop'
              ? 'หยุดรับแจ้งเตือนจากธนาคารแล้ว'
              : 'ยกเลิกและลบ Session จากเซิร์ฟเวอร์แล้ว',
        'success',
      );
      if (name === 'connect' || name === 'disconnect' || name === 'stop') await onConnected?.();
      await refresh();
    } catch (error: any) {
      notify(bankConnectionMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  }
  if (demoMode) return null;
  const a = result?.agent;
  const chatCandidates = bankChatCandidates(a);
  const capacityFull = bankConnectionAtCapacity(a);
  return (
    <div className="mf-agent-card" aria-label="เชื่อม LINE เพื่อรับแจ้งเตือนธนาคาร">
      <div className="mf-agent-heading">
        <span className="mf-agent-symbol">
          <Server size={20} />
        </span>
        <div>
          <strong>เชื่อม LINE ของคุณเอง</strong>
          <p>เชื่อมจากหน้านี้ครั้งเดียว จากนั้นรับแจ้งเตือนได้แม้ไม่ได้เปิดคอมพิวเตอร์</p>
        </div>
        <span className={'mf-agent-state ' + (a?.running ? 'active' : '')}>
          <span /> {a?.running ? 'ทำงานอยู่' : 'ยังไม่ทำงาน'}
        </span>
      </div>
      {unavailable || !a ? (
        <div className="mf-agent-notice">
          <CircleHelp size={17} /> กำลังตรวจสถานะเซิร์ฟเวอร์...
        </div>
      ) : !a.available ? (
        <div className="mf-agent-notice">
          <AlertTriangle size={17} />
          <span>{bankConnectionMessage(a.reason || 'ยังไม่พร้อมเชื่อม LINE')} กรุณาแจ้งผู้ดูแล MoneyFlow</span>
        </div>
      ) : (
        <>
          <div className="mf-agent-notice" style={{ lineHeight: 1.8 }}>
            <ShieldCheck size={17} />
            <span>
              วิธีตั้งค่า: 1. กดเชื่อม LINE และสแกน QR → 2. เลือกแชตธนาคารที่ตรวจสอบแล้ว → 3. เลือกบัญชี
              MoneyFlow ด้านล่าง → 4. เปิดรับแจ้งเตือนและกดบันทึกการตั้งค่า
            </span>
          </div>
          <div className="mf-agent-status-line">
            <span>
              <Wifi size={16} /> {states[a.state] || a.state}
            </span>
            <span>
              กำลังใช้งาน {a.runningWorkers}/{a.maxWorkers} บัญชี
            </span>
          </div>
          {capacityFull && !result?.connected && (
            <div className="mf-agent-notice" role="status">
              <AlertTriangle size={17} /> <span>{BANK_CONNECTION_BUSY}</span>
            </div>
          )}
          <div className="mf-agent-buttons">
            {!result?.connected && (
              <button
                type="button"
                className="is-primary"
                disabled={busy || capacityFull}
                onClick={() => void action('connect')}
              >
                <Link2 size={16} /> เชื่อม LINE ด้วย QR
              </button>
            )}
            {result?.connected && !a.running && (
              <button
                type="button"
                className="is-primary"
                disabled={busy}
                onClick={() => void action('start')}
              >
                <CirclePlay size={17} /> เริ่มรับแจ้งเตือน
              </button>
            )}
            {result?.connected && a.running && (
              <button
                type="button"
                className="is-stop"
                disabled={busy}
                onClick={() => void action('stop')}
              >
                <CircleStop size={17} /> หยุดรับแจ้งเตือน
              </button>
            )}
            {result?.connected && !a.running && (
              <button
                type="button"
                className="is-neutral"
                disabled={busy}
                onClick={() => void action('disconnect')}
              >
                <Unplug size={16} /> ยกเลิกเชื่อม LINE
              </button>
            )}
            <button type="button" className="is-neutral" disabled={busy} onClick={() => void refresh()}>
              <RefreshCw size={16} /> รีเฟรช
            </button>
          </div>
          {a.qrUrl && (
            <div className="mf-agent-qr">
              <div>
                <strong>
                  <Smartphone size={18} /> สแกน QR ด้วย LINE ของคุณ
                </strong>
                <p>
                  เปิด LINE บนมือถือ → สแกน QR → ยืนยันการเข้าสู่ระบบ ห้ามแชร์ QR หรือ PIN ให้ผู้อื่น
                </p>
              </div>
              <div className="mf-agent-qr-image">
                <QRCodeSVG value={a.qrUrl} size={178} level="M" />
              </div>
              {a.pin && (
                <div className="mf-agent-pin">
                  รหัสยืนยัน <strong>{a.pin}</strong>
                </div>
              )}
            </div>
          )}
          {chatCandidates.length > 0 && (
            <div className="mf-agent-candidates">
              <strong>
                <ShieldCheck size={16} /> พบแชตที่อาจเป็นธนาคาร
              </strong>
              <small>
                ชื่อบางรายการมาจากข้อมูลที่ผู้ใช้แจ้ง ไม่ใช่ชื่อที่ LINE ยืนยัน
                ต้องตรวจแชตจริงก่อนผูกบัญชี
              </small>
              {chatCandidates.map((mid) => (
                <div className="mf-agent-candidate" key={mid}>
                  <BankChatIdentityLabel mid={mid} />
                  <button
                    type="button"
                    disabled={!bankChatIdentity(mid).selectable}
                    onClick={() => onCandidate?.(mid)}
                  >
                    {bankChatIdentity(mid).selectable ? 'ใช้แชตนี้' : 'ยังไม่รองรับ'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {a.running && (
            <p className="mf-agent-footnote">
              ได้รับจากธนาคาร {a.observedCount || 0} · ส่งไป MoneyFlow {a.eventCount || 0} · ข้าม{' '}
              {a.skippedCount || 0} · ตรวจข้อความล่าสุด {a.historyChecks || 0} รอบ
            </p>
          )}
          {a.lastError && (
            <div className="mf-agent-notice">
              <AlertTriangle size={17} /> {bankConnectionMessage(a.lastError)}
            </div>
          )}
          <p className="mf-agent-footnote">
            ข้อมูลเชื่อมต่อของแต่ละคนถูกเก็บแยกและเข้ารหัส · วิธีอ่านแจ้งเตือนไม่ใช่บริการทางการจาก LINE
            หรือธนาคาร
          </p>
        </>
      )}
    </div>
  );
}
