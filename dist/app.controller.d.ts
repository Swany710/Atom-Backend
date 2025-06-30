import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
interface TextCommandRequest {
    message: string;
    userId?: string;
    conversationId?: string;
}
export declare class AppController {
    private readonly appService;
    private readonly configService;
    private conversations;
    constructor(appService: AppService, configService: ConfigService);
    getHello(): string;
    getHealth(): {
        status: string;
        timestamp: string;
    };
    getAIHealth(): {
        status: string;
        service: string;
        openaiConfigured: any;
        timestamp: string;
    };
    getAIStatus(): {
        status: string;
        aiService: string;
        mode: string;
        timestamp: string;
    };
    processTextCommand1(body: TextCommandRequest): Promise<{
        message: any;
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
    processVoiceCommand1(file: any, body: any): Promise<{
        message: any;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error?: undefined;
    } | {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error: any;
    }>;
    getConversation(conversationId: string): {
        conversationId: string;
        messages: any[];
        messageCount: number;
        timestamp: Date;
    };
    clearConversation(body: {
        conversationId?: string;
    }): {
        message: string;
        timestamp: Date;
    };
}
export {};
