import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the user_memory table for layered long-term assistant memory.
 *
 * Three layers stored in one table (discriminated by 'layer' column):
 *   profile  — stable user facts, injected into every prompt
 *   episodic — recent notable events, TTL ~90 days
 *   task     — active in-flight tasks, cleared when resolved
 */
export class AddUserMemory1700000000004 implements MigrationInterface {
  name = 'AddUserMemory1700000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_memory" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "userId"      VARCHAR       NOT NULL,
        "layer"       VARCHAR(20)   NOT NULL,
        "key"         VARCHAR(200)  NOT NULL,
        "value"       TEXT          NOT NULL,
        "tags"        TEXT,
        "importance"  INTEGER       NOT NULL DEFAULT 5,
        "expiresAt"   TIMESTAMPTZ,
        "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_memory" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_memory_user_layer_key" UNIQUE ("userId", "layer", "key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_memory_userId_layer"
      ON "user_memory" ("userId", "layer")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_memory"`);
  }
}
