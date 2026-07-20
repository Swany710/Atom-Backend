import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddOrganizations (tenancy step 1 of 3 — ADDITIVE ONLY)
 *
 * See TENANCY-DESIGN.md at repo root.
 *
 * 1. Creates `organizations` (the tenant boundary) and
 *    `integration_credentials` (per-org encrypted API keys, e.g. AccuLynx).
 * 2. Adds NULLABLE tenant columns to existing tables:
 *      users                  → orgId, role
 *      email_connections      → orgId
 *      pending_actions        → orgId
 *      scheduled_tasks        → orgId
 *      user_memory            → orgId
 *      notes                  → orgId
 *      chat_memory            → userId, orgId   (had NO owner column at all)
 *      knowledge_base_entries → orgId           (NULL = shared spec library,
 *                                                stays nullable forever)
 *
 * Everything is nullable so this deploys safely against live beta data.
 * Migration 008 backfills; migration 009 tightens (NOT NULL + FKs).
 */
export class AddOrganizations1700000000007 implements MigrationInterface {
  name = 'AddOrganizations1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── organizations ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"      VARCHAR(255) NOT NULL,
        "slug"      VARCHAR(100) NOT NULL,
        "plan"      VARCHAR(50)  NOT NULL DEFAULT 'beta',
        "isActive"  BOOLEAN      NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organizations_slug" UNIQUE ("slug")
      )
    `);

    // ── integration_credentials ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "integration_credentials" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "orgId"       UUID        NOT NULL,
        "provider"    VARCHAR(50) NOT NULL,
        "credentials" TEXT        NOT NULL,
        "isActive"    BOOLEAN     NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_integration_credentials" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_integration_credentials_org_provider" UNIQUE ("orgId", "provider"),
        CONSTRAINT "FK_integration_credentials_org"
          FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // ── users: orgId + role ───────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "orgId" UUID,
        ADD COLUMN IF NOT EXISTS "role"  VARCHAR(20) NOT NULL DEFAULT 'member'
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "users"
          ADD CONSTRAINT "FK_users_org"
          FOREIGN KEY ("orgId") REFERENCES "organizations"("id");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_orgId" ON "users" ("orgId")
    `);

    // ── orgId on user-owned tables (nullable until backfill) ──────────────
    for (const table of [
      'email_connections',
      'pending_actions',
      'scheduled_tasks',
      'user_memory',
      'notes',
    ]) {
      await queryRunner.query(`
        ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "orgId" UUID
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_orgId" ON "${table}" ("orgId")
      `);
    }

    // ── chat_memory: gains an owner for the first time ────────────────────
    await queryRunner.query(`
      ALTER TABLE "chat_memory"
        ADD COLUMN IF NOT EXISTS "userId" UUID,
        ADD COLUMN IF NOT EXISTS "orgId"  UUID
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_memory_org_user_session"
      ON "chat_memory" ("orgId", "userId", "sessionId")
    `);

    // ── knowledge_base_entries: NULL orgId = shared spec library ──────────
    await queryRunner.query(`
      ALTER TABLE "knowledge_base_entries" ADD COLUMN IF NOT EXISTS "orgId" UUID
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_knowledge_base_entries_orgId"
      ON "knowledge_base_entries" ("orgId")
    `);

    // ── invite_codes: org-bound invites (NULL = legacy admin code → new org)
    await queryRunner.query(`
      ALTER TABLE "invite_codes" ADD COLUMN IF NOT EXISTS "orgId" UUID
    `);

    // ── users: AccuLynx identity mapping (admin-set; see CRM-ACCESS-POLICY.md)
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "acculynxUserId" UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "acculynxUserId"`);
    await queryRunner.query(`ALTER TABLE "invite_codes" DROP COLUMN IF EXISTS "orgId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_base_entries_orgId"`);
    await queryRunner.query(`ALTER TABLE "knowledge_base_entries" DROP COLUMN IF EXISTS "orgId"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_memory_org_user_session"`);
    await queryRunner.query(`ALTER TABLE "chat_memory" DROP COLUMN IF EXISTS "orgId"`);
    await queryRunner.query(`ALTER TABLE "chat_memory" DROP COLUMN IF EXISTS "userId"`);

    for (const table of [
      'notes',
      'user_memory',
      'scheduled_tasks',
      'pending_actions',
      'email_connections',
    ]) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${table}_orgId"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "orgId"`);
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_orgId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_org"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "orgId"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "integration_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
