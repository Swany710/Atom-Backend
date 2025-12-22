import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { EmbeddingService } from './services/embedding.service';
import { Document } from './entities/document.entity';
import { DocumentChunk } from './entities/document-chunk.entity';
import { AuthModule } from '../auth/auth.module';

/**
 * Knowledge Base Module
 * Provides document management and vector search functionality
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentChunk]),
    ConfigModule,
    AuthModule,
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, EmbeddingService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
