import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { SearchDocumentsDto } from './dto/search-documents.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

/**
 * Knowledge Base Controller
 * Handles document upload, retrieval, and vector search
 */
@ApiTags('Knowledge Base')
@Controller('knowledge-base')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  /**
   * Upload a document
   */
  @Post('documents')
  @ApiOperation({ summary: 'Upload a document to knowledge base' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Document uploaded successfully',
  })
  async uploadDocument(
    @Body() uploadDto: UploadDocumentDto,
    @CurrentUser() user: User,
  ): Promise<any> {
    return this.knowledgeBaseService.uploadDocument(user.id, uploadDto);
  }

  /**
   * Get all documents
   */
  @Get('documents')
  @ApiOperation({ summary: 'Get all documents' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Documents retrieved successfully',
  })
  async getDocuments(@CurrentUser() user: User): Promise<any[]> {
    return this.knowledgeBaseService.getDocuments(user.id);
  }

  /**
   * Get a specific document
   */
  @Get('documents/:id')
  @ApiOperation({ summary: 'Get a specific document' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Document retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Document not found',
  })
  async getDocument(
    @Param('id') documentId: string,
    @CurrentUser() user: User,
  ): Promise<any> {
    return this.knowledgeBaseService.getDocument(user.id, documentId);
  }

  /**
   * Delete a document
   */
  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Document deleted successfully',
  })
  async deleteDocument(
    @Param('id') documentId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.knowledgeBaseService.deleteDocument(user.id, documentId);
  }

  /**
   * Get document chunks
   */
  @Get('documents/:id/chunks')
  @ApiOperation({ summary: 'Get chunks for a document' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chunks retrieved successfully',
  })
  async getDocumentChunks(
    @Param('id') documentId: string,
    @CurrentUser() user: User,
  ): Promise<any[]> {
    return this.knowledgeBaseService.getDocumentChunks(user.id, documentId);
  }

  /**
   * Search documents using vector similarity
   */
  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search documents using vector similarity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Search results retrieved',
  })
  async searchDocuments(
    @Body() searchDto: SearchDocumentsDto,
    @CurrentUser() user: User,
  ): Promise<any[]> {
    return this.knowledgeBaseService.searchDocuments(user.id, searchDto);
  }

  /**
   * Get knowledge base statistics
   */
  @Get('statistics')
  @ApiOperation({ summary: 'Get knowledge base statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
  })
  async getStatistics(@CurrentUser() user: User): Promise<any> {
    return this.knowledgeBaseService.getStatistics(user.id);
  }
}
