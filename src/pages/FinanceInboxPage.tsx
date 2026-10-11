import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  CircleAlert,
  FileImage,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useFinancePage } from '../app/FinanceContext';
import { askConfirm } from '../ConfirmDialog';
import './FinanceInboxPage.css';

type Account = { id: string; name: string };
type Category = { id: string; name: string; kind: string };
type Pending = {
  id: string;
  bank: string;
  kind: 'income' | 'expense' | null;
  amountSatang: number | null;
  summary: string;
  reason: string | null;
  accountId: string | null;
  createdAt: string;
};
type Pair = {
  outId: string;
  inId: string;
  amountSatang: number;
  sourceName: string;
  destinationName: string;
};
type Suggestion = {
  kind: 'income' | 'expense';
  amountSatang: number;
  merchant: string;
  category: string;
  confidence: number;
};
type Receipt = {
  reviewId: string;
  suggestion: Suggestion;
  possibleDuplicates: Array<{ id: string; merchant: string; accountName: string; kind: string }>;
};
const amount = (value: number) =>
  '฿' +
  (value / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const satang = (value: string) =>
  /^\d{1,8}(?:\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.trim()) * 100) : NaN;
const date = (v: string) =>
  new Date(v).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });

export default function FinanceInboxPage() {
  const { demoMode, notify, reload } = useFinancePage();
  const [inbox, setInbox] = useState<{ review: Pending[]; transfers: Pair[] }>({
    review: [],
    transfers: [],
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bank, setBank] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { kind: string; amount: string }>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptKind, setReceiptKind] = useState<'income' | 'expense'>('expense');
  const [receiptMerchant, setReceiptMerchant] = useState('');
  const [receiptAccount, setReceiptAccount] = useState('');
  const [receiptCategory, setReceiptCategory] = useState('');
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'bank' | 'receipt'>('bank');

  const load = async () => {
    if (demoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [items, money, bankState] = await Promise.all([
        api('/finance/inbox'),
        api('/data'),
        api('/bank/linejs/settings'),
      ]);
      setInbox({ review: items.review || [], transfers: items.transfers || [] });
      setAccounts(money.accounts || []);
      setCategories(money.categories || []);
      setBank(bankState.settings || null);
      setDrafts((current) => {
        const drafts = { ...current };
        for (const x of items.review || [])
          if (!drafts[x.id])
            drafts[x.id] = {
              kind: x.kind || 'expense',
              amount: x.amountSatang ? String(x.amountSatang / 100) : '',
            };
        return drafts;
      });
    } catch (e: any) {
      setError(e.message || 'โหลดรายการไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [demoMode]);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      notify(success);
      await Promise.all([load(), reload()]);
    } catch (e: any) {
      setError(e.message || 'ทำรายการไม่สำเร็จ');
      notify(e.message || 'ทำรายการไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };
  async function imageToBase64(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2_100_000)
      throw Error('รองรับรูป JPG, PNG, WEBP ขนาดไม่เกิน 2MB');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(Error('อ่านรูปไม่สำเร็จ'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return base64;
  }
  async function preview(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    setReceipt(null);
    try {
      const base64 = await imageToBase64(file);
      const result = (await api('/finance/receipts/preview', 'POST', {
        base64,
        mime: file.type,
      })) as Receipt;
      setReceipt(result);
      setTab('receipt');
      setReceiptAmount(String(result.suggestion.amountSatang / 100));
      setReceiptKind(result.suggestion.kind);
      setReceiptMerchant(result.suggestion.merchant);
      setReceiptAccount(accounts[0]?.id || '');
      setReceiptCategory(
        categories.find(
          (c) => c.kind === result.suggestion.kind && c.name === result.suggestion.category,
        )?.id ||
          categories.find((c) => c.kind === result.suggestion.kind)?.id ||
          '',
      );
      setDuplicateConfirmed(false);
    } catch (e: any) {
      setError(e.message || 'อ่านสลิปไม่สำเร็จ');
    } finally {
      setPhotoBusy(false);
    }
  }
  const isEmpty = !inbox.review.length && !inbox.transfers.length;
  return (
    <div className="mf-inbox">
      <div className="mf-inbox-heading">
        <div>
          <div className="mf-inbox-eyebrow">
            <ShieldCheck size={15} /> ตรวจสอบก่อนบันทึก
          </div>
          <h1>
            ศูนย์ตรวจสอบเงิน<span>.</span>
          </h1>
          <p>เช็กยอดที่อ่านไม่ชัด จับคู่เงินโอนระหว่างบัญชี และอ่านใบเสร็จ โดยคุณเป็นคนยืนยัน</p>
        </div>
        <button
          className="button outline"
          type="button"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          <RefreshCw size={17} /> โหลดข้อมูลใหม่
        </button>
      </div>
      <div className="mf-inbox-counts">
        <div>
          <span>ต้องตรวจสอบ</span>
          <strong>{inbox.review.length}</strong>
          <small>รายการจากธนาคาร</small>
        </div>
        <div>
          <span>อาจเป็นการโอนของตัวเอง</span>
          <strong>{inbox.transfers.length}</strong>
          <small>รอให้คุณจับคู่</small>
        </div>
        <div>
          <span>เชื่อมธนาคาร</span>
          <strong>{bank?.enabled ? 'เปิดอยู่' : 'ยังไม่เปิด'}</strong>
          <small>
            {bank?.lastEventAt ? 'แจ้งเตือนล่าสุด ' + date(bank.lastEventAt) : 'ยังไม่มีแจ้งเตือนล่าสุด'}
          </small>
        </div>
      </div>
      <div className="mf-inbox-toolbar" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bank'} onClick={() => setTab('bank')}>
          <Landmark size={17} /> ตรวจสอบธนาคาร
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'receipt'}
          onClick={() => setTab('receipt')}
        >
          <FileImage size={17} /> อ่านสลิปและใบเสร็จ
        </button>
        <Link to="/linejs">
          <Wallet size={16} /> ตั้งค่าธนาคาร <ArrowRight size={14} />
        </Link>
      </div>
      {error && (
        <div role="alert" className="mf-inbox-error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      {tab === 'bank' && (
        <section className="mf-inbox-stack">
          {loading ? (
            <p className="mf-inbox-empty">กำลังโหลดรายการ...</p>
          ) : isEmpty ? (
            <div className="mf-inbox-empty">
              <Check size={29} />
              <h3>เรียบร้อยแล้ว ไม่มีรายการที่ต้องตรวจสอบ</h3>
              <p>
                ถ้ามีแจ้งเตือนที่อ่านไม่ชัด หรือพบยอดเข้า–ออกที่อาจเป็นการโอนระหว่างบัญชี
                รายการจะปรากฏที่นี่
              </p>
            </div>
          ) : null}
          {inbox.review.map((item) => {
            const draft = drafts[item.id] || {
              kind: item.kind || 'expense',
              amount: item.amountSatang ? String(item.amountSatang / 100) : '',
            };
            const mapped = accounts.find((a) => a.id === item.accountId);
            return (
              <article key={item.id} className="mf-inbox-card">
                <div className="mf-inbox-card-head">
                  <span className="mf-inbox-dot" />
                  <strong>{item.bank}</strong>
                  <time>{date(item.createdAt)}</time>
                </div>
                <h3>ตรวจยอดจากธนาคาร</h3>
                <p>{item.reason || 'มีรายการใหม่ กรุณาตรวจยอดในแอปธนาคารก่อนยืนยัน'}</p>
                <p className="mf-inbox-summary">{item.summary}</p>
                <div className="mf-inbox-inputs">
                  <label>
                    ทิศทาง
                    <select
                      value={draft.kind}
                      onChange={(e) =>
                        setDrafts((v) => ({ ...v, [item.id]: { ...draft, kind: e.target.value } }))
                      }
                    >
                      <option value="expense">เงินออก</option>
                      <option value="income">เงินเข้า</option>
                    </select>
                  </label>
                  <label>
                    จำนวนเงิน (บาท)
                    <input
                      inputMode="decimal"
                      value={draft.amount}
                      placeholder="0.00"
                      onChange={(e) =>
                        setDrafts((v) => ({ ...v, [item.id]: { ...draft, amount: e.target.value } }))
                      }
                    />
                  </label>
                  <label>
                    เข้าบัญชี
                    <input value={mapped?.name || 'ยังไม่เลือกบัญชีในศูนย์เชื่อมธนาคาร'} disabled />
                  </label>
                </div>
                <div className="mf-inbox-card-actions">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !mapped ||
                      !Number.isSafeInteger(satang(draft.amount)) ||
                      satang(draft.amount) <= 0
                    }
                    onClick={() =>
                      void run(
                        () =>
                          api('/finance/inbox/' + item.id + '/confirm', 'POST', {
                            kind: draft.kind,
                            amountSatang: satang(draft.amount),
                            accountId: item.accountId,
                          }),
                        'บันทึกรายการที่ตรวจสอบแล้ว',
                      )
                    }
                  >
                    <Check size={16} /> ยืนยันยอด
                  </button>
                  <button
                    type="button"
                    className="mf-inbox-skip"
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        if (
                          await askConfirm({
                            title: 'ไม่บันทึกรายการนี้?',
                            description:
                              'ข้อมูลแจ้งเตือนจะถูกทำเครื่องหมายว่าไม่บันทึก โดยไม่กระทบยอดเงินอื่น',
                            confirmLabel: 'ไม่บันทึก',
                          })
                        )
                          await run(
                            () => api('/finance/inbox/' + item.id + '/reject', 'POST', {}),
                            'ไม่บันทึกรายการนี้แล้ว',
                          );
                      })()
                    }
                  >
                    <Trash2 size={16} /> ไม่บันทึก
                  </button>
                </div>
              </article>
            );
          })}
          {inbox.transfers.map((pair) => (
            <article key={pair.outId + '-' + pair.inId} className="mf-inbox-card mf-inbox-transfer">
              <div className="mf-inbox-card-head">
                <ArrowLeftRight size={18} />
                <strong>อาจเป็นการโอนระหว่างบัญชี</strong>
              </div>
              <h3>{amount(pair.amountSatang)}</h3>
              <p>
                {pair.sourceName} → {pair.destinationName}
              </p>
              <p>สองฝั่งแจ้งยอดเท่ากันใกล้เคียงกัน ระบบไม่ตัดสินแทนคุณ กรุณาตรวจรายการจริงก่อนจับคู่</p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    if (
                      await askConfirm({
                        title: 'ยืนยันว่าโอนเงินระหว่างบัญชีตัวเอง?',
                        description:
                          'จะรวมเงินออกและเงินเข้าเป็นรายการโอนหนึ่งรายการ โดยไม่ถือเป็นรายรับหรือรายจ่าย',
                        confirmLabel: 'จับคู่เงินโอน',
                      })
                    )
                      await run(
                        () =>
                          api('/finance/transfers/confirm', 'POST', {
                            outId: pair.outId,
                            inId: pair.inId,
                          }),
                        'จับคู่เงินโอนสำเร็จ',
                      );
                  })()
                }
              >
                <ArrowLeftRight size={16} /> จับคู่เป็นเงินโอน
              </button>
            </article>
          ))}
        </section>
      )}
      {tab === 'receipt' && (
        <section className="mf-inbox-stack">
          <div className="mf-inbox-upload">
            <UploadCloud size={30} />
            <h3>อัปโหลดสลิปหรือใบเสร็จ</h3>
            <p>
              เมื่อคุณเลือกรูป ระบบจะส่งไปยัง Gemini เพื่อช่วยอ่านยอดและเสนอหมวดหมู่
              โดยยังไม่บันทึกจนกว่าคุณยืนยัน และไม่เก็บไฟล์ภาพบน MoneyFlow
            </p>
            <label className="mf-inbox-upload-button">
              {photoBusy ? 'กำลังอ่านรูป...' : 'เลือกรูป JPG / PNG / WEBP'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={photoBusy || demoMode}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  void preview(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          {receipt && (
            <article className="mf-inbox-card">
              <div className="mf-inbox-card-head">
                <Sparkles size={18} />
                <strong>ตรวจสอบข้อมูลที่อ่านได้</strong>
              </div>
              <p>กรุณาตรวจยอด ร้านค้า และหมวดหมู่กับรูปจริงก่อนบันทึก</p>
              <div className="mf-inbox-inputs">
                <label>
                  ประเภท
                  <select
                    value={receiptKind}
                    onChange={(e) => {
                      const kind = e.target.value as 'income' | 'expense';
                      setReceiptKind(kind);
                      setReceiptCategory(categories.find((c) => c.kind === kind)?.id || '');
                    }}
                  >
                    <option value="expense">รายจ่าย</option>
                    <option value="income">รายรับ</option>
                  </select>
                </label>
                <label>
                  จำนวนเงิน
                  <input
                    inputMode="decimal"
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value)}
                  />
                </label>
                <label>
                  ร้านค้า / รายการ
                  <input
                    value={receiptMerchant}
                    maxLength={120}
                    onChange={(e) => setReceiptMerchant(e.target.value)}
                  />
                </label>
                <label>
                  บัญชี
                  <select value={receiptAccount} onChange={(e) => setReceiptAccount(e.target.value)}>
                    <option value="">เลือกบัญชี</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  หมวดหมู่
                  <select value={receiptCategory} onChange={(e) => setReceiptCategory(e.target.value)}>
                    <option value="">เลือกหมวด</option>
                    {categories
                      .filter((c) => c.kind === receiptKind)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {receipt.possibleDuplicates.length > 0 && (
                <div className="mf-inbox-duplicate">
                  <CircleAlert size={18} />
                  <div>
                    <strong>พบรายการยอดเท่ากันใน 2 วันที่ผ่านมา</strong>
                    <p>อาจเคยบันทึกผ่านธนาคารหรือด้วยตัวเองแล้ว กรุณาตรวจสอบก่อนบันทึกซ้ำ</p>
                    <label>
                      <input
                        type="checkbox"
                        checked={duplicateConfirmed}
                        onChange={(e) => setDuplicateConfirmed(e.target.checked)}
                      />{' '}
                      ฉันตรวจแล้วว่าเป็นคนละรายการ
                    </label>
                  </div>
                </div>
              )}
              <button
                type="button"
                disabled={
                  busy ||
                  !receiptAccount ||
                  !receiptCategory ||
                  !receiptMerchant.trim() ||
                  !Number.isSafeInteger(satang(receiptAmount)) ||
                  satang(receiptAmount) <= 0 ||
                  (receipt.possibleDuplicates.length > 0 && !duplicateConfirmed)
                }
                onClick={() =>
                  void run(async () => {
                    await api('/finance/receipts/confirm', 'POST', {
                      reviewId: receipt.reviewId,
                      kind: receiptKind,
                      amountSatang: satang(receiptAmount),
                      accountId: receiptAccount,
                      categoryId: receiptCategory,
                      merchant: receiptMerchant.trim(),
                      acknowledgeDuplicates: duplicateConfirmed,
                    });
                    setReceipt(null);
                  }, 'บันทึกรายการจากรูปเรียบร้อยแล้ว')
                }
              >
                <Check size={17} /> ยืนยันและบันทึก
              </button>
            </article>
          )}
        </section>
      )}
    </div>
  );
}
