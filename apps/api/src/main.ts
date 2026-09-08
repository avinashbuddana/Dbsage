import 'reflect-metadata';

import { ShutdownSignal, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { sanitizeStartupFailure } from './common/startup-failure';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.use('/api/v1/datasources/:id/spec-chat', json({ limit: '32mb' }));
  app.use('/api/v1/datasources/:id/spec-analyses', json({ limit: '32mb' }));
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);

  await app.listen(config.apiPort, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  const failure = sanitizeStartupFailure(error);
  process.stderr.write(
    `${JSON.stringify({
      errorType: failure.errorType,
      level: 'error',
      message: 'SchemaIQ API failed to start',
      startupFailure: failure.message,
    })}\n`,
  );
  process.exitCode = 1;
});
