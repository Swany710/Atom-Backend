import { IsEmail, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object for sending emails
 */
export class SendEmailDto {
  @ApiProperty({
    description: 'Recipient email address',
    example: 'recipient@example.com',
  })
  @IsEmail()
  to: string;

  @ApiProperty({
    description: 'Email subject',
    example: 'Meeting Reminder',
  })
  @IsString()
  subject: string;

  @ApiProperty({
    description: 'Email body (plain text)',
    example: 'This is a reminder about our meeting tomorrow.',
  })
  @IsString()
  body: string;

  @ApiProperty({
    description: 'CC recipients',
    example: ['cc@example.com'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiProperty({
    description: 'BCC recipients',
    example: ['bcc@example.com'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @ApiProperty({
    description: 'HTML content',
    example: '<h1>Meeting Reminder</h1><p>Tomorrow at 10 AM</p>',
    required: false,
  })
  @IsOptional()
  @IsString()
  html?: string;
}
