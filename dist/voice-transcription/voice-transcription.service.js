"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var VoiceTranscriptionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceTranscriptionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let VoiceTranscriptionService = VoiceTranscriptionService_1 = class VoiceTranscriptionService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(VoiceTranscriptionService_1.name);
        this.openai = new openai_1.default({
            apiKey: this.configService.get('OPENAI_API_KEY'),
        });
    }
    async transcribeAudio(buffer, format = 'mp3') {
        const tempFilePath = path.join(__dirname, `temp_audio_${Date.now()}.${format}`);
        fs.writeFileSync(tempFilePath, buffer);
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                response_format: 'json',
                language: 'en',
            });
            return transcription.text;
        }
        catch (error) {
            this.logger.error('Transcription failed', error);
            throw error;
        }
        finally {
            fs.unlinkSync(tempFilePath);
        }
    }
};
exports.VoiceTranscriptionService = VoiceTranscriptionService;
exports.VoiceTranscriptionService = VoiceTranscriptionService = VoiceTranscriptionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VoiceTranscriptionService);
//# sourceMappingURL=voice-transcription.service.js.map