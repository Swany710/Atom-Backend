import {
  Controller,
  Post,
  Body,
  BadRequestException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { Public } from '../decorators/public.decorator';

interface RegisterDto {
  email: string;
  password: string;
  displayName?: string;
  inviteCode?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

/** Constant-time compare (same rationale as ApiKeyGuard). */
function timingSafeEquals(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Auth endpoints — both are public (no API key required).
 *
 * POST /auth/register  — INVITE-ONLY: requires a valid inviteCode matching the
 *                        REGISTRATION_INVITE_CODE env var. If that env var is
 *                        unset, registration is disabled entirely (403). This
 *                        prevents strangers from self-registering and reaching
 *                        company-global tools (AccuLynx CRM, knowledge base).
 * POST /auth/login     — authenticate and receive an access token
 */
@Public()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account (invite-only)' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'password123', displayName: 'Jane', inviteCode: 'your-invite-code' } } })
  @ApiResponse({ status: 201, description: 'Account created — returns accessToken' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Registration disabled or invalid invite code' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(@Body() body: RegisterDto) {
    // ── Invite gate ──────────────────────────────────────────────────────
    const inviteCode = process.env.REGISTRATION_INVITE_CODE;
    if (!inviteCode) {
      throw new ForbiddenException('Registration is currently disabled.');
    }
    if (!body?.inviteCode || !timingSafeEquals(body.inviteCode, inviteCode)) {
      throw new ForbiddenException('A valid invite code is required to register.');
    }

    if (!body?.email?.trim()) throw new BadRequestException('email is required');
    if (!body?.password)      throw new BadRequestException('password is required');
    if (body.password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }
    return this.authService.register(body.email, body.password, body.displayName);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive a JWT' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'password123' } } })
  @ApiResponse({ status: 200, description: 'Returns accessToken (JWT)' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: LoginDto) {
    if (!body?.email?.trim()) throw new BadRequestException('email is required');
    if (!body?.password)      throw new BadRequestException('password is required');
    return this.authService.login(body.email, body.password);
  }
}
