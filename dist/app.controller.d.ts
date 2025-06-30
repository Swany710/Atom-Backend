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
    private openai;
    private conversations;
    private isOpenAIConfigured;
    constructor(appService: AppService, configService: ConfigService);
    private initializeOpenAI;
    getHello(): string;
    getHealth(): {
        status: string;
        timestamp: string;
    };
    getAIHealth(): {
        status: string;
        service: string;
        openaiConfigured: boolean;
        timestamp: string;
    };
    getAIStatus(): {
        status: string;
        aiService: string;
        mode: string;
        openaiConfigured: boolean;
        timestamp: string;
    };
    processTextCommand(body: TextCommandRequest): Promise<{
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: boolean;
        error?: undefined;
    } | {
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: true;
        error: {
            status: any;
            message: any;
        };
    }>;
    processVoiceCommand(file: any, body: any): Promise<{
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: boolean;
        error?: undefined;
    } | {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: true;
        error: {
            status: any;
            message: any;
        };
    }>;
    processTextCommandAlt(body: TextCommandRequest): Promise<{
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: boolean;
        error?: undefined;
    } | {
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: true;
        error: {
            status: any;
            message: any;
        };
    }>;
    processVoiceCommandAlt(file: any, body: any): Promise<{
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: boolean;
        error?: undefined;
    } | {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        openaiConfigured: true;
        error: {
            status: any;
            message: any;
        };
    }>;
}
export {};
