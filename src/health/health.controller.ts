import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Response } from 'express';
import { Public } from '../decorators/public.decorator';
import { checkCapabilities } from '../config/env.validation';

/**
 * Liveness  — GET /health          → always 200 while the process is alive
 * Readiness — GET /health/ready    → 200 when DB is reachable, 503 when not
 *
 * IMPORTANT: The readiness endpoint must return HTTP 503 (not 200) when the
 * database is unreachable. Railway and load balancers read the HTTP status
 * code to decide whether to route traffic — a 200 with an error body is
 * treated as healthy.
 *
 * Both endpoints are @Public() — health-checkers do not carry Authorization.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Liveness: is the process alive? */
  @Public()
  @Get()
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: '1.1.0',
    };
  }

  /**
   * Readiness: is the database reachable? Returns 200 or 503.
   *
   * Also reports which AI/voice features are configured. Missing AI keys do NOT
   * fail readiness — the service is still able to serve traffic — but they are
   * listed so "why did voice stop working?" is answerable from a single curl
   * instead of a container log dig.
   */
  @Public()
  @Get('ready')
  async readiness(@Res() res: Response): Promise<void> {
    const capabilities = checkCapabilities();
    const degraded = capabilities.filter((c) => !c.ok).map((c) => c.detail);

    try {
      await this.dataSource.query('SELECT 1');
      res.status(HttpStatus.OK).json({
        status: degraded.length ? 'degraded' : 'ok',
        db: 'connected',
        capabilities: Object.fromEntries(capabilities.map((c) => [c.feature, c.ok])),
        ...(degraded.length ? { missing: degraded } : {}),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 503 signals Railway/load balancers to stop routing traffic to this pod
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'unavailable',
        db: 'disconnected',
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
