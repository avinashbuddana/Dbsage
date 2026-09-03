import { Injectable } from '@nestjs/common';
import { createServer, type Server } from 'node:net';
import { Client, type ConnectConfig } from 'ssh2';

import type { AppConfigService } from '../config/app-config.service';
import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import { DatasourceConnectionError } from '../database-connections/datasource-connection.error';
import { SshAuthenticationType } from '../datasources/enums/datasource.enums';
import type { SshTunnelHandle } from './ssh-tunnel.types';

@Injectable()
export class SshTunnelService {
  constructor(private readonly config: AppConfigService) {}

  async createTunnel(config: CustomerDatabaseConnectionConfig): Promise<SshTunnelHandle> {
    if (!config.ssh) {
      throw new DatasourceConnectionError('SSH_TUNNEL_FAILED', 'SSH configuration is required');
    }
    const ssh = config.ssh;

    const client = this.createClient();
    const server = this.createForwardingServer(client, config);
    let healthy = false;
    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= (async () => {
        healthy = false;
        await this.closeServer(server);
        client.end();
      })();
      return closePromise;
    };

    return new Promise<SshTunnelHandle>((resolve, reject) => {
      const fail = (error: Error): void => {
        void close().then(() => reject(this.normalizeError(error)));
      };
      server.once('error', fail);
      client.once('error', fail);
      client.once('ready', () => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') {
            fail(new Error('SSH tunnel did not bind'));
            return;
          }
          server.removeListener('error', fail);
          client.removeListener('error', fail);
          const markUnhealthy = (): void => {
            healthy = false;
          };
          client.once('close', markUnhealthy);
          client.once('error', markUnhealthy);
          server.once('close', markUnhealthy);
          server.unref();
          healthy = true;
          resolve({
            host: '127.0.0.1',
            port: address.port,
            isHealthy: () => healthy,
            close,
          });
        });
      });
      client.connect(this.connectOptions(ssh));
    });
  }

  protected createClient(): Client {
    return new Client();
  }

  protected createForwardingServer(
    client: Client,
    config: CustomerDatabaseConnectionConfig,
  ): Server {
    return createServer((socket) => {
      client.forwardOut(
        '127.0.0.1',
        0,
        config.host,
        config.port,
        (error, stream) => {
          if (error) {
            socket.destroy();
            return;
          }
          socket.on('error', () => stream.destroy());
          stream.on('error', () => socket.destroy());
          socket.pipe(stream).pipe(socket);
        },
      );
    });
  }

  private connectOptions(ssh: NonNullable<CustomerDatabaseConnectionConfig['ssh']>): ConnectConfig {
    const authentication =
      ssh.authenticationType === SshAuthenticationType.Password
        ? { password: ssh.password }
        : { privateKey: ssh.privateKey, passphrase: ssh.privateKeyPassphrase };
    return {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      readyTimeout: this.config.mysql.connectTimeoutMs,
      keepaliveInterval: 30_000,
      keepaliveCountMax: 3,
      ...authentication,
    };
  }

  private closeServer(server: Server): Promise<void> {
    if (!server.listening) return Promise.resolve();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  private normalizeError(error: Error): DatasourceConnectionError {
    const details = error as Error & { code?: string; level?: string };
    const code = (() => {
      if (details.level === 'client-authentication') return 'SSH_AUTHENTICATION_FAILED' as const;
      if (details.code === 'ECONNREFUSED') return 'SSH_CONNECTION_REFUSED' as const;
      if (details.code === 'ETIMEDOUT') return 'SSH_TIMEOUT' as const;
      return 'SSH_TUNNEL_FAILED' as const;
    })();
    return new DatasourceConnectionError(code, 'SSH tunnel connection failed');
  }
}
