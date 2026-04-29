import { Module } from '@nestjs/common';
import { OpenAiTranscriptionService } from './openai-transcription.service';

@Module({
  providers: [OpenAiTranscriptionService],
  exports: [OpenAiTranscriptionService],
})
export class TranscriptionModule {}
