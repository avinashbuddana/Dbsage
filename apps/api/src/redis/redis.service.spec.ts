import type { PinoLogger } from 'nestjs-pino';

import type { AppConfigService } from '../config/app-config.service';

const createClientMock = jest.fn();

jest.mock('redis', () => ({
  createClient: (options: unknown): unknown => createClientMock(options),
}));

import { RedisService } from './redis.service';

describe('RedisService lifecycle', () => {
  const client = {
    isOpen: true,
    connect: jest.fn(),
    ping: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createClientMock.mockReturnValue(client);
  });

  it('disables reconnect loops and destroys the client during shutdown', async () => {
    const config = {
      redis: { host: 'localhost', port: 6379, password: 'local-password' },
    } as AppConfigService;
    const logger = { error: jest.fn() } as unknown as PinoLogger;
    const service = new RedisService(config, logger);

    expect(createClientMock).toHaveBeenCalledWith({
      socket: {
        host: 'localhost',
        port: 6379,
        connectTimeout: 5_000,
        reconnectStrategy: false,
      },
      password: 'local-password',
    });

    await service.onApplicationShutdown();
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });
});
