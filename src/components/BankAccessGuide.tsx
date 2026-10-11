import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Landmark,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import './BankAccessGuide.css';
import './BankAccessGuide.css';

export const BANK_CONSENT_VERSION = 'bank-line-access-2026-10-11';
export type BankAccessState = { loaded: boolean; granted: boolean; version: string };

export function BankAccessGuide({
  onPermissionChange,
  compact = false,
}: {
  onPermissionChange?: (granted: boolean) => void;
  compact?: boolean;
}) {
  const [state, setState] = useState<BankAccessState>({
    loaded: false,
    granted: false,
    version: BANK_CONSENT_VERSION,
  });
  const [checks, setChecks] = useState({ line: false, bank: false, risks: false });
  const [ready, setReady] = useState({ message: false, enabled: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    try {
      const r = await api('/bank/consent');
      setState({
        loaded: true,
        granted: r.granted === true,
        version: r.version || BANK_CONSENT_VERSION,
      });
      onPermissionChange?.(r.granted === true);
    } catch (e: unknown) {
      setState((x) => ({ ...x, loaded: true }));
      setError(e instanceof Error ? e.message : 'ตรวจสิทธิ์การเชื่อม LINE ไม่สำเร็จ');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function accept() {
    if (busy || !checks.line || !checks.bank || !checks.risks) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/bank/consent', 'POST', {
        version: state.version,
        lineAccountAccess: true,
        bankMessageProcessing: true,
        understandsRisks: true,
      });
      if (result.granted !== true) throw Error('ไม่สามารถบันทึกการยินยอมได้');
      setState((x) => ({ ...x, granted: true }));
      onPermissionChange?.(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'บันทึกสิทธิ์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (busy) return;
    if (
      !window.confirm(
        'ยกเลิกการอนุญาตและหยุดเชื่อม LINE ส่วนตัวหรือไม่? รายการเงินที่บันทึกไว้จะยังอยู่',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api('/bank/consent/withdraw', 'POST', {});
      setState((x) => ({ ...x, granted: false }));
      setChecks({ line: false, bank: false, risks: false });
      onPermissionChange?.(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ยกเลิกการอนุญาตไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={'mf-bank-guide ' + (compact ? 'is-compact' : '')}>
      <div className="mf-bank-guide-title">
        <Landmark size={20} />
        <div>
          <h3>ก่อนเชื่อมธนาคาร ต้องเตรียมอะไรบ้าง?</h3>
          <p>ใช้เวลาประมาณ 3–5 นาที ทำตามขั้นตอนนี้ได้เลย แม้ไม่เคยตั้งค่ามาก่อน</p>
        </div>
      </div>
      <div className="mf-bank-guide-steps">
        <div className="mf-bank-guide-step">
          <span className="mf-bank-step-number">1</span>
          <div>
            <strong>เปิดรับแจ้งเตือนธนาคารใน LINE ก่อน</strong>
            <p>
              เปิดแอป LINE แล้วตรวจว่ามีแชต <b>KBank Live</b> หรือ <b>Krungthai Connext</b> อยู่จริง
              และเคยได้รับข้อความเงินเข้าหรือเงินออกอย่างน้อย 1 รายการ
              (ข้อความเก่าที่แสดงอยู่ก็ช่วยตรวจสอบได้)
            </p>
            <label>
              <input
                type="checkbox"
                checked={ready.message}
                onChange={(e) => setReady((v) => ({ ...v, message: e.target.checked }))}
              />{' '}
              ฉันตรวจแล้วว่าได้รับแจ้งเตือนใน LINE
            </label>
            {!ready.message && (
              <small>
                ยังไม่มีแชต? ต้องสมัครหรือเปิดบริการแจ้งเตือนผ่านช่องทางของธนาคารก่อน MoneyFlow
                ไม่สามารถสร้างแชตธนาคารแทนได้
              </small>
            )}
          </div>
        </div>
        <div className="mf-bank-guide-step">
          <span className="mf-bank-step-number">2</span>
          <div>
            <strong>เตรียมบัญชีปลายทางใน MoneyFlow</strong>
            <p>
              สร้างบัญชีสำหรับแต่ละธนาคารไว้ก่อน เช่น “กสิกรของฉัน” และ “กรุงไทยของฉัน”
              เพื่อป้องกันยอดเงินเข้าผิดบัญชี
            </p>
            <label>
              <input
                type="checkbox"
                checked={ready.enabled}
                onChange={(e) => setReady((v) => ({ ...v, enabled: e.target.checked }))}
              />{' '}
              ฉันมีบัญชี MoneyFlow สำหรับธนาคารที่จะเชื่อมแล้ว
            </label>
            <Link to="/accounts">
              เปิดหน้าบัญชีและกระเป๋า <ExternalLink size={13} />
            </Link>
          </div>
        </div>
        <div className="mf-bank-guide-step">
          <span className="mf-bank-step-number">3</span>
          <div>
            <strong>อนุญาตการเชื่อม LINE ส่วนตัว แล้วสแกน QR</strong>
            <p>
              สแกน QR ด้วย LINE ของคุณจากมือถือ ระบบจึงจะตรวจหาแชตได้{' '}
              <b>LINE Login หรือการเพิ่มเพื่อน MoneyFlow OA ไม่ได้ให้สิทธิ์อ่านแชตส่วนตัว</b>{' '}
              ทั้งสองอย่างเป็นคนละการอนุญาต
            </p>
          </div>
        </div>
        <div className="mf-bank-guide-step">
          <span className="mf-bank-step-number">4</span>
          <div>
            <strong>ตรวจชื่อแชต → เลือก → ลองรับแจ้งเตือน</strong>
            <p>
              เมื่อปรากฏแชตที่พบ ให้เทียบชื่อและเครื่องหมายรับรองใน LINE ก่อนกด “ใช้แชตนี้”
              เลือกธนาคารและบัญชีให้ตรงกัน แล้วจึงเปิดรับรายการ ตรวจยอดทดสอบกับแอปธนาคารก่อนใช้งานจริง
            </p>
            <small>
              รหัสแชตเป็นเพียงรหัสผู้ส่ง ระบบยังระบุชื่อธนาคารจากรหัสนั้นโดยอัตโนมัติไม่ได้
              และไม่จำเป็นต้องมีรายการโอนใหม่ทันทีสำหรับการค้นหาแชต
              แต่รายการใหม่หลังเปิดระบบจึงจะนำไปบันทึกตามเงื่อนไข
            </small>
          </div>
        </div>
      </div>
      <div className="mf-bank-guide-warning">
        <CircleAlert size={18} />
        <p>
          <strong>ข้อควรรู้:</strong> วิธีเชื่อมนี้ไม่ใช่ API ทางการของธนาคารหรือ LINE
          มีความเสี่ยงด้านการเข้าถึงบัญชี LINE ส่วนตัว อาจเชื่อมหลุด อ่านยอดไม่ครบ หรือทำให้บัญชี LINE
          ถูกจำกัดได้ MoneyFlow ไม่ใช่หลักฐานยอดเงินจริง
        </p>
      </div>
      <div className="mf-bank-consent">
        <div className="mf-bank-consent-title">
          <LockKeyhole size={17} />
          <strong>การอนุญาตให้เข้าถึง LINE ส่วนตัว (เลือกใช้)</strong>
        </div>
        <p>
          เพื่อความโปร่งใส โปรดอ่าน{' '}
          <Link to="/privacy" target="_blank">
            นโยบายความเป็นส่วนตัว
          </Link>{' '}
          และ{' '}
          <Link to="/terms" target="_blank">
            ข้อกำหนดการใช้บริการ
          </Link>{' '}
          ก่อนตัดสินใจ หากไม่ยอมรับ คุณยังบันทึกรายรับรายจ่ายด้วยตัวเองได้ตามปกติ
        </p>
        {state.granted ? (
          <div className="mf-bank-granted">
            <span>
              <CheckCircle2 size={17} /> อนุญาตการเชื่อมแล้ว
            </span>
            <button type="button" disabled={busy} onClick={() => void withdraw()}>
              ถอนการอนุญาตและหยุดเชื่อม
            </button>
          </div>
        ) : (
          <div className="mf-bank-consent-checks">
            <label>
              <input
                type="checkbox"
                checked={checks.line}
                onChange={(e) => setChecks((v) => ({ ...v, line: e.target.checked }))}
              />
              ฉันอนุญาตให้ MoneyFlow เชื่อมบัญชี LINE ส่วนตัวที่ฉันเป็นเจ้าของ
              โดยรับทราบว่าตัวเชื่อมอาจเข้าถึงข้อมูล LINE ที่กว้างกว่าข้อความธนาคาร
            </label>
            <label>
              <input
                type="checkbox"
                checked={checks.bank}
                onChange={(e) => setChecks((v) => ({ ...v, bank: e.target.checked }))}
              />
              ฉันอนุญาตให้ใช้ข้อความแจ้งเตือนของแชตธนาคารที่เลือก
              เพื่อประมวลผลยอดเงินเข้า–ออกและสร้างรายการในบัญชี MoneyFlow
            </label>
            <label>
              <input
                type="checkbox"
                checked={checks.risks}
                onChange={(e) => setChecks((v) => ({ ...v, risks: e.target.checked }))}
              />
              ฉันเข้าใจว่าไม่ใช่บริการทางการ ยอดอาจไม่ถูกต้อง และสามารถหยุดเชื่อมหรือถอนการอนุญาตได้
            </label>
            <button
              type="button"
              className="mf-bank-consent-submit"
              disabled={busy || !state.loaded || !checks.line || !checks.bank || !checks.risks}
              onClick={() => void accept()}
            >
              {busy ? 'กำลังบันทึก...' : 'ยอมรับและเปิดขั้นตอนเชื่อม LINE'}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mf-bank-consent-error">
            {error}
          </p>
        )}
        {!state.granted && (
          <small>
            ยังไม่อนุญาต = ยังไม่เริ่มเชื่อม LINE ส่วนตัว การกดยินยอมไม่ได้เปิดบันทึกรายการอัตโนมัติทันที
          </small>
        )}
      </div>
    </section>
  );
}
