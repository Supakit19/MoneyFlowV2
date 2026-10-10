import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import AuthPortal from '../AuthPortal';
import BrandMark from '../components/BrandMark';
type Props = {
  onAuthenticated: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onPreview: () => void;
  error: string;
};
export default function LoginPage({ onAuthenticated, onError, onPreview, error }: Props) {
  const mark = <BrandMark />;
  return (
    <div className="auth-background">
      <div className="auth-shell">
        <Link to="/" className="auth-back-home">
          <ArrowLeft size={15} /> รู้จัก MoneyFlow ก่อนเริ่มใช้งาน
        </Link>
        <div className="brand large">
          {mark}
          <span>
            moneyflow<span className="brand-period">.</span>
          </span>
        </div>
        <div className="auth-heading">
          <span className="eyebrow">YOUR MONEY, IN FLOW</span>
          <h1>เงินของคุณ จัดการได้ง่ายขึ้น</h1>
          <p>
            สร้างบัญชีฟรีด้วยอีเมลหรือ Google แล้วเชื่อม LINE เพิ่มภายหลังก็ได้
            ทุกช่องทางที่เชื่อมจะกลับมาที่ข้อมูลบัญชีเดียวกัน
          </p>
        </div>
        <AuthPortal onAuthenticated={onAuthenticated} onError={onError} />
        {error && (
          <p className="error auth-error-visible" role="alert">
            {error}
          </p>
        )}
        <div className="auth-separator">
          <span>หรือ</span>
        </div>
        <button className="button outline wide" onClick={onPreview}>
          ทดลองดู Dashboard <ArrowUpRight size={17} />
        </button>
        <div className="auth-bottom">
          <ShieldCheck size={16} /> ข้อมูลส่วนตัวของสมาชิกแต่ละคนถูกแยกกันอย่างปลอดภัย
        </div>
      </div>
      <div className="auth-visual">
        <div className="floating-chip">
          <span className="pulse" /> YOU'RE IN CONTROL
        </div>
        <div className="auth-visual-inner">
          <div className="visual-badge">
            <Sparkles size={20} /> FINANCE MADE SIMPLE
          </div>
          <h2>
            Make your money
            <br />
            <em>make sense.</em>
          </h2>
          <p>
            Every little expense. Every big plan.
            <br />
            All beautifully in sync.
          </p>
          <div className="visual-graph">
            <svg viewBox="0 0 490 220" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#d9ef90" stopOpacity=".5" />
                  <stop offset="1" stopColor="#d9ef90" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 170 C60 200 85 95 135 125 S220 150 260 87 S350 130 385 49 S445 55 490 12 L490 220 L0 220Z"
                fill="url(#heroFill)"
              />
              <path
                d="M0 170 C60 200 85 95 135 125 S220 150 260 87 S350 130 385 49 S445 55 490 12"
                fill="none"
                stroke="#daed97"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="visual-footer">
            <div>
              <b>฿ 0.00</b>
              <small>YOUR TOTAL BALANCE</small>
            </div>
            <span className="growth">
              <TrendingUp size={15} /> START FRESH
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
