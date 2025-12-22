import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebSearchService } from './web-search.service';
import { WebSearchController } from './web-search.controller';

/**
 * Web Search Module
 * Provides Tavily-powered web search functionality
 */
@Module({
  imports: [ConfigModule],
  controllers: [WebSearchController],
  providers: [WebSearchService],
  exports: [WebSearchService],
})
export class WebSearchModule {}
