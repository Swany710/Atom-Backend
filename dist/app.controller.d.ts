import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AIVoiceService } from './ai/ai-voice.service';
import { ChatMemory } from './ai/chat-memory.entity';
export declare class AppController {
    private readonly config;
    private readonly aiVoiceService;
    private readonly chatRepo;
    constructor(config: ConfigService, aiVoiceService: AIVoiceService, chatRepo: Repository<ChatMemory>);
    getHealth(): {
        status: string;
        service: string;
        timestamp: Date;
    };
    getStatus(): {
        status: string;
        aiService: string;
        timestamp: Date;
    };
    handleText(body: {
        message: string;
        userId?: string;
        conversationId?: string;
    }): Promise<{
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
    }>;
    handleVoice(file: Express.Multer.File, body: {
        userId?: string;
        conversationId?: string;
    }): Promise<{
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
    }>;
    getConversation(id: string): Promise<{
        conversationId: string;
        messages: ChatMemory[];
        messageCount: number;
    }>;
    clearConversation(id: string): Promise<{
        message: string;
        conversationId: string;
    }>;
}
