import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the users table required by AuthService.
 *
 * This table was previously managed by TypeORM's synchronize=true in dev.
 * In production synchronize is disabled, so this migration ensures the
 * table exists with the correct schema before any auth operations run.
 */
export class AddUsersTable1700000000002 implements MigrationInterface {
  name = 'AddUsersTable1700000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
        "email"         VARCHAR(255)  NOT NULL,
        "password_hash" TEXT          NOT NULL,
        "displayName"   VARCHAR(100),
        "isVerified"    BOOLEAN       NOT NULL DEFAULT false,
        "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_email"
      ON "users" ("email")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
