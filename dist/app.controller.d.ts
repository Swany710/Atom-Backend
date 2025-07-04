import { ConfigService } from '@nestjs/config';
export declare class AppController {
    private configService;
    private conversations;
    constructor(configService: ConfigService);
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
    processTextCommand(body: any): Promise<{
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
        error?: undefined;
    } | {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
        error: any;
    }>;
}
