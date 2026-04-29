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
    const correlationId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : crypto.randomUUID();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    next();
  }
}
