import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarService } from './calendar.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarController } from './calendar.controller';
import { EmailConnection } from '../email/email-connection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailConnection])],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleCalendarService],
  exports: [CalendarService, GoogleCalendarService],
})
export class CalendarModule {}
