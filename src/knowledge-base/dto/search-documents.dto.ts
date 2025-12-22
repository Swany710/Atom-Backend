import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Data Transfer Object for searching documents
 */
export class SearchDocumentsDto {
  @ApiProperty({
    description: 'Search query',
    example: 'How to configure authentication?',
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'Number of results to return',
    example: 5,
    minimum: 1,
    maximum: 50,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 5;

  @ApiProperty({
    description: 'Minimum similarity threshold (0-1)',
    example: 0.7,
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  threshold?: number = 0.7;
}
