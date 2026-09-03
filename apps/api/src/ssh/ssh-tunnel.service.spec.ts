import { EventEmitter } from 'node:events';
import type { Server, Socket } from 'node:net';
import type { Client, ConnectConfig } from 'ssh2';

import type { AppConfigService } from '../config/app-config.service';
import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
  SshAuthenticationType,
} from '../datasources/enums/datasource.enums';
import { SshTunnelService } from './ssh-tunnel.service';

class FakeSshClient extends EventEmitter {
  readonly connect = jest.fn((options: ConnectConfig) => {
    this.options = options;
    queueMicrotask(() => this.emit('ready'));
    return this as unknown as Client;
  });
  readonly end = jest.fn(() => this.emit('close'));
  readonly forwardOut = jest.fn(
    (
      _sourceHost: string,
      _sourcePort: number,
      _destinationHost: string,
      _destinationPort: number,
      callback: (error: Error | undefined, stream: Socket) => void,
    ) => callback(new Error('not used'), undefined as unknown as Socket),
  );
  options?: ConnectConfig;
}

class TestSshTunnelService extends SshTunnelService {
  readonly listen = jest.fn();

  constructor(
    config: AppConfigService,
    private readonly fakeClient: FakeSshClient,
  ) {
    super(config);
  }

  protected override createClient(): Client {
    return this.fakeClient as unknown as Client;
  }

  protected override createForwardingServer(): Server {
    const server = new EventEmitter() as EventEmitter & {
      listening: boolean;
      listen: (port: number, host: string, callback: () => void) => void;
      address: () => { address: string; family: string; port: number };
      close: (callback: () => void) => void;
      unref: () => void;
    };
    server.listening = false;
    server.listen = (port, host, callback) => {
      this.listen(port, host);
      server.listening = true;
      callback();
    };
    server.address = () => ({ address: '127.0.0.1', family: 'IPv4', port: 41_234 });
    server.close = (callback) => {
      server.listening = false;
      server.emit('close');
      callback();
    };
    server.unref = jest.fn();
    return server as unknown as Server;
  }
}

const datasourceConfig: CustomerDatabaseConnectionConfig = {
  datasourceId: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
  type: DatasourceType.MySql,
  connectionMode: DatasourceConnectionMode.SshTunnel,
  status: DatasourceStatus.Active,
  host: '10.1.2.3',
  port: 3306,
  databaseName: 'app',
  username: 'reader',
  password: 'db-secret',
  sslEnabled: true,
  ssh: {
    host: 'bastion.example.com',
    port: 22,
    username: 'tunnel-user',
    authenticationType: SshAuthenticationType.PrivateKey,
    privateKey: 'private-key',
    privateKeyPassphrase: 'passphrase',
  },
};

const appConfig = {
  mysql: { connectTimeoutMs: 5_000 },
} as unknown as AppConfigService;

describe('SshTunnelService', () => {
  it('binds an ephemeral loopback listener and closes every resource', async () => {
    const client = new FakeSshClient();
    const service = new TestSshTunnelService(appConfig, client);

    const tunnel = await service.createTunnel(datasourceConfig);

    expect(tunnel.host).toBe('127.0.0.1');
    expect(tunnel.port).toBeGreaterThan(0);
    expect(service.listen).toHaveBeenCalledWith(0, '127.0.0.1');
    expect(client.options).toMatchObject({
      host: 'bastion.example.com',
      port: 22,
      username: 'tunnel-user',
      privateKey: 'private-key',
      passphrase: 'passphrase',
      readyTimeout: 5_000,
    });
    await tunnel.close();
    await tunnel.close();
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(tunnel.isHealthy()).toBe(false);
  });

  it('normalizes SSH authentication failures and closes the client', async () => {
    const client = new FakeSshClient();
    client.connect.mockImplementationOnce(() => {
      queueMicrotask(() => client.emit('error', Object.assign(new Error('driver detail'), { level: 'client-authentication' })));
      return client as unknown as Client;
    });
    const service = new TestSshTunnelService(appConfig, client);

    await expect(service.createTunnel(datasourceConfig)).rejects.toMatchObject({
      code: 'SSH_AUTHENTICATION_FAILED',
      message: expect.not.stringContaining('driver detail'),
    });
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
