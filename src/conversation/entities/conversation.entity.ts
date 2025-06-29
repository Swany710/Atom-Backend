import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { ConversationMessage } from './conversation-message.entity';

@Entity('conversations')
@Index(['userId', 'isActive'])
@Index(['sessionId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ unique: true })
  sessionId: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'jsonb', default: {} })
  context: {
    userPreferences?: Record<string, any>;
    activeJobIds?: string[];
    currentLocation?: string;
    recentActions?: string[];
    pendingTasks?: any[];
    contextVariables?: Record<string, any>;
  };

  @Column({ type: 'jsonb', default: {} })
  metadata: {
    deviceType?: string;
    platform?: string;
    userAgent?: string;
    ipAddress?: string;
    createdFrom?: string;
  };

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ConversationMessage, message => message.conversation)
  messages: ConversationMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
