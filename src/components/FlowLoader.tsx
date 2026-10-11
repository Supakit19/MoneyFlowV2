import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import './FlowLoader.css';
import BrandMark from './BrandMark';

type Props = { compact?: boolean; message?: string };

export default function FlowLoader({
  compact = false,
  message = 'กำลังจัดข้อมูลของคุณให้เข้าที่',
}: Props) {
  return (
    <div
      className={'mf-flow-loader' + (compact ? ' is-compact' : '')}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="mf-flow-scene" aria-hidden="true">
        <div className="mf-flow-halo halo-one" />
        <div className="mf-flow-halo halo-two" />
        <div className="mf-flow-orbit orbit-one">
          <span />
        </div>
        <div className="mf-flow-orbit orbit-two">
          <span />
        </div>
        <div className="mf-flow-mascot">
          <BrandMark />
        </div>
        <div className="mf-flow-floating mf-flow-floating-in">
          <ArrowDownLeft size={16} />
          <span>+฿</span>
        </div>
        <div className="mf-flow-floating mf-flow-floating-out">
          <ArrowUpRight size={15} />
          <span>–฿</span>
        </div>
        <div className="mf-flow-floating mf-flow-floating-check">
          <Check size={17} />
        </div>
      </div>
      <div className="mf-flow-description">
        <div className="mf-flow-eyebrow">
          <span className="mf-flow-live" /> MONEYFLOW IS WORKING
        </div>
        <h2>
          กำลังจัดเงินให้เป็นระเบียบ
          <span className="mf-flow-ellipsis" aria-hidden="true">
            ...
          </span>
        </h2>
        <p>{message}</p>
        <div className="mf-flow-trail" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
