import { validateEnvironment } from './environment';

const validEnvironment = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  WEB_PORT: '3000',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_NAME: 'schemaiq_test',
  DATABASE_USER: 'schemaiq',
  DATABASE_PASSWORD: 'database-password',
  DATABASE_SSL: 'false',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: 'redis-password',
  JWT_SECRET: 'jwt-secret-with-at-least-32-characters',
  ENCRYPTION_KEY: 'encryption-key-with-at-least-32-chars',
  DATASOURCE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MYSQL_MAX_ACTIVE_DATASOURCES: '10',
  MYSQL_DATASOURCE_IDLE_TIMEOUT_MS: '300000',
  MYSQL_DATASOURCE_CLEANUP_INTERVAL_MS: '60000',
  MYSQL_POOL_SIZE: '3',
  MYSQL_CONNECT_TIMEOUT_MS: '5000',
  ALLOW_LOCAL_DATASOURCES: 'false',
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'info',
};

describe('validateEnvironment', () => {
  it('coerces ports and booleans into typed values', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.API_PORT).toBe(3001);
    expect(environment.DATABASE_PORT).toBe(5432);
    expect(environment.DATABASE_SSL).toBe(false);
    expect(environment.MYSQL_POOL_SIZE).toBe(3);
    expect(environment.ALLOW_LOCAL_DATASOURCES).toBe(false);
  });

  it('fails fast when required secrets are absent', () => {
    const withoutJwtSecret: Record<string, unknown> = { ...validEnvironment };
    delete withoutJwtSecret.JWT_SECRET;

    expect(() => validateEnvironment(withoutJwtSecret)).toThrow('Invalid environment');
  });

  it('rejects wildcard CORS in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGIN: '*',
      }),
    ).toThrow('Invalid environment');
  });

  it('rejects a datasource encryption key that is not exactly 32 decoded bytes', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATASOURCE_ENCRYPTION_KEY: Buffer.alloc(31).toString('base64'),
      }),
    ).toThrow('DATASOURCE_ENCRYPTION_KEY');
  });
});
