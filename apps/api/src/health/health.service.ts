import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { HealthResponse, ReadinessResponse } from '@schemaiq/types';

import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  health(): HealthResponse {
    return { status: 'ok', service: 'schemaiq-api' };
  }

  async readiness(): Promise<ReadinessResponse> {
    const [postgres, redis] = await Promise.allSettled([
      this.dataSource.query('SELECT 1'),
      this.redis.ping(),
    ]);

    if (postgres.status === 'rejected' || redis.status === 'rejected' || !redis.value) {
      throw new ServiceUnavailableException();
    }

    return {
      status: 'ok',
      service: 'schemaiq-api',
      checks: { postgres: 'up', redis: 'up' },
    };
  }
}
