import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DatasourceSpecAnalyses1788550000000 implements MigrationInterface {
  name = 'DatasourceSpecAnalyses1788550000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "datasource_spec_analysis_status" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "datasource_spec_analyses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "database_name" varchar(128) NOT NULL,
        "status" "datasource_spec_analysis_status" NOT NULL,
        "encrypted_specification" text,
        "specification_iv" varchar(24),
        "specification_auth_tag" varchar(24),
        "specification_encryption_version" integer,
        "result" text,
        "error_code" varchar(80),
        "error_message" varchar(255),
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_datasource_spec_analyses_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_datasource_spec_analyses_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_datasource_spec_analyses_datasource" FOREIGN KEY ("datasource_id")
          REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_datasource_spec_analyses_encrypted_source" CHECK (
          ("encrypted_specification" IS NULL AND "specification_iv" IS NULL
            AND "specification_auth_tag" IS NULL AND "specification_encryption_version" IS NULL)
          OR
          ("encrypted_specification" IS NOT NULL AND "specification_iv" IS NOT NULL
            AND "specification_auth_tag" IS NOT NULL AND "specification_encryption_version" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_datasource_spec_analyses_organization_datasource_created" ON "datasource_spec_analyses" ("organization_id", "datasource_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "datasource_spec_analyses"');
    await queryRunner.query('DROP TYPE "datasource_spec_analysis_status"');
  }
}
