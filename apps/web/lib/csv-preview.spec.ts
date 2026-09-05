import { describe, expect, it } from 'vitest';

import { previewCsv } from './csv-preview';

function csvFile(content: string): File {
  return new File([content], 'sample.csv', { type: 'text/csv' });
}

describe('previewCsv', () => {
  it('parses headers and the first sample row', async () => {
    const preview = await previewCsv(csvFile('first_name,surname,email\nJohn,Smith,john@example.com\n'));
    expect(preview.headers).toEqual(['first_name', 'surname', 'email']);
    expect(preview.sampleRow).toEqual(['John', 'Smith', 'john@example.com']);
  });

  it('respects quoted fields containing the delimiter', async () => {
    const preview = await previewCsv(csvFile('name,address\n"Doe, Jane","123 Main St"\n'));
    expect(preview.sampleRow).toEqual(['Doe, Jane', '123 Main St']);
  });

  it('respects a custom delimiter', async () => {
    const preview = await previewCsv(csvFile('a;b\n1;2\n'), ';');
    expect(preview.headers).toEqual(['a', 'b']);
    expect(preview.sampleRow).toEqual(['1', '2']);
  });

  it('returns an empty sample row when the file has only a header', async () => {
    const preview = await previewCsv(csvFile('a,b\n'));
    expect(preview.sampleRow).toEqual([]);
  });
});
