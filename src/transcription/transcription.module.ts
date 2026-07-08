import { Module } from '@nestjs/common';
import { ElevenLabsTranscriptionService } from './elevenlabs-transcription.service';

@Module({
  providers: [ElevenLabsTranscriptionService],
  exports: [ElevenLabsTranscriptionService],
})
export class TranscriptionModule {}
