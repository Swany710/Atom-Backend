import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: BackfillOrganizations (tenancy step 2 of 3 — DATA ONLY)
 *
 * See TENANCY-DESIGN.md §5.2.
 *
 * 1. Creates one organization per existing user that has no org yet
 *    (name = displayName || email, slug = email local part + user id prefix,
 *    user becomes 'owner' of their own org).
 * 2. Stamps orgId onto all user-owned rows:
 *    email_connections, pending_actions, scheduled_tasks, user_memory, notes.
 * 3. chat_memory: backfills userId from session ownership — sessionIds are
 *    either exactly the user's UUID or prefixed with it (see
 *    voice.controller assertSessionOwnership) — then stamps orgId.
 *    Orphan rows (no matching user) are LEFT ALONE and logged, not deleted.
 *
 * Idempotent: every statement only touches rows where the target is NULL.
 * Reversible only in the sense that columns stay nullable until migration 009;
 * down() intentionally does NOT delete created orgs (data-loss risk).
 */
export class BackfillOrganizations1700000000008 implements MigrationInterface {
  name = 'BackfillOrganizations1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. One org per orphan user, user becomes owner ────────────────────
    const users: Array<{ id: string; email: string; displayName: string | null }> =
      await queryRunner.query(
        `SELECT "id", "email", "displayName" FROM "users" WHERE "orgId" IS NULL`,
      );

    for (const u of users) {
      const name = (u.displayName ?? '').trim() || u.email;
      // slug: url-safe email local part + user-id prefix for uniqueness
      const local = u.email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      const slug = `${local || 'org'}-${u.id.slice(0, 8)}`;

      const inserted: Array<{ id: string }> = await queryRunner.query(
        `INSERT INTO "organizations" ("name", "slug")
         VALUES ($1, $2)
         ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name"
         RETURNING "id"`,
        [name, slug],
      );
      await queryRunner.query(
        `UPDATE "users" SET "orgId" = $1, "role" = 'owner' WHERE "id" = $2`,
        [inserted[0].id, u.id],
      );
    }

    // ── 2. Stamp orgId on user-owned tables ───────────────────────────────
    for (const table of [
      'email_connections',
      'pending_actions',
      'scheduled_tasks',
      'user_memory',
      'notes',
    ]) {
      await queryRunner.query(`
        UPDATE "${table}" t
        SET "orgId" = u."orgId"
        FROM "users" u
        WHERE t."orgId" IS NULL
          AND t."userId" = u."id"::text
      `);
    }

    // ── 3. chat_memory: userId from sessionId prefix, then orgId ──────────
    await queryRunner.query(`
      UPDATE "chat_memory" cm
      SET "userId" = u."id", "orgId" = u."orgId"
      FROM "users" u
      WHERE cm."userId" IS NULL
        AND left(cm."sessionId", 36) = u."id"::text
    `);

    // Orphans: flag, don't delete
    const orphans: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*)::text AS count FROM "chat_memory" WHERE "userId" IS NULL`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[BackfillOrganizations] chat_memory orphan rows (no owning user): ${orphans[0].count} — left in place with NULL userId/orgId`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Un-stamp only; do NOT drop organizations (would destroy tenant data).
    await queryRunner.query(`UPDATE "chat_memory" SET "userId" = NULL, "orgId" = NULL`);
    for (const table of [
      'notes',
      'user_memory',
      'scheduled_tasks',
      'pending_actions',
      'email_connections',
    ]) {
      await queryRunner.query(`UPDATE "${table}" SET "orgId" = NULL`);
    }
    await queryRunner.query(`UPDATE "users" SET "orgId" = NULL WHERE "role" = 'owner'`);
  }
}
