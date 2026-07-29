import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './contact.entity';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { DirectorySearchService } from './directory-search.service';
import { EmailConnection } from '../integrations/email/email-connection.entity';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    // EmailConnection is needed read-only, to reach the user's mailbox tokens
    // for directory search. Registering the entity here avoids depending on
    // EmailModule and the provider wiring that comes with it.
    TypeOrmModule.forFeature([Contact, EmailConnection]),
    OrganizationsModule,
  ],
  providers: [ContactsService, DirectorySearchService],
  controllers: [ContactsController],
  exports: [ContactsService, DirectorySearchService],
})
export class ContactsModule {}
