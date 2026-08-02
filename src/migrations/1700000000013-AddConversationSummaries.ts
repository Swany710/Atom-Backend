import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddConversationSummaries
 *
 * Removes the 40-message history cliff.
 *
 * ConversationMemoryService loads only the newest HISTORY_LIMIT rows per turn.
 * Everything older used to be dropped outright — Atom would forget the job it
 * had been discussing for the last twenty minutes, mid-project, with nothing to
 * tell the user it had stopped remembering rather than stopped understanding.
 *
 * This table holds one rolling summary per session covering every message that
 * has scrolled out of that window. ConversationSummarizerService rewrites it on
 * each rollover (rather than appending) so it stays bounded however long the
 * session runs, and loadHistory() prepends it to every request.
 *
 * `coveredThrough` is the createdAt of the newest chat_memory row already folded
 * in, which is what makes consecutive rolls neither double-count nor skip.
 */
export class AddConversationSummaries1700000000013 implements MigrationInterface {
  name = 'AddConversationSummaries1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_summaries" (
        "id"             UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "sessionId"      VARCHAR     NOT NULL,
        "userId"         UUID,
        "orgId"          UUID,
        "summary"        TEXT        NOT NULL,
        "coveredThrough" TIMESTAMPTZ NOT NULL,
        "messageCount"   INTEGER     NOT NULL DEFAULT 0,
        "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_summaries" PRIMARY KEY ("id")
      )
    `);

    // One summary per session — the summarizer upserts on this.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_conversation_summaries_session"
      ON "conversation_summaries" ("sessionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conversation_summaries_org"
      ON "conversation_summaries" ("orgId")
    `);

    // Consistent with migration 010: a direct or pooled connection must not be
    // able to read across tenants even if application scoping were bypassed.
    await queryRunner.query(
      `ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_summaries_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_summaries_session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_summaries"`);
  }
}
