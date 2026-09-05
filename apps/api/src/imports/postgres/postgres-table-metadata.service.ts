import { NotFoundException, Injectable } from '@nestjs/common';

import { BulkImportPostgresProvider } from './bulk-import-postgres.provider';
import type { PostgresColumnMetadata, PostgresTableMetadata } from './postgres-import.types';
import { PostgresImportTargetPolicyService } from './postgres-import-target-policy.service';

interface ExistsRow {
  exists: boolean;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  has_default: boolean;
  is_generated: boolean;
  is_identity: boolean;
}

interface SchemaRow {
  name: string;
}

interface TableRow {
  name: string;
  column_count: number;
}

@Injectable()
export class PostgresTableMetadataService {
  constructor(
    private readonly postgres: BulkImportPostgresProvider,
    private readonly policy: PostgresImportTargetPolicyService,
  ) {}

  async listSchemas(): Promise<string[]> {
    return this.postgres.withClient(async (client) => {
      const schemas = await client.query<SchemaRow>(
        `SELECT nspname AS name
         FROM pg_namespace
         WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
         ORDER BY nspname`,
      );
      return schemas.rows.filter((schema) => this.policy.isSchemaAllowed(schema.name)).map((schema) => schema.name);
    });
  }

  async listTables(schema: string): Promise<{ name: string; columnCount: number }[]> {
    this.policy.assertSchemaAllowed(schema);
    return this.postgres.withClient(async (client) => {
      const tables = await client.query<TableRow>(
        `SELECT relation.relname AS name, COUNT(columns.column_name)::integer AS column_count
         FROM pg_class relation
         INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         LEFT JOIN information_schema.columns columns
           ON columns.table_schema = namespace.nspname AND columns.table_name = relation.relname
         WHERE namespace.nspname = $1 AND relation.relkind IN ('r', 'p')
         GROUP BY relation.relname
         ORDER BY relation.relname`,
        [schema],
      );
      return tables.rows
        .filter((table) => this.policy.isAllowed(schema, table.name))
        .map((table) => ({ columnCount: table.column_count, name: table.name }));
    });
  }

  async getTable(schema: string, table: string): Promise<PostgresTableMetadata> {
    this.policy.assertAllowed(schema, table);
    return this.postgres.withClient(async (client) => {
      const schemaResult = await client.query<ExistsRow>(
        `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists`,
        [schema],
      );
      if (!schemaResult.rows[0]?.exists) {
        throw new NotFoundException('Import target schema not found');
      }

      const tableResult = await client.query<ExistsRow>(
        `SELECT EXISTS (
          SELECT 1
          FROM pg_class relation
          INNER JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = $1
            AND relation.relname = $2
            AND relation.relkind IN ('r', 'p')
        ) AS exists`,
        [schema, table],
      );
      if (!tableResult.rows[0]?.exists) {
        throw new NotFoundException('Import target table not found');
      }

      const columns = await client.query<ColumnRow>(
        `SELECT
          column_name,
          data_type,
          is_nullable = 'YES' AS is_nullable,
          column_default IS NOT NULL AS has_default,
          is_generated = 'ALWAYS' AS is_generated,
          is_identity = 'YES' AS is_identity
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
        [schema, table],
      );

      return {
        schema,
        table,
        columns: columns.rows.map((column): PostgresColumnMetadata => ({
          name: column.column_name,
          dataType: column.data_type,
          isNullable: column.is_nullable,
          hasDefault: column.has_default,
          isGenerated: column.is_generated,
          isIdentity: column.is_identity,
        })),
      };
    });
  }
}
