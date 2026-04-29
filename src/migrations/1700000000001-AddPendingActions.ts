import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the pending_actions table required by PendingActionService.
 *
 * This table was missing from the initial migration, causing every write tool
 * call (send_email, create_calendar_event, etc.) to throw a "relation
 * pending_actions does not exist" error in production.
 *
 * Each write action creates a row here before touching any external provider.
 * The row is atomically claimed+confirmed once the user approves the action.
 */
export class AddPendingActions1700000000001 implements MigrationInterface {
  name = 'AddPendingActions1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_actions" (
        "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
        "userId"        VARCHAR       NOT NULL,
        "toolName"      VARCHAR       NOT NULL,
        "args"          JSONB         NOT NULL DEFAULT '{}',
        "summary"       TEXT          NOT NULL,
        "status"        VARCHAR       NOT NULL DEFAULT 'pending',
        "sessionId"     VARCHAR,
        "correlationId" VARCHAR,
        "resultSummary" TEXT,
        "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "expiresAt"     TIMESTAMPTZ   NOT NULL,
        CONSTRAINT "PK_pending_actions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pending_actions_userId_status"
      ON "pending_actions" ("userId", "status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pending_actions_userId_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_actions"`);
  }
}
