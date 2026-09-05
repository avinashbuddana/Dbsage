import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createClient } from 'redis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class RedisService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly client: ReturnType<typeof createClient>;

  constructor(
    config: AppConfigService,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger,
  ) {
    const redis = config.redis;
    this.client = createClient({
      socket: {
        host: redis.host,
        port: redis.port,
        connectTimeout: 5_000,
        reconnectStrategy: false,
      },
      ...(redis.password === undefined ? {} : { password: redis.password }),
    });
    this.client.on('error', (error: Error) => {
      this.logger.error({ errorType: error.name }, 'Redis client error');
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  getClient(): ReturnType<typeof createClient> {
    return this.client;
  }

  disconnect(): Promise<void> {
    if (this.client.isOpen) {
      this.client.destroy();
    }

    return Promise.resolve();
  }
}
