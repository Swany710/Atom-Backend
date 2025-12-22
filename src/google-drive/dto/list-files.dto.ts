import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Data Transfer Object for listing Google Drive files
 */
export class ListFilesDto {
  @ApiProperty({
    description: 'Search query (e.g., "name contains \'report\'")',
    example: "mimeType='application/pdf'",
    required: false,
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({
    description: 'Maximum number of files to return',
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
  pageSize?: number = 10;

  @ApiProperty({
    description: 'Page token for pagination',
    required: false,
  })
  @IsOptional()
  @IsString()
  pageToken?: string;

  @ApiProperty({
    description: 'Comma-separated list of fields to include',
    example: 'id,name,mimeType,size,createdTime',
    required: false,
  })
  @IsOptional()
  @IsString()
  fields?: string;
}
