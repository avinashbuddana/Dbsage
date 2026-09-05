import { BadRequestException, Injectable } from '@nestjs/common';

const SAFE_NEW_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

@Injectable()
export class PostgresIdentifierService {
  quote(identifier: string, knownIdentifiers: readonly string[]): string {
    if (!knownIdentifiers.includes(identifier)) {
      throw new BadRequestException('Import target identifier is invalid');
    }
    return `"${identifier.replaceAll('"', '""')}"`;
  }

  /**
   * Validates an identifier that does not yet exist in the database (e.g. a table or
   * column being created), since `quote()` can only check against already-known names.
   */
  validateNewIdentifier(identifier: string): string {
    if (!SAFE_NEW_IDENTIFIER.test(identifier)) {
      throw new BadRequestException('Import target identifier is invalid');
    }
    return identifier;
  }
}
