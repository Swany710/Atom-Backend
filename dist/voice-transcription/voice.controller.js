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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
let VoiceController = class VoiceController {
    async handleVoiceCommand(file) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const form = new form_data_1.default();
        form.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
        });
        try {
            const n8nResponse = await axios_1.default.post('https://swany.app.n8n.cloud/webhook-test/voice-command', form, { headers: form.getHeaders() });
            return {
                status: 'sent to n8n',
                result: n8nResponse.data,
            };
        }
        catch (err) {
            console.error('Failed to send to n8n:', err.message);
            throw new common_1.HttpException('Failed to forward file to n8n', common_1.HttpStatus.BAD_GATEWAY);
        }
    }
};
exports.VoiceController = VoiceController;
__decorate([
    (0, common_1.Post)('voice-command'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('data')),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], VoiceController.prototype, "handleVoiceCommand", null);
exports.VoiceController = VoiceController = __decorate([
    (0, common_1.Controller)('voice')
], VoiceController);
//# sourceMappingURL=voice.controller.js.map