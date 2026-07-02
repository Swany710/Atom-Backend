import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { User } from '../users/user.entity';
import { PendingAction } from '../pending-actions/pending-action.entity';
import { ChatMemory } from '../conversations/chat-memory.entity';
import { ScheduledTask } from '../scheduled-tasks/scheduled-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PendingAction, ChatMemory, ScheduledTask]),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
