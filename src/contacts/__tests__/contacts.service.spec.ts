/**
 * ContactsService — validation and duplicate-detection tests.
 *
 * The duplicate check is the part that earns its keep. "Add my contacts from
 * Gmail" is a repeatable action, and without it the address book fills with
 * near-identical rows the second time someone runs it. These tests pin the
 * matching rules so that behaviour can't quietly regress.
 */

import { ContactsService } from '../contacts.service';

// ── Test doubles ────────────────────────────────────────────────────────────

/**
 * Query-builder double. findDuplicate() builds its predicate through the
 * builder API, so rather than re-implement SQL we record what was asked for
 * and let the test decide what the DB "found".
 */
function makeQueryBuilder(result: any = null) {
  const qb: any = {
    _wheres: [] as string[],
    where(w: any)      { qb._wheres.push(String(w)); return qb; },
    andWhere(w: any)   { qb._wheres.push(String(w)); return qb; },
    orWhere(w: any)    { qb._wheres.push(String(w)); return qb; },
    orderBy()          { return qb; },
    addOrderBy()       { return qb; },
    take()             { return qb; },
    getOne:            jest.fn().mockResolvedValue(result),
    getManyAndCount:   jest.fn().mockResolvedValue([[], 0]),
  };
  return qb;
}

function makeService(over: { existing?: any; qb?: any } = {}) {
  const saved: any[] = [];
  const qb = over.qb ?? makeQueryBuilder(over.existing ?? null);

  const repo: any = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((d: any) => ({ ...d })),
    save:   jest.fn(async (d: any) => {
      const row = {
        id: 'contact-1',
        ...d,
        createdAt: new Date(),
        updatedAt: new Date(),
        get displayName() {
          const n = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
          return n || this.companyName || 'Unnamed contact';
        },
      };
      saved.push(row);
      return row;
    }),
    findOne: jest.fn(),
    update:  jest.fn(),
    delete:  jest.fn(),
  };

  const orgResolver   = { orgIdForUser: jest.fn().mockResolvedValue('org-1') } as any;
  const tenantContext = { get: jest.fn(() => ({ orgId: 'org-1', userId: 'user-1' })) } as any;

  const svc = new ContactsService(repo, orgResolver, tenantContext);
  return { svc, repo, qb, saved };
}

const USER = 'user-1';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ContactsService', () => {

  describe('create — validation', () => {

    it('refuses a contact with no name and no company', async () => {
      const { svc, repo } = makeService();

      const res = await svc.create(USER, { email: 'nobody@example.com' });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/first name, last name, or company/i);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('accepts a company-only contact (suppliers often have no person)', async () => {
      const { svc } = makeService();

      const res = await svc.create(USER, { companyName: 'ABC Supply' });

      expect(res.success).toBe(true);
      expect(res.contact?.companyName).toBe('ABC Supply');
    });

    it('rejects a malformed email rather than storing junk', async () => {
      const { svc, repo } = makeService();

      const res = await svc.create(USER, { firstName: 'Jane', email: 'not-an-email' });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/does not look like an email/i);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('stores the phone exactly as given — no reformatting', async () => {
      const { svc, saved } = makeService();

      await svc.create(USER, { firstName: 'Jane', phone: '(555) 123-4567' });

      // AccuLynx wants 10 bare digits; the address book does not. Normalising
      // on the way IN would lose the formatting the user chose.
      expect(saved[0].phone).toBe('(555) 123-4567');
    });

    it('trims whitespace and drops empty strings', async () => {
      const { svc, saved } = makeService();

      await svc.create(USER, { firstName: '  Jane  ', lastName: '   ', city: ' Peoria ' });

      expect(saved[0].firstName).toBe('Jane');
      expect(saved[0].lastName).toBeUndefined();
      expect(saved[0].city).toBe('Peoria');
    });

    it('defaults source to manual and stamps the org', async () => {
      const { svc, saved } = makeService();

      await svc.create(USER, { firstName: 'Jane' });

      expect(saved[0].source).toBe('manual');
      expect(saved[0].orgId).toBe('org-1');
      expect(saved[0].userId).toBe(USER);
    });

    it('preserves provenance when importing from a mailbox', async () => {
      const { svc, saved } = makeService();

      await svc.create(USER, {
        firstName: 'Jim', source: 'google', externalId: 'people/c123',
      });

      expect(saved[0].source).toBe('google');
      expect(saved[0].externalId).toBe('people/c123');
    });
  });

  describe('create — duplicate detection', () => {

    it('refuses when the person already exists, and says who', async () => {
      const existing = {
        id: 'existing-1', firstName: 'Jane', lastName: 'Smith',
        email: 'jane@example.com',
        get displayName() { return 'Jane Smith'; },
      };
      const { svc, repo } = makeService({ existing });

      const res = await svc.create(USER, { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already in your contacts/i);
      expect(res.duplicateOf?.id).toBe('existing-1');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('adds anyway when the user explicitly said so', async () => {
      const existing = { id: 'existing-1', get displayName() { return 'Jane Smith'; } };
      const { svc, repo } = makeService({ existing });

      const res = await svc.create(
        USER,
        { firstName: 'Jane', lastName: 'Smith' },
        { allowDuplicate: true },
      );

      expect(res.success).toBe(true);
      expect(repo.save).toHaveBeenCalled();
    });

    it('matches on externalId, email, phone digits, and full name', async () => {
      const { svc, qb } = makeService();

      await svc.create(USER, {
        firstName: 'Jane', lastName: 'Smith',
        email: 'jane@example.com', phone: '(555) 123-4567',
        externalId: 'people/c1',
      });

      const predicate = qb._wheres.join(' ');
      expect(predicate).toMatch(/externalId/);
      expect(predicate).toMatch(/email/i);
      expect(predicate).toMatch(/phone/i);
      expect(predicate).toMatch(/firstName/i);
    });

    it('does not treat a bare first name as identifying', async () => {
      // Two different Jims must not collide just because they share a first name.
      const { svc, qb } = makeService();

      await svc.create(USER, { firstName: 'Jim' });

      // The name branch requires BOTH first and last.
      const predicate = qb._wheres.join(' ');
      expect(predicate).toMatch(/1 = 0/);
    });
  });

  describe('update', () => {

    it('cannot rewrite provenance', async () => {
      const { svc, repo } = makeService();
      repo.findOne.mockResolvedValue({
        id: 'c1', orgId: 'org-1', userId: USER,
        get displayName() { return 'Jane'; },
      });

      await svc.update(USER, 'c1', { firstName: 'Janet', source: 'google', externalId: 'x' } as any);

      const [, patch] = repo.update.mock.calls[0];
      expect(patch.firstName).toBe('Janet');
      expect(patch.source).toBeUndefined();
      expect(patch.externalId).toBeUndefined();
    });

    it('refuses to touch a contact belonging to another org', async () => {
      const { svc, repo } = makeService();
      repo.findOne.mockResolvedValue({ id: 'c1', orgId: 'someone-else', userId: 'other' });

      const res = await svc.update(USER, 'c1', { firstName: 'Nope' });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('get / remove — tenant isolation', () => {

    it('will not return another org\'s contact', async () => {
      const { svc, repo } = makeService();
      repo.findOne.mockResolvedValue({ id: 'c1', orgId: 'other-org', userId: 'other' });

      const res = await svc.get(USER, 'c1');

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it('will not delete another org\'s contact', async () => {
      const { svc, repo } = makeService();
      repo.findOne.mockResolvedValue({ id: 'c1', orgId: 'other-org', userId: 'other' });

      const res = await svc.remove(USER, 'c1');

      expect(res.success).toBe(false);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
