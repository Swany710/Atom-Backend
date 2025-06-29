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
const typeorm_1 = require("@nestjs/typeorm");
const schedule_1 = require("@nestjs/schedule");
const event_emitter_1 = require("@nestjs/event-emitter");
const conversation_module_1 = require("./conversation/conversation.module");
const ai_voice_module_1 = require("./ai/ai-voice.module");
const n8n_voice_module_1 = require("./voice-transcription/n8n-voice.module");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const conversation_entity_1 = require("./conversation/entities/conversation.entity");
const conversation_message_entity_1 = require("./conversation/entities/conversation-message.entity");
const user_conversation_settings_entity_1 = require("./conversation/entities/user-conversation-settings.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ['.env.local', '.env'],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    type: 'postgres',
                    url: configService.get('SUPABASE_DATABASE_URL') || configService.get('DATABASE_URL'),
                    entities: [
                        conversation_entity_1.Conversation,
                        conversation_message_entity_1.ConversationMessage,
                        user_conversation_settings_entity_1.UserConversationSettings,
                    ],
                    synchronize: configService.get('NODE_ENV') !== 'production',
                    logging: configService.get('NODE_ENV') === 'development',
                    ssl: configService.get('NODE_ENV') === 'production' ? {
                        rejectUnauthorized: false
                    } : false,
                    extra: {
                        max: 10,
                        min: 1,
                        idleTimeoutMillis: 30000,
                        connectionTimeoutMillis: 2000,
                    },
                }),
            }),
            schedule_1.ScheduleModule.forRoot(),
            event_emitter_1.EventEmitterModule.forRoot(),
            conversation_module_1.ConversationModule,
            ai_voice_module_1.AIVoiceModule,
            n8n_voice_module_1.N8NVoiceModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map