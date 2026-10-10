import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, CheckCircle2, MessageCircle, QrCode, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import './LineAddFriend.css';

type LineAccount = { available: true; basicId: string };
type State =
  | { status: 'loading' }
  | { status: 'available'; basicId: string; url: string }
  | { status: 'unavailable' };

const validBasicId = (value: unknown): value is string =>
  typeof value === 'string' && /^@[a-z0-9._-]{3,40}$/i.test(value);

/**
 * A LINE OA friend link is NOT an account-login QR.
 * It opens the public account profile; users separately link their LINE
 * with their MoneyFlow account after sign-in.
 */
export function buildFriendUrl(basicId: unknown): string | null {
  if (!validBasicId(basicId)) return null;
  return 'https://line.me/R/ti/p/' + encodeURIComponent(basicId);
}

export default function LineAddFriend() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/public/line-oa', {
          signal: controller.signal,
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw Error('LINE OA lookup failed');
        const account = (await response.json()) as Partial<LineAccount>;
        const url = buildFriendUrl(account.basicId);
        if (!url) throw Error('Invalid LINE OA profile');
        if (!controller.signal.aborted)
          setState({ status: 'available', basicId: account.basicId!, url });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  return (
    <section className="mf-join" id="line" aria-labelledby="mf-join-heading">
      <div className="mf-join-backdrop" aria-hidden="true" />
      <div className="mf-join-inner">
        <div className="mf-join-copy">
          <span className="mf-join-kicker">
            <span /> GET STARTED WITH LINE
          </span>
          <h2 id="mf-join-heading">
            เริ่มจากแชต
            <br />
            <em>ที่คุณคุ้นเคย.</em>
          </h2>
          <p>
            เพิ่มเพื่อน MoneyFlow ใน LINE แล้วเปิดแชตเพื่อบันทึกรายจ่ายหรือดูสรุปเงิน
            ทำได้ทั้งสแกนจากจอคอมและกดเพิ่มเพื่อนบนมือถือ
          </p>
          <div className="mf-join-steps">
            <div>
              <span>01</span>
              <p>
                <strong>สแกน QR หรือกดเพิ่มเพื่อน</strong>
                <small>เปิดโปรไฟล์ MoneyFlow ใน LINE ของคุณ</small>
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>กด “เพิ่มเพื่อน” ใน LINE</strong>
                <small>เปิดแชตกับ MoneyFlow ได้ทันที</small>
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>เปิดสมุดเงินผ่าน LINE</strong>
                <small>ผู้ใช้ใหม่สมัครผ่าน LINE ได้เลย ส่วนบัญชีเดิมเชื่อมได้ในเว็บ</small>
              </p>
            </div>
          </div>
          <div className="mf-join-actions">
            {state.status === 'available' ? (
              <a className="mf-join-primary" href={state.url} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={18} /> เพิ่มเพื่อน MoneyFlow <ArrowRight size={17} />
              </a>
            ) : (
              <span className="mf-join-disabled" role="status">
                {state.status === 'loading' ? 'กำลังเชื่อมต่อ LINE...' : 'ยังโหลดลิงก์เพิ่มเพื่อนไม่ได้'}
              </span>
            )}
            <Link to="/login" className="mf-join-secondary">
              ใช้ผ่านเว็บไซต์ <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="mf-join-side">
          <div className="mf-join-qr-card">
            <div className="mf-join-qr-top">
              <span className="mf-join-brand">
                m<span>.</span>
              </span>
              <div>
                <strong>MoneyFlow</strong>
                <small>LINE Official Account</small>
              </div>
              <span className="mf-join-online">
                <i /> OFFICIAL
              </span>
            </div>
            <div className="mf-join-qr-frame" aria-live="polite">
              {state.status === 'available' ? (
                <QRCodeSVG
                  value={state.url}
                  title="สแกน QR เพื่อเพิ่มเพื่อน MoneyFlow LINE Official Account"
                  size={198}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#143F31"
                  marginSize={2}
                />
              ) : state.status === 'loading' ? (
                <div className="mf-join-qr-wait" role="status">
                  <QrCode size={65} strokeWidth={1.3} />
                  <span>กำลังเตรียม QR</span>
                </div>
              ) : (
                <div className="mf-join-qr-wait" role="status">
                  <QrCode size={65} strokeWidth={1.3} />
                  <span>ไม่สามารถแสดง QR ได้ขณะนี้</span>
                </div>
              )}
            </div>
            <strong className="mf-join-qr-title">สแกนเพื่อเพิ่มเพื่อน</strong>
            <p>ใช้กล้องใน LINE สแกนจากจอคอมพิวเตอร์</p>
            {state.status === 'available' && <span className="mf-join-id">{state.basicId}</span>}
            <div className="mf-join-qr-foot">
              <CheckCircle2 size={15} /> เพิ่มเพื่อนกับบัญชีจริงของ MoneyFlow
            </div>
          </div>
          <div className="mf-join-note">
            <ShieldCheck size={18} />
            <span>
              เพิ่มเพื่อนอย่างเดียวยังไม่ได้สร้างบัญชี MoneyFlow — กด “สมุดเงิน” ในแชต LINE
              เพื่อสมัครหรือเข้าสู่ระบบได้เลย หากมีบัญชีเดิมให้เชื่อม LINE จากเว็บไซต์ก่อน
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
