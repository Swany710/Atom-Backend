import { AppService } from './app.service';
interface TextCommandRequest {
    message: string;
    userId?: string;
    conversationId?: string;
}
export declare class AppController {
    private readonly appService;
    private conversations;
    constructor(appService: AppService);
    getHello(): string;
    getHealth(): {
        status: string;
        timestamp: string;
    };
    getAIHealth(): {
        status: string;
        service: string;
        timestamp: string;
        version: string;
    };
    getAIStatus(): {
        status: string;
        aiService: string;
        mode: string;
        timestamp: string;
    };
    handleTextCommand(body: TextCommandRequest): Promise<{
        message: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
    }>;
    handleVoiceCommand(body: any): Promise<{
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: Date;
        mode: string;
    }>;
    getUserConversations(): {
        conversations: string[];
        count: number;
        mode: string;
    };
}
export {};
