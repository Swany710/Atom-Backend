import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: TightenOrganizations (tenancy step 3 of 3 — CONSTRAINTS)
 *
 * See TENANCY-DESIGN.md §5.3. Runs ONLY after 008 backfill is verified.
 *
 * 1. Aborts loudly if any user-owned row still has NULL orgId (backfill gap).
 * 2. users.orgId → NOT NULL.
 * 3. User-owned tables: orgId → NOT NULL + FK to organizations.
 * 4. Converts bare varchar userId columns to real uuid FKs
 *    (REFERENCES users(id) ON DELETE CASCADE).
 *
 * Deliberately NOT tightened:
 *  - knowledge_base_entries.orgId stays NULLABLE (NULL = shared spec library);
 *    gains FK only.
 *  - chat_memory.userId/orgId stay NULLABLE (orphan sessions are preserved);
 *    gain FKs only (NULLs pass FK checks).
 */
export class TightenOrganizations1700000000009 implements MigrationInterface {
  name = 'TightenOrganizations1700000000009';

  private static readonly USER_OWNED = [
    'email_connections',
    'pending_actions',
    'scheduled_tasks',
    'user_memory',
    'notes',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Preflight: refuse to tighten over a bad backfill ───────────────
    for (const table of ['users', ...TightenOrganizations1700000000009.USER_OWNED]) {
      const rows: Array<{ count: string }> = await queryRunner.query(
        `SELECT COUNT(*)::text AS count FROM "${table}" WHERE "orgId" IS NULL`,
      );
      if (parseInt(rows[0].count, 10) > 0) {
        throw new Error(
          `[TightenOrganizations] ${table} has ${rows[0].count} rows with NULL orgId — ` +
            `run/verify migration 008 backfill first. Aborting (nothing changed).`,
        );
      }
    }

    // ── 2. users.orgId NOT NULL ───────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "orgId" SET NOT NULL`,
    );

    // ── 3. User-owned tables: NOT NULL + org FK + userId varchar→uuid FK ──
    for (const table of TightenOrganizations1700000000009.USER_OWNED) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "orgId" SET NOT NULL`,
      );
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "${table}"
            ADD CONSTRAINT "FK_${table}_org"
            FOREIGN KEY ("orgId") REFERENCES "organizations"("id");
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);

      // userId: varchar → uuid, then FK. USING cast aborts loudly on garbage.
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "${table}"
            ADD CONSTRAINT "FK_${table}_user"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    }

    // ── 4. FKs only (columns stay nullable) ───────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "chat_memory"
          ADD CONSTRAINT "FK_chat_memory_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "chat_memory"
          ADD CONSTRAINT "FK_chat_memory_org"
          FOREIGN KEY ("orgId") REFERENCES "organizations"("id");
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "knowledge_base_entries"
          ADD CONSTRAINT "FK_knowledge_base_entries_org"
          FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_base_entries" DROP CONSTRAINT IF EXISTS "FK_knowledge_base_entries_org"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_memory" DROP CONSTRAINT IF EXISTS "FK_chat_memory_org"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_memory" DROP CONSTRAINT IF EXISTS "FK_chat_memory_user"`,
    );
    for (const table of TightenOrganizations1700000000009.USER_OWNED) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_user"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "userId" TYPE varchar USING "userId"::text`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_org"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "orgId" DROP NOT NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "orgId" DROP NOT NULL`,
    );
  }
}
