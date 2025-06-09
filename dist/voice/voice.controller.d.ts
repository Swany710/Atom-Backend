import { VoiceService } from './voice.service';
export declare class VoiceController {
    private readonly voiceService;
    constructor(voiceService: VoiceService);
    transcribeAudio(file: Express.Multer.File): Promise<{
        text: string;
    }>;
    synthesizeText(text: string): Promise<{
        audioUrl: string;
    }>;
}
