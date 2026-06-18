import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddScheduledTasks
 *
 * Creates the `scheduled_tasks` table used by ScheduledTaskService to store
 * future actions (e.g. "send a reminder email to John Smith at 3pm Friday").
 */
export class AddScheduledTasks1700000000005 implements MigrationInterface {
  name = 'AddScheduledTasks1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scheduled_tasks" (
        "id"            UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"        VARCHAR           NOT NULL,
        "taskType"      VARCHAR           NOT NULL,
        "description"   TEXT              NOT NULL,
        "scheduledAt"   TIMESTAMPTZ       NOT NULL,
        "status"        VARCHAR           NOT NULL DEFAULT 'pending',
        "args"          JSONB             NOT NULL DEFAULT '{}',
        "resultSummary" TEXT,
        "createdAt"     TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_scheduled_tasks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scheduled_tasks_user_status_at"
      ON "scheduled_tasks" ("userId", "status", "scheduledAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scheduled_tasks_user_status_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_tasks"`);
  }
}
