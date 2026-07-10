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
import { AuthService } from './auth.service';
import { InviteCodesService } from './invite-codes.service';
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

/**
 * Auth endpoints — both are public (no API key required).
 *
 * POST /auth/register  — INVITE-ONLY: requires a valid single-use invite code
 *                        (created in the admin dashboard) OR the master
 *                        REGISTRATION_INVITE_CODE env var. If neither exists,
 *                        registration is disabled entirely (403). This
 *                        prevents strangers from self-registering and reaching
 *                        company-global tools (AccuLynx CRM, knowledge base).
 * POST /auth/login     — authenticate and receive an access token
 */
@Public()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly inviteCodes: InviteCodesService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account (invite-only)' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'password123', displayName: 'Jane', inviteCode: 'your-invite-code' } } })
  @ApiResponse({ status: 201, description: 'Account created — returns accessToken' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Registration disabled or invalid invite code' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(@Body() body: RegisterDto) {
    // ── Invite gate ──────────────────────────────────────────────────────
    if (!(await this.inviteCodes.registrationEnabled())) {
      throw new ForbiddenException('Registration is currently disabled.');
    }
    const invite = await this.inviteCodes.peek(body?.inviteCode ?? '');
    if (!invite) {
      throw new ForbiddenException('A valid invite code is required to register.');
    }

    if (!body?.email?.trim()) throw new BadRequestException('email is required');
    if (!body?.password)      throw new BadRequestException('password is required');
    if (body.password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }

    const tokens = await this.authService.register(body.email, body.password, body.displayName);

    // Consume the single-use code only AFTER a successful registration, so a
    // failed attempt (e.g. duplicate email) doesn't burn the invite.
    if (invite !== 'env') {
      await this.inviteCodes.consume(invite.id, tokens.userId, tokens.email);
    }

    return tokens;
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
