import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PendingAction } from './pending-action.entity';
import { PendingActionService } from './pending-action.service';

@Module({
  imports:  [TypeOrmModule.forFeature([PendingAction])],
  providers: [PendingActionService],
  exports:   [PendingActionService],
})
export class PendingActionModule {}
