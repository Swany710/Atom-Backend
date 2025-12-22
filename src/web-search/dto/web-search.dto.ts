import { IsString, IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum SearchDepth {
  BASIC = 'basic',
  ADVANCED = 'advanced',
}

/**
 * Data Transfer Object for web search
 */
export class WebSearchDto {
  @ApiProperty({
    description: 'Search query',
    example: 'Latest developments in AI technology',
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: 'Number of results to return',
    example: 5,
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  maxResults?: number = 5;

  @ApiProperty({
    description: 'Search depth (basic or advanced)',
    example: SearchDepth.BASIC,
    enum: SearchDepth,
    required: false,
  })
  @IsOptional()
  @IsEnum(SearchDepth)
  searchDepth?: SearchDepth = SearchDepth.BASIC;

  @ApiProperty({
    description: 'Include images in results',
    example: true,
    required: false,
  })
  @IsOptional()
  includeImages?: boolean = false;

  @ApiProperty({
    description: 'Include raw content',
    example: false,
    required: false,
  })
  @IsOptional()
  includeRawContent?: boolean = false;
}
