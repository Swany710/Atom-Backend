import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object for uploading documents
 */
export class UploadDocumentDto {
  @ApiProperty({
    description: 'Document title',
    example: 'Product Documentation',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Document content (text)',
    example: 'This is the content of the document...',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Source URL (optional)',
    example: 'https://example.com/docs/product',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiProperty({
    description: 'Additional metadata (optional)',
    example: { category: 'technical', version: '1.0' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
