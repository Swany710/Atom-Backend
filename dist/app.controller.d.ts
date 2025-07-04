import { ConfigService } from '@nestjs/config';
export declare class AppController {
    private configService;
    private conversations;
    constructor(configService: ConfigService);
    healthCheck(): {
        status: string;
        service: string;
        openaiConfigured: boolean;
        timestamp: string;
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
        message: any;
        transcription: string;
        conversationId: any;
        timestamp: Date;
        mode: string;
    }>;
    private callWhisperAPI;
}
