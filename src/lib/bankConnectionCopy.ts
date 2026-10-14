/**
 * User-facing copy for the optional bank-alert integration.
 * Internal library/worker names must never appear in customer error messages.
 */
export const BANK_CONNECTION_BUSY =
  'ขณะนี้ระบบรับแจ้งเตือนธนาคารมีผู้ใช้งานเต็มชั่วคราว กรุณาลองเชื่อมต่ออีกครั้งภายหลัง คุณยังสามารถใช้งาน MoneyFlow ได้ตามปกติ';

export function bankConnectionAtCapacity(
  agent: { available?: boolean; running?: boolean; runningWorkers?: number; maxWorkers?: number } | null | undefined,
): boolean {
  return Boolean(
    agent?.available &&
      !agent.running &&
      Number.isFinite(agent.runningWorkers) &&
      Number.isFinite(agent.maxWorkers) &&
      (agent.maxWorkers ?? 0) > 0 &&
      (agent.runningWorkers ?? 0) >= (agent.maxWorkers ?? 0),
  );
}

export function bankConnectionMessage(input: unknown): string {
  const message =
    typeof input === 'string'
      ? input.trim()
      : input instanceof Error
        ? input.message.trim()
        : '';

  if (!message) return 'ไม่สามารถเชื่อมต่อ LINE ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง';
  if (/ใช้งานครบ|ผู้ใช้พร้อมกัน|workers? (?:full|limit)|worker.*ครบ|capacity/i.test(message))
    return BANK_CONNECTION_BUSY;
  if (/หยุด Local LINEJS|LINEJS เปิดค้าง|Local LINEJS ผูก/i.test(message))
    return 'มีการเชื่อม LINE บนอุปกรณ์อื่นอยู่ กรุณาหยุดการเชื่อมต่อเดิมก่อนลองอีกครั้ง';
  if (/หยุด Hosted LINEJS|Hosted LINEJS อยู่|บัญชีนี้ไม่ได้ใช้ Hosted LINEJS/i.test(message))
    return 'กรุณาหยุดการรับแจ้งเตือน LINE เดิมก่อนเปลี่ยนการเชื่อมต่อ';
  if (/ยังไม่เปิด Hosted LINEJS|ยังขาด Node\.js|LINEJS cannot|LINEJS bridge token|กุญแจเข้ารหัส/i.test(message))
    return 'ระบบรับแจ้งเตือนธนาคารยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล MoneyFlow';
  if (/เริ่ม Hosted|เริ่ม LINEJS|Hosted Worker/i.test(message))
    return 'ไม่สามารถเริ่มรับแจ้งเตือนธนาคารได้ กรุณาลองใหม่ภายหลัง';
  if (/LINEJS อ่านเครื่องหมาย/i.test(message))
    return 'ระบบบันทึกรายการตามประเภทเงินเข้าและเงินออกที่อ่านได้จากแจ้งเตือนธนาคาร';
  if (/เชื่อม LINEJS ระบุ Sender MID/i.test(message))
    return 'กรุณาเชื่อม LINE เลือกแชตธนาคาร และเลือกบัญชีสำหรับบันทึกรายการ';
  if (/บัญชี Hosted LINEJS ต้องจัดการโทเค็น/i.test(message))
    return 'กรุณาจัดการการเชื่อม LINE ผ่านหน้าตั้งค่าเท่านั้น';
  if (/ข้อมูลข้อความจาก LINEJS ไม่ถูกต้อง/i.test(message))
    return 'รูปแบบแจ้งเตือนธนาคารไม่ถูกต้อง';
  // Future server versions may still use internal terminology. Do not leak it.
  if (/LINEJS|Hosted Worker|LINEJS_WORKER|connector_token_encrypted/i.test(message))
    return 'การเชื่อมต่อเพื่อรับแจ้งเตือนธนาคารมีปัญหา กรุณาลองอีกครั้งภายหลัง';
  return message;
}
