import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SecureMysqlDatasources1788393600000 implements MigrationInterface {
  name = 'SecureMysqlDatasources1788393600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "datasource_type" AS ENUM ('MYSQL')`);
    await queryRunner.query(
      `CREATE TYPE "datasource_connection_mode" AS ENUM ('DIRECT', 'SSH_TUNNEL', 'PRIVATE_CONNECTOR', 'VPN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "datasource_status" AS ENUM ('ACTIVE', 'CONNECTION_FAILED', 'DISABLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "ssh_authentication_type" AS ENUM ('PRIVATE_KEY', 'PASSWORD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "datasource_secret_type" AS ENUM ('DATABASE_PASSWORD', 'SSH_PASSWORD', 'SSH_PRIVATE_KEY', 'SSH_PRIVATE_KEY_PASSPHRASE')`,
    );
    await queryRunner.query(`
      CREATE TABLE "datasources" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "database_type" "datasource_type" NOT NULL,
        "connection_mode" "datasource_connection_mode" NOT NULL,
        "host" varchar(253) NOT NULL,
        "port" integer NOT NULL,
        "database_name" varchar(128) NOT NULL,
        "username" varchar(128) NOT NULL,
        "ssl_enabled" boolean NOT NULL DEFAULT false,
        "status" "datasource_status" NOT NULL,
        "last_connected_at" timestamptz,
        "last_connection_error_code" varchar(80),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_datasources_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_datasources_port" CHECK ("port" BETWEEN 1 AND 65535),
        CONSTRAINT "FK_datasources_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_datasources_organization_id" ON "datasources" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_datasources_organization_name" ON "datasources" ("organization_id", "name")`,
    );
    await queryRunner.query(`
      CREATE TABLE "datasource_ssh_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "datasource_id" uuid NOT NULL,
        "ssh_host" varchar(253) NOT NULL,
        "ssh_port" integer NOT NULL DEFAULT 22,
        "ssh_username" varchar(128) NOT NULL,
        "authentication_type" "ssh_authentication_type" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_datasource_ssh_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_datasource_ssh_configs_port" CHECK ("ssh_port" BETWEEN 1 AND 65535),
        CONSTRAINT "FK_datasource_ssh_configs_datasource" FOREIGN KEY ("datasource_id")
          REFERENCES "datasources"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_datasource_ssh_configs_datasource_id" ON "datasource_ssh_configs" ("datasource_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "datasource_secrets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "datasource_id" uuid NOT NULL,
        "type" "datasource_secret_type" NOT NULL,
        "encrypted_value" text NOT NULL,
        "iv" varchar(24) NOT NULL,
        "auth_tag" varchar(24) NOT NULL,
        "encryption_version" smallint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_datasource_secrets_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_datasource_secrets_encryption_version" CHECK ("encryption_version" > 0),
        CONSTRAINT "FK_datasource_secrets_datasource" FOREIGN KEY ("datasource_id")
          REFERENCES "datasources"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_datasource_secrets_datasource_id" ON "datasource_secrets" ("datasource_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_datasource_secrets_datasource_type" ON "datasource_secrets" ("datasource_id", "type")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "datasource_secrets"');
    await queryRunner.query('DROP TABLE "datasource_ssh_configs"');
    await queryRunner.query('DROP TABLE "datasources"');
    await queryRunner.query('DROP TYPE "datasource_secret_type"');
    await queryRunner.query('DROP TYPE "ssh_authentication_type"');
    await queryRunner.query('DROP TYPE "datasource_status"');
    await queryRunner.query('DROP TYPE "datasource_connection_mode"');
    await queryRunner.query('DROP TYPE "datasource_type"');
  }
}
