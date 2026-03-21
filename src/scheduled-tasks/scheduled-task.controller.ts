import {
  Controller,
  Get,
  Delete,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ScheduledTaskService } from './scheduled-task.service';

/**
 * ScheduledTaskController
 *
 * REST endpoints for managing a user's scheduled tasks.
 * All routes are protected by ApiKeyGuard (JWT) — req.atomUserId is populated.
 *
 * GET  /scheduled-tasks        — list all tasks for the current user
 * GET  /scheduled-tasks/pending — list only pending tasks
 * DELETE /scheduled-tasks/:id  — cancel a pending task
 */
@Controller('scheduled-tasks')
export class ScheduledTaskController {
  constructor(private readonly service: ScheduledTaskService) {}

  @Get()
  async listAll(@Req() req: any) {
    const userId = req.atomUserId as string;
    const tasks = await this.service.list(userId);
    return {
      tasks: tasks.map(t => ({
        id:          t.id,
        taskType:    t.taskType,
        description: t.description,
        scheduledAt: t.scheduledAt,
        status:      t.status,
        resultSummary: t.resultSummary,
        createdAt:   t.createdAt,
      })),
      count: tasks.length,
    };
  }

  @Get('pending')
  async listPending(@Req() req: any) {
    const userId = req.atomUserId as string;
    const tasks = await this.service.listPending(userId);
    return {
      tasks: tasks.map(t => ({
        id:          t.id,
        taskType:    t.taskType,
        description: t.description,
        scheduledAt: t.scheduledAt,
        status:      t.status,
        createdAt:   t.createdAt,
      })),
      count: tasks.length,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = req.atomUserId as string;
    const result = await this.service.cancel(id, userId);
    if (!result.ok) {
      throw new BadRequestException(result.message);
    }
    return result;
  }
}
