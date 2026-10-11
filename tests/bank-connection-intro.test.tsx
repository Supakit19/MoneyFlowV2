import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import BankConnectionIntroDialog from '../src/components/BankConnectionIntroDialog';
import BrandMark from '../src/components/BrandMark';

describe('MoneyFlow optional bank connection education', () => {
  test('offers an explicit optional path without pretending to authorize LINE access', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BankConnectionIntroDialog />
      </MemoryRouter>,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('ไม่จำเป็นเลยครับ');
    expect(markup).toContain('ไม่ใช้ตอนนี้ กลับหน้าหลัก');
    expect(markup).toContain('ไม่เชื่อม ก็ใช้งานได้ครบ');
    expect(markup).toContain('ไม่เชื่อมต่อระบบธนาคารโดยตรง');
    expect(markup).toContain('ไม่ขอรหัสผ่านธนาคาร');
    expect(markup).toContain('ไม่สามารถสั่งโอน ถอน หรือหักเงิน');
    expect(markup).toContain('ไม่ใช่การยินยอม');
  });
  test('copy accurately explains LINE-specific risks and notifications', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <BankConnectionIntroDialog />
      </MemoryRouter>,
    );
    expect(markup).toContain('การเชื่อมใช้บัญชี LINE ส่วนตัว');
    expect(markup).toContain('กว้างกว่าแชตธนาคาร');
    expect(markup).toContain('ต้องเปิดรับแจ้งเตือนจากธนาคารใน LINE');
    expect(markup).toContain('รายการที่อ่านไม่ชัดต้องตรวจสอบ');
    expect(markup).toContain('การกด “เข้าใจแล้ว”');
    expect(markup).toContain('ไม่ใช่การยินยอม');
  });
  test('shared brand mark carries animated identity and accessible description', () => {
    const markup = renderToStaticMarkup(<BrandMark />);
    expect(markup).toContain('mf-animated-brand-mark');
    expect(markup).toContain('โลโก้ MoneyFlow');
  });
});
