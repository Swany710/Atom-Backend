import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enable Row Level Security on the four tables the Supabase security advisor
 * flagged as fully exposed to the anon/authenticated PostgREST roles:
 * notes, invite_codes, organizations, integration_credentials.
 *
 * Why plain ENABLE (not FORCE) and no policies:
 *   - Atom's backend connects as the table OWNER (postgres). Table owners
 *     BYPASS RLS, so enabling it does NOT affect any backend query. FORCE
 *     would remove that bypass and lock the app out — do not use it here.
 *   - Atom does not use the Supabase Data API or Supabase Auth. With RLS
 *     enabled and no policy, the anon/authenticated roles get deny-all, which
 *     is exactly the intent: nothing reaches these tables except the backend.
 *
 * This mirrors the change applied directly to production on 2026-07-21; the
 * ALTERs are idempotent (ENABLE on an already-enabled table is a no-op).
 */
export class EnableRlsOnExposedTables1700000000010 implements MigrationInterface {
  name = 'EnableRlsOnExposedTables1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.notes                   ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE public.invite_codes            ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE public.organizations           ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE public.integration_credentials DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE public.organizations           DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE public.invite_codes            DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE public.notes                   DISABLE ROW LEVEL SECURITY`);
  }
}
