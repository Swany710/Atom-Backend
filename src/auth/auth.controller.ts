import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
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
 */
@Public()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ schema: { example: { email: 'user@example.com', password: 'password123', displayName: 'Jane' } } })
  @ApiResponse({ status: 201, description: 'Account created — returns accessToken' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
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
