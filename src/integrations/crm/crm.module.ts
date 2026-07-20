import { Module } from '@nestjs/common';
import { AccuLynxService } from './acculynx.service';
import { AccuLynxController } from './acculynx.controller';
import { CrmAccessPolicyService } from './crm-access-policy.service';

/**
 * CrmModule — AccuLynx integration + per-user access policy.
 * IntegrationCredential + User repositories come from the global
 * OrganizationsModule (TypeOrmModule export), so no imports needed here.
 */
@Module({
  controllers: [AccuLynxController],
  providers:   [AccuLynxService, CrmAccessPolicyService],
  exports:     [AccuLynxService, CrmAccessPolicyService],
})
export class CrmModule {}
