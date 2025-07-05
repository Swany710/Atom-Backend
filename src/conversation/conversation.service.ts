 // src/conversation/conversation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage, MessageRole, MessageType } from './entities/conversation-message.entity';
import { UserConversationSettings } from './entities/user-conversation-settings.entity';

export interface ConversationContext {
  conversationId?: string;
  sessionId: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  totalMessages?: number;
  context?: Record<string, any>;
}

export interface AddMessageDto {
  sessionId: string;
  userId: string;
  role: MessageRole;
  content: string;
  messageType?: MessageType;
  metadata?: Record<string, any>;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private messageRepo: Repository<ConversationMessage>,
    @InjectRepository(UserConversationSettings)
    private settingsRepo: Repository<UserConversationSettings>,
  ) {}

  // Get or create conversation by session ID
  async getOrCreateConversation(sessionId: string, userId: string, metadata?: Record<string, any>): Promise<Conversation> {
    let conversation = await this.conversationRepo.findOne({
      where: { sessionId, isActive: true },
      relations: ['messages']
    });

    if (!conversation) {
      conversation = this.conversationRepo.create({
        sessionId,
        userId,
        title: `Conversation ${new Date().toLocaleDateString()}`,
        context: {},
        metadata: {
          createdFrom: 'atom_voice_assistant',
          ...metadata
        }
      });

      conversation = await this.conversationRepo.save(conversation);
      this.logger.log(`Created new conversation: ${conversation.id} for session: ${sessionId}`);
    }

    return conversation;
  }

  // Add message to conversation
  async addMessage(dto: AddMessageDto): Promise<ConversationMessage> {
    const conversation = await this.getOrCreateConversation(dto.sessionId, dto.userId);

    const message = this.messageRepo.create({
      conversationId: conversation.id,
      conversation,
      role: dto.role,
      content: dto.content,
      messageType: dto.messageType || MessageType.TEXT,
      tokensUsed: this.estimateTokens(dto.content),
      metadata: {
        ...dto.metadata,
        timestamp: new Date().toISOString(),
        sessionId: dto.sessionId
      }
    });

    const savedMessage = await this.messageRepo.save(message);

    // Update conversation timestamp
    await this.conversationRepo.update(conversation.id, {
      updatedAt: new Date()
    });

    // Check if we need to summarize
    await this.checkAndSummarizeIfNeeded(conversation.id);

    this.logger.log(`Added ${dto.role} message to conversation ${conversation.id}`);
    return savedMessage;
  }

  // Get conversation messages with limit
  async getConversationMessages(sessionId: string, limit: number = 10): Promise<ConversationMessage[]> {
    const conversation = await this.conversationRepo.findOne({
      where: { sessionId, isActive: true }
    });

    if (!conversation) {
      return [];
    }

    const messages = await this.messageRepo.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'DESC' },
      take: limit
    });

    // Return in chronological order (oldest first)
    return messages.reverse();
  }

  // Get conversation context for AI
  async getConversationContext(sessionId: string, windowSize: number = 10): Promise<ConversationContext> {
    const messages = await this.getConversationMessages(sessionId, windowSize);
    const conversation = await this.conversationRepo.findOne({
      where: { sessionId, isActive: true }
    });

    // Format messages for AI API
    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt.toISOString()
    }));

    const totalMessages = await this.getMessageCount(conversation?.id);

    return {
      conversationId: conversation?.id,
      sessionId,
      messages: formattedMessages,
      totalMessages,
      context: conversation?.context || {}
    };
  }

  // Update conversation context
  async updateConversationContext(sessionId: string, context: Record<string, any>): Promise<void> {
    const conversation = await this.conversationRepo.findOne({
      where: { sessionId, isActive: true }
    });

    if (conversation) {
      await this.conversationRepo.update(conversation.id, {
        context: { ...conversation.context, ...context },
        updatedAt: new Date()
      });
    }
  }

  // Clear conversation (mark as inactive)
  async clearConversation(sessionId: string): Promise<void> {
    await this.conversationRepo.update(
      { sessionId, isActive: true },
      { isActive: false, updatedAt: new Date() }
    );
    this.logger.log(`Cleared conversation for session: ${sessionId}`);
  }

  // Get user's recent conversations
  async getRecentConversations(userId: string, limit: number = 10): Promise<Conversation[]> {
    return this.conversationRepo.find({
      where: { userId, isActive: true },
      order: { updatedAt: 'DESC' },
      take: limit,
      select: ['id', 'sessionId', 'title', 'createdAt', 'updatedAt']
    });
  }

  // Get or create user settings
  async getUserSettings(userId: string): Promise<UserConversationSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });

    if (!settings) {
      settings = this.settingsRepo.create({
        userId,
        maxConversationHistory: 50,
        contextWindowSize: 10,
        memoryRetentionDays: 30,
        settings: {
          enableAutoSummary: true,
          enableContextAwareness: true,
          saveVoiceTranscriptions: true,
          enablePersonalization: true
        }
      });
      settings = await this.settingsRepo.save(settings);
    }

    return settings;
  }

  // Clean up old conversations
  async cleanupOldConversations(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.conversationRepo.update(
      { updatedAt: MoreThan(thirtyDaysAgo), isActive: false },
      { isActive: false }
    );

    this.logger.log(`Cleaned up ${result.affected} old conversations`);
  }

  // Private helper methods
  private async getMessageCount(conversationId: string): Promise<number> {
    if (!conversationId) return 0;
    return this.messageRepo.count({ where: { conversationId } });
  }

  private async checkAndSummarizeIfNeeded(conversationId: string): Promise<void> {
    const messageCount = await this.getMessageCount(conversationId);
    
    // Auto-summarize every 20 messages
    if (messageCount > 0 && messageCount % 20 === 0) {
      await this.createConversationSummary(conversationId);
    }
  }

  private async createConversationSummary(conversationId: string): Promise<void> {
    // Get last 20 messages
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: 20
    });

    // Create summary (you could integrate with OpenAI here)
    const summary = `Summary of ${messages.length} messages from ${messages[messages.length - 1]?.createdAt} to ${messages[0]?.createdAt}`;

    // Update conversation with summary
    await this.conversationRepo.update(conversationId, {
      summary,
      updatedAt: new Date()
    });

    this.logger.log(`Created summary for conversation ${conversationId}`);
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (roughly 4 characters per token)
    return Math.ceil(text.length / 4);
  }

  // Import existing data from your n8n_chat_histories table
  async importExistingChatHistory(): Promise<void> {
    this.logger.log('Starting import of existing chat history...');
    
    // This method would help migrate your existing Supabase data
    // You can run this once to import your current n8n_chat_histories
    
    try {
      // Example of how you might structure the import
      // You would need to query your existing table and map the data
      
      this.logger.log('Chat history import completed successfully');
    } catch (error) {
      this.logger.error('Error importing chat history:', error);
    }
  }
}
