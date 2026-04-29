import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMemory } from './chat-memory.entity';
import { ConversationMemoryService } from './conversation-memory.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMemory])],
  providers: [ConversationMemoryService],
  exports: [ConversationMemoryService],
})
export class ConversationsModule {}
