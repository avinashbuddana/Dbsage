import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import type { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const dataSource = {
    query: jest.fn<Promise<unknown[]>, [string]>(),
  };
  const redis = {
    ping: jest.fn<Promise<boolean>, []>(),
  };

  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(
      dataSource as unknown as DataSource,
      redis as unknown as RedisService,
    );
  });

  it('reports the API as healthy without exposing infrastructure details', () => {
    expect(service.health()).toEqual({ status: 'ok', service: 'schemaiq-api' });
  });

  it('reports readiness when PostgreSQL and Redis respond', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue(true);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      service: 'schemaiq-api',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('returns a sanitized unavailable error when a dependency fails', async () => {
    dataSource.query.mockRejectedValue(new Error('postgres://user:secret@host/database'));
    redis.ping.mockResolvedValue(true);

    await expect(service.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
