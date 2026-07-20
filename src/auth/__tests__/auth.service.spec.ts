import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { User } from '../../users/user.entity';
import { Organization } from '../../organizations/organization.entity';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id:           'user-uuid-123',
    email:        'test@example.com',
    passwordHash: '$2a$12$hashedpassword',
    displayName:  'Test User',
    isVerified:   false,
    orgId:        'org-uuid-456',
    role:         'owner',
    createdAt:    new Date(),
    updatedAt:    new Date(),
    ...overrides,
  });
}

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return Object.assign(new Organization(), {
    id:       'org-uuid-456',
    name:     'Test Co',
    slug:     'test-co-abc123',
    plan:     'beta',
    isActive: true,
    ...overrides,
  });
}

function makeRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findOne:  jest.fn(),
    create:   jest.fn(),
    save:     jest.fn(),
    ...overrides,
  };
}

/**
 * Transaction mock: invokes the callback with a manager whose create/save/
 * findOne route by entity class (User vs Organization).
 */
function makeDataSource(managerBehavior: {
  savedUser: User;
  savedOrg?: Organization;
  joinOrg?: Organization | null;
}) {
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any) =>
      Promise.resolve(entity === Organization ? managerBehavior.joinOrg ?? null : null),
    ),
    create: jest.fn().mockImplementation((entity: any, data: any) => data),
    save: jest.fn().mockImplementation((data: any) =>
      Promise.resolve(
        data?.slug !== undefined
          ? managerBehavior.savedOrg ?? makeOrg()
          : Object.assign(makeUser(), data, { id: managerBehavior.savedUser.id }),
      ),
    ),
  };
  return {
    manager,
    transaction: jest.fn().mockImplementation(async (fn: any) => fn(manager)),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let repo: ReturnType<typeof makeRepo>;
  let orgRepo: ReturnType<typeof makeRepo>;
  let jwtService: { sign: jest.Mock };
  let dataSource: ReturnType<typeof makeDataSource>;

  async function build(ds = makeDataSource({ savedUser: makeUser() })) {
    dataSource = ds;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User),         useValue: repo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: JwtService,                       useValue: jwtService },
        { provide: DataSource,                       useValue: dataSource },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  }

  beforeEach(async () => {
    repo       = makeRepo();
    orgRepo    = makeRepo();
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    await build();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new user + org and returns a token', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.register({
        email: 'Test@Example.com',
        password: 'password123',
        companyName: 'Test Co',
      });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.orgId).toBeTruthy();
      expect(result.role).toBe('owner');
    });

    it('registers into an existing org as member for org-bound invites', async () => {
      repo.findOne.mockResolvedValue(null);
      await build(makeDataSource({
        savedUser: makeUser({ role: 'member' }),
        joinOrg: makeOrg(),
      }));

      const result = await service.register({
        email: 'member@example.com',
        password: 'password123',
        joinOrgId: 'org-uuid-456',
      });

      // no new org saved — user joined the existing one
      const userSave = dataSource.manager.create.mock.calls.find(
        c => c[0] === User,
      );
      expect(userSave?.[1]?.role).toBe('member');
      expect(userSave?.[1]?.orgId).toBe('org-uuid-456');
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('rejects org-bound invites whose org no longer exists', async () => {
      repo.findOne.mockResolvedValue(null);
      await build(makeDataSource({ savedUser: makeUser(), joinOrg: null }));

      await expect(
        service.register({
          email: 'member@example.com',
          password: 'password123',
          joinOrgId: 'gone-org',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('hashes the password — never stores plaintext', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.register({ email: 'test@example.com', password: 'mysecretpassword' });

      const userCreate = dataSource.manager.create.mock.calls.find(c => c[0] === User);
      const passwordHash = userCreate?.[1]?.passwordHash;
      expect(passwordHash).not.toBe('mysecretpassword');
      expect(await bcrypt.compare('mysecretpassword', passwordHash)).toBe(true);
    });

    it('throws ConflictException when email is already registered', async () => {
      repo.findOne.mockResolvedValue(makeUser());

      await expect(
        service.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns a token (with org + role) for valid credentials', async () => {
      const hash = await bcrypt.hash('correctpassword', 10);
      const user = makeUser({ passwordHash: hash });
      repo.findOne.mockResolvedValue(user);

      const result = await service.login('test@example.com', 'correctpassword');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.userId).toBe(user.id);
      expect(result.orgId).toBe(user.orgId);
      expect(result.role).toBe(user.role);
      // JWT payload must carry org + role (tenancy)
      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.org).toBe(user.orgId);
      expect(payload.role).toBe(user.role);
    });

    it('rejects users with no org (pre-backfill accounts)', async () => {
      const hash = await bcrypt.hash('password', 10);
      repo.findOne.mockResolvedValue(makeUser({ passwordHash: hash, orgId: undefined }));

      await expect(service.login('test@example.com', 'password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.login('nobody@example.com', 'password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correctpassword', 10);
      repo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));

      await expect(service.login('test@example.com', 'wrongpassword'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('uses the same error message for both wrong email and wrong password (no enumeration)', async () => {
      repo.findOne.mockResolvedValue(null);
      let err1: Error | null = null;
      try { await service.login('nobody@example.com', 'x'); } catch (e: any) { err1 = e; }

      const hash = await bcrypt.hash('correct', 10);
      repo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));
      let err2: Error | null = null;
      try { await service.login('test@example.com', 'wrong'); } catch (e: any) { err2 = e; }

      expect(err1?.message).toBe(err2?.message);
    });

    it('lowercases email on login too', async () => {
      const hash = await bcrypt.hash('password', 10);
      repo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));

      await service.login('TEST@EXAMPLE.COM', 'password');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });
  });

  // ── validateJwt ───────────────────────────────────────────────────────────

  describe('validateJwt', () => {
    it('returns the user when the payload sub matches', async () => {
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);

      const result = await service.validateJwt({
        sub: user.id, email: user.email, org: user.orgId!, role: user.role,
      });
      expect(result).toBe(user);
    });

    it('returns null when the user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.validateJwt({
        sub: 'nonexistent', email: 'x@x.com', org: 'o', role: 'member',
      });
      expect(result).toBeNull();
    });
  });
});
