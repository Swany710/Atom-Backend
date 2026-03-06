import { Module } from '@nestjs/common';
import { AccuLynxService } from './acculynx.service';
import { AccuLynxController } from './acculynx.controller';

@Module({
  controllers: [AccuLynxController],
  providers:   [AccuLynxService],
  exports:     [AccuLynxService],
})
export class CrmModule {}
