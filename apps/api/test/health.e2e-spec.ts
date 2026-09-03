import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { RedisService } from '../src/redis/redis.service';

describe('Health endpoints', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
        {
          provide: RedisService,
          useValue: { ping: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns the public liveness response', async () => {
    await request(httpServer)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', service: 'schemaiq-api' });
  });

  it('GET /api/v1/health/ready verifies managed dependencies', async () => {
    await request(httpServer)
      .get('/api/v1/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        service: 'schemaiq-api',
        checks: { postgres: 'up', redis: 'up' },
      });
  });
});
