import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DatasourceSpecAnalysisReport1788560000000 implements MigrationInterface {
  name = 'DatasourceSpecAnalysisReport1788560000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "datasource_spec_analyses" ADD "match_score" smallint',
    );
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" ADD "report" jsonb');
    await queryRunner.query(`
      ALTER TABLE "datasource_spec_analyses"
      ADD CONSTRAINT "CHK_datasource_spec_analyses_match_score"
      CHECK ("match_score" IS NULL OR ("match_score" >= 0 AND "match_score" <= 100))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "datasource_spec_analyses" DROP CONSTRAINT "CHK_datasource_spec_analyses_match_score"',
    );
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP COLUMN "report"');
    await queryRunner.query('ALTER TABLE "datasource_spec_analyses" DROP COLUMN "match_score"');
  }
}
