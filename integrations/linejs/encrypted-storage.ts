import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  lstatSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { BaseStorage, type Storage } from '@evex/linejs/storage';
import { openVault, sealVault } from '../../shared/linejs-vault.ts';

/** LINEJS hosted sessions are encrypted on disk, never saved as session.json. */
export class EncryptedLineStorage extends BaseStorage {
  private queue: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly key: Buffer;
  private readonly owner: string;

  constructor(file: string, key: Buffer, owner: string) {
    super();
    this.file = file;
    this.key = key;
    this.owner = owner;
    const parent = dirname(file);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    if (lstatSync(parent).isSymbolicLink()) throw Error('LINEJS session directory cannot be a symlink');
    chmodSync(parent, 0o700);
    if (existsSync(file)) {
      if (lstatSync(file).isSymbolicLink()) throw Error('LINEJS session file cannot be a symlink');
      chmodSync(file, 0o600);
      this.all(); // validate encryption before connecting to LINE
    }
  }

  private all(): Record<string, Storage['Value']> {
    if (!existsSync(this.file)) return {};
    const cipher = readFileSync(this.file, 'utf8');
    const value = JSON.parse(openVault(cipher, this.key, this.owner, 'line-session'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Invalid LINEJS session');
    return value;
  }

  private write(data: Record<string, Storage['Value']>) {
    const cipher = sealVault(JSON.stringify(data), this.key, this.owner, 'line-session');
    const tmp = this.file + '.' + randomBytes(8).toString('hex') + '.tmp';
    writeFileSync(tmp, cipher, { mode: 0o600, flag: 'wx' });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }

  private mutate(action: (data: Record<string, Storage['Value']>) => void): Promise<void> {
    const update = this.queue.then(() => {
      const data = this.all();
      action(data);
      this.write(data);
    });
    this.queue = update.catch(() => {});
    return update;
  }

  async set(key: Storage['Key'], value: Storage['Value']): Promise<void> {
    return this.mutate((data) => {
      data[key] = value;
    });
  }
  async get(key: Storage['Key']): Promise<Storage['Value'] | undefined> {
    await this.queue;
    return this.all()[key];
  }
  async delete(key: Storage['Key']): Promise<void> {
    return this.mutate((data) => {
      delete data[key];
    });
  }
  async clear(): Promise<void> {
    return this.mutate((data) => {
      for (const key of Object.keys(data)) delete data[key];
    });
  }
  async migrate(storage: BaseStorage): Promise<void> {
    await this.queue;
    for (const [key, value] of Object.entries(this.all())) await storage.set(key, value);
  }
}
