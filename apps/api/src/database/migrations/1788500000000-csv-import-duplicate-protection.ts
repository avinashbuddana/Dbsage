import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvImportDuplicateProtection1788500000000 implements MigrationInterface {
  name = 'CsvImportDuplicateProtection1788500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "data_imports" ADD COLUMN "file_hash" varchar(64)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_data_imports_active_file_hash"
        ON "data_imports" ("organization_id", "target_schema", "target_table", "file_hash")
        WHERE "status" IN ('QUEUED', 'PROCESSING', 'COMPLETED')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_data_imports_active_file_hash"');
    await queryRunner.query('ALTER TABLE "data_imports" DROP COLUMN "file_hash"');
  }
}
