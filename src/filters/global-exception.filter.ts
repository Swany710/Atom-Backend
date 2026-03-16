import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Standard error response shape emitted on every unhandled exception.
 * Frontend can rely on this structure across all endpoints.
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  correlationId: string | null;
  timestamp: string;
  path: string;
  details?: unknown;
}

/**
 * GlobalExceptionFilter
 *
 * Catches every thrown exception (Nest HTTP exceptions, TypeORM errors,
 * and unhandled runtime errors) and normalises the response to the
 * ApiErrorResponse shape above.
 *
 * Registered via app.useGlobalFilters() in main.ts so it applies before
 * any route handler responds.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const res = ctx.getResponse<Response>();

    const correlationId = req?.correlationId ?? null;
    const path = req?.url ?? 'unknown';
    const timestamp = new Date().toISOString();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b['message'] as string) ?? exception.message;
        if (b['error']) details = { error: b['error'] };
        if (Array.isArray(b['message'])) {
          // class-validator ValidationPipe produces string[] messages
          details = { validationErrors: b['message'] };
          message = 'Validation failed';
        }
      }

      code = this.statusToCode(status);
    } else if (exception instanceof Error) {
      message = exception.message;
      // Expose stack in non-production for debugging
      if (process.env.NODE_ENV !== 'production') {
        details = { stack: exception.stack };
      }
    }

    const body: ApiErrorResponse = {
      code,
      message,
      correlationId,
      timestamp,
      path,
      ...(details !== undefined ? { details } : {}),
    };

    // Log at error level so Railway's log shipper captures it
    this.logger.error(
      JSON.stringify({ ...body, level: 'ERROR', status }),
    );

    res.status(status).json(body);
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
