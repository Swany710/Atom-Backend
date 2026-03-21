import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledTask } from './scheduled-task.entity';
import { ScheduledTaskService } from './scheduled-task.service';
import { ScheduledTaskController } from './scheduled-task.controller';
import { EmailModule } from '../integrations/email/email.module';

/**
 * ScheduledTasksModule
 *
 * Provides:
 *   - ScheduledTaskService  — create/list/cancel tasks + cron executor
 *   - ScheduledTaskController — REST endpoints (/scheduled-tasks/*)
 *
 * Imports:
 *   - EmailModule — needed by the cron executor to send emails on behalf of users
 *
 * Exports:
 *   - ScheduledTaskService — consumed by ToolExecutionService for the
 *     schedule_task / list_scheduled_tasks / cancel_scheduled_task tools
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledTask]),
    EmailModule,
  ],
  providers: [ScheduledTaskService],
  controllers: [ScheduledTaskController],
  exports: [ScheduledTaskService],
})
export class ScheduledTasksModule {}
