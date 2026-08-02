import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMemory } from './chat-memory.entity';
import { ConversationSummary } from './conversation-summary.entity';
import { ConversationMemoryService } from './conversation-memory.service';
import { ConversationSummarizerService } from './conversation-summarizer.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMemory, ConversationSummary])],
  providers: [ConversationMemoryService, ConversationSummarizerService],
  exports: [ConversationMemoryService, ConversationSummarizerService],
})
export class ConversationsModule {}
