import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvImportPartiallyCompletedStatus1788520000000 implements MigrationInterface {
  name = 'CsvImportPartiallyCompletedStatus1788520000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "data_import_status" ADD VALUE 'PARTIALLY_COMPLETED'`);
  }

  // Postgres does not support removing a value from an enum type; this migration
  // is intentionally one-directional.
  async down(): Promise<void> {}
}
