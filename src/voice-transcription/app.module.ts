import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceTranscriptionService } from './voice-transcription.service';

@Module({
  imports: [],
  controllers: [VoiceController],
  providers: [VoiceTranscriptionService],
})
export class AppModule {}
