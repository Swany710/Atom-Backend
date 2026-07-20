import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './organization.entity';
import { IntegrationCredential } from './integration-credential.entity';
import { User } from '../users/user.entity';
import { TenantContextService } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { OrgResolverService } from './org-resolver.service';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * OrganizationsModule — tenant layer (TENANCY-DESIGN.md).
 *
 * @Global so TenantContextService is injectable everywhere without each
 * module importing this one. TenantContextInterceptor is registered as a
 * global APP_INTERCEPTOR in app.module.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, IntegrationCredential, User]),
    AuthModule,
  ],
  providers: [TenantContextService, TenantContextInterceptor, OrgResolverService, OrganizationsService],
  controllers: [OrganizationsController],
  exports: [TypeOrmModule, TenantContextService, OrgResolverService],
})
export class OrganizationsModule {}
