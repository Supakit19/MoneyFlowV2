import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Landmark,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';
import LineJsLocalAgent from './LineJsLocalAgent';
import './LineJsBankAutomation.css';

type Options = {
  enabled: boolean;
  pushLine: boolean;
  bank: 'kbank' | 'scb' | 'other';
  senderMid: string;
  accountId: string;
  tokenConfigured: boolean;
  lastEventAt: string | null;
};
type SavedEvent = {
  id: string;
  bank: string;
  kind: 'income' | 'expense';
  amount_satang: number | string;
  summary: string;
  created_at: string;
  status: 'saved';
};
const EMPTY: Options = {
  enabled: false,
  pushLine: false,
  bank: 'kbank',
  senderMid: '',
  accountId: '',
  tokenConfigured: false,
  lastEventAt: null,
};
const banks: { value: Options['bank']; label: string }[] = [
  { value: 'kbank', label: 'KBank Live · กสิกรไทย' },
  { value: 'scb', label: 'SCB Connect · ไทยพาณิชย์' },
  { value: 'other', label: 'ธนาคารอื่น (ทดลอง)' },
];
function formatMoney(satang: number | string) {
  return (
    '฿' +
    (Number(satang) / 100).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export default function LineJsBankAutomation() {
  const { api, live, notify, demoMode, reload } = useFinancePage();
  const [options, setOptions] = useState<Options>(EMPTY);
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (demoMode) return;
    setLoading(true);
    try {
      const [settingsResult, eventsResult] = await Promise.all([
        api('/bank/linejs/settings'),
        api('/bank/linejs/events'),
      ]);
      setOptions({ ...EMPTY, ...(settingsResult.settings || {}) });
      setEvents(eventsResult.events || []);
      setLoaded(true);
    } catch (error: any) {
      notify(error.message || 'ไม่สามารถอ่านสถานะ LINEJS', 'error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (demoMode) {
      setLoaded(true);
      return;
    }
    void load();
  }, [demoMode]);
  useEffect(() => {
    if (demoMode || !options.enabled) return;
    const id = window.setInterval(async () => {
      try {
        const data = await api('/bank/linejs/events');
        setEvents(data.events || []);
      } catch {
        // A manual refresh reports the error in the UI.
      }
    }, 7000);
    return () => window.clearInterval(id);
  }, [demoMode, options.enabled]);

  const update = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  async function save(next: Options) {
    if (demoMode || saving) return;
    setSaving(true);
    try {
      const result = await api('/bank/linejs/settings', 'PUT', {
        enabled: next.enabled,
        pushLine: next.pushLine,
        bank: next.bank,
        senderMid: next.senderMid.trim(),
        accountId: next.accountId,
      });
      setOptions({ ...EMPTY, ...result.settings });
      notify('บันทึกการตั้งค่า LINEJS แล้ว', 'success');
      await reload();
    } catch (error: any) {
      notify(error.message || 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function changeFlow(nextEnabled: boolean) {
    if (saving || demoMode) return;
    if (nextEnabled && (!options.tokenConfigured || !options.senderMid || !options.accountId)) {
      notify('เชื่อม Worker เลือกบัญชี และระบุ Sender MID ก่อนเปิด Flow', 'warning');
      return;
    }
    if (nextEnabled) {
      const accepted = await askConfirm({
        title: 'เปิดรับแจ้งเตือนธนาคาร?',
        description:
          'MoneyFlow จะใช้เครื่องหมาย +/- ก่อน ถ้ารู้ว่าเงินเข้าจะบันทึกรายรับ หากอ่านยอดรายการ KBank Live ได้แต่แยกประเภทไม่ได้ จะตั้งต้นเป็นรายจ่ายตามกฎที่กำหนด ซึ่งอาจผิดประเภทได้เมื่อธนาคารส่งข้อมูลไม่ครบ แจ้ง LINE OA เมื่อเปิดสวิตช์แจ้งกลับ กรุณาตรวจรายการเป็นระยะ',
        confirmLabel: 'เปิดรับและบันทึกอัตโนมัติ',
        tone: 'normal',
      });
      if (!accepted) return;
    }
    await save({ ...options, enabled: nextEnabled });
  }

  return (
    <section className="panel mf-bank-panel" aria-labelledby="bank-linejs-title">
      <div className="mf-bank-heading">
        <div className="mf-bank-heading-left">
          <span className="mf-bank-app-icon">
            <Landmark size={25} />
          </span>
          <div>
            <div className="mf-bank-tagline">
              <span /> LINEJS · ธนาคาร
            </div>
            <h3 id="bank-linejs-title">รับรายการเงินเข้า–ออกอัตโนมัติ</h3>
            <p>อ่านยอดจากการ์ด Flex และข้อความ KBank Live โดยไม่ต้องกดยืนยัน</p>
          </div>
        </div>
        <span className={'mf-bank-state ' + (options.enabled ? 'is-on' : '')}>
          <span /> {options.enabled ? 'เปิดรับข้อมูล' : 'ปิดรับข้อมูล'}
        </span>
      </div>

      <LineJsLocalAgent
        onConnected={load}
        onCandidate={(mid) => {
          update('senderMid', mid);
          notify('พบ Sender MID กรุณาตรวจสอบว่าเป็นธนาคารจริงแล้วกดบันทึกการตั้งค่า', 'info');
        }}
      />

      <div className="mf-bank-content mf-bank-simple-content">
        <div className="mf-bank-primary">
          <label className="mf-bank-toggle">
            <span className="mf-bank-toggle-copy">
              <strong>เปิดรับแจ้งเตือนและบันทึกเงินอัตโนมัติ</strong>
              <small>ต้องเปิด LINEJS Local Agent บน Mac ด้วย</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="เปิดรับรายการอัตโนมัติ"
              checked={options.enabled}
              disabled={demoMode || saving || !loaded}
              onChange={(e) => void changeFlow(e.target.checked)}
            />
            <span className="mf-bank-switch-track" aria-hidden="true">
              <span />
            </span>
          </label>
          <label className="mf-bank-toggle">
            <span className="mf-bank-toggle-copy">
              <strong>แจ้งกลับ LINE OA เมื่อบันทึกรายการสำเร็จ</strong>
              <small>
                ส่งยอดเงินเข้า/ออกกลับไปที่ LINE OA ที่เชื่อมกับบัญชี MoneyFlow นี้
                ไม่ส่งเมื่ออ่านรายการไม่ได้
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="แจ้งผลการบันทึกกลับ LINE OA"
              checked={options.pushLine}
              disabled={demoMode || saving || !loaded}
              onChange={(e) => update('pushLine', e.target.checked)}
            />
            <span className="mf-bank-switch-track" aria-hidden="true">
              <span />
            </span>
          </label>
          <div className="mf-bank-simple-rules">
            <span>
              <ArrowDownLeft size={16} /> <strong>+ จำนวนเงิน</strong> → เงินเข้า
            </span>
            <span>
              <ArrowUpRight size={16} /> <strong>- จำนวนเงิน</strong> → เงินออก
            </span>
            <small>
              KBank Live: หากอ่านยอดได้แต่ไม่รู้ประเภท → ตั้งต้นเป็นเงินออก • ยอดคงเหลือ รายการไม่มียอด
              และข้อมูลขัดแย้งจะไม่ถูกบันทึก
            </small>
          </div>
          <div className="mf-bank-divider" />
          <div className="mf-bank-fields">
            <label>
              ธนาคาร / แหล่งแจ้งเตือน
              <select
                value={options.bank}
                disabled={demoMode || saving}
                onChange={(e) => update('bank', e.target.value as Options['bank'])}
              >
                {banks.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              บันทึกเข้าบัญชี MoneyFlow
              <select
                value={options.accountId}
                disabled={demoMode || saving}
                onChange={(e) => update('accountId', e.target.value)}
              >
                <option value="">เลือกบัญชี</option>
                {live.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mf-bank-mid-label">
            Sender MID ของแชตธนาคาร
            <input
              value={options.senderMid}
              maxLength={33}
              autoComplete="off"
              spellCheck={false}
              placeholder="u ตามด้วยรหัสผู้ส่ง 32 ตัว"
              disabled={demoMode || saving}
              onChange={(e) => update('senderMid', e.target.value.trim())}
            />
            <small>เลือก MID ที่ระบบพบผ่าน Local Agent หรือระบุรหัสผู้ส่งที่ตรวจสอบแล้ว</small>
          </label>
          <div className="mf-bank-actions">
            <button
              type="button"
              className="button primary"
              disabled={demoMode || saving || loading}
              onClick={() => void save(options)}
            >
              <Check size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
            <button
              type="button"
              className="button outline"
              disabled={demoMode || loading}
              onClick={() => void load()}
            >
              <RefreshCw size={16} /> {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
            </button>
          </div>
        </div>
      </div>

      <div className="mf-bank-events">
        <div className="mf-bank-events-head">
          <div>
            <h4>รายการที่บันทึกจาก LINEJS ล่าสุด</h4>
            <p>แสดงเฉพาะรายการที่บันทึกสำเร็จแล้ว ไม่มีคิวตรวจสอบ</p>
          </div>
          <span>{events.length} รายการ</span>
        </div>
        {!events.length ? (
          <div className="mf-bank-empty">
            <Clock3 size={23} />
            <strong>ยังไม่มีรายการบันทึกจาก LINEJS</strong>
            <p>แสดงเมื่อ LINEJS บันทึกจำนวนเงินได้สำเร็จตามกฎเงินเข้า/เงินออก</p>
          </div>
        ) : (
          <div className="mf-bank-event-list">
            {events.map((item) => (
              <div className="mf-bank-event" key={item.id}>
                <span className="mf-bank-event-icon">
                  {item.kind === 'income' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </span>
                <div className="mf-bank-event-description">
                  <strong>
                    {item.kind === 'income' ? 'เงินเข้าผ่าน ' : 'เงินออกผ่าน '}
                    {item.bank === 'kbank'
                      ? 'KBank Live'
                      : item.bank === 'scb'
                        ? 'SCB Connect'
                        : 'ธนาคาร'}
                  </strong>
                  <small>
                    {new Date(item.created_at).toLocaleString('th-TH')} · บันทึกแล้ว
                    {item.summary.includes('ตั้งต้นเป็นเงินออก') ? ' · ใช้กฎตั้งต้นเป็นเงินออก' : ''}
                  </small>
                </div>
                <span className={'mf-bank-event-amount ' + (item.kind === 'income' ? 'incoming' : '')}>
                  {item.kind === 'income' ? '+' : '-'}
                  {formatMoney(item.amount_satang)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mf-bank-footer">
        <ShieldCheck size={15} /> LINEJS ไม่ใช่บริการธนาคารทางการ
        รายการโอนระหว่างบัญชีตัวเองอาจถูกนับเป็นรายจ่าย กรุณาตรวจยอดเป็นระยะ
      </div>
    </section>
  );
}
