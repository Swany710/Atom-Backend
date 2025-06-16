import { VoiceTranscriptionService } from './voice-transcription.service';
export declare class VoiceController {
    private readonly transcriptionService;
    constructor(transcriptionService: VoiceTranscriptionService);
    triggerWebhook(): Promise<{
        status: string;
    }>;
    transcribe(file: Express.Multer.File): Promise<{
        transcription: string;
    }>;
}
