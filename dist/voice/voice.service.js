"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
let VoiceService = class VoiceService {
    constructor(configService) {
        this.configService = configService;
        this.openai = new openai_1.OpenAI({
            apiKey: this.configService.get('OPENAI_API_KEY'),
        });
    }
    async transcribeAudio(file) {
        try {
            const audioFile = new File([file.buffer], file.originalname, {
                type: file.mimetype,
            });
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                language: 'en',
            });
            return { text: transcription.text };
        }
        catch (error) {
            console.error('Error transcribing audio:', error);
            throw new Error('Failed to transcribe audio');
        }
    }
    async synthesizeText(text) {
        try {
            const mp3 = await this.openai.audio.speech.create({
                model: 'tts-1',
                voice: 'alloy',
                input: text,
            });
            const buffer = Buffer.from(await mp3.arrayBuffer());
            const base64Audio = buffer.toString('base64');
            return {
                audioUrl: `data:audio/mpeg;base64,${base64Audio}`
            };
        }
        catch (error) {
            console.error('Error synthesizing text:', error);
            throw new Error('Failed to synthesize text');
        }
    }
};
exports.VoiceService = VoiceService;
exports.VoiceService = VoiceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VoiceService);
//# sourceMappingURL=voice.service.js.map