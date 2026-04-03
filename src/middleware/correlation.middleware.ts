import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Correlation-ID middleware.
 *
 * Reads X-Correlation-Id from the incoming request (set by the proxy / caller)
 * or generates a fresh UUID if absent. The ID is then:
 *   - Forwarded in the response as X-Correlation-Id
 *   - Attached to req.correlationId for use by controllers / services
 *
 * Enabled globally in AppModule via app.use(middleware).
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction) {
    const incoming = req.headers['x-correlation-id'];

    // Sanitize to alphanumerics and hyphens only (UUID charset).
    // This prevents log-injection attacks where a crafted header containing
    // newlines, JSON metacharacters, or control characters could corrupt
    // structured log output or spoof log entries.
    // If the header is absent or becomes empty after sanitization, generate
    // a fresh UUID instead.
    const sanitized =
      typeof incoming === 'string'
        ? incoming.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)
        : '';

    const correlationId = sanitized.length > 0 ? sanitized : crypto.randomUUID();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  }
}
