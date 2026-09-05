declare module 'pg-copy-streams' {
  import type { Writable } from 'node:stream';
  import type { Submittable } from 'pg';

  export interface CopyFromStream extends Writable, Submittable {
    rowCount: number;
  }

  export function from(command: string): CopyFromStream;
}
