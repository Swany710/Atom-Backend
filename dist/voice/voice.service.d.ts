import { ConfigService } from '@nestjs/config';
export declare class VoiceService {
    private configService;
    private openai;
    constructor(configService: ConfigService);
    transcribeAudio(file: Express.Multer.File): Promise<{
        text: string;
    }>;
    synthesizeText(text: string): Promise<{
        audioUrl: string;
    }>;
}
