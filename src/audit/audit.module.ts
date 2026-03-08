import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * @Global() so AuditService can be injected anywhere without importing
 * AuditModule in every feature module.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
