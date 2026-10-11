import React from 'react';
import './BrandMark.css';

/**
 * Shared animated logo. Source artwork can be added as three PNG/WebP
 * frames when available as actual files. Until then the familiar MoneyFlow
 * glyph stays in place and animates, never leaving broken-image icons.
 */
const logoFrames: readonly string[] = [];

export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={[
        'brand-mark',
        'mf-animated-brand-mark',
        logoFrames.length > 0 ? 'has-art' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label="โลโก้ MoneyFlow"
    >
      {logoFrames.length > 0 ? (
        logoFrames.map((source, index) => (
          <img
            key={source}
            src={source}
            alt=""
            aria-hidden="true"
            className={'mf-animated-brand-frame frame-' + index}
            draggable={false}
          />
        ))
      ) : (
        <>
          <span className="mf-animated-brand-letter">m</span>
          <i />
        </>
      )}
    </span>
  );
}
