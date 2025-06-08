import { ConfigService } from '@nestjs/config';
export declare class VoiceService {
    private configService;
    constructor(configService: ConfigService);
    processWithN8n(audioBuffer: Buffer): Promise<any>;
}
