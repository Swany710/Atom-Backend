import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../decorators/public.decorator';

/**
 * Liveness  — GET /health          → always 200 while the process is alive
 * Readiness — GET /health/ready    → 200 only when DB is reachable
 *
 * Both endpoints are @Public() — health-checkers (Railway, load balancers)
 * do not carry an Authorization header.
 */
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
    };
  }

  /** Readiness: is the database reachable? */
  @Public()
  @Get('ready')
  async readiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        db: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Return 503 without throwing so Railway stops routing traffic, not crashing the pod
      return {
        status: 'unavailable',
        db: 'disconnected',
        error: message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
