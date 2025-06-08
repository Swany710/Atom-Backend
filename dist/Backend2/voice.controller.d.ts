import { VoiceService } from './voice.service';
export declare class VoiceController {
    private voiceService;
    constructor(voiceService: VoiceService);
    processVoiceCommand(file: Express.Multer.File): Promise<{
        success: boolean;
        transcription: any;
        response: any;
        timestamp: Date;
        error?: undefined;
    } | {
        success: boolean;
        error: string;
        timestamp: Date;
        transcription?: undefined;
        response?: undefined;
    }>;
}
