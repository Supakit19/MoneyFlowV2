import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Plus,
  Trash2,
} from 'lucide-react';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';
import LineJsConnectorAgent from './LineJsConnectorAgent';
import './LineJsBankAutomation.css';

type ExtraBankSource = {
  bank: 'kbank' | 'ktb' | 'scb' | 'other';
  senderMid: string;
  accountId: string;
  enabled: boolean;
};
type Options = {
  extraSources: ExtraBankSource[];
  enabled: boolean;
  pushLine: boolean;
  bank: ExtraBankSource['bank'];
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
  extraSources: [],
  senderMid: '',
  accountId: '',
  tokenConfigured: false,
  lastEventAt: null,
};
const banks: { value: Options['bank']; label: string }[] = [
  { value: 'kbank', label: 'KBank Live · กสิกรไทย' },
  { value: 'ktb', label: 'Krungthai Connext · กรุงไทย' },
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
  const [newBank, setNewBank] = useState<ExtraBankSource['bank']>('ktb');
  const [newSenderMid, setNewSenderMid] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [verifiedExtraMid, setVerifiedExtraMid] = useState(false);

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
      notify(error.message || 'ไม่สามารถตรวจสอบการเชื่อมต่อ LINE', 'error');
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
        extraSources: next.extraSources,
        senderMid: next.senderMid.trim(),
        accountId: next.accountId,
      });
      setOptions({ ...EMPTY, ...result.settings });
      notify('บันทึกการเชื่อมต่อธนาคารแล้ว', 'success');
      await reload();
    } catch (error: any) {
      notify(error.message || 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
      await load();
    } finally {
      setSaving(false);
    }
  }
  async function addExtra() {
    if (saving || demoMode) return;
    if (!/^u[0-9a-f]{32}$/i.test(newSenderMid) || !newAccountId || !verifiedExtraMid) {
      notify('กรุณาเลือกแชตของธนาคาร เลือกบัญชีที่จะบันทึก และยืนยันว่าเป็นแชตจริง', 'warning');
      return;
    }
    if (newBank === options.bank && options.senderMid) {
      notify('ธนาคารนี้เป็นแหล่งหลักอยู่แล้ว กรุณาเลือกธนาคารอื่น', 'warning');
      return;
    }
    if (
      options.extraSources.some(
        (source) => source.bank === newBank || source.senderMid === newSenderMid.toLowerCase(),
      )
    ) {
      notify('แชตธนาคารนี้ถูกเพิ่มไว้แล้ว', 'warning');
      return;
    }
    await save({
      ...options,
      extraSources: [
        ...options.extraSources,
        { bank: newBank, senderMid: newSenderMid.toLowerCase(), accountId: newAccountId, enabled: true },
      ],
    });
    setNewSenderMid('');
    setVerifiedExtraMid(false);
  }
  async function changeFlow(nextEnabled: boolean) {
    if (saving || demoMode) return;
    if (
      nextEnabled &&
      (!options.tokenConfigured ||
        ((!options.senderMid || !options.accountId) && !options.extraSources.some((x) => x.enabled)))
    ) {
      notify('กรุณาเชื่อม LINE เลือกแชตธนาคาร และเลือกบัญชีที่จะบันทึกก่อน', 'warning');
      return;
    }
    if (nextEnabled) {
      const accepted = await askConfirm({
        title: 'เปิดรับแจ้งเตือนธนาคาร?',
        description:
          'MoneyFlow จะอ่านแจ้งเตือนจากแชตธนาคารที่คุณเลือกเท่านั้น ถ้าเป็นเงินเข้าจะบันทึกเป็นรายรับ ถ้าเป็นเงินออกจะบันทึกเป็นรายจ่าย แต่บางแจ้งเตือนของกสิกรที่มีแค่ยอดเงินอาจถูกนับเป็นรายจ่ายก่อน จึงควรตรวจสอบรายการกับแอปธนาคารเป็นระยะ',
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
              <span /> จัดการธนาคารผ่าน LINE
            </div>
            <h3 id="bank-linejs-title">รับรายการเงินเข้า–ออกอัตโนมัติ</h3>
            <p>เชื่อม KBank Live และ Krungthai Connext ผ่าน LINE เดียว เลือกบัญชีที่บันทึกแยกกันได้</p>
          </div>
        </div>
        <span className={'mf-bank-state ' + (options.enabled ? 'is-on' : '')}>
          <span /> {options.enabled ? 'เปิดรับข้อมูล' : 'ปิดรับข้อมูล'}
        </span>
      </div>

      <LineJsConnectorAgent
        onConnected={load}
        onCandidate={(mid) => {
          if (options.senderMid) {
            setNewSenderMid(mid);
            setVerifiedExtraMid(false);
            notify('พบแชตแจ้งเตือนอีกแห่งแล้ว กรุณาตรวจสอบธนาคารและเลือกบัญชีที่จะบันทึก', 'info');
          } else {
            update('senderMid', mid);
            notify('พบแชตแจ้งเตือนแล้ว กรุณาตรวจสอบว่าเป็นธนาคารจริง แล้วกดบันทึก', 'info');
          }
        }}
      />

      <div className="mf-bank-content mf-bank-simple-content">
        <div className="mf-bank-primary">
          <label className="mf-bank-toggle">
            <span className="mf-bank-toggle-copy">
              <strong>เปิดรับแจ้งเตือนและบันทึกเงินอัตโนมัติ</strong>
              <small>รับข้อความได้ต่อเนื่อง แม้คุณปิดคอมพิวเตอร์</small>
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
              <strong>ส่งข้อความกลับในแชต MoneyFlow เมื่อบันทึกสำเร็จ</strong>
              <small>
                เมื่อบันทึกยอดสำเร็จ จะส่งผลกลับไปที่แชต MoneyFlow ที่คุณเชื่อมไว้
                รายการที่อ่านไม่ชัดจะไม่นำไปบันทึก
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="แจ้งผลการบันทึกในแชต MoneyFlow"
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
          <div className="mf-bank-extras">
            <strong>แชตธนาคารเพิ่มเติม · LINE เดียวกัน</strong>
            <p>
              กสิกรและกรุงไทยใช้ LINE เดียวกันได้ แต่บันทึกแยกบัญชีเงินกัน
              เพิ่มบัญชีกรุงไทยในหน้า “บัญชีและกระเป๋า” ก่อน หากยังไม่มี
            </p>
            {options.extraSources.map((source) => (
              <div className="mf-bank-extra-item" key={source.bank}>
                <div>
                  <b>{banks.find((bank) => bank.value === source.bank)?.label || source.bank}</b>
                  <small>
                    {live.accounts.find((account) => account.id === source.accountId)?.name ||
                      'บัญชีเดิมถูกลบ'}
                    {' · '}ตรวจสอบแชตแล้ว
                  </small>
                </div>
                <label className="mf-bank-extra-toggle">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    disabled={saving || demoMode}
                    aria-label={'เปิดรับแจ้งเตือน ' + source.bank}
                    onChange={(event) =>
                      void save({
                        ...options,
                        extraSources: options.extraSources.map((x) =>
                          x.bank === source.bank ? { ...x, enabled: event.target.checked } : x,
                        ),
                      })
                    }
                  />
                  เปิดใช้
                </label>
                <button
                  type="button"
                  className="mf-bank-extra-delete"
                  disabled={saving || demoMode}
                  aria-label={'ลบแชต ' + source.bank}
                  onClick={() =>
                    void (async () => {
                      const yes = await askConfirm({
                        title: 'หยุดเชื่อมธนาคารนี้?',
                        description: 'หยุดรับรายการใหม่จากแชตนี้ รายการการเงินเดิมจะไม่ถูกลบ',
                        confirmLabel: 'นำออก',
                        tone: 'danger',
                      });
                      if (yes)
                        await save({
                          ...options,
                          extraSources: options.extraSources.filter((x) => x.bank !== source.bank),
                        });
                    })()
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {options.extraSources.length < 3 && (
              <div className="mf-bank-extra-form">
                <div className="mf-bank-fields">
                  <label>
                    เพิ่มธนาคาร
                    <select
                      value={newBank}
                      disabled={saving || demoMode}
                      onChange={(e) => setNewBank(e.target.value as ExtraBankSource['bank'])}
                    >
                      {banks.map((bank) => (
                        <option value={bank.value} key={bank.value}>
                          {bank.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    บันทึกเข้าบัญชี
                    <select
                      value={newAccountId}
                      disabled={saving || demoMode}
                      onChange={(e) => setNewAccountId(e.target.value)}
                    >
                      <option value="">เลือกบัญชี</option>
                      {live.accounts.map((account) => (
                        <option value={account.id} key={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mf-bank-mid-label">
                  รหัสแชตแจ้งเตือนของธนาคารที่เพิ่ม
                  <input
                    value={newSenderMid}
                    placeholder="กดเลือกแชตที่พบด้านบน"
                    maxLength={33}
                    disabled={saving || demoMode}
                    autoComplete="off"
                    onChange={(e) => {
                      setNewSenderMid(e.target.value.trim());
                      setVerifiedExtraMid(false);
                    }}
                  />
                  <small>
                    เมื่อระบบพบแชตแจ้งเตือนใหม่ ให้กด “เลือกแชตนี้” ด้านบน ระบบจะกรอกรหัสให้
                  </small>
                </label>
                <label className="mf-bank-extra-verify">
                  <input
                    type="checkbox"
                    checked={verifiedExtraMid}
                    disabled={saving || demoMode}
                    onChange={(e) => setVerifiedExtraMid(e.target.checked)}
                  />
                  ฉันตรวจสอบแล้วว่าแชตนี้เป็นของธนาคารที่เลือก
                </label>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving || demoMode}
                  onClick={() => void addExtra()}
                >
                  <Plus size={16} /> เพิ่มธนาคารนี้
                </button>
                <small>
                  สำหรับ Krungthai Connext จะอ่านเฉพาะข้อความที่ระบุ “เงินเข้า” หรือ “เงินออก”
                  พร้อมยอดชัดเจน
                </small>
              </div>
            )}
          </div>
          <label className="mf-bank-mid-label">
            รหัสแชตแจ้งเตือนของธนาคารหลัก
            <input
              value={options.senderMid}
              maxLength={33}
              autoComplete="off"
              spellCheck={false}
              placeholder="กดเลือกแชตที่พบด้านบน"
              disabled={demoMode || saving}
              onChange={(e) => update('senderMid', e.target.value.trim())}
            />
            <small>เมื่อมีแจ้งเตือนใหม่ ระบบจะช่วยค้นหาแชตที่อาจเป็นของธนาคารให้เลือก</small>
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
            <h4>เงินเข้า–ออกที่บันทึกจากธนาคาร</h4>
            <p>แสดงเฉพาะรายการที่บันทึกสำเร็จแล้ว ไม่มีคิวตรวจสอบ</p>
          </div>
          <span>{events.length} รายการ</span>
        </div>
        {!events.length ? (
          <div className="mf-bank-empty">
            <Clock3 size={23} />
            <strong>ยังไม่มีรายการจากแจ้งเตือนธนาคาร</strong>
            <p>เมื่อมีการบันทึกรายการจากธนาคารสำเร็จ จะแสดงที่นี่</p>
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
                    {item.bank === 'kbank' || item.bank === 'KBank Live'
                      ? 'KBank Live'
                      : item.bank === 'ktb' || item.bank === 'Krungthai Connext'
                        ? 'Krungthai Connext'
                        : item.bank === 'scb' || item.bank === 'SCB Connect'
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
        <ShieldCheck size={15} /> การเชื่อมต่อแจ้งเตือนนี้ไม่ได้ให้บริการโดยธนาคารโดยตรง •
        รายการโอนระหว่างบัญชีตัวเองอาจถูกนับเป็นรายจ่าย กรุณาตรวจยอดเป็นระยะ
      </div>
    </section>
  );
}
