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
    postAIText(body: any): {
        message: string;
        input: any;
        timestamp: string;
    };
    postAIVoice(body: any): {
        message: string;
        transcription: string;
        timestamp: string;
    };
}
