import { AIVoiceService } from './ai/ai-voice.service';
import { ConfigService } from '@nestjs/config';
export declare class AppController {
    private configService;
    private readonly aiVoiceService;
    private conversations;
    constructor(configService: ConfigService, aiVoiceService: AIVoiceService);
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
    processTextCommand1(body: any): Promise<{
        message: any;
        conversationId: any;
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
    processVoiceCommand1(file: any, body: any): Promise<{
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error?: undefined;
    } | {
        message: string;
        transcription: string;
        mode: string;
        timestamp: Date;
        conversationId?: undefined;
        error?: undefined;
    } | {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error: any;
    }>;
    getConversation(id: string): {
        conversationId: string;
        messages: any[];
        messageCount: number;
        timestamp: Date;
    };
    clearConversation(id: string): {
        message: string;
        timestamp: Date;
    };
    getAllConversations(): {
        conversations: {
            id: string;
            messageCount: number;
            lastMessage: any;
        }[];
    };
}
