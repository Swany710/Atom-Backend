import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Data Transfer Object for querying emails
 */
export class EmailQueryDto {
  @ApiProperty({
    description: 'Gmail search query (e.g., "from:user@example.com", "is:unread")',
    example: 'is:unread',
    required: false,
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({
    description: 'Maximum number of emails to retrieve',
    example: 10,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  maxResults?: number = 10;

  @ApiProperty({
    description: 'Label ID to filter by',
    example: 'INBOX',
    required: false,
  })
  @IsOptional()
  @IsString()
  labelId?: string;
}
