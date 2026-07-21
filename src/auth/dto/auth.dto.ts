import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

/**
 * Request DTOs for the auth endpoints.
 *
 * These are CLASSES (not interfaces) on purpose: the global ValidationPipe
 * (whitelist + forbidNonWhitelisted, see main.ts) only enforces validation on
 * class-validator DTOs. Interfaces are erased at compile time and slip through
 * unvalidated, so these two security-sensitive endpoints get real input
 * validation and reject unexpected fields with a 400.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  inviteCode?: string;

  /** Company name — creates the user's organization (new-org path only) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'password is required' })
  @MaxLength(200)
  password!: string;
}
