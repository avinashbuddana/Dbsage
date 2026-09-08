import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VerifiedDatasourceKnowledge1788570000000 implements MigrationInterface {
  name = 'VerifiedDatasourceKnowledge1788570000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query('ALTER TABLE "llm_usage" ADD "knowledge_version_id" uuid');
    await queryRunner.query('CREATE INDEX "IDX_llm_usage_knowledge_version_id" ON "llm_usage" ("knowledge_version_id")');
    await queryRunner.query(`
      CREATE TABLE "datasource_specifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "database_name" varchar(128) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_datasource_specifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_datasource_specifications_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_datasource_specifications_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_datasource_specifications_organization_datasource_database" UNIQUE ("organization_id", "datasource_id", "database_name")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "datasource_specification_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "specification_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "version_number" integer NOT NULL,
        "extraction_confidence" numeric(4,3) NOT NULL,
        "requirements" jsonb NOT NULL,
        "expected_model" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz,
        CONSTRAINT "PK_datasource_specification_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_datasource_specification_versions_specification" FOREIGN KEY ("specification_id") REFERENCES "datasource_specifications"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_datasource_specification_versions_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_datasource_specification_versions_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_datasource_specification_versions_specification_number" UNIQUE ("specification_id", "version_number"),
        CONSTRAINT "CHK_datasource_specification_versions_confidence" CHECK ("extraction_confidence" >= 0 AND "extraction_confidence" <= 1),
        CONSTRAINT "CHK_datasource_specification_versions_number" CHECK ("version_number" > 0)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_datasource_specification_versions_organization_datasource" ON "datasource_specification_versions" ("organization_id", "datasource_id")');
    await queryRunner.query(`
      CREATE TABLE "datasource_schema_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "database_name" varchar(128) NOT NULL,
        "schema" jsonb NOT NULL,
        "content_hash" char(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz NOT NULL,
        CONSTRAINT "PK_datasource_schema_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_datasource_schema_snapshots_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_datasource_schema_snapshots_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_datasource_schema_snapshots_organization_datasource_database_hash" UNIQUE ("organization_id", "datasource_id", "database_name", "content_hash")
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_datasource_schema_snapshots_organization_datasource_created" ON "datasource_schema_snapshots" ("organization_id", "datasource_id", "created_at")');
    await queryRunner.query(`
      CREATE TABLE "specification_compatibility_checks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "specification_version_id" uuid NOT NULL,
        "schema_snapshot_id" uuid NOT NULL,
        "overall_score" smallint NOT NULL,
        "entity_score" smallint NOT NULL,
        "field_score" smallint NOT NULL,
        "relationship_score" smallint NOT NULL,
        "constraint_score" smallint NOT NULL,
        "semantic_score" smallint NOT NULL,
        "anchor_score" smallint NOT NULL,
        "status" varchar(32) NOT NULL,
        "knowledge_eligibility" varchar(24) NOT NULL,
        "reason" varchar(1200) NOT NULL,
        "summary" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_specification_compatibility_checks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_specification_compatibility_checks_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_compatibility_checks_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_compatibility_checks_version" FOREIGN KEY ("specification_version_id") REFERENCES "datasource_specification_versions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_compatibility_checks_snapshot" FOREIGN KEY ("schema_snapshot_id") REFERENCES "datasource_schema_snapshots"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_specification_compatibility_checks_version_snapshot" UNIQUE ("specification_version_id", "schema_snapshot_id"),
        CONSTRAINT "CHK_specification_compatibility_checks_scores" CHECK ("overall_score" BETWEEN 0 AND 100 AND "entity_score" BETWEEN 0 AND 100 AND "field_score" BETWEEN 0 AND 100 AND "relationship_score" BETWEEN 0 AND 100 AND "constraint_score" BETWEEN 0 AND 100 AND "semantic_score" BETWEEN 0 AND 100 AND "anchor_score" BETWEEN 0 AND 100)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_specification_compatibility_checks_organization_datasource_created" ON "specification_compatibility_checks" ("organization_id", "datasource_id", "created_at")');
    await queryRunner.query(`
      CREATE TABLE "specification_database_findings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "datasource_id" uuid NOT NULL,
        "specification_version_id" uuid NOT NULL,
        "schema_snapshot_id" uuid NOT NULL,
        "compatibility_check_id" uuid NOT NULL,
        "finding_type" varchar(40) NOT NULL,
        "severity" varchar(12) NOT NULL,
        "requirement_id" varchar(128),
        "table_name" varchar(128),
        "column_name" varchar(128),
        "relationship_name" varchar(384),
        "title" varchar(240) NOT NULL,
        "description" text NOT NULL,
        "evidence" jsonb NOT NULL,
        "recommendation" text,
        "confidence_score" numeric(4,3) NOT NULL,
        "status" varchar(20) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_specification_database_findings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_specification_database_findings_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_database_findings_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_database_findings_version" FOREIGN KEY ("specification_version_id") REFERENCES "datasource_specification_versions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_database_findings_snapshot" FOREIGN KEY ("schema_snapshot_id") REFERENCES "datasource_schema_snapshots"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_specification_database_findings_check" FOREIGN KEY ("compatibility_check_id") REFERENCES "specification_compatibility_checks"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_specification_database_findings_confidence" CHECK ("confidence_score" >= 0 AND "confidence_score" <= 1)
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_specification_database_findings_check" ON "specification_database_findings" ("compatibility_check_id", "created_at")');
    await queryRunner.query('CREATE INDEX "IDX_specification_database_findings_organization_datasource" ON "specification_database_findings" ("organization_id", "datasource_id")');
    await this.createMappings(queryRunner);
    await this.createKnowledgeTables(queryRunner);
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD "specification_id" uuid');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD "specification_version_id" uuid');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD "schema_snapshot_id" uuid');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD "compatibility_check_id" uuid');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD CONSTRAINT "FK_datasource_spec_analyses_specification" FOREIGN KEY ("specification_id") REFERENCES "datasource_specifications"("id") ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD CONSTRAINT "FK_datasource_spec_analyses_version" FOREIGN KEY ("specification_version_id") REFERENCES "datasource_specification_versions"("id") ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD CONSTRAINT "FK_datasource_spec_analyses_snapshot" FOREIGN KEY ("schema_snapshot_id") REFERENCES "datasource_schema_snapshots"("id") ON DELETE SET NULL');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD CONSTRAINT "FK_datasource_spec_analyses_check" FOREIGN KEY ("compatibility_check_id") REFERENCES "specification_compatibility_checks"("id") ON DELETE SET NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP CONSTRAINT "FK_datasource_spec_analyses_check"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP CONSTRAINT "FK_datasource_spec_analyses_snapshot"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP CONSTRAINT "FK_datasource_spec_analyses_version"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP CONSTRAINT "FK_datasource_spec_analyses_specification"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP COLUMN "compatibility_check_id"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP COLUMN "schema_snapshot_id"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP COLUMN "specification_version_id"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP COLUMN "specification_id"');
    await queryRunner.query('DROP TABLE "knowledge_chunks"');
    await queryRunner.query('DROP TABLE "database_knowledge"');
    await queryRunner.query('DROP TABLE "datasource_knowledge_versions"');
    await queryRunner.query('DROP TABLE "specification_relationship_mappings"');
    await queryRunner.query('DROP TABLE "specification_field_mappings"');
    await queryRunner.query('DROP TABLE "specification_entity_mappings"');
    await queryRunner.query('DROP TABLE "specification_database_findings"');
    await queryRunner.query('DROP TABLE "specification_compatibility_checks"');
    await queryRunner.query('DROP TABLE "datasource_schema_snapshots"');
    await queryRunner.query('DROP TABLE "datasource_specification_versions"');
    await queryRunner.query('DROP TABLE "datasource_specifications"');
    await queryRunner.query('DROP INDEX "IDX_llm_usage_knowledge_version_id"');
    await queryRunner.query('ALTER TABLE "llm_usage" DROP COLUMN "knowledge_version_id"');
    await queryRunner.query('DROP EXTENSION IF EXISTS vector');
  }

  private async createMappings(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "specification_entity_mappings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "datasource_id" uuid NOT NULL, "specification_version_id" uuid NOT NULL, "schema_snapshot_id" uuid NOT NULL, "compatibility_check_id" uuid NOT NULL, "requirement_id" varchar(128) NOT NULL, "spec_entity" varchar(240) NOT NULL, "table_name" varchar(128) NOT NULL, "match_type" varchar(32) NOT NULL, "confidence_score" numeric(4,3) NOT NULL, "verified" boolean NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_specification_entity_mappings" PRIMARY KEY ("id"), CONSTRAINT "UQ_specification_entity_mappings_check_requirement" UNIQUE ("compatibility_check_id", "requirement_id"), CONSTRAINT "FK_specification_entity_mappings_check" FOREIGN KEY ("compatibility_check_id") REFERENCES "specification_compatibility_checks"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "specification_field_mappings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "datasource_id" uuid NOT NULL, "specification_version_id" uuid NOT NULL, "schema_snapshot_id" uuid NOT NULL, "compatibility_check_id" uuid NOT NULL, "requirement_id" varchar(128) NOT NULL, "spec_field" varchar(240) NOT NULL, "table_name" varchar(128) NOT NULL, "column_name" varchar(128) NOT NULL, "match_type" varchar(32) NOT NULL, "confidence_score" numeric(4,3) NOT NULL, "verified" boolean NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_specification_field_mappings" PRIMARY KEY ("id"), CONSTRAINT "UQ_specification_field_mappings_check_requirement_field" UNIQUE ("compatibility_check_id", "requirement_id", "spec_field"), CONSTRAINT "FK_specification_field_mappings_check" FOREIGN KEY ("compatibility_check_id") REFERENCES "specification_compatibility_checks"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "specification_relationship_mappings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "datasource_id" uuid NOT NULL, "specification_version_id" uuid NOT NULL, "schema_snapshot_id" uuid NOT NULL, "compatibility_check_id" uuid NOT NULL, "requirement_id" varchar(128) NOT NULL, "relationship_name" varchar(384) NOT NULL, "source_table_name" varchar(128) NOT NULL, "target_table_name" varchar(128) NOT NULL, "match_type" varchar(32) NOT NULL, "confidence_score" numeric(4,3) NOT NULL, "verified" boolean NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_specification_relationship_mappings" PRIMARY KEY ("id"), CONSTRAINT "UQ_specification_relationship_mappings_check_requirement_relationship" UNIQUE ("compatibility_check_id", "requirement_id", "relationship_name"), CONSTRAINT "FK_specification_relationship_mappings_check" FOREIGN KEY ("compatibility_check_id") REFERENCES "specification_compatibility_checks"("id") ON DELETE CASCADE)`);
  }

  private async createKnowledgeTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "datasource_knowledge_versions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "datasource_id" uuid NOT NULL, "specification_version_id" uuid NOT NULL, "schema_snapshot_id" uuid NOT NULL, "compatibility_check_id" uuid NOT NULL, "version_number" integer NOT NULL, "status" varchar(16) NOT NULL, "knowledge_count" integer NOT NULL DEFAULT 0, "chunk_count" integer NOT NULL DEFAULT 0, "created_at" timestamptz NOT NULL DEFAULT now(), "completed_at" timestamptz, "activated_at" timestamptz, "superseded_at" timestamptz, CONSTRAINT "PK_datasource_knowledge_versions" PRIMARY KEY ("id"), CONSTRAINT "UQ_datasource_knowledge_versions_compatibility" UNIQUE ("compatibility_check_id"), CONSTRAINT "FK_datasource_knowledge_versions_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE, CONSTRAINT "FK_datasource_knowledge_versions_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE, CONSTRAINT "FK_datasource_knowledge_versions_version" FOREIGN KEY ("specification_version_id") REFERENCES "datasource_specification_versions"("id") ON DELETE CASCADE, CONSTRAINT "FK_datasource_knowledge_versions_snapshot" FOREIGN KEY ("schema_snapshot_id") REFERENCES "datasource_schema_snapshots"("id") ON DELETE CASCADE, CONSTRAINT "FK_datasource_knowledge_versions_check" FOREIGN KEY ("compatibility_check_id") REFERENCES "specification_compatibility_checks"("id") ON DELETE CASCADE, CONSTRAINT "CHK_datasource_knowledge_versions_number" CHECK ("version_number" > 0))`);
    await queryRunner.query('CREATE INDEX "IDX_datasource_knowledge_versions_organization_datasource_created" ON "datasource_knowledge_versions" ("organization_id", "datasource_id", "created_at")');
    await queryRunner.query(`CREATE TABLE "database_knowledge" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "datasource_id" uuid NOT NULL, "knowledge_version_id" uuid NOT NULL, "knowledge_type" varchar(32) NOT NULL, "subject_type" varchar(48) NOT NULL, "subject_id" varchar(128), "subject" varchar(384) NOT NULL, "content" text NOT NULL, "source_type" varchar(24) NOT NULL, "source_id" varchar(128), "importance_score" smallint NOT NULL, "confidence_score" numeric(4,3) NOT NULL, "verified" boolean NOT NULL, "active" boolean NOT NULL DEFAULT false, "content_hash" char(64) NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_database_knowledge" PRIMARY KEY ("id"), CONSTRAINT "UQ_database_knowledge_version_hash" UNIQUE ("knowledge_version_id", "content_hash"), CONSTRAINT "FK_database_knowledge_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE, CONSTRAINT "FK_database_knowledge_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE, CONSTRAINT "FK_database_knowledge_version" FOREIGN KEY ("knowledge_version_id") REFERENCES "datasource_knowledge_versions"("id") ON DELETE CASCADE, CONSTRAINT "CHK_database_knowledge_importance" CHECK ("importance_score" BETWEEN 0 AND 100), CONSTRAINT "CHK_database_knowledge_confidence" CHECK ("confidence_score" >= 0 AND "confidence_score" <= 1))`);
    await queryRunner.query('CREATE INDEX "IDX_database_knowledge_organization_datasource_active" ON "database_knowledge" ("organization_id", "datasource_id", "active")');
    await queryRunner.query(`CREATE TABLE "knowledge_chunks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "datasource_id" uuid NOT NULL, "knowledge_version_id" uuid NOT NULL, "knowledge_id" uuid NOT NULL, "content" text NOT NULL, "content_hash" char(64) NOT NULL, "embedding" vector, "embedding_model" varchar(255) NOT NULL, "embedding_dimensions" integer NOT NULL, "importance_score" smallint NOT NULL, "confidence_score" numeric(4,3) NOT NULL, "active" boolean NOT NULL DEFAULT false, "metadata" jsonb NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_knowledge_chunks" PRIMARY KEY ("id"), CONSTRAINT "UQ_knowledge_chunks_knowledge_hash" UNIQUE ("knowledge_id", "content_hash"), CONSTRAINT "FK_knowledge_chunks_organization" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE, CONSTRAINT "FK_knowledge_chunks_datasource" FOREIGN KEY ("datasource_id") REFERENCES "datasources"("id") ON DELETE CASCADE, CONSTRAINT "FK_knowledge_chunks_version" FOREIGN KEY ("knowledge_version_id") REFERENCES "datasource_knowledge_versions"("id") ON DELETE CASCADE, CONSTRAINT "FK_knowledge_chunks_knowledge" FOREIGN KEY ("knowledge_id") REFERENCES "database_knowledge"("id") ON DELETE CASCADE, CONSTRAINT "CHK_knowledge_chunks_importance" CHECK ("importance_score" BETWEEN 0 AND 100), CONSTRAINT "CHK_knowledge_chunks_confidence" CHECK ("confidence_score" >= 0 AND "confidence_score" <= 1), CONSTRAINT "CHK_knowledge_chunks_dimensions" CHECK ("embedding_dimensions" > 0))`);
    await queryRunner.query('CREATE INDEX "IDX_knowledge_chunks_organization_datasource_active" ON "knowledge_chunks" ("organization_id", "datasource_id", "active")');
    await queryRunner.query('CREATE INDEX "IDX_knowledge_chunks_reusable_embedding" ON "knowledge_chunks" ("organization_id", "datasource_id", "content_hash", "embedding_model")');
  }
}
