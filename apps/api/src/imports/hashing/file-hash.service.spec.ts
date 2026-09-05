import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { FileHashService } from './file-hash.service';

describe('FileHashService', () => {
  it('computes the SHA-256 hex digest of everything piped through it', async () => {
    const service = new FileHashService();
    const hasher = service.createHashingTransform();
    const chunks: Buffer[] = [];

    hasher.on('data', (chunk: Buffer) => chunks.push(chunk));
    await pipeline(Readable.from(['hello']), hasher);

    expect(hasher.digest()).toBe(createHash('sha256').update('hello').digest('hex'));
  });

  it('produces the same digest for identical content piped separately', async () => {
    const service = new FileHashService();
    const first = service.createHashingTransform();
    const second = service.createHashingTransform();

    await pipeline(Readable.from(['name\nAda\n']), first);
    await pipeline(Readable.from(['name\nAda\n']), second);

    expect(first.digest()).toBe(second.digest());
  });

  it('produces different digests for different content', async () => {
    const service = new FileHashService();
    const first = service.createHashingTransform();
    const second = service.createHashingTransform();

    await pipeline(Readable.from(['name\nAda\n']), first);
    await pipeline(Readable.from(['name\nGrace\n']), second);

    expect(first.digest()).not.toBe(second.digest());
  });

  it('passes bytes through unchanged', async () => {
    const service = new FileHashService();
    const hasher = service.createHashingTransform();
    const chunks: Buffer[] = [];
    hasher.on('data', (chunk: Buffer) => chunks.push(chunk));

    await pipeline(Readable.from(['pass-through-content']), hasher);

    expect(Buffer.concat(chunks).toString('utf8')).toBe('pass-through-content');
  });
});
