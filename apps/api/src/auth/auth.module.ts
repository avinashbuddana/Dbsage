import { Module } from '@nestjs/common';

import { OrganizationContextService } from './organization-context.service';

@Module({
  providers: [OrganizationContextService],
  exports: [OrganizationContextService],
})
export class AuthModule {}
