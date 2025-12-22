import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Embedding Service
 * Generates vector embeddings using OpenAI API
 */
@Injectable()
export class EmbeddingService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate embedding for a single text
   * @param text Input text
   * @returns Vector embedding (1536 dimensions for text-embedding-3-small)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate embedding');
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param texts Array of input texts
   * @returns Array of vector embeddings
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate embeddings');
    }
  }

  /**
   * Split text into chunks for embedding
   * @param text Input text
   * @param chunkSize Maximum size of each chunk
   * @param overlap Overlap between chunks
   * @returns Array of text chunks with metadata
   */
  splitTextIntoChunks(
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200,
  ): Array<{ content: string; startPosition: number; endPosition: number }> {
    const chunks: Array<{
      content: string;
      startPosition: number;
      endPosition: number;
    }> = [];

    let startPosition = 0;

    while (startPosition < text.length) {
      const endPosition = Math.min(startPosition + chunkSize, text.length);
      const content = text.substring(startPosition, endPosition);

      chunks.push({
        content,
        startPosition,
        endPosition,
      });

      // Move to next chunk with overlap
      startPosition += chunkSize - overlap;

      // If we're at the end, break to avoid infinite loop
      if (endPosition === text.length) {
        break;
      }
    }

    return chunks;
  }
}
