import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';

export interface JwtPayload {
  sub: string;   // user UUID
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  userId: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new beta user.
   * Returns a JWT immediately so the caller is logged-in right away.
   */
  async register(email: string, password: string, displayName?: string): Promise<AuthTokens> {
    const existing = await this.userRepo.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    const user = this.userRepo.create({
      email:        email.toLowerCase(),
      passwordHash,
      displayName:  displayName?.trim() || undefined,
      isVerified:   false,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`New beta user registered: ${saved.id}`);

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
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, userId: user.id, email: user.email };
  }
}
