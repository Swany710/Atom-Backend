import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

/**
 * Authentication Service
 * Handles user registration, login, and token management
 *
 * ADDED: Part of authentication system integration
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Register a new user
   * @param registerDto User registration data
   * @returns Authentication response with tokens and user info
   * @throws ConflictException if email already exists
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, firstName, lastName } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
    });

    await this.userRepository.save(user);

    // Generate tokens
    return this.generateAuthResponse(user);
  }

  /**
   * Login user with email and password
   * @param loginDto User login credentials
   * @returns Authentication response with tokens and user info
   * @throws UnauthorizedException if credentials are invalid
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Generate tokens
    return this.generateAuthResponse(user);
  }

  /**
   * Refresh access token using refresh token
   * @param refreshToken Refresh token
   * @returns New access token
   * @throws UnauthorizedException if refresh token is invalid
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'default-refresh-secret',
        ),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const accessToken = this.generateAccessToken(user);

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Get user by ID
   * @param userId User ID
   * @returns User object
   */
  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
  }

  /**
   * Update user's Google OAuth tokens
   * Used by Gmail and Google Drive modules
   * @param userId User ID
   * @param googleId Google ID
   * @param accessToken Google access token
   * @param refreshToken Google refresh token
   * @param expiryDate Token expiry date
   */
  async updateGoogleTokens(
    userId: string,
    googleId: string,
    accessToken: string,
    refreshToken: string | null,
    expiryDate: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      googleId,
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken || undefined,
      googleTokenExpiry: expiryDate,
    });
  }

  /**
   * Generate authentication response with tokens
   * @param user User object
   * @returns Authentication response
   */
  private generateAuthResponse(user: User): AuthResponseDto {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  /**
   * Generate JWT access token
   * @param user User object
   * @returns Access token
   */
  private generateAccessToken(user: User): string {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '7d'),
    });
  }

  /**
   * Generate JWT refresh token
   * @param user User object
   * @returns Refresh token
   */
  private generateRefreshToken(user: User): string {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>(
        'JWT_REFRESH_SECRET',
        'default-refresh-secret',
      ),
      expiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRATION',
        '30d',
      ),
    });
  }
}
