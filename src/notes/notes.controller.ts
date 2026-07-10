import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotesService } from './notes.service';

/**
 * Notes API — user-scoped (req.atomUserId comes from the ApiKeyGuard:
 * JWT users get their own id, API-key callers act as OWNER_USER_ID).
 */
@ApiBearerAuth('bearer')
@ApiTags('Notes')
@Controller('api/v1/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  private userId(req: any): string {
    return req.atomUserId;
  }

  /** GET /api/v1/notes?search=&limit= */
  @Get()
  list(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('limit') limit = '50',
  ) {
    return this.notes.list(this.userId(req), {
      search,
      limit: parseInt(limit, 10) || 50,
    });
  }

  /** POST /api/v1/notes  { content, title? } */
  @Post()
  create(@Req() req: any, @Body() body: { content: string; title?: string }) {
    return this.notes.create(this.userId(req), body?.content, body?.title);
  }

  /** PATCH /api/v1/notes/:id  { content?, title? } */
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { content?: string; title?: string },
  ) {
    return this.notes.update(this.userId(req), id, body ?? {});
  }

  /** DELETE /api/v1/notes/:id */
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.notes.delete(this.userId(req), id);
  }
}
