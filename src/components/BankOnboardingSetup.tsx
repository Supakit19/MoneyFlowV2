import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CirclePlay,
  CircleStop,
  Landmark,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import { api } from '../lib/api';
import type { Account } from '../lib/finance';
import './BankOnboardingSetup.css';

type Bank = 'kbank' | 'ktb' | 'scb' | 'other';
type Settings = {
  enabled: boolean;
  bank: Bank;
  senderMid: string;
  accountId: string;
  tokenConfigured: boolean;
  pushLine: boolean;
};
type Agent = {
  available: boolean;
  running: boolean;
  linked?: boolean;
  state: string;
  qrUrl: string;
  pin: string;
  candidateMid: string;
  reason: string;
  lastError: string;
  mode: string;
  maxWorkers?: number;
  runningWorkers?: number;
};
type Connector = {
  connectorMode: 'local' | 'hosted';
  connected: boolean;
  agent: Agent;
};
type Local = { agent: Agent };
type Props = {
  accounts: Account[];
  lineConnected: boolean;
  notify: (message: string, tone?: 'success' | 'error' | 'warning' | 'info') => void;
};
const banks: { id: Bank; name: string }[] = [
  { id: 'kbank', name: 'กสิกรไทย · KBank Live' },
  { id: 'ktb', name: 'กรุงไทย · Krungthai Connext' },
  { id: 'scb', name: 'ไทยพาณิชย์ · SCB Connect (ทดลอง)' },
  { id: 'other', name: 'ธนาคารอื่น (ทดลอง)' },
];
const statusTitle: Record<string, string> = {
  stopped: 'ยังไม่ได้เปิดตัวรับข้อความ',
  starting: 'กำลังเปิดตัวเชื่อมต่อ LINE...',
  waiting_qr: 'รอสแกน QR และยืนยันบนโทรศัพท์',
  connected: 'LINE เชื่อมแล้ว กำลังตรวจข้อความ',
  listening: 'พร้อมรับข้อความธนาคาร',
  error: 'LINE เชื่อมต่อไม่สำเร็จ',
};

export default function BankOnboardingSetup({ accounts, lineConnected, notify }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hosted, setHosted] = useState<Connector | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [hasVerifiedSender, setHasVerifiedSender] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [pushLine, setPushLine] = useState(false);
  const [chosenBank, setChosenBank] = useState<Bank>('kbank');
  const [senderMid, setSenderMid] = useState('');
  const [accountId, setAccountId] = useState('');
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(
    async (first = false) => {
      try {
        const [cfg, host, legacy] = await Promise.all([
          api('/bank/linejs/settings'),
          api('/bank/linejs/connector/status'),
          api('/bank/linejs/local/status').catch(() => ({ agent: null })), // Local control intentionally blocked on VPS
        ]);
        const current: Settings = cfg.settings;
        setSettings(current);
        setHosted(host);
        setLocal(legacy);
        if (first && !initialized) {
          setChosenBank(current.bank);
          setSenderMid(current.senderMid || '');
          setAccountId(current.accountId || accounts[0]?.id || '');
          setEnabled(true);
          setPushLine(Boolean(current.pushLine && lineConnected));
          setSaved(current.enabled === true);
          setInitialized(true);
        }
        setFailure('');
      } catch (e) {
        if (first) setFailure(e instanceof Error ? e.message : 'อ่านสถานะการเชื่อมต่อไม่สำเร็จ');
      } finally {
        if (first) setLoading(false);
      }
    },
    [accounts, lineConnected, initialized],
  );

  useEffect(() => {
    void refresh(true);
    const id = window.setInterval(() => void refresh(), 4500);
    return () => window.clearInterval(id);
  }, []);

  const useLegacy =
    local?.agent?.available === true &&
    (local.agent.linked === true || local.agent.running === true) &&
    hosted?.connectorMode !== 'hosted';
  const agent = useLegacy ? local?.agent : hosted?.agent;
  const serverSupported = useLegacy || Boolean(hosted?.agent?.available);
  const canSetup = useLegacy
    ? local?.agent?.linked === true
    : hosted?.connectorMode === 'hosted' && hosted?.connected === true;
  const active = agent?.state === 'connected' || agent?.state === 'listening';
  const firstBank = useMemo(() => accounts.find((a) => a.kind === 'bank') || accounts[0], [accounts]);
  const currentAccount = accountId || firstBank?.id || '';

  async function connect() {
    if (busy || !serverSupported) return;
    setBusy(true);
    setFailure('');
    try {
      if (useLegacy) {
        if (!local?.agent?.linked) await api('/bank/linejs/local/connect', 'POST');
        await api('/bank/linejs/local/start', 'POST');
      } else {
        if (hosted?.connected) await api('/bank/linejs/connector/start', 'POST');
        else await api('/bank/linejs/connector/connect', 'POST');
      }
      notify('เปิดการเชื่อมต่อแล้ว สแกน QR เมื่อปรากฏบนหน้าจอ', 'info');
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'เปิดการเชื่อมต่อไม่สำเร็จ';
      setFailure(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (busy) return;
    if (!canSetup || !active) {
      setFailure('กรุณาเชื่อม LINE ด้วย QR ให้สำเร็จก่อน');
      return;
    }
    if (!senderMid || !/^u[0-9a-f]{32}$/i.test(senderMid)) {
      setFailure('กรุณาเลือก Sender MID ของธนาคารที่ถูกต้อง');
      return;
    }
    if (!hasVerifiedSender && !saved) {
      setFailure('โปรดยืนยันว่า Sender MID นี้มาจากแชตธนาคารจริง');
      return;
    }
    if (enabled && chosenBank === 'kbank' && !riskAccepted && !saved) {
      setFailure('กรุณารับทราบกฎตั้งต้นเป็นเงินออกก่อนเปิดบันทึกอัตโนมัติ');
      return;
    }
    if (!currentAccount) {
      setFailure('กรุณาเลือกบัญชี MoneyFlow สำหรับบันทึกรายการ');
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const result = await api('/bank/linejs/settings', 'PUT', {
        enabled,
        bank: chosenBank,
        accountId: currentAccount,
        senderMid: senderMid.toLowerCase(),
        pushLine: lineConnected ? pushLine : false,
      });
      if (result.connectorWarning) {
        setFailure(result.connectorWarning);
        setSaved(false);
        notify(result.connectorWarning, 'warning');
      } else {
        setSaved(enabled);
        notify('ตั้งค่ารับแจ้งเตือนธนาคารสำเร็จแล้ว', 'success');
      }
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'บันทึกการเชื่อมต่อธนาคารไม่สำเร็จ';
      setFailure(message);
      notify(message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="bank-onboard-loading">
        <LoaderCircle className="bank-onboard-spin" size={18} /> กำลังเตรียมระบบเชื่อมธนาคาร...
      </div>
    );
  return (
    <div className="bank-onboard">
      <div className="bank-onboard-title">
        <Landmark size={21} />
        <div>
          <strong>รับเงินเข้า–ออกจากธนาคารอัตโนมัติ</strong>
          <p>เชื่อม LINE ส่วนตัว 1 ครั้ง แล้วให้ MoneyFlow รับแจ้งเตือนตามบัญชีของคุณ</p>
        </div>
      </div>
      {!serverSupported ? (
        <div className="bank-onboard-notice">
          <AlertCircle size={18} />
          <span>
            {agent?.reason || 'เซิร์ฟเวอร์ยังไม่เปิดระบบเชื่อม LINEJS'} —
            ข้ามขั้นตอนนี้และกลับมาเชื่อมภายหลังได้
          </span>
        </div>
      ) : (
        <>
          <div className="bank-onboard-status">
            <span className={'bank-onboard-dot ' + (active ? 'is-ready' : '')} />
            <div>
              <strong>{statusTitle[agent?.state || 'stopped'] || 'กำลังตรวจสถานะ LINE'}</strong>
              <small>
                {useLegacy ? 'เชื่อมผ่าน Mac ของคุณ' : 'แยก LINE Session ของคุณบนเซิร์ฟเวอร์'}
              </small>
            </div>
          </div>
          {!active && !agent?.running && (
            <button
              type="button"
              className="bank-onboard-button"
              disabled={busy}
              onClick={() => void connect()}
            >
              <Link2 size={17} />
              {busy
                ? 'กำลังเชื่อมต่อ...'
                : hosted?.connected
                  ? 'เริ่ม LINEJS ต่อ'
                  : 'เชื่อม LINE ด้วย QR'}
              <ArrowRight size={17} />
            </button>
          )}
          {agent?.qrUrl && (
            <div className="bank-onboard-qr">
              <QRCodeSVG value={agent.qrUrl} size={186} level="M" />
              <div>
                <strong>
                  <Smartphone size={17} /> สแกน QR จาก LINE บนมือถือ
                </strong>
                <p>
                  เปิดแอป LINE → ตัวสแกน QR → สแกนและยืนยันการเข้าสู่ระบบ ห้ามส่งภาพ QR หรือ PIN ให้ใคร
                </p>
                {agent.pin && (
                  <span className="bank-onboard-pin">
                    รหัสยืนยัน: <b>{agent.pin}</b>
                  </span>
                )}
              </div>
            </div>
          )}
          {agent?.state === 'error' && (
            <p className="bank-onboard-hint">
              เชื่อมต่อหลุด? กดเริ่ม LINEJS อีกครั้ง หรือกลับมาเชื่อมภายหลัง
            </p>
          )}
          {canSetup && (
            <div className="bank-onboard-config">
              <label className="bank-onboard-field">
                ธนาคาร
                <select
                  value={chosenBank}
                  disabled={busy}
                  onChange={(e) => {
                    setChosenBank(e.target.value as Bank);
                    setSaved(false);
                  }}
                >
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bank-onboard-field">
                บันทึกเข้า MoneyFlow บัญชีไหน
                <select
                  value={currentAccount}
                  disabled={busy}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    setSaved(false);
                  }}
                >
                  {accounts.map((account) => (
                    <option value={account.id} key={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              {agent?.candidateMid && (
                <button
                  type="button"
                  className="bank-onboard-bank-option"
                  onClick={() => {
                    setSenderMid(agent.candidateMid);
                    setHasVerifiedSender(false);
                    setSaved(false);
                  }}
                >
                  <ShieldCheck size={17} /> พบแชตที่อาจเป็นธนาคาร — กดเลือกหลังตรวจชื่อแชตจริง
                </button>
              )}
              <label className="bank-onboard-field">
                Sender MID ของแชตธนาคาร
                <input
                  value={senderMid}
                  maxLength={33}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="u ตามด้วยอักษรและตัวเลข 32 ตัว"
                  disabled={busy}
                  onChange={(e) => {
                    setSenderMid(e.target.value.trim());
                    setHasVerifiedSender(false);
                    setSaved(false);
                  }}
                />
              </label>
              <label className="bank-onboard-check">
                <input
                  type="checkbox"
                  checked={hasVerifiedSender || saved}
                  disabled={busy || saved}
                  onChange={(e) => setHasVerifiedSender(e.target.checked)}
                />
                <span>ฉันตรวจแล้วว่า Sender MID นี้เป็นแชตธนาคารจริง</span>
              </label>
              <label className="bank-onboard-check">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={busy}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    setSaved(false);
                  }}
                />
                <span>บันทึกรายการที่อ่านได้อัตโนมัติ</span>
              </label>
              {enabled && chosenBank === 'kbank' && (
                <label className="bank-onboard-check">
                  <input
                    type="checkbox"
                    checked={riskAccepted || saved}
                    disabled={busy || saved}
                    onChange={(e) => setRiskAccepted(e.target.checked)}
                  />
                  <span>
                    ฉันรับทราบว่าแจ้งเตือน KBank Live ที่อ่านยอดได้แต่ไม่พบประเภท จะถูกตั้งต้นเป็น{' '}
                    <strong>เงินออก</strong> และอาจต้องแก้ไขรายการภายหลัง
                  </span>
                </label>
              )}
              {lineConnected ? (
                <label className="bank-onboard-check">
                  <input
                    type="checkbox"
                    checked={pushLine}
                    disabled={busy}
                    onChange={(e) => {
                      setPushLine(e.target.checked);
                      setSaved(false);
                    }}
                  />
                  <span>แจ้งรายการที่บันทึกสำเร็จกลับ LINE OA</span>
                </label>
              ) : (
                <p className="bank-onboard-hint">
                  ต้องเชื่อม LINE OA ในขั้นก่อนหน้า จึงจะเปิดแจ้งกลับ LINE OA ได้
                </p>
              )}
              <button
                type="button"
                className="bank-onboard-button"
                disabled={busy || !active}
                onClick={() => void apply()}
              >
                {busy ? (
                  <LoaderCircle className="bank-onboard-spin" size={17} />
                ) : saved ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <CirclePlay size={17} />
                )}
                {busy
                  ? 'กำลังบันทึก...'
                  : saved
                    ? 'ตั้งค่าสำเร็จแล้ว — กดบันทึกอีกครั้งเพื่อปรับค่า'
                    : 'บันทึกและเปิดรับธนาคาร'}
              </button>
            </div>
          )}
          {saved && settings?.enabled && (
            <div className="bank-onboard-success">
              <CheckCircle2 size={18} />
              ระบบพร้อมรับแจ้งเตือนของคุณแล้ว ไม่ต้องเปิดหน้านี้ค้างไว้เมื่อเซิร์ฟเวอร์ทำงานอยู่
            </div>
          )}
          {agent?.lastError && <p className="bank-onboard-hint">{agent.lastError}</p>}
        </>
      )}
      {failure && (
        <div className="bank-onboard-error" role="alert">
          <AlertCircle size={17} />
          {failure}
        </div>
      )}
      <div className="bank-onboard-privacy">
        <ShieldCheck size={17} />
        LINEJS ไม่ใช่บริการทางการของธนาคารหรือ LINE อาจอ่านข้อมูลผิดหรือรับแจ้งเตือนไม่ครบ
        กรุณาตรวจยอดกับแอปธนาคาร และยกเลิกเชื่อมได้ภายหลัง
      </div>
      <button
        type="button"
        className="bank-onboard-refresh"
        disabled={busy}
        onClick={() => void refresh()}
      >
        <RefreshCw size={15} /> ตรวจสถานะอีกครั้ง
      </button>
    </div>
  );
}
