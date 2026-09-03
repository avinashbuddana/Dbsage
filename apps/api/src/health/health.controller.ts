import { Controller, Get } from '@nestjs/common';

import type { HealthResponse, ReadinessResponse } from '@schemaiq/types';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  health(): HealthResponse {
    return this.healthService.health();
  }

  @Get('ready')
  readiness(): Promise<ReadinessResponse> {
    return this.healthService.readiness();
  }
}
