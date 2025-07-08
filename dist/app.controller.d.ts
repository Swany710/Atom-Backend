import { AIVoiceService } from './ai/ai-voice.service';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ChatMemory } from './ai/chat-memory.entity';
export declare class AppController {
    private configService;
    private readonly aiVoiceService;
    private chatRepo;
    constructor(configService: ConfigService, aiVoiceService: AIVoiceService, chatRepo: Repository<ChatMemory>);
    getHealth(): {
        status: string;
        timestamp: Date;
        service: string;
    };
    getStatus(): {
        status: string;
        aiService: string;
        mode: string;
        timestamp: Date;
    };
    processTextCommand1(body: {
        message: string;
        userId?: string;
    }): Promise<{
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error?: undefined;
    } | {
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error: any;
    }>;
    processVoiceCommand1(file: any, body: any): Promise<void>;
    getConversation(id: string): Promise<{
        conversationId: string;
        messages: ChatMemory[];
        messageCount: number;
        timestamp: Date;
    }>;
    clearConversation(id: string): Promise<{
        message: string;
        timestamp: Date;
    }>;
    getAllConversations(): Promise<{
        conversations: {
            id: any;
            messageCount: number;
            lastMessage: any;
        }[];
    }>;
}
