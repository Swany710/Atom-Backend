import { Module } from '@nestjs/common';
import { CalendarModule } from '../integrations/calendar/calendar.module';
import { EmailModule } from '../integrations/email/email.module';
import { CrmModule } from '../integrations/crm/crm.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { PendingActionModule } from '../pending-actions/pending-action.module';
import { AuditModule } from '../audit/audit.module';
import { ToolDefinitionsService } from './tool-definitions.service';
import { ToolExecutionService } from './tool-execution.service';

@Module({
  imports: [CalendarModule, EmailModule, CrmModule, KnowledgeBaseModule, PendingActionModule, AuditModule],
  providers: [ToolDefinitionsService, ToolExecutionService],
  exports: [ToolDefinitionsService, ToolExecutionService],
})
export class ToolsModule {}
