import { bankConnectionMessage } from './bankConnectionCopy';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export const friendlyError = (error: any) => {
  const msg = typeof error === 'string' ? error : JSON.stringify(error || '');
  if (/(404|not_found)/i.test(msg) && /models\//i.test(msg))
    return 'โมเดล Gemini ที่ตั้งไว้ไม่รองรับ API นี้ ตรวจค่า GEMINI_MODEL ใน .env';
  if (/(429|resource_exhausted|quota)/i.test(msg))
    return 'Gemini ใช้งานเกินโควตาชั่วคราว กรุณาลองอีกครั้งภายหลัง';
  if (/(403|billing|permission_denied)/i.test(msg))
    return 'ไม่สามารถใช้ Gemini ได้ กรุณาตรวจสิทธิ์และโควตา API Key ใน Google AI Studio';
  const safeMessage = bankConnectionMessage(msg);
  return safeMessage.length > 250
    ? 'การประมวลผลไม่สำเร็จ กรุณาตรวจการตั้งค่าและลองใหม่'
    : safeMessage;
};
export const api = async (path: string, method = 'GET', body?: unknown) => {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new ApiError('ไม่สามารถอ่านคำตอบจากเซิร์ฟเวอร์ได้ กรุณาลองใหม่', response.status);
  }
  if (!response.ok || result?.error)
    throw new ApiError(friendlyError(result?.error || 'เกิดปัญหาในการเชื่อมต่อ'), response.status);
  return result;
};
