import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GeneratedQueries1788590000000 implements MigrationInterface {
  name = 'GeneratedQueries1788590000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "generated_queries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "user_id" uuid,
        "question" text NOT NULL,
        "intent" varchar(40) NOT NULL,
        "schema_snapshot_id" uuid NOT NULL,
        "knowledge_version_id" uuid,
        "query_plan" jsonb NOT NULL,
        "generated_sql" text,
        "parameter_metadata" jsonb NOT NULL,
        "status" varchar(24) NOT NULL,
        "validation_status" varchar(24) NOT NULL,
        "confidence" numeric(4,3) NOT NULL,
        "provider" varchar(32),
        "model" varchar(255),
        "prompt_version" varchar(120),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_generated_queries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_generated_queries_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_generated_queries_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_generated_queries_snapshot" FOREIGN KEY ("schema_snapshot_id") REFERENCES "datasource_schema_snapshots"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_generated_queries_knowledge_version" FOREIGN KEY ("knowledge_version_id") REFERENCES "datasource_knowledge_versions"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_generated_queries_confidence" CHECK ("confidence" >= 0 AND "confidence" <= 1)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_generated_queries_organization_datasource" ON "generated_queries" ("organization_id", "datasource_id")');
    await queryRunner.query('CREATE INDEX "IDX_generated_queries_datasource_created" ON "generated_queries" ("datasource_id", "created_at")');
    await queryRunner.query('CREATE INDEX "IDX_generated_queries_schema_snapshot" ON "generated_queries" ("schema_snapshot_id")');
    await queryRunner.query('CREATE INDEX "IDX_generated_queries_status" ON "generated_queries" ("status")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "generated_queries"');
  }
}
