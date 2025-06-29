 
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_conversation_settings')
export class UserConversationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column({ default: 50 })
  maxConversationHistory: number;

  @Column({ default: 20 })
  autoSummarizeAfter: number;

  @Column({ default: 10 })
  contextWindowSize: number;

  @Column({ default: 'conversational' })
  preferredResponseStyle: string;

  @Column({ default: 30 })
  memoryRetentionDays: number;

  @Column({ type: 'jsonb', default: {} })
  settings: {
    enableAutoSummary?: boolean;
    enableContextAwareness?: boolean;
    saveVoiceTranscriptions?: boolean;
    enablePersonalization?: boolean;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}