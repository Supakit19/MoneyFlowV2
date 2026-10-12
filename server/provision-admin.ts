/**
 * One-time administrator provisioning.
 * Usage (interactive; avoids storing passwords in shell history):
 * bun server/provision-admin.ts
 * Requires the application's existing DATABASE_URL environment configuration.
 */
import postgres from 'postgres';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { execFileSync } from 'node:child_process';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw Error('DATABASE_URL missing; refusing local/production database guessing');
const rl = createInterface({ input: stdin, output: stdout });
const email = (await rl.question('Admin email: ')).trim().toLowerCase();
let password = '';
if (stdin.isTTY && stdout.isTTY) {
  try {
    execFileSync('stty', ['-echo'], { stdio: ['inherit', 'ignore', 'ignore'] });
    password = await rl.question('Admin password (16+ characters): ');
  } finally {
    execFileSync('stty', ['echo'], { stdio: ['inherit', 'ignore', 'ignore'] });
    stdout.write('\n');
    rl.close();
  }
} else {
  rl.close();
  throw Error('Interactive terminal required for secure password input');
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 16)
  throw Error('Valid email and a password of at least 16 characters required');
const db = postgres(databaseUrl, { max: 1 });
try {
  const hash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  await db`INSERT INTO admin_users(email,password_hash) VALUES(${email},${hash})
    ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,active=true`;
  // Revoke old administrator sessions when resetting credentials.
  await db`DELETE FROM admin_sessions WHERE admin_id=(SELECT id FROM admin_users WHERE email=${email})`;
  console.log('Admin account provisioned; old admin sessions revoked.');
} finally { await db.end(); }
