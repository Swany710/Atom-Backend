import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AIVoiceService } from './ai/ai-voice.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, AIVoiceService],
})
export class AppModule {
  constructor() {
    console.log('✅ Atom App Module loaded - Ready for frontend connection');
  }
}