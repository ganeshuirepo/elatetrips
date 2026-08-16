import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

/**
 * Where uploaded photos live. Disk is the mock-first default (served back by
 * the same node under /uploads); an S3/Cloudinary adapter implements the same
 * port when real object storage arrives — callers only ever see a URL.
 */
export interface IPhotoStorage {
  /** Persist the bytes; resolve to the public URL the client should store. */
  save(originalName: string, mimetype: string, bytes: Buffer): Promise<string>;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

export class DiskPhotoStorage implements IPhotoStorage {
  /**
   * @param dir       absolute directory to write into (created on demand)
   * @param publicBase URL prefix the files are served under, e.g.
   *                   `http://localhost:4000/uploads`
   */
  constructor(
    private readonly dir: string,
    private readonly publicBase: string,
  ) {}

  async save(originalName: string, mimetype: string, bytes: Buffer): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    // Never trust the client's filename — derive ours, keep only a hint of it.
    const hint = path
      .basename(originalName)
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 40)
      .replace(/\.[^.]*$/, '');
    const ext = EXT_BY_TYPE[mimetype] ?? '.bin';
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}${hint ? `-${hint}` : ''}${ext}`;
    await writeFile(path.join(this.dir, name), bytes);
    return `${this.publicBase.replace(/\/$/, '')}/${name}`;
  }
}
