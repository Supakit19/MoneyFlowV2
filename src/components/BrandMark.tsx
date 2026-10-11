import React from 'react';
import './BrandMark.css';

/**
 * The uploaded MoneyFlow wallet mascot is the single logo source for the site.
 * Gentle CSS motion preserves image quality and can be switched off by the
 * user's reduced-motion preference.
 */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={['brand-mark', 'mf-animated-brand-mark', 'has-art', className]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label="โลโก้ MoneyFlow รูปกระเป๋าเงิน"
    >
      <img
        className="mf-animated-brand-image"
        src="/brand/moneyflow-mascot.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
