import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the dead first-generation schema tables. The app long ago moved to
 * `users` (auth), `chat_memory` (conversation history), `pending_actions`, and
 * `audit`/`tool_executions` was never wired up. Verified before dropping:
 *   - 0 rows in every one of these tables (production, 2026-07-21)
 *   - no code references anywhere in src/ (no entity, repository, or raw query)
 *   - their only foreign keys are AMONG themselves; nothing in the live schema
 *     references them, so dropping them cannot cascade into active tables.
 *
 * Dropped in dependency order (referencing tables first). IF EXISTS keeps this
 * idempotent and a harmless no-op on fresh databases that never had them.
 * down() cannot faithfully restore them (schema + data are gone and were
 * empty); recreating hollow tables would be misleading, so it is intentionally
 * a no-op.
 */
export class DropLegacyTables1700000000011 implements MigrationInterface {
  name = 'DropLegacyTables1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public.tool_executions`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.audio_turns`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.conversations`);
    await queryRunner.query(`DROP TABLE IF EXISTS public.app_users`);
  }

  public async down(): Promise<void> {
    // Intentionally irreversible: the dropped tables were empty and unused.
  }
}
