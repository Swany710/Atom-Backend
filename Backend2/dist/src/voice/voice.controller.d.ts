import { VoiceTranscriptionService } from './voice.service';
export declare class VoiceController {
    private voiceService;
    constructor(voiceService: VoiceTranscriptionService);
    processVoiceCommand(file: Express.Multer.File): Promise<{
        error: string;
        transcription?: undefined;
        n8nResult?: undefined;
        timestamp?: undefined;
    } | {
        transcription: string;
        n8nResult: any;
        timestamp: Date;
        error?: undefined;
    } | {
        transcription: string;
        error: any;
        timestamp: Date;
        n8nResult?: undefined;
    }>;
}
