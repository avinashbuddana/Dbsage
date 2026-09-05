import { Injectable } from '@nestjs/common';
import { createHash, type Hash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

export class HashingTransform extends Transform {
  private readonly hash: Hash = createHash('sha256');

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.hash.update(chunk);
    callback(null, chunk);
  }

  digest(): string {
    return this.hash.digest('hex');
  }
}

@Injectable()
export class FileHashService {
  createHashingTransform(): HashingTransform {
    return new HashingTransform();
  }
}
