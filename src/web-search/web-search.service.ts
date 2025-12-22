import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { WebSearchDto, SearchDepth } from './dto/web-search.dto';

/**
 * Tavily Search Response Interface
 */
interface TavilySearchResponse {
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content?: string;
  }>;
  images?: string[];
  follow_up_questions?: string[];
  response_time: number;
}

/**
 * Web Search Service
 * Integrates with Tavily API for web search functionality
 */
@Injectable()
export class WebSearchService {
  private axiosInstance: any; // FIXED: axios types compatibility
  private apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TAVILY_API_KEY', '');

    this.axiosInstance = axios.create({
      baseURL: 'https://api.tavily.com',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Perform web search using Tavily API
   * @param searchDto Search parameters
   * @returns Search results
   */
  async search(searchDto: WebSearchDto): Promise<any> {
    if (!this.apiKey) {
      throw new BadRequestException('Tavily API key not configured');
    }

    try {
      const response = await this.axiosInstance.post(
        '/search',
        {
          api_key: this.apiKey,
          query: searchDto.query,
          max_results: searchDto.maxResults || 5,
          search_depth: searchDto.searchDepth || SearchDepth.BASIC,
          include_images: searchDto.includeImages || false,
          include_raw_content: searchDto.includeRawContent || false,
          include_answer: true,
        },
      );

      return this.formatSearchResults(response.data);
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new BadRequestException('Invalid Tavily API key');
      }
      if (error.response?.status === 429) {
        throw new BadRequestException('Rate limit exceeded');
      }
      throw new InternalServerErrorException('Failed to perform web search');
    }
  }

  /**
   * Perform a quick answer search
   * @param query Search query
   * @returns Quick answer and top result
   */
  async quickAnswer(query: string): Promise<{
    answer: string | null;
    topResult: any;
  }> {
    const searchResult = await this.search({
      query,
      maxResults: 1,
      searchDepth: SearchDepth.BASIC,
    });

    return {
      answer: searchResult.answer || null,
      topResult: searchResult.results[0] || null,
    };
  }

  /**
   * Search for news articles
   * @param query Search query
   * @param maxResults Maximum results
   * @returns News search results
   */
  async searchNews(query: string, maxResults: number = 5): Promise<any> {
    // Add "news" context to the query
    const newsQuery = `${query} news latest`;

    return this.search({
      query: newsQuery,
      maxResults,
      searchDepth: SearchDepth.ADVANCED,
    });
  }

  /**
   * Get related questions for a query
   * @param query Search query
   * @returns Related questions
   */
  async getRelatedQuestions(query: string): Promise<string[]> {
    if (!this.apiKey) {
      throw new BadRequestException('Tavily API key not configured');
    }

    try {
      const response = await this.axiosInstance.post(
        '/search',
        {
          api_key: this.apiKey,
          query: query,
          max_results: 3,
          search_depth: SearchDepth.ADVANCED,
          include_answer: true,
        },
      );

      return response.data.follow_up_questions || [];
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to get related questions',
      );
    }
  }

  /**
   * Extract content from a specific URL
   * @param url URL to extract content from
   * @returns Extracted content
   */
  async extractContent(url: string): Promise<{
    url: string;
    content: string;
    title: string;
  }> {
    if (!this.apiKey) {
      throw new BadRequestException('Tavily API key not configured');
    }

    try {
      const response = await this.axiosInstance.post('/extract', {
        api_key: this.apiKey,
        urls: [url],
      });

      const result = response.data.results[0];

      return {
        url: result.url,
        content: result.raw_content || result.content,
        title: result.title || '',
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to extract content');
    }
  }

  /**
   * Format search results into a consistent structure
   * @param data Raw Tavily response
   * @returns Formatted search results
   */
  private formatSearchResults(data: TavilySearchResponse): any {
    return {
      query: data.query,
      answer: data.answer || null,
      results: data.results.map((result) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        relevanceScore: result.score,
        rawContent: result.raw_content,
      })),
      images: data.images || [],
      relatedQuestions: data.follow_up_questions || [],
      responseTime: data.response_time,
      totalResults: data.results.length,
    };
  }

  /**
   * Validate API key
   * @returns Whether API key is valid
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      await this.search({
        query: 'test',
        maxResults: 1,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
