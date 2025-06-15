import { ConfigService } from '@nestjs/config';
export declare class VoiceTranscriptionService {
    private readonly configService;
    private readonly openai;
    private readonly logger;
    constructor(configService: ConfigService);
    transcribeAudio(buffer: Buffer, format?: string): Promise<string>;
}
