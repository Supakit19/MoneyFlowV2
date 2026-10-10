import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Fingerprint,
  Layers3,
  MessageCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import LineAddFriend from '../components/LineAddFriend';
import './MoneyFlowSite.css';

const pocketUrl = 'https://liff.line.me/2011955989-OUGIQOBk';

function SiteLogo({ light = false }: { light?: boolean }) {
  return (
    <Link className={'mf-site-logo' + (light ? ' light' : '')} to="/" aria-label="MoneyFlow กลับหน้าแรก">
      <span className="mf-site-logo-icon">
        m<span>.</span>
      </span>
      <span>
        moneyflow<span className="mf-site-logo-period">.</span>
      </span>
    </Link>
  );
}
function SiteHeader({ company = false }: { company?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="mf-site-header">
      <nav className="mf-site-nav" aria-label="เมนูหลัก">
        <SiteLogo />
        <button
          type="button"
          className="mf-site-menu-toggle"
          aria-expanded={open}
          aria-label="เปิดเมนู"
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className={'mf-site-nav-links' + (open ? ' is-open' : '')}>
          <a onClick={() => setOpen(false)} href="/#features">
            ฟีเจอร์
          </a>
          <a onClick={() => setOpen(false)} href="/#line">
            เพิ่มเพื่อน LINE
          </a>
          <Link onClick={() => setOpen(false)} to="/company" aria-current={company ? 'page' : undefined}>
            เกี่ยวกับเรา
          </Link>
          <a onClick={() => setOpen(false)} href="/#faq">
            คำถามที่พบบ่อย
          </a>
          <Link className="mf-site-nav-login" onClick={() => setOpen(false)} to="/login">
            เข้าสู่ระบบ <ArrowUpRight size={15} />
          </Link>
        </div>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mf-site-footer">
      <div className="mf-site-footer-inner">
        <div>
          <SiteLogo light />
          <p>เรื่องเงินที่เข้าใจง่ายขึ้น ในแบบของคุณ</p>
        </div>
        <div className="mf-site-footer-links">
          <a href="/#features">ฟีเจอร์</a>
          <a href="/#line">เพิ่มเพื่อน LINE</a>
          <Link to="/company">เกี่ยวกับเรา</Link>
          <Link to="/login">เข้าสู่ระบบ</Link>
        </div>
      </div>
      <div className="mf-site-footer-bottom">
        <span>© {new Date().getFullYear()} MoneyFlow. Your money, in flow.</span>
        <span>จัดการเงินอย่างเข้าใจ ไม่ต้องเก่งตัวเลข</span>
      </div>
    </footer>
  );
}

function HeroPreview() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const isWeek = period === 'week';
  return (
    <div className="mf-site-hero-preview" aria-label="ตัวอย่างหน้าภาพรวมการเงินของ MoneyFlow">
      <div className="mf-site-preview-orbit orbit-a" />
      <div className="mf-site-preview-orbit orbit-b" />
      <div className="mf-site-preview-float mf-site-preview-float-up">
        <span>
          <ArrowDownLeft size={15} />
        </span>
        <div>
          <small>เงินเข้าบันทึกแล้ว</small>
          <b>+฿2,500</b>
        </div>
        <CheckCircle2 size={16} />
      </div>
      <div className="mf-site-preview-panel">
        <div className="mf-site-preview-top">
          <div className="mf-site-preview-user">
            <span>m.</span>
            <div>
              <b>ภาพรวมเงินของคุณ</b>
              <small>ภาพจำลองเพื่อแสดงรูปแบบการใช้งาน</small>
            </div>
          </div>
          <div className="mf-site-preview-online">
            <i /> พร้อมใช้งาน
          </div>
        </div>
        <div className="mf-site-preview-balance">
          <span>ยอดเงินในบัญชีทั้งหมด</span>
          <strong>
            ฿28,460<span>.50</span>
          </strong>
          <div className="mf-site-preview-quick">
            <span>
              <ArrowDownLeft size={13} /> เงินเข้า +฿8,250
            </span>
            <span>
              <ArrowUpRight size={13} /> เงินออก ฿3,140
            </span>
          </div>
        </div>
        <div className="mf-site-preview-chart-head">
          <div>
            <small>ภาพรวมการเคลื่อนไหว</small>
            <b>{isWeek ? 'สัปดาห์นี้' : 'เดือนนี้'}</b>
          </div>
          <div className="mf-site-preview-toggle" role="group" aria-label="ช่วงเวลาตัวอย่าง">
            <button className={isWeek ? 'active' : ''} onClick={() => setPeriod('week')}>
              7 วัน
            </button>
            <button className={!isWeek ? 'active' : ''} onClick={() => setPeriod('month')}>
              เดือน
            </button>
          </div>
        </div>
        <div className="mf-site-preview-bars" aria-label="กราฟตัวอย่าง">
          {(isWeek ? [42, 56, 38, 75, 51, 91, 68] : [45, 77, 62, 50, 88, 71, 95]).map((height, i) => (
            <div className="mf-site-preview-bar-col" key={i}>
              <div className="mf-site-preview-bar-bg">
                <i style={{ height: height + '%', animationDelay: i * 0.08 + 's' }} />
              </div>
              <span>
                {
                  (isWeek
                    ? ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
                    : ['1', '5', '10', '15', '20', '25', '30'])[i]
                }
              </span>
            </div>
          ))}
        </div>
        <div className="mf-site-preview-transactions">
          <div>
            <span className="mf-site-preview-tx-icon">
              <ArrowUpRight size={17} />
            </span>
            <div>
              <b>กาแฟตอนเช้า</b>
              <small>อาหารและเครื่องดื่ม • วันนี้</small>
            </div>
            <strong>− ฿65</strong>
          </div>
          <div>
            <span className="mf-site-preview-tx-icon green">
              <ArrowDownLeft size={17} />
            </span>
            <div>
              <b>รายได้เสริม</b>
              <small>รายรับ • วันนี้</small>
            </div>
            <strong className="green">+ ฿1,200</strong>
          </div>
        </div>
      </div>
      <div className="mf-site-preview-float mf-site-preview-float-budget">
        <span>
          <Check size={16} />
        </span>
        <div>
          <small>งบสัปดาห์นี้</small>
          <b>ยังอยู่ในแผน</b>
        </div>
      </div>
    </div>
  );
}

const features = [
  {
    icon: MessageCircle,
    number: '01',
    title: 'พิมพ์เหมือนคุยกับเพื่อน',
    copy: '“กาแฟ 65” ก็เริ่มจดได้เลย ไม่ต้องเปิดตารางให้วุ่นวาย',
    type: 'chat',
  },
  {
    icon: ScanLine,
    number: '02',
    title: 'ส่งรูปให้ช่วยอ่าน',
    copy: 'ส่งรูปสลิปหรือใบเสร็จ ให้ระบบช่วยแยกรายการ แล้วตรวจสอบก่อนบันทึก',
    type: 'scan',
  },
  {
    icon: Wallet,
    number: '03',
    title: 'เงินหลายบัญชี อยู่ที่เดียว',
    copy: 'แยกกระเป๋าเงินและบัญชีต่าง ๆ เพื่อดูภาพรวมได้ชัดขึ้น',
    type: 'wallet',
  },
  {
    icon: BarChart3,
    number: '04',
    title: 'รู้ทันงบที่ตั้งไว้',
    copy: 'เห็นว่าใช้ไปเท่าไหร่ และยังเหลืองบอีกเท่าไหร่ในสัปดาห์นี้',
    type: 'budget',
  },
  {
    icon: Zap,
    number: '05',
    title: 'เชื่อมแจ้งเตือนธนาคาร',
    copy: 'เลือกแชตธนาคารที่รองรับแล้วให้ช่วยบันทึกรายการอัตโนมัติ พร้อมตรวจสอบยอดได้',
    type: 'bank',
  },
  {
    icon: Layers3,
    number: '06',
    title: 'ดูทุกอย่างผ่าน LINE',
    copy: 'เปิดสมุดเงินบนมือถือจาก LINE ได้ทันที ไม่ต้องสลับหลายหน้าจอ',
    type: 'mini',
  },
] as const;

export default function LandingPage() {
  useEffect(() => {
    document.title = 'MoneyFlow — เงินทุกบาท ชัดขึ้นในทุกวัน';
    if (location.hash)
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }, []);
  return (
    <div className="mf-site">
      <SiteHeader />
      <main>
        <section className="mf-site-hero">
          <div className="mf-site-hero-glow first" />
          <div className="mf-site-hero-glow second" />
          <div className="mf-site-hero-inner">
            <div className="mf-site-hero-copy">
              <div className="mf-site-kicker">
                <span /> YOUR MONEY, IN FLOW <span className="mf-site-kicker-line" />
              </div>
              <h1>
                เงินทุกบาท
                <br />
                <span>ชัดขึ้น</span>ในทุกวัน<span className="mf-site-period">.</span>
              </h1>
              <p>
                จากเรื่องเงินที่ต้องคอยจำ ให้กลายเป็นเรื่องง่าย ๆ ที่จัดการได้ใน LINE และบนเว็บ
                บันทึกรายรับรายจ่าย ดูงบและเข้าใจเงินของตัวเองได้ในที่เดียว
              </p>
              <div className="mf-site-hero-actions">
                <Link className="mf-site-primary-button" to="/login">
                  เริ่มจัดการเงินของฉัน <ArrowUpRight size={19} />
                </Link>
                <a
                  className="mf-site-ghost-button"
                  href="#line"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={18} /> เพิ่มเพื่อน LINE
                </a>
              </div>
              <div className="mf-site-hero-note">
                <span>
                  <Check size={14} /> ใช้กับบัญชี LINE ที่คุณมี
                </span>
                <span>
                  <Check size={14} /> เลือกบันทึกเองหรือให้ช่วยอัตโนมัติ
                </span>
              </div>
            </div>
            <HeroPreview />
          </div>
          <div className="mf-site-hero-bottom">
            <div>
              <span>01 / 03</span>
              <i />
              <b>LESS TRACKING. MORE LIVING.</b>
            </div>
            <p>
              เลื่อนลงเพื่อรู้จัก MoneyFlow <ArrowRight size={15} />
            </p>
          </div>
        </section>

        <section className="mf-site-belief" aria-label="จุดเด่น MoneyFlow">
          <div>
            <Zap size={21} />
            <span>พิมพ์แล้วจด</span>
          </div>
          <div>
            <ShieldCheck size={21} />
            <span>ตรวจสอบรายการได้</span>
          </div>
          <div>
            <BarChart3 size={21} />
            <span>งบและกราฟเข้าใจง่าย</span>
          </div>
          <div>
            <Wallet size={21} />
            <span>หลายบัญชีในที่เดียว</span>
          </div>
        </section>

        <LineAddFriend />

        <section className="mf-site-section mf-site-features" id="features">
          <div className="mf-site-section-top">
            <span className="mf-site-section-overline">
              <i /> EVERYTHING YOU NEED
            </span>
            <div className="mf-site-section-heading">
              <h2>
                เรื่องเงินไม่ต้องยาก
                <br />
                <em>เราทำให้ง่ายขึ้น</em>
              </h2>
              <p>จด ดู วางแผน และกลับมาคุมเงินของตัวเองได้ทุกวัน จากหน้าจอที่คุณคุ้นเคย</p>
            </div>
          </div>
          <div className="mf-site-feature-grid">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <article className={'mf-site-feature-card feature-' + f.type} key={f.number}>
                  <div className="mf-site-feature-head">
                    <span className="mf-site-feature-symbol">
                      <Icon size={25} strokeWidth={1.8} />
                    </span>
                    <span className="mf-site-feature-number">{f.number} / 06</span>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.copy}</p>
                  {f.type === 'chat' ? (
                    <div className="mf-site-feature-illustration chat">
                      <span>กาแฟ 65 บาท</span>
                      <span>
                        <Check size={12} /> บันทึกรายจ่าย ฿65
                      </span>
                    </div>
                  ) : null}
                  {f.type === 'budget' ? (
                    <div className="mf-site-feature-illustration meter">
                      <div>
                        <span>สัปดาห์นี้</span>
                        <b>64%</b>
                      </div>
                      <i>
                        <b />
                      </i>
                      <small>ยังอยู่ในแผนของคุณ</small>
                    </div>
                  ) : null}
                  {f.type === 'mini' ? (
                    <div className="mf-site-feature-illustration mini">
                      <span>m.</span>
                      <div>
                        <i />
                        <i />
                        <i />
                      </div>
                      <ArrowUpRight size={20} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mf-site-conversation">
          <div className="mf-site-conversation-content">
            <span className="mf-site-section-overline">
              <i /> BUILT FOR EVERYDAY LIFE
            </span>
            <h2>
              ชีวิตเดินเร็ว
              <br />
              เรื่องเงินก็ต้อง<span>ทัน</span>
            </h2>
            <p>
              ไม่ต้องรอให้ถึงสิ้นเดือนถึงจะรู้ว่าเงินไปไหน ทุกครั้งที่บันทึก
              คุณจะเห็นภาพรวมที่ชัดขึ้นอีกนิด
            </p>
            <ul>
              <li>
                <CheckCircle2 size={19} /> จดรายการสั้น ๆ ได้จาก LINE
              </li>
              <li>
                <CheckCircle2 size={19} /> เห็นยอดงบที่เหลือก่อนตัดสินใจใช้
              </li>
              <li>
                <CheckCircle2 size={19} /> เปิดดูย้อนหลังเมื่อไรก็ได้
              </li>
            </ul>
            <a href={pocketUrl} target="_blank" rel="noopener noreferrer" className="mf-site-link">
              ลองเปิด MoneyFlow Pocket <ArrowUpRight size={18} />
            </a>
          </div>
          <div
            className="mf-site-conversation-preview"
            aria-label="ตัวอย่างบทสนทนาและข้อความยืนยันรายการ"
          >
            <div className="mf-site-chat-head">
              <span>m.</span>
              <div>
                <b>MoneyFlow</b>
                <small>
                  <span /> พร้อมช่วยบันทึก
                </small>
              </div>
              <MessageCircle size={19} />
            </div>
            <div className="mf-site-chat-user">ข้าวเที่ยง 85 บาท</div>
            <div className="mf-site-chat-response">
              <div className="mf-site-chat-label">
                <CheckCircle2 size={15} /> บันทึกเรียบร้อย
              </div>
              <strong>− ฿85.00</strong>
              <div className="mf-site-chat-row">
                <span>หมวดหมู่</span>
                <b>อาหาร</b>
              </div>
              <div className="mf-site-chat-row">
                <span>งบสัปดาห์นี้</span>
                <b>ยังใช้ได้อีก ฿1,240</b>
              </div>
              <div className="mf-site-chat-progress">
                <i />
              </div>
              <small>ดูสรุปเต็มได้ในสมุดเงิน</small>
            </div>
            <div className="mf-site-chat-user second">สรุปสัปดาห์</div>
            <div className="mf-site-conversation-sparkle">✳</div>
          </div>
        </section>

        <section className="mf-site-section mf-site-how" id="how">
          <div className="mf-site-section-top">
            <span className="mf-site-section-overline">
              <i /> GET STARTED
            </span>
            <div className="mf-site-section-heading">
              <h2>
                เริ่มง่าย
                <br />
                <em>แค่สามขั้นตอน</em>
              </h2>
              <p>ไม่ต้องตั้งค่าระบบซับซ้อนก่อนเริ่มบันทึกเงินรายการแรก</p>
            </div>
          </div>
          <div className="mf-site-steps">
            <div className="mf-site-step">
              <span>01</span>
              <div className="mf-site-step-icon">
                <Fingerprint size={29} />
              </div>
              <h3>เลือกวิธีเริ่มใช้งาน</h3>
              <p>สมัครผ่าน LINE, Google หรืออีเมลได้ตามสะดวก ไม่จำเป็นต้องสมัครอีเมลก่อน</p>
            </div>
            <div className="mf-site-step">
              <span>02</span>
              <div className="mf-site-step-icon">
                <MessageCircle size={29} />
              </div>
              <h3>เพิ่มเพื่อน MoneyFlow ใน LINE</h3>
              <p>สแกน QR หรือกดเพิ่มเพื่อน จากนั้นเปิดสมุดเงินเพื่อสมัครหรือเข้าใช้ผ่าน LINE ได้เลย</p>
            </div>
            <div className="mf-site-step">
              <span>03</span>
              <div className="mf-site-step-icon">
                <BarChart3 size={29} />
              </div>
              <h3>จด แล้วเข้าใจเงินมากขึ้น</h3>
              <p>กลับมาดูรายรับรายจ่าย หมวดหมู่ และงบที่คุณกำหนดได้ทุกวัน</p>
            </div>
          </div>
          <div className="mf-site-how-cta">
            <span>พร้อมเริ่มแล้วใช่ไหม?</span>
            <Link to="/login">
              เริ่มใช้งาน MoneyFlow <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        <section className="mf-site-trust">
          <div className="mf-site-trust-inner">
            <div className="mf-site-trust-icon">
              <ShieldCheck size={31} />
            </div>
            <div>
              <span className="mf-site-section-overline">YOUR DATA. YOUR CONTROL.</span>
              <h2>
                เงินของคุณ
                <br />
                <em>คุณเป็นคนควบคุม</em>
              </h2>
              <p>
                MoneyFlow แยกข้อมูลตามบัญชีผู้ใช้ และให้คุณตรวจหรือแก้รายการที่บันทึกได้
                การเชื่อมข้อความธนาคารเป็นทางเลือกและไม่ใช่บริการจากธนาคารโดยตรง
                ควรเทียบยอดกับแอปธนาคารเสมอ
              </p>
            </div>
            <div className="mf-site-trust-list">
              <span>
                <Check size={17} /> เชื่อม LINE กับบัญชีของคุณเอง
              </span>
              <span>
                <Check size={17} /> ตรวจทานก่อนบันทึกได้
              </span>
              <span>
                <Check size={17} /> ใช้บัญชีเดิมบนเว็บและมือถือ
              </span>
            </div>
          </div>
        </section>

        <section className="mf-site-section mf-site-faq" id="faq">
          <div>
            <span className="mf-site-section-overline">
              <i /> FAQs
            </span>
            <h2>
              ข้อสงสัย
              <br />
              <em>ที่พบบ่อย</em>
            </h2>
            <p>ตอบคำถามที่ควรรู้ก่อนเริ่มใช้ MoneyFlow</p>
          </div>
          <div className="mf-site-faq-list">
            {[
              [
                'จำเป็นต้องใช้ LINE ไหม?',
                'ไม่จำเป็นครับ คุณบันทึกรายรับรายจ่ายผ่านเว็บไซต์ได้ก่อน แล้วค่อยเชื่อม LINE เมื่อสะดวก',
              ],
              [
                'ต้องให้รหัสผ่านแอปธนาคารไหม?',
                'ไม่ต้องกรอกรหัสผ่านธนาคาร MoneyFlow ใช้ข้อมูลจากรายการที่คุณบันทึกหรือข้อความแจ้งเตือนที่คุณเลือกเชื่อมเท่านั้น',
              ],
              [
                'ถ้าระบบอ่านรายการผิด แก้ไขได้ไหม?',
                'ตรวจรายการกับธนาคารและจัดการข้อมูลของคุณได้จากหน้าเว็บ MoneyFlow คุณสามารถเลือกรูปแบบการยืนยันก่อนบันทึกได้',
              ],
              [
                'เปิดจากมือถือได้เลยหรือไม่?',
                'ได้ครับ เปิด MoneyFlow Pocket จากเมนู LINE เพื่อสมัครบัญชีใหม่หรือเข้าสู่สมุดเงินเดิมได้เลย',
              ],
            ].map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>
                  {q}
                  <ChevronDown size={20} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mf-site-end-cta">
          <span>YOUR NEXT CHAPTER STARTS HERE</span>
          <h2>
            เริ่มเข้าใจเงินตัวเอง
            <br />
            <em>ตั้งแต่วันนี้.</em>
          </h2>
          <p>เงินไม่จำเป็นต้องเป็นเรื่องที่คอยกังวลอยู่ทุกวัน</p>
          <Link to="/login">
            เริ่มใช้งานเลย <ArrowUpRight size={19} />
          </Link>
          <div className="mf-site-end-shape" aria-hidden="true" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export function CompanyPage() {
  useEffect(() => {
    document.title = 'เรื่องราวของ MoneyFlow — About Us';
  }, []);
  return (
    <div className="mf-site mf-site-company">
      <SiteHeader company />
      <main>
        <section className="mf-site-company-hero">
          <span className="mf-site-section-overline">
            <i /> ABOUT MONEYFLOW
          </span>
          <h1>
            เราเชื่อว่าเรื่องเงิน
            <br />
            ควร<span>เข้าใจง่ายกว่านี้.</span>
          </h1>
          <p>
            MoneyFlow เป็นผลิตภัณฑ์ที่ออกแบบมาเพื่อช่วยให้คนทั่วไปเห็นภาพเงินของตัวเองชัดขึ้น
            โดยลดขั้นตอนการจดบันทึก และเชื่อมประสบการณ์บนเว็บเข้ากับ LINE ที่ใช้ทุกวัน
          </p>
          <div className="mf-site-company-hero-art">
            <div>
              m<span>.</span>
            </div>
            <div>
              TRACK
              <br />
              UNDERSTAND
              <br />
              GROW.
            </div>
            <div className="mf-site-company-hero-orbit" />
          </div>
        </section>
        <section className="mf-site-company-values">
          <div>
            <span>01 / PURPOSE</span>
            <h2>ทำให้ง่าย</h2>
            <p>ภาษาต้องเข้าใจได้ในครั้งแรก ไม่ต้องรู้ศัพท์การเงินหรือเทคนิค</p>
          </div>
          <div>
            <span>02 / CLARITY</span>
            <h2>ทำให้เห็น</h2>
            <p>ยอดเงิน งบ และพฤติกรรมการใช้จ่ายที่สะท้อนจากข้อมูลของคุณจริง</p>
          </div>
          <div>
            <span>03 / CONTROL</span>
            <h2>ให้คุณเลือก</h2>
            <p>บันทึกเองหรือเลือกให้ระบบช่วย พร้อมตรวจสอบได้ก่อนเชื่อข้อมูล</p>
          </div>
        </section>
        <section className="mf-site-company-closing">
          <Sparkles size={35} />
          <h2>
            การเงินที่ดี เริ่มต้นจาก
            <br />
            <em>การเข้าใจตัวเอง</em>
          </h2>
          <p>เราจะพัฒนา MoneyFlow ให้เป็นพื้นที่จัดการเงินที่ใช้ง่ายและเป็นของคุณจริง ๆ</p>
          <Link to="/login">
            เริ่มต้นกับ MoneyFlow <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
