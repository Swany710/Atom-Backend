 
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { Conversation } from './conversation.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

export enum MessageType {
  TEXT = 'text',
  VOICE = 'voice',
  SYSTEM = 'system'
}

@Entity('conversation_messages')
@Index(['conversationId', 'createdAt'])
@Index(['role', 'createdAt'])
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  conversationId: string;

  @ManyToOne(() => Conversation, conversation => conversation.messages, { onDelete: 'CASCADE' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageRole
  })
  role: MessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT
  })
  messageType: MessageType;

  @Column({ default: 0 })
  tokensUsed: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: {
    transcriptionConfidence?: number;
    audioLength?: number;
    processingTime?: number;
    actions?: any[];
    timestamp?: string;
    sessionId?: string;
  };

  @CreateDateColumn()
  createdAt: Date;
}