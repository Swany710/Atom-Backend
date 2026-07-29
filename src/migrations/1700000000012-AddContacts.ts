import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddContacts
 *
 * `contacts` — Atom's own address book, separate from AccuLynx contacts.
 *
 * AccuLynx contacts belong to jobs and are governed by the CRM access policy.
 * These are the operator's own people — suppliers, subs, adjusters, referrals —
 * and are org-scoped so the whole company sees one shared book.
 *
 * Phone and address are free text on purpose. AccuLynx demands exactly ten
 * digits for a phone and internal numeric IDs for state/country; that is fine
 * for a CRM record but hostile to "just save this number". Normalisation
 * happens on the way out to AccuLynx, not on the way in here.
 *
 * `source` / `externalId` record where an entry came from, so a repeat import
 * from Gmail or Outlook recognises its own earlier work instead of duplicating.
 */
export class AddContacts1700000000012 implements MigrationInterface {
  name = 'AddContacts1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      VARCHAR     NOT NULL,
        "orgId"       UUID,
        "firstName"   VARCHAR(120),
        "lastName"    VARCHAR(120),
        "companyName" VARCHAR(200),
        "title"       VARCHAR(120),
        "email"       VARCHAR(320),
        "phone"       VARCHAR(60),
        "street1"     VARCHAR(200),
        "street2"     VARCHAR(200),
        "city"        VARCHAR(120),
        "state"       VARCHAR(60),
        "zip"         VARCHAR(20),
        "notes"       TEXT,
        "source"      VARCHAR(20)  NOT NULL DEFAULT 'manual',
        "externalId"  VARCHAR(200),
        "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contacts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_org_lastname"
      ON "contacts" ("orgId", "lastName")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_user_created"
      ON "contacts" ("userId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_org"
      ON "contacts" ("orgId")
    `);
    // Duplicate detection queries by externalId on every import.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_contacts_external"
      ON "contacts" ("externalId")
    `);

    // Consistent with migration 010: RLS on, so a direct/pooled connection
    // cannot read across tenants even if application scoping were bypassed.
    await queryRunner.query(`ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_external"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_org_lastname"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
  }
}
