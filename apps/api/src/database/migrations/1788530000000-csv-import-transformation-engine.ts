import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvImportTransformationEngine1788530000000 implements MigrationInterface {
  name = 'CsvImportTransformationEngine1788530000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "data_import_mode" AS ENUM ('STRICT', 'FLEXIBLE')`);
    await queryRunner.query(
      `ALTER TABLE "data_imports" ADD COLUMN "import_mode" "data_import_mode" NOT NULL DEFAULT 'STRICT'`,
    );
    await queryRunner.query(`ALTER TABLE "data_imports" ADD COLUMN "date_format" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "data_imports" ADD COLUMN "array_delimiter" varchar(5)`);

    await queryRunner.query(`
      CREATE TABLE "data_import_errors" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "import_id" uuid NOT NULL,
        "row_number" integer NOT NULL,
        "csv_column" varchar(255) NOT NULL,
        "database_column" varchar(63) NOT NULL,
        "raw_value" text NOT NULL,
        "target_type" varchar(50) NOT NULL,
        "error_message" varchar(500) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_data_import_errors_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_data_import_errors_import" FOREIGN KEY ("import_id")
          REFERENCES "data_imports"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_data_import_errors_import_id" ON "data_import_errors" ("import_id")`);

    await queryRunner.query(`DROP INDEX "UQ_data_imports_active_file_hash"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_data_imports_active_file_hash"
        ON "data_imports" ("organization_id", "target_schema", "target_table", "file_hash")
        WHERE "status" IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_data_imports_active_file_hash"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_data_imports_active_file_hash"
        ON "data_imports" ("organization_id", "target_schema", "target_table", "file_hash")
        WHERE "status" IN ('QUEUED', 'PROCESSING', 'COMPLETED')
    `);
    await queryRunner.query('DROP TABLE "data_import_errors"');
    await queryRunner.query('ALTER TABLE "data_imports" DROP COLUMN "array_delimiter"');
    await queryRunner.query('ALTER TABLE "data_imports" DROP COLUMN "date_format"');
    await queryRunner.query('ALTER TABLE "data_imports" DROP COLUMN "import_mode"');
    await queryRunner.query('DROP TYPE "data_import_mode"');
  }
}
