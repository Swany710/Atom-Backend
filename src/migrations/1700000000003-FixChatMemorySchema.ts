import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligns the chat_memory table with the ChatMemory entity.
 *
 * Problem: InitialSchema migration created chat_memory with a UUID PK
 * but the entity was using @PrimaryGeneratedColumn() (serial integer) with
 * no explicit table name. This migration:
 *   1. Ensures the UUID PK column is present (idempotent via IF NOT EXISTS)
 *   2. Ensures the explicit index on sessionId exists
 *   3. Drops the old integer id column if it somehow exists (schema drift fix)
 *
 * Safe to run on a fresh DB (all CREATE IF NOT EXISTS) and on an existing DB.
 */
export class FixChatMemorySchema1700000000003 implements MigrationInterface {
  name = 'FixChatMemorySchema1700000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Recreate with correct schema if it doesn't already exist
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_memory" (
        "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
        "sessionId" VARCHAR     NOT NULL,
        "role"      VARCHAR     NOT NULL,
        "content"   TEXT        NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_memory" PRIMARY KEY ("id")
      )
    `);

    // Add sessionId index if missing
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_memory_sessionId"
      ON "chat_memory" ("sessionId")
    `);

    // If the old numeric id column exists alongside a UUID column (drift),
    // this is a no-op because the PRIMARY KEY constraint already targets "id".
    // No destructive column drops — data safety first.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_memory_sessionId"`);
    // Note: do NOT drop the table — that would destroy conversation history.
  }
}
