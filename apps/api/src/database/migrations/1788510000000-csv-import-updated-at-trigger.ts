import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvImportUpdatedAtTrigger1788510000000 implements MigrationInterface {
  name = 'CsvImportUpdatedAtTrigger1788510000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS trigger AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION IF EXISTS set_updated_at() CASCADE');
  }
}
