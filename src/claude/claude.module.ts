import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { ToolsModule } from '../tools/tools.module';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';

@Module({
  imports: [ConversationsModule, ToolsModule],
  providers: [ClaudeOrchestratorService],
  exports: [ClaudeOrchestratorService],
})
export class ClaudeModule {}
