import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHello(): string;
    getHealth(): {
        status: string;
        timestamp: string;
    };
    getTest(): {
        message: string;
        timestamp: string;
    };
    getAIHealth(): {
        status: string;
        message: string;
        timestamp: string;
    };
    getAIStatus(): {
        status: string;
        message: string;
        timestamp: string;
    };
    postAITextCommand1(body: any): {
        message: string;
        conversationId: string;
        timestamp: string;
        mode: string;
    };
    postAIVoiceCommand1(body: any): {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: string;
        mode: string;
    };
    postAITextCommand(body: any): {
        message: string;
        conversationId: string;
        timestamp: string;
        mode: string;
    };
    postAIVoiceCommand(body: any): {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: string;
        mode: string;
    };
    postAIText(body: any): {
        message: string;
        conversationId: string;
        timestamp: string;
        mode: string;
    };
    postAIVoice(body: any): {
        message: string;
        transcription: string;
        conversationId: string;
        timestamp: string;
        mode: string;
    };
}
