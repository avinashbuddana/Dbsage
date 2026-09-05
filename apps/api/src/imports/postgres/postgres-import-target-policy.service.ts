import { BadRequestException, Injectable } from '@nestjs/common';

const BLOCKED_SCHEMAS = new Set(['information_schema', 'pg_catalog']);
const BLOCKED_TABLES = new Set([
  'audit_logs',
  'data_import_errors',
  'data_imports',
  'datasource_secrets',
  'datasource_ssh_configs',
  'datasources',
  'migrations',
  'organization_members',
  'organizations',
  'users',
]);

@Injectable()
export class PostgresImportTargetPolicyService {
  isSchemaAllowed(schema: string): boolean {
    return !BLOCKED_SCHEMAS.has(schema) && !schema.startsWith('pg_');
  }

  isAllowed(schema: string, table: string): boolean {
    return this.isSchemaAllowed(schema) && !BLOCKED_TABLES.has(table);
  }

  assertSchemaAllowed(schema: string): void {
    if (!this.isSchemaAllowed(schema)) {
      throw new BadRequestException('Import target is not allowed');
    }
  }

  assertAllowed(schema: string, table: string): void {
    if (!this.isAllowed(schema, table)) {
      throw new BadRequestException('Import target is not allowed');
    }
  }
}
