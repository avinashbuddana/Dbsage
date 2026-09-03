import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { isUUID } from 'class-validator';

import type { AppConfigService } from '../config/app-config.service';

@Injectable({ scope: Scope.REQUEST })
export class OrganizationContextService {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly config: AppConfigService,
  ) {}

  getOrganizationId(): string {
    if (this.config.nodeEnv === 'production') {
      throw new UnauthorizedException('Production authentication is not configured');
    }
    const organizationId = this.request.header('x-organization-id');
    if (!organizationId || !isUUID(organizationId, '4')) {
      throw new UnauthorizedException('A valid development organization context is required');
    }
    return organizationId;
  }
}
