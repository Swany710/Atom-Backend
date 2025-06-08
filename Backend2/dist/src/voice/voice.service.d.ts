import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
export declare class VoiceTranscriptionService {
    private httpService;
    private configService;
    private openai;
    constructor(httpService: HttpService, configService: ConfigService);
    transcribeAudio(audioBuffer: Buffer): Promise<string>;
    processWithN8n(audioBuffer: Buffer): Promise<any>;
}
