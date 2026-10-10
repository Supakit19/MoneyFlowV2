import { describe, expect, test } from 'bun:test';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import LandingPage, { CompanyPage } from '../src/pages/MoneyFlowSite';
import FlowLoader from '../src/components/FlowLoader';

describe('Public MoneyFlow website before login', () => {
  test('landing has actual accessible product content, not a login redirect or an image-only mockup', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(html).toContain('เงินทุกบาท');
    expect(html).toContain('เรื่องเงินไม่ต้องยาก');
    expect(html).toContain('เริ่มง่าย');
    expect(html).toContain('คำถาม');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/company"');
    expect(html).toContain('https://liff.line.me/2011955989-OUGIQOBk');
    expect(html).toContain('ตัวอย่าง');
    expect(html).not.toContain('<img');
  });
  test('about-company is a public MoneyFlow mission page with a clear login path', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CompanyPage />
      </MemoryRouter>,
    );
    expect(html).toContain('เราเชื่อว่าเรื่องเงิน');
    expect(html).toContain('ทำให้ง่าย');
    expect(html).toContain('ให้คุณเลือก');
    expect(html).toContain('href="/login"');
  });
  test('loader gives an accessible live status with motion-free text fallback', () => {
    const html = renderToStaticMarkup(<FlowLoader message="กำลังจัดข้อมูลของคุณ" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('กำลังจัดข้อมูลของคุณ');
    expect(html).toContain('mf-flow-wallet-graph');
  });
});
