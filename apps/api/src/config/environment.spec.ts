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
  MYSQL_CUSTOMER_POOL_SIZE: '3',
  MYSQL_CONNECT_TIMEOUT_MS: '5000',
  ALLOW_LOCAL_DATASOURCES: 'false',
  LLM_PROVIDER: 'ollama',
  OLLAMA_MODEL: 'qwen3:8b',
  OLLAMA_EMBEDDING_MODEL: 'nomic-embed-text',
  OPENROUTER_API_KEY: 'test-openrouter-api-key',
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'info',
};

describe('validateEnvironment', () => {
  it('coerces ports and booleans into typed values', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.API_PORT).toBe(3001);
    expect(environment.DATABASE_PORT).toBe(5432);
    expect(environment.DATABASE_SSL).toBe(false);
    expect(environment).toMatchObject({ MYSQL_CUSTOMER_POOL_SIZE: 3 });
    expect(environment.ALLOW_LOCAL_DATASOURCES).toBe(false);
  });

  it('provides bounded CSV import defaults', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.CSV_IMPORT_MAX_FILE_SIZE_BYTES).toBeGreaterThan(
      environment.CSV_IMPORT_QUEUE_THRESHOLD_BYTES,
    );
    expect(environment.CSV_IMPORT_WORKER_CONCURRENCY).toBeGreaterThan(0);
  });

  it('provides validated, bounded LLM defaults', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      OPENROUTER_MODEL: 'nvidia/nemotron-3.5-lightning',
      LLM_MAX_CONCURRENCY: 4,
      LLM_PROVIDER: 'ollama',
      LLM_TEMPERATURE: 0.1,
    });
  });

  it('provides bounded database-context defaults', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      DATABASE_CONTEXT_MAX_ESTIMATED_TOKENS: 1_000,
      DATABASE_CONTEXT_MAX_RELATIONSHIP_DEPTH: 1,
      DATABASE_CONTEXT_MIN_VECTOR_SIMILARITY: 0.45,
    });
  });

  it('provides bounded SQL-generation defaults', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment).toMatchObject({
      SQL_DEFAULT_LIMIT: 100,
      SQL_MAX_FILTER_DEPTH: 3,
      SQL_MAX_LIMIT: 1_000,
      SQL_MAX_TABLES: 4,
    });
  });

  it('rejects a SQL default limit above its maximum', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, SQL_DEFAULT_LIMIT: '1001', SQL_MAX_LIMIT: '1000' }),
    ).toThrow('SQL_DEFAULT_LIMIT');
  });

  it('rejects a default model repeated in the approved fallback list', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LLM_FALLBACK_MODELS: 'nvidia/nemotron-3.5-lightning',
      }),
    ).toThrow('LLM_FALLBACK_MODELS');
  });

  it('rejects a non-loopback Ollama endpoint', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, OLLAMA_BASE_URL: 'http://ollama.example.com:11434' }),
    ).toThrow('OLLAMA_BASE_URL');
  });

  it('rejects COPY-unsafe CSV delimiters', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        CSV_IMPORT_ALLOWED_DELIMITERS: ",;'",
      }),
    ).toThrow('CSV_IMPORT_ALLOWED_DELIMITERS');
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

  it('rejects local datasource targets in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        ALLOW_LOCAL_DATASOURCES: 'true',
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

  it('does not require static customer MySQL credentials in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGIN: 'https://app.schemaiq.example',
      }),
    ).not.toThrow();
  });

  it('requires the selected provider credentials only', () => {
    const localOnly = { ...validEnvironment, OPENROUTER_API_KEY: '' };
    expect(() => validateEnvironment(localOnly)).not.toThrow();
    expect(() => validateEnvironment({ ...localOnly, LLM_PROVIDER: 'openrouter' })).toThrow(
      'OPENROUTER_API_KEY',
    );
  });
});
