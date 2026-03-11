import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../decorators/public.decorator';

interface RegisterDto {
  email: string;
  password: string;
  displayName?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

/**
 * Auth endpoints — both are public (no API key required).
 *
 * POST /auth/register  — create a new beta-user account
 * POST /auth/login     — authenticate and receive an access token
 *
 * The returned accessToken is a signed JWT.  Send it on subsequent
 * requests as:   Authorization: Bearer <accessToken>
 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    if (!body?.email?.trim()) throw new BadRequestException('email is required');
    if (!body?.password)      throw new BadRequestException('password is required');
    if (body.password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }

    return this.authService.register(body.email, body.password, body.displayName);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto) {
    if (!body?.email?.trim()) throw new BadRequestException('email is required');
    if (!body?.password)      throw new BadRequestException('password is required');

    return this.authService.login(body.email, body.password);
  }
}
