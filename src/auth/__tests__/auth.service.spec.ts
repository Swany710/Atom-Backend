import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { User } from '../../users/user.entity';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id:           'user-uuid-123',
    email:        'test@example.com',
    passwordHash: '$2a$12$hashedpassword',
    displayName:  'Test User',
    isVerified:   false,
    createdAt:    new Date(),
    updatedAt:    new Date(),
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let repo: ReturnType<typeof makeRepo>;
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    repo       = makeRepo();
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: JwtService,              useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new user and returns a token', async () => {
      const saved = makeUser();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);

      const result = await service.register('Test@Example.com', 'password123');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(repo.save).toHaveBeenCalled();
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.userId).toBe(saved.id);
      expect(result.email).toBe(saved.email);
    });

    it('lowercases the email before saving', async () => {
      const saved = makeUser({ email: 'upper@example.com' });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);

      await service.register('UPPER@EXAMPLE.COM', 'password123');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'upper@example.com' } });
    });

    it('hashes the password — never stores plaintext', async () => {
      const saved = makeUser();
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((data) => ({ ...saved, passwordHash: data.passwordHash }));
      repo.save.mockResolvedValue(saved);

      await service.register('test@example.com', 'mysecretpassword');

      const createCall = repo.create.mock.calls[0][0];
      expect(createCall.passwordHash).not.toBe('mysecretpassword');
      const isHashed = await bcrypt.compare('mysecretpassword', createCall.passwordHash);
      expect(isHashed).toBe(true);
    });

    it('throws ConflictException when email is already registered', async () => {
      repo.findOne.mockResolvedValue(makeUser());

      await expect(service.register('test@example.com', 'password123'))
        .rejects.toThrow(ConflictException);
    });

    it('includes an optional displayName when provided', async () => {
      const saved = makeUser({ displayName: 'Jane Doe' });
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);

      await service.register('test@example.com', 'password123', '  Jane Doe  ');

      const createCall = repo.create.mock.calls[0][0];
      expect(createCall.displayName).toBe('Jane Doe');
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns a token for valid credentials', async () => {
      const hash = await bcrypt.hash('correctpassword', 10);
      const user = makeUser({ passwordHash: hash });
      repo.findOne.mockResolvedValue(user);

      const result = await service.login('test@example.com', 'correctpassword');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.userId).toBe(user.id);
    });

    it('throws UnauthorizedException for unknown email', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.login('nobody@example.com', 'password'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correctpassword', 10);
      const user = makeUser({ passwordHash: hash });
      repo.findOne.mockResolvedValue(user);

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

      const result = await service.validateJwt({ sub: user.id, email: user.email });
      expect(result).toBe(user);
    });

    it('returns null when the user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.validateJwt({ sub: 'nonexistent', email: 'x@x.com' });
      expect(result).toBeNull();
    });
  });
});
