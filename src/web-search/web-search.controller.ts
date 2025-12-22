import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WebSearchService } from './web-search.service';
import { WebSearchDto } from './dto/web-search.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';

/**
 * Web Search Controller
 * Handles web search requests using Tavily API
 */
@ApiTags('Web Search')
@Controller('web-search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebSearchController {
  constructor(private readonly webSearchService: WebSearchService) {}

  /**
   * Perform web search
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Perform web search using Tavily' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid API key or request',
  })
  async search(@Body() searchDto: WebSearchDto): Promise<any> {
    return this.webSearchService.search(searchDto);
  }

  /**
   * Get quick answer for a query
   */
  @Get('quick-answer')
  @ApiOperation({ summary: 'Get quick answer for a query' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quick answer retrieved',
  })
  async quickAnswer(@Query('q') query: string): Promise<any> {
    return this.webSearchService.quickAnswer(query);
  }

  /**
   * Search for news
   */
  @Get('news')
  @ApiOperation({ summary: 'Search for news articles' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'limit', description: 'Max results', required: false })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'News results retrieved',
  })
  async searchNews(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ): Promise<any> {
    return this.webSearchService.searchNews(query, limit);
  }

  /**
   * Get related questions
   */
  @Get('related-questions')
  @ApiOperation({ summary: 'Get related questions for a query' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Related questions retrieved',
  })
  async getRelatedQuestions(@Query('q') query: string): Promise<string[]> {
    return this.webSearchService.getRelatedQuestions(query);
  }

  /**
   * Extract content from URL
   */
  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract content from a URL' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Content extracted successfully',
  })
  async extractContent(@Body('url') url: string): Promise<any> {
    return this.webSearchService.extractContent(url);
  }

  /**
   * Validate API key
   */
  @Get('validate')
  @ApiOperation({ summary: 'Validate Tavily API key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API key validation result',
  })
  async validateApiKey(): Promise<{ valid: boolean }> {
    const valid = await this.webSearchService.validateApiKey();
    return { valid };
  }
}
