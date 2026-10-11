import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

describe('MoneyFlow uploaded mascot assets', () => {
  test('the mascot is an optimized valid WEBP image', async () => {
    const bytes = await readFile(resolve(import.meta.dir, '../public/brand/moneyflow-mascot.webp'));
    expect(bytes.length).toBeGreaterThan(9000);
    expect(bytes.length).toBeLessThan(20000);
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  });
  test('browser and home screen icons are present', async () => {
    const favicon = await readFile(resolve(import.meta.dir, '../public/favicon.png'));
    const touchIcon = await readFile(resolve(import.meta.dir, '../public/brand/moneyflow-icon-192.png'));
    expect(favicon.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(touchIcon.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
  test('disabled motion preferences remove all mascot movement', async () => {
    const css = await Bun.file(resolve(import.meta.dir, '../src/components/BrandMark.css')).text();
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important');
    expect(css).toContain('mf-mascot-float');
  });
});
