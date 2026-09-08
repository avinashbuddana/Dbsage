import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { API_SERVICE_NAME } from '@schemaiq/shared';

import { getOrCreateRequestId } from '../common/request-id';
import { AppConfigService } from '../config/app-config.service';
import { ConfigurationModule } from '../config/configuration.module';

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-organization-id',
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'req.body.apiKey',
  'req.body.databasePassword',
  'req.body.sshPassword',
  'req.body.privateKey',
  'req.body.privateKeyPassphrase',
  'req.body.ssh.password',
  'req.body.ssh.privateKey',
  'req.body.ssh.privateKeyPassphrase',
  'req.body.encryptedValue',
  'req.body.iv',
  'req.body.authTag',
  'req.body.connectionString',
  'req.body.connectionUrl',
  'req.body.decryptedPassword',
  'req.body.specification',
  'res.headers.set-cookie',
  'password',
  'authorization',
  'cookie',
  'token',
  'secret',
  'apiKey',
  'databasePassword',
  'sshPassword',
  'privateKey',
  'privateKeyPassphrase',
  'encryptedValue',
  'iv',
  'authTag',
  'DATASOURCE_ENCRYPTION_KEY',
  'OPENROUTER_API_KEY',
  'connectionString',
  'connectionUrl',
  'decryptedPassword',
  'specification',
  'encryptedSpecification',
  'specificationIv',
  'specificationAuthTag',
  'specificationEncryptionVersion',
  'result',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
        pinoHttp: {
          autoLogging: config.nodeEnv === 'production',
          base: { service: API_SERVICE_NAME },
          level: config.logLevel,
          messageKey: 'message',
          timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
          redact: {
            paths: REDACTED_PATHS,
            censor: '[REDACTED]',
          },
          transport:
            config.nodeEnv === 'development'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    ignore: 'pid,hostname',
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                }
              : undefined,
          genReqId: (request, response) => {
            const requestId = getOrCreateRequestId(request.headers['x-request-id']);
            response.setHeader('x-request-id', requestId);
            return requestId;
          },
          customProps: (request) => ({
            requestId: request.id,
          }),
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
