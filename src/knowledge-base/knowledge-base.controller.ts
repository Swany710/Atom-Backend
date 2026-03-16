import {
  Controller, Get, Post, Delete, Body, Query, Param,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeBaseService } from './knowledge-base.service';

@Controller('api/v1/knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kb: KnowledgeBaseService) {}

  /** GET /api/v1/knowledge-base  — list / browse */
  @Get()
  list(
    @Query('page')     page     = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search')   search?: string,
    @Query('category') category?: string,
  ) {
    return this.kb.listEntries({
      page:     parseInt(page, 10)     || 1,
      pageSize: parseInt(pageSize, 10) || 20,
      search,
      category,
    });
  }

  /** GET /api/v1/knowledge-base/search?q=...  — semantic / keyword search */
  @Get('search')
  search(
    @Query('q')     q     = '',
    @Query('limit') limit = '5',
  ) {
    if (!q.trim()) return { success: false, error: 'Query is required.' };
    return this.kb.search(q, parseInt(limit, 10) || 5);
  }

  /** GET /api/v1/knowledge-base/categories */
  @Get('categories')
  async categories() {
    const cats = await this.kb.listCategories();
    return { categories: cats };
  }

  /** GET /api/v1/knowledge-base/:id */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const entry = await this.kb.getEntry(id);
    if (!entry) return { success: false, error: 'Entry not found.' };
    return { success: true, entry };
  }

  /** POST /api/v1/knowledge-base  — add a manual / pre-loaded entry */
  @Post()
  addEntry(@Body() body: {
    title:     string;
    content:   string;
    source?:   string;
    category?: string;
  }) {
    return this.kb.addEntry(body);
  }

  /** POST /api/v1/knowledge-base/upload  — upload a text/PDF file */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['text/plain', 'text/markdown', 'application/pdf',
                         'application/msword',
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.md')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only .txt, .md, .pdf and .docx files are supported.'), false);
        }
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('title')    title?: string,
    @Body('category') category?: string,
  ) {
    if (!file) return { success: false, error: 'No file uploaded.' };

    let content = '';

    if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
      content = file.buffer.toString('utf-8');
    } else if (file.mimetype === 'application/pdf') {
      // Extract text from PDF using a simple approach
      try {
        const pdfParse = require('pdf-parse');
        const parsed   = await pdfParse(file.buffer);
        content        = parsed.text;
      } catch {
        // If pdf-parse not available, store as note
        content = `[PDF file uploaded: ${file.originalname} — text extraction not available. Install pdf-parse to enable.]`;
      }
    } else {
      content = file.buffer.toString('utf-8');
    }

    if (!content.trim()) {
      return { success: false, error: 'Could not extract text from file.' };
    }

    return this.kb.addEntry({
      title:    title?.trim() || file.originalname.replace(/\.[^.]+$/, ''),
      content,
      source:   'upload',
      category: category?.trim() || undefined,
      fileName: file.originalname,
    });
  }

  /** DELETE /api/v1/knowledge-base/:id */
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.kb.deleteEntry(id);
  }
}
