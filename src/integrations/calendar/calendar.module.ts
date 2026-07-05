import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarService } from './calendar.service';
import { GoogleCalendarService } from './google-calendar.service';
import { OutlookCalendarService } from './outlook-calendar.service';
import { CalendarController } from './calendar.controller';
import { EmailConnection } from '../email/email-connection.entity';
// EmailModule provides OutlookTransport (per-user token handling) for
// OutlookCalendarService. No circular dependency: EmailModule imports
// nothing from the calendar folder.
import { EmailModule } from '../email/email.module';

@Module({
  imports: [TypeOrmModule.forFeature([EmailConnection]), EmailModule],
  controllers: [CalendarController],
  providers: [CalendarService, GoogleCalendarService, OutlookCalendarService],
  exports: [CalendarService, GoogleCalendarService, OutlookCalendarService],
})
export class CalendarModule {}
