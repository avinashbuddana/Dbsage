import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PostgreSqlCsvImports1788480000000 implements MigrationInterface {
  name = 'PostgreSqlCsvImports1788480000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "data_import_status" AS ENUM ('UPLOADED', 'VALIDATING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "data_import_processing_mode" AS ENUM ('SYNCHRONOUS', 'QUEUED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "data_imports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        "original_file_name" varchar(255) NOT NULL,
        "stored_file_reference" varchar(64) NOT NULL,
        "file_size_bytes" bigint NOT NULL,
        "mime_type" varchar(128) NOT NULL,
        "target_schema" varchar(63) NOT NULL,
        "target_table" varchar(63) NOT NULL,
        "column_mapping" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" "data_import_status" NOT NULL DEFAULT 'UPLOADED',
        "processing_mode" "data_import_processing_mode" NOT NULL,
        "delimiter" char(1) NOT NULL,
        "has_header" boolean NOT NULL DEFAULT true,
        "total_rows" bigint,
        "processed_rows" bigint NOT NULL DEFAULT 0,
        "successful_rows" bigint NOT NULL DEFAULT 0,
        "failed_rows" bigint NOT NULL DEFAULT 0,
        "processed_bytes" bigint NOT NULL DEFAULT 0,
        "progress_percent" smallint NOT NULL DEFAULT 0,
        "queue_job_id" varchar(64),
        "error_code" varchar(80),
        "error_message" varchar(500),
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "file_deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_data_imports_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_data_imports_file_size" CHECK ("file_size_bytes" > 0),
        CONSTRAINT "CHK_data_imports_progress" CHECK ("progress_percent" BETWEEN 0 AND 100),
        CONSTRAINT "FK_data_imports_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_data_imports_created_by_user" FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_data_imports_organization_id" ON "data_imports" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_data_imports_organization_created_at" ON "data_imports" ("organization_id", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_data_imports_status" ON "data_imports" ("status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "data_imports"');
    await queryRunner.query('DROP TYPE "data_import_processing_mode"');
    await queryRunner.query('DROP TYPE "data_import_status"');
  }
}
