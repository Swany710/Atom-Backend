"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const voice_controller_1 = require("./voice-transcription/voice.controller");
const ai_voice_controller_1 = require("./ai/ai-voice.controller");
const ai_voice_service_1 = require("./ai/ai-voice.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env'],
            }),
        ],
        controllers: [
            app_controller_1.AppController,
            voice_controller_1.VoiceController,
            ai_voice_controller_1.AIVoiceController,
        ],
        providers: [
            app_service_1.AppService,
            ai_voice_service_1.AIVoiceService,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map