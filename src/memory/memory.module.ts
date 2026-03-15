import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserMemory } from './user-memory.entity';
import { UserMemoryService } from './user-memory.service';

@Module({
  imports:   [TypeOrmModule.forFeature([UserMemory])],
  providers: [UserMemoryService],
  exports:   [UserMemoryService],
})
export class MemoryModule {}
