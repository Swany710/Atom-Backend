import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';

// Import entities
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { UserConversationSettings } from './entities/user-conversation-settings.entity';

@Module({
  imports: [
    // Only import the entities for this module - TypeORM root is configured in AppModule
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMessage,
      UserConversationSettings,
    ]),
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService], // Export so AI module can use it
})
export class ConversationModule {}