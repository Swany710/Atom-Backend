import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema migration.
 *
 * Creates the tables that TypeORM was previously managing via synchronize=true.
 * In production, synchronize is disabled and this migration runs on boot via
 * migrationsRun: true in the TypeORM config.
 *
 * Tables covered:
 *   - knowledge_base_entries
 *   - email_connections
 *   - chat_memory
 *
 * Timestamp prefix (1700000000000) is arbitrary — TypeORM orders migrations
 * by filename timestamp ascending.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── knowledge_base_entries ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "knowledge_base_entries" (
        "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
        "title"      VARCHAR(500) NOT NULL,
        "content"    TEXT        NOT NULL,
        "source"     VARCHAR(50)  NOT NULL DEFAULT 'manual',
        "category"   VARCHAR(100),
        "fileName"   VARCHAR(255),
        "embedding"  TEXT,
        "isActive"   BOOLEAN     NOT NULL DEFAULT true,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_base_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_knowledge_base_entries_title"
      ON "knowledge_base_entries" ("title")
    `);

    // ── email_connections ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_connections" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "userId"       VARCHAR     NOT NULL,
        "provider"     VARCHAR     NOT NULL,
        "emailAddress" VARCHAR,
        "accessToken"  TEXT        NOT NULL,
        "refreshToken" TEXT,
        "expiresAt"    TIMESTAMPTZ,
        "scope"        TEXT,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_email_connections_userId_provider" UNIQUE ("userId", "provider")
      )
    `);

    // ── chat_memory ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_memory" (
        "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
        "sessionId"  VARCHAR     NOT NULL,
        "role"       VARCHAR     NOT NULL,
        "content"    TEXT        NOT NULL,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_memory" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_memory_sessionId"
      ON "chat_memory" ("sessionId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_memory"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_connections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_base_entries"`);
  }
}
