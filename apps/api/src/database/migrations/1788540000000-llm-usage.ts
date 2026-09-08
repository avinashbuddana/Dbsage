import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LlmUsage1788540000000 implements MigrationInterface {
  name = 'LlmUsage1788540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "llm_usage" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid,
        "specification_version_id" uuid,
        "task" varchar(80) NOT NULL,
        "prompt_version" varchar(120) NOT NULL,
        "provider" varchar(32) NOT NULL,
        "model" varchar(255) NOT NULL,
        "input_tokens" integer NOT NULL DEFAULT 0,
        "output_tokens" integer NOT NULL DEFAULT 0,
        "total_tokens" integer NOT NULL DEFAULT 0,
        "latency_ms" integer NOT NULL,
        "success" boolean NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_llm_usage_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_llm_usage_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_llm_usage_datasource" FOREIGN KEY ("datasource_id")
          REFERENCES "datasources"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_llm_usage_input_tokens" CHECK ("input_tokens" >= 0),
        CONSTRAINT "CHK_llm_usage_output_tokens" CHECK ("output_tokens" >= 0),
        CONSTRAINT "CHK_llm_usage_total_tokens" CHECK ("total_tokens" >= 0),
        CONSTRAINT "CHK_llm_usage_latency_ms" CHECK ("latency_ms" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_llm_usage_organization_created_at" ON "llm_usage" ("organization_id", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_llm_usage_datasource_id" ON "llm_usage" ("datasource_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_llm_usage_specification_version_id" ON "llm_usage" ("specification_version_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "llm_usage"');
  }
}
