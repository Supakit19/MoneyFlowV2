import { createHash, randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { provisionFinanceWorkspace } from './google-auth.ts';

export const tokenHash = (raw: string) => createHash('sha256').update(raw).digest('hex');
export const normalizeEmail = (raw: any) =>
  String(raw || '')
    .trim()
    .toLowerCase();
export const validEmail = (mail: string) =>
  mail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
export const validPassword = (pass: any) =>
  typeof pass === 'string' && pass.length >= 10 && pass.length <= 128;
export const validName = (name: any) =>
  typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100;
export const isDuplicate = (e: any) => e?.code === '23505';

export async function registerEmailAccount(
  db: Sql,
  input: { email: string; name: string; password: string },
) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw Error('กรุณาใส่อีเมลที่ถูกต้อง');
  if (!validPassword(input.password)) throw Error('รหัสผ่านต้องมีอย่างน้อย 10 และไม่เกิน 128 ตัวอักษร');
  if (!validName(input.name)) throw Error('กรุณาระบุชื่อแสดงผล (ไม่เกิน 100 ตัวอักษร)');
  // Existing Google-owned email must be connected from that signed-in account.
  const googleOwners = await db`SELECT user_id FROM google_links WHERE lower(email)=${email} LIMIT 1`;
  if (googleOwners.length)
    throw Error('อีเมลนี้มีบัญชี Google อยู่แล้ว กรุณาเข้าด้วย Google และเชื่อมอีเมลจากหน้าโปรไฟล์');
  const hash = await Bun.password.hash(input.password, { algorithm: 'argon2id' });
  try {
    return await db.begin(async (tx) => {
      const id = 'email:' + randomBytes(16).toString('hex');
      const saved = await tx`
        INSERT INTO users(username,email,password_hash,display_name,onboarding_state)
        VALUES(${id},${email},${hash},${input.name.trim()},'pending') RETURNING id
      `;
      await provisionFinanceWorkspace(tx as unknown as Sql, saved[0].id);
      return { userId: saved[0].id as string, created: true };
    });
  } catch (e: any) {
    if (isDuplicate(e))
      throw Error('อีเมลนี้สมัครบัญชีแล้ว กรุณาเข้าสู่ระบบหรือใช้ Google ที่เชื่อมไว้');
    throw e;
  }
}

export async function authenticateEmail(db: Sql, emailValue: string, password: string) {
  const email = normalizeEmail(emailValue);
  if (!validEmail(email) || typeof password !== 'string') return null;
  const rows = await db`SELECT id,password_hash FROM users WHERE lower(email)=${email} LIMIT 1`;
  if (!rows[0]?.password_hash) return null;
  if (!(await Bun.password.verify(password, rows[0].password_hash))) return null;
  return rows[0].id as string;
}

export async function attachEmailPassword(
  db: Sql,
  userId: string,
  input: { email: string; password: string },
) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw Error('กรุณาใส่อีเมลที่ถูกต้อง');
  if (!validPassword(input.password)) throw Error('รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร');
  const user = await db`
   SELECT u.email,u.password_hash,g.email google_email
   FROM users u LEFT JOIN google_links g ON g.user_id=u.id
   WHERE u.id=${userId} LIMIT 1
 `;
  if (!user.length) throw Error('ไม่พบบัญชี');
  if (user[0].password_hash) throw Error('บัญชีนี้ตั้งรหัสผ่านไว้แล้ว');
  // Google account owners can only add the Google-verified email, not arbitrarily
  // choose a third party's address. E-mail-only accounts already have a password.
  if (user[0].google_email && user[0].google_email.toLowerCase() !== email) {
    throw Error('ต้องใช้อีเมลเดียวกับ Google ที่เชื่อมไว้');
  }
  try {
    const rows = await db`
    UPDATE users SET email=${email},password_hash=${await Bun.password.hash(input.password, { algorithm: 'argon2id' })}
    WHERE id=${userId} AND password_hash IS NULL RETURNING id
  `;
    if (!rows.length) throw Error('บัญชีนี้มีรหัสผ่านแล้ว');
    return { ok: true };
  } catch (e: any) {
    if (isDuplicate(e)) throw Error('อีเมลนี้ถูกใช้โดยบัญชีอื่นแล้ว');
    throw e;
  }
}

export async function changePassword(
  db: Sql,
  userId: string,
  password: string,
  oldPassword: string | undefined,
  allowPasswordless: boolean,
) {
  if (!validPassword(password)) throw Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 10 และไม่เกิน 128 ตัวอักษร');
  const u = await db`SELECT password_hash FROM users WHERE id=${userId} LIMIT 1`;
  if (!u.length) throw Error('ไม่พบบัญชี');
  if (!u[0].password_hash) throw Error('กรุณาตั้งรหัสผ่านจากเมนูเชื่อมอีเมลก่อน');
  if (
    !allowPasswordless &&
    (!oldPassword || !(await Bun.password.verify(oldPassword, u[0].password_hash)))
  )
    throw Error('กรุณายืนยันรหัสผ่านเดิม');
  await db`UPDATE users SET password_hash=${await Bun.password.hash(password, { algorithm: 'argon2id' })} WHERE id=${userId}`;
  return { ok: true };
}
