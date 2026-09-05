import { Readable } from 'node:stream';

import type { AppConfigService } from '../../config/app-config.service';
import { CsvHeaderValidator } from './csv-header.validator';

function createValidator(maxColumns = 4, maxHeaderLength = 32): CsvHeaderValidator {
  return new CsvHeaderValidator({
    csvImport: {
      maxColumns,
      maxHeaderLength,
    },
  } as unknown as AppConfigService);
}

describe('CsvHeaderValidator', () => {
  it('reads a quoted CSV header without loading subsequent records', async () => {
    const headers = await createValidator().readHeaders(
      Readable.from(['first_name,"last,name",email\r\nAda,Lovelace,ada@example.com\r\n']),
      ',',
    );

    expect(headers).toEqual(['first_name', 'last,name', 'email']);
  });

  it('rejects duplicate, empty, oversized, and excessive headers', async () => {
    await expect(
      createValidator().readHeaders(Readable.from(['email,email\n']), ','),
    ).rejects.toThrow('duplicate');
    await expect(createValidator().readHeaders(Readable.from(['email,\n']), ',')).rejects.toThrow(
      'empty',
    );
    await expect(
      createValidator(1).readHeaders(Readable.from(['first_name,email\n']), ','),
    ).rejects.toThrow('maximum');
    await expect(
      createValidator(4, 3).readHeaders(Readable.from(['email\n']), ','),
    ).rejects.toThrow('maximum length');
  });
});
