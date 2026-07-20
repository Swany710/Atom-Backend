import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

export interface JwtPayload {
  sub: string;    // user UUID
  email: string;
  org: string;    // org UUID (tenancy — tokens without it are rejected)
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  userId: string;
  email: string;
  orgId: string;
  role: UserRole;
}

export interface RegisterOptions {
  email: string;
  password: string;
  displayName?: string;
  /** Company name — used when creating a NEW org (ignored for org invites) */
  companyName?: string;
  /** When set (org-bound invite), user joins this org as 'member' */
  joinOrgId?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Register a new user.
   *
   * Two paths (TENANCY-DESIGN §3):
   *  - joinOrgId set (org-bound invite): user joins that org as 'member'.
   *  - otherwise: a NEW organization is created in the same transaction and
   *    the user becomes its 'owner'. Org name = companyName || displayName || email.
   */
  async register(opts: RegisterOptions): Promise<AuthTokens> {
    const email = opts.email.toLowerCase();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(opts.password, this.SALT_ROUNDS);

    const saved = await this.dataSource.transaction(async manager => {
      let orgId: string;
      let role: UserRole;

      if (opts.joinOrgId) {
        const org = await manager.findOne(Organization, {
          where: { id: opts.joinOrgId, isActive: true },
        });
        if (!org) {
          throw new UnauthorizedException('The organization for this invite no longer exists.');
        }
        orgId = org.id;
        role = 'member';
      } else {
        const name =
          opts.companyName?.trim() || opts.displayName?.trim() || email;
        const org = manager.create(Organization, {
          name,
          slug: this.slugify(name),
        });
        const savedOrg = await manager.save(org);
        orgId = savedOrg.id;
        role = 'owner';
      }

      const user = manager.create(User, {
        email,
        passwordHash,
        displayName: opts.displayName?.trim() || undefined,
        isVerified: false,
        orgId,
        role,
      });
      return manager.save(user);
    });

    this.logger.log(
      `New user registered: ${saved.id} (org ${saved.orgId}, role ${saved.role})`,
    );
    return this.issueTokens(saved);
  }

  /**
   * Authenticate an existing user.
   * Returns a JWT on success; throws UnauthorizedException on failure.
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.userRepo.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.orgId) {
      // Pre-backfill account that migration 008 somehow missed — loud failure
      // beats silently issuing an org-less (rejected) token.
      this.logger.error(`User ${user.id} has no orgId — run migration 008 backfill`);
      throw new UnauthorizedException(
        'Your account is not yet assigned to an organization. Contact support.',
      );
    }

    return this.issueTokens(user);
  }

  /**
   * Validate a JWT payload returned by the guard.
   * Returns the User or null (guard handles the rejection).
   */
  async validateJwt(payload: JwtPayload): Promise<User | null> {
    return this.userRepo.findOne({ where: { id: payload.sub } }) ?? null;
  }

  /** Sign a fresh access token for the given user */
  private issueTokens(user: User): AuthTokens {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      org: user.orgId!,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      userId: user.id,
      email: user.email,
      orgId: user.orgId!,
      role: user.role,
    };
  }

  /** URL-safe unique slug from an org name */
  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    // random suffix guarantees uniqueness without a lookup round-trip
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${base || 'org'}-${suffix}`;
  }
}
