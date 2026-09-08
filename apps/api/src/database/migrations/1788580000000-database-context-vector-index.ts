import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DatabaseContextVectorIndex1788580000000 implements MigrationInterface {
  name = 'DatabaseContextVectorIndex1788580000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_knowledge_chunks_context_scope" ON "knowledge_chunks" ("organization_id", "datasource_id", "knowledge_version_id") WHERE "active" = true AND "embedding" IS NOT NULL',
    );
    // ponytail: embedding dimensions vary by configured model; add a per-dimension expression HNSW index only once dimensions are a persisted invariant.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_knowledge_chunks_context_scope"');
  }
}
