// src/conversation/conversation.controller.ts
import { Controller, Post, Get, Body, Param, Query, Logger } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { MessageRole, MessageType } from './entities/conversation-message.entity';

export class AddMessageDto {
  sessionId: string;
  userId: string;
  role: MessageRole;
  content: string;
  messageType?: MessageType;
  metadata?: Record<string, any>;
}

export class GetContextDto {
  sessionId: string;
  windowSize?: number;
}

@Controller('conversation')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(private readonly conversationService: ConversationService) {}

  @Post('message')
  async addMessage(@Body() dto: AddMessageDto) {
    this.logger.log(`Adding message for session: ${dto.sessionId}`);
    const message = await this.conversationService.addMessage(dto);
    return {
      success: true,
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        messageType: message.messageType,
        createdAt: message.createdAt
      }
    };
  }

  @Get('context/:sessionId')
  async getContext(
    @Param('sessionId') sessionId: string,
    @Query('windowSize') windowSize?: number
  ) {
    const context = await this.conversationService.getConversationContext(
      sessionId,
      windowSize ? parseInt(windowSize as string) : 10
    );
    return {
      success: true,
      context
    };
  }

  @Get('messages/:sessionId')
  async getMessages(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number
  ) {
    const messages = await this.conversationService.getConversationMessages(
      sessionId,
      limit ? parseInt(limit as string) : 10
    );
    return {
      success: true,
      messages
    };
  }

  @Post('clear/:sessionId')
  async clearConversation(@Param('sessionId') sessionId: string) {
    await this.conversationService.clearConversation(sessionId);
    return {
      success: true,
      message: 'Conversation cleared'
    };
  }

  @Get('recent/:userId')
  async getRecentConversations(
    @Param('userId') userId: string,
    @Query('limit') limit?: number
  ) {
    const conversations = await this.conversationService.getRecentConversations(
      userId,
      limit ? parseInt(limit as string) : 10
    );
    return {
      success: true,
      conversations
    };
  }

  @Get('settings/:userId')
  async getUserSettings(@Param('userId') userId: string) {
    const settings = await this.conversationService.getUserSettings(userId);
    return {
      success: true,
      settings
    };
  }
} 
 
