import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { HttpModule } from '@nestjs/axios';
import { VoiceTranscriptionService } from './voice/voice.service';
import { VoiceController } from './voice/voice.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [VoiceController],
  providers: [VoiceTranscriptionService],
})
export class AppModule {}