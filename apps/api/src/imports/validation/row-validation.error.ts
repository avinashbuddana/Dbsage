import type { RowError } from './import-validator.service';

export class RowValidationException extends Error {
  constructor(readonly errors: readonly RowError[]) {
    super(errors[0]?.error ?? 'CSV row validation failed');
    this.name = 'RowValidationException';
  }
}
