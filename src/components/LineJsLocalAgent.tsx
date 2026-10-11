import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  CirclePlay,
  CircleStop,
  Link2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';
import './LineJsLocalAgent.css';
import { bankChatIdentity } from './bankChatCandidates';
import BankChatIdentityLabel from './BankChatIdentityLabel';

type Agent = {
  available: boolean;
  running: boolean;
  state: string;
  mode: 'discovery' | 'listening';
  linked: boolean;
  externalRunning: boolean;
  qrUrl: string;
  pin: string;
  candidateMid: string;
  eventCount: number;
  observedCount: number;
  skippedCount: number;
  historyChecks: number;
  historyFailures: number;
  historyRecent: number;
  historyState: string;
  historyLastCheckedAt: string;
  lastOutcome: string;
  lastError: string;
  reason: string;
};
const outcomeText: Record<string, string> = {
  saved: 'บันทึกแล้ว',
  ignored: 'ข้ามรายการ',
  duplicate: 'รายการซ้ำ',
};
const statusText: Record<string, string> = {
  stopped: 'ยังไม่เริ่มทำงาน',
  starting: 'กำลังเชื่อมต่อ...',
  waiting_qr: 'รอสแกน QR ใน LINE',
  connected: 'เชื่อมบัญชี LINE แล้ว',
  listening: 'กำลังรับข้อความจาก LINE',
  error: 'การเชื่อมต่อมีปัญหา',
};

export default function LineJsLocalAgent({
  onConnected,
  onCandidate,
}: {
  onConnected?: () => Promise<void>;
  onCandidate?: (mid: string) => void;
}) {
  const { api, notify, demoMode } = useFinancePage();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  async function refresh() {
    if (demoMode) return;
    try {
      const result = await api('/bank/linejs/local/status');
      setAgent(result.agent);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }
  useEffect(() => {
    if (demoMode) return;
    void refresh();
    const handle = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(handle);
  }, [demoMode]);

  async function action(name: 'connect' | 'start' | 'stop') {
    if (busy || demoMode) return;
    if (name === 'connect') {
      const agreed = await askConfirm({
        title: 'เชื่อม LINE กับ MoneyFlow บนเครื่องนี้?',
        description:
          'ระบบจะตั้งค่าการเชื่อมต่อให้อัตโนมัติ หากเคยเชื่อมไว้จะต้องเปิดรับแจ้งเตือนใหม่หลังตรวจสอบข้อมูล',
        confirmLabel: 'เชื่อมต่อบนเครื่องนี้',
        tone: 'normal',
      });
      if (!agreed) return;
    }
    setBusy(true);
    try {
      const data = await api('/bank/linejs/local/' + name, 'POST');
      if (data.agent) setAgent(data.agent);
      if (name === 'connect') await onConnected?.();
      notify(
        name === 'connect'
          ? 'ตั้งค่าการเชื่อม LINE บนเครื่องนี้สำเร็จ'
          : name === 'start'
            ? 'เริ่มรับแจ้งเตือนแล้ว'
            : 'หยุดรับแจ้งเตือนแล้ว',
        'success',
      );
      await refresh();
    } catch (e: any) {
      notify(e.message || 'ควบคุมการเชื่อมต่อไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  }
  if (demoMode) return null;
  return (
    <div className="mf-agent-card">
      <div className="mf-agent-heading">
        <span className="mf-agent-symbol">
          <Monitor size={20} />
        </span>
        <div>
          <strong>เชื่อม LINE บนเครื่องนี้</strong>
          <p>เปิดรับข้อความจากธนาคารผ่านคอมพิวเตอร์เครื่องนี้</p>
        </div>
        <span className={'mf-agent-state ' + (agent?.running ? 'active' : '')}>
          <span /> {agent?.running ? 'ทำงานอยู่' : 'ไม่ได้ทำงาน'}
        </span>
      </div>
      {unavailable || (agent && !agent.available) ? (
        <div className="mf-agent-notice">
          <CircleHelp size={17} />
          <span>
            {agent?.reason ||
              'การรับแจ้งเตือนบนเครื่องนี้ใช้ได้เมื่อเปิด MoneyFlow บนคอมพิวเตอร์เครื่องนี้เท่านั้น'}
          </span>
        </div>
      ) : !agent ? (
        <div className="mf-agent-notice">กำลังตรวจการเชื่อม LINE...</div>
      ) : (
        <>
          <div className="mf-agent-status-line">
            <span>
              <Wifi size={16} /> {statusText[agent.state] || agent.state}
            </span>
            <span>
              {agent.running
                ? agent.mode === 'listening'
                  ? 'โหมดรับธนาคาร'
                  : 'โหมดค้นหาผู้ส่ง'
                : agent.linked
                  ? 'เครื่องนี้พร้อมเชื่อม'
                  : 'ยังไม่ได้เชื่อม LINE'}
            </span>
          </div>
          {agent.externalRunning && (
            <div className="mf-agent-notice">
              <AlertTriangle size={17} />
              <span>มีตัวรับแจ้งเตือนที่เปิดอยู่แล้ว กรุณาปิดการทำงานเดิมก่อนเปิดผ่านหน้านี้</span>
            </div>
          )}
          <div className="mf-agent-buttons">
            {!agent.linked && (
              <button
                type="button"
                onClick={() => void action('connect')}
                disabled={busy || agent.externalRunning}
              >
                <Link2 size={16} /> เชื่อม LINE บนเครื่องนี้
              </button>
            )}
            {!agent.running && agent.linked && (
              <button
                type="button"
                className="is-primary"
                onClick={() => void action('start')}
                disabled={busy || agent.externalRunning}
              >
                <CirclePlay size={17} /> เริ่มรับแจ้งเตือน
              </button>
            )}
            {agent.running && (
              <button
                type="button"
                className="is-stop"
                onClick={() => void action('stop')}
                disabled={busy}
              >
                <CircleStop size={17} /> หยุดรับแจ้งเตือน
              </button>
            )}
            <button type="button" className="is-neutral" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw size={16} /> รีเฟรช
            </button>
          </div>
          {agent.qrUrl && (
            <div className="mf-agent-qr">
              <div>
                <strong>
                  <Smartphone size={18} /> สแกน QR ใน LINE บนมือถือ
                </strong>
                <p>เปิด LINE → สแกน QR → ยืนยันการเข้าสู่ระบบบนอุปกรณ์นี้ ห้ามแชร์ภาพ QR หรือรหัส PIN</p>
              </div>
              <div className="mf-agent-qr-image">
                <QRCodeSVG value={agent.qrUrl} size={178} level="M" />
              </div>
              {agent.pin && (
                <div className="mf-agent-pin">
                  รหัสยืนยันใน LINE <strong>{agent.pin}</strong>
                </div>
              )}
            </div>
          )}
          {agent.candidateMid && (
            <div className="mf-agent-candidate">
              <div>
                <strong>
                  <ShieldCheck size={16} /> พบผู้ส่งที่อาจเป็นธนาคาร
                </strong>
                <small>ชื่อที่แสดงอาจมาจากข้อมูลที่ผู้ใช้แจ้ง กรุณาตรวจสอบใน LINE ก่อนเลือก</small>
                <BankChatIdentityLabel mid={agent.candidateMid} />
              </div>
              <button
                type="button"
                disabled={!bankChatIdentity(agent.candidateMid).selectable}
                onClick={() => onCandidate?.(agent.candidateMid)}
              >
                {bankChatIdentity(agent.candidateMid).selectable ? 'ใช้แชตนี้' : 'ยังไม่รองรับ'}
              </button>
            </div>
          )}
          {agent.running && agent.mode === 'listening' && (
            <p className="mf-agent-footnote">
              แจ้งเตือนธนาคารที่ได้รับ {agent.observedCount ?? 0} · ส่งให้ MoneyFlow{' '}
              {agent.eventCount ?? 0} · ข้าม/อ่านไม่ได้ {agent.skippedCount ?? 0}
              {agent.lastOutcome
                ? ' · ผลล่าสุด: ' + (outcomeText[agent.lastOutcome] || agent.lastOutcome)
                : ''}
            </p>
          )}
          {agent.running && agent.mode === 'listening' && (
            <p className="mf-agent-footnote">
              ตรวจข้อความล่าสุดจากแชตธนาคารแบบสำรองทุก 60 วินาที · ตรวจแล้ว {agent.historyChecks ?? 0}{' '}
              รอบ · ข้อความใหม่หลังเริ่มใช้งาน {agent.historyRecent ?? 0} รายการ ·{' '}
              {agent.historyState === 'ok'
                ? 'อ่านประวัติได้'
                : agent.historyState === 'bank_chat_unavailable'
                  ? 'ไม่พบกล่องข้อความธนาคาร'
                  : agent.historyState === 'fetch_error'
                    ? 'อ่านประวัติไม่สำเร็จ'
                    : 'รอการตรวจครั้งแรก'}
            </p>
          )}
          {agent.running &&
            agent.mode === 'listening' &&
            agent.historyState === 'ok' &&
            (agent.observedCount ?? 0) > 0 &&
            (agent.skippedCount ?? 0) > 0 && (
              <div className="mf-agent-notice">
                <AlertTriangle size={17} />
                <span>
                  มีแจ้งเตือนธนาคารบางรายการที่ข้อมูลยอดหรือประเภทเงินไม่ชัดเจน
                  ระบบจึงข้ามรายการนั้นเพื่อไม่ให้บันทึกเงินผิด และจะไม่บันทึกย้อนหลังอัตโนมัติ
                </span>
              </div>
            )}
          {agent.lastError && (
            <div className="mf-agent-notice">
              <AlertTriangle size={17} />
              <span>{agent.lastError}</span>
            </div>
          )}
          <p className="mf-agent-footnote">
            ข้อมูลสำหรับเชื่อมต่อจะอยู่บนคอมพิวเตอร์เครื่องนี้เท่านั้น ·
            ต้องเปิดคอมพิวเตอร์ไว้ระหว่างรับแจ้งเตือน
          </p>
        </>
      )}
    </div>
  );
}
