import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddNotesAndInviteCodes
 *
 * 1. `notes` — per-user quick notes, creatable from chat (create_note tool)
 *    or the frontend Notes section.
 * 2. `invite_codes` — single-use registration invite codes managed from the
 *    admin dashboard. Replaces the single shared REGISTRATION_INVITE_CODE
 *    env var (which remains as a master fallback).
 */
export class AddNotesAndInviteCodes1700000000006 implements MigrationInterface {
  name = 'AddNotesAndInviteCodes1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notes" (
        "id"        UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    VARCHAR     NOT NULL,
        "title"     VARCHAR(300),
        "content"   TEXT        NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notes_user_created"
      ON "notes" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invite_codes" (
        "id"           UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "code"         VARCHAR(64) NOT NULL,
        "label"        VARCHAR(200),
        "status"       VARCHAR(20) NOT NULL DEFAULT 'active',
        "usedByUserId" VARCHAR,
        "usedByEmail"  VARCHAR,
        "usedAt"       TIMESTAMPTZ,
        "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invite_codes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_invite_codes_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_invite_codes_status"
      ON "invite_codes" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invite_codes_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invite_codes"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notes_user_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notes"`);
  }
}
