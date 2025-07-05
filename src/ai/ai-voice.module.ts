import { Module } from '@nestjs/common';
import { AIVoiceController } from './ai-voice.controller';
import { AIVoiceService } from './ai-voice.service';

@Module({
  imports: [],
  controllers: [AIVoiceController],
  providers: [AIVoiceService],
  exports: [AIVoiceService],
})
export class AIVoiceModule {}