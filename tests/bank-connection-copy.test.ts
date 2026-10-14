import { describe, expect, test } from 'bun:test';
import { BANK_CONNECTION_BUSY, bankConnectionAtCapacity, bankConnectionMessage } from '../src/lib/bankConnectionCopy';

describe('Public bank connection messages', () => {
  test('maps legacy technical worker capacity errors to user copy', () => {
    expect(bankConnectionMessage('Hosted LINEJS ใช้งานครบจำนวนผู้ใช้พร้อมกัน กรุณาลองใหม่ภายหลัง')).toBe(BANK_CONNECTION_BUSY);
    expect(BANK_CONNECTION_BUSY).not.toMatch(/LINEJS|Worker|Hosted/);
  });
  test('hides internal names for unknown technical errors', () => {
    expect(bankConnectionMessage('LINEJS session internal error')).not.toMatch(/LINEJS|Hosted|Worker/);
    expect(bankConnectionMessage(new Error('เซิร์ฟเวอร์ยังขาด Node.js / LINEJS หรือกุญแจเข้ารหัส'))).not.toMatch(/LINEJS|Node.js/);
  });
  test('avoids falsely blocking an already running connection', () => {
    expect(bankConnectionAtCapacity({ available: true, running: false, runningWorkers: 4, maxWorkers: 4 })).toBe(true);
    expect(bankConnectionAtCapacity({ available: true, running: true, runningWorkers: 4, maxWorkers: 4 })).toBe(false);
    expect(bankConnectionAtCapacity({ available: true, running: false, runningWorkers: 2, maxWorkers: 4 })).toBe(false);
  });
});
