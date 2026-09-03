import type { AppConfigService } from '../config/app-config.service';
import type { DataSource } from 'typeorm';
import { DatasourceConnectionMode, DatasourceStatus, DatasourceType } from '../datasources/enums/datasource.enums';
import { MySqlDatabaseConnector } from './mysql-database.connector';
import type { CustomerDatabaseConnectionConfig } from './database-connector.types';

const config: CustomerDatabaseConnectionConfig = {
  datasourceId: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
  type: DatasourceType.MySql,
  connectionMode: DatasourceConnectionMode.Direct,
  status: DatasourceStatus.Active,
  host: '203.0.113.10',
  port: 3306,
  databaseName: 'app',
  username: 'reader',
  password: 'secret',
  sslEnabled: true,
};

describe('MySqlDatabaseConnector', () => {
  const appConfig = {
    mysql: { connectTimeoutMs: 4_000, poolSize: 3 },
  } as unknown as AppConfigService;

  afterEach(() => jest.restoreAllMocks());

  it('creates a locked-down dynamic TypeORM datasource', async () => {
    const connector = new MySqlDatabaseConnector(appConfig);
    const initialize = jest
      .spyOn(
        (await import('typeorm')).DataSource.prototype,
        'initialize',
      )
      .mockImplementation(function (this: DataSource) {
        return Promise.resolve(this);
      });

    const dataSource = await connector.createDataSource(config);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(dataSource.options).toMatchObject({
      type: 'mysql',
      connectorPackage: 'mysql2',
      entities: [],
      synchronize: false,
      migrationsRun: false,
      logging: false,
      multipleStatements: false,
      connectTimeout: 4_000,
      poolSize: 3,
      ssl: { rejectUnauthorized: true },
    });
  });

  it('always destroys a temporary connection after SELECT 1', async () => {
    const connector = new MySqlDatabaseConnector(appConfig);
    const destroy = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockResolvedValue([{ '1': 1 }]);
    const temporary = {
      isInitialized: true,
      query,
      destroy,
    } as unknown as DataSource;
    jest.spyOn(connector, 'createDataSource').mockResolvedValue(temporary);

    await expect(connector.testConnection(config)).resolves.toMatchObject({
      success: true,
      databaseType: DatasourceType.MySql,
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ER_ACCESS_DENIED_ERROR', 'DATASOURCE_AUTHENTICATION_FAILED'],
    ['ECONNREFUSED', 'DATASOURCE_CONNECTION_REFUSED'],
    ['ETIMEDOUT', 'DATASOURCE_TIMEOUT'],
    ['ER_BAD_DB_ERROR', 'DATASOURCE_DATABASE_NOT_FOUND'],
  ])('normalizes %s without exposing driver errors', async (driverCode, safeCode) => {
    const connector = new MySqlDatabaseConnector(appConfig);
    jest.spyOn(connector, 'createDataSource').mockRejectedValue(
      Object.assign(new Error('driver details and host'), { code: driverCode }),
    );

    await expect(connector.testConnection(config)).rejects.toMatchObject({
      code: safeCode,
      message: expect.not.stringContaining('driver details'),
    });
  });
});
