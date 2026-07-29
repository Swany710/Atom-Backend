import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ContactsService, ContactInput } from './contacts.service';
import { DirectorySearchService } from './directory-search.service';

/**
 * ContactsController — Atom's own address book.
 *
 *   GET    /api/v1/contacts              list / search
 *   POST   /api/v1/contacts              create
 *   GET    /api/v1/contacts/directory    search the connected mailbox (read-only)
 *   GET    /api/v1/contacts/:id          one contact
 *   PATCH  /api/v1/contacts/:id          update
 *   DELETE /api/v1/contacts/:id          delete
 *
 * /directory finds candidates in Gmail/Outlook but saves NOTHING — the client
 * posts the ones the user picked back to POST /contacts. Import is always an
 * explicit choice, never a side effect of searching.
 */
@ApiTags('Contacts')
@ApiBearerAuth('bearer')
@Controller('api/v1/contacts')
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly directory: DirectorySearchService,
  ) {}

  private userId(req: any): string {
    return req.atomUserId ?? process.env.OWNER_USER_ID ?? 'owner';
  }

  @Get()
  async list(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contacts.list(this.userId(req), {
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Search the user's connected mailbox for people. Read-only.
   * Declared BEFORE :id so "directory" isn't captured as an id.
   */
  @Get('directory')
  async searchDirectory(
    @Req() req: any,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.directory.search(
      this.userId(req),
      q,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.contacts.get(this.userId(req), id);
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: ContactInput & { allowDuplicate?: boolean },
  ) {
    const { allowDuplicate, ...input } = body ?? {};
    return this.contacts.create(this.userId(req), input, { allowDuplicate });
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: ContactInput) {
    return this.contacts.update(this.userId(req), id, body ?? {});
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.contacts.remove(this.userId(req), id);
  }
}
