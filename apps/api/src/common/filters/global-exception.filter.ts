import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { DatasourceConnectionError } from '../../database-connections/datasource-connection.error';
import { DuplicateImportException } from '../../imports/hashing/duplicate-import.error';
import type { RequestWithId } from '../types/request-with-id';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  existingImportId?: string;
  fileHash?: string;
  previousImport?: DuplicateImportException['previousImport'];
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Access denied';
    case 404:
      return 'Resource not found';
    case 409:
      return 'Request conflicts with existing data';
    case 429:
      return 'Too many requests';
    case 503:
      return 'Service unavailable';
    default:
      return status >= 500 ? 'Internal server error' : 'Request failed';
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const requestId = request.id ?? 'unknown';
    const isKnownException =
      exception instanceof HttpException ||
      exception instanceof DatasourceConnectionError ||
      exception instanceof DuplicateImportException;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof DuplicateImportException
          ? 409
          : exception instanceof DatasourceConnectionError
            ? exception.code === 'DATASOURCE_NETWORK_BLOCKED'
              ? 400
              : exception.code === 'DATASOURCE_DISABLED'
                ? 409
                : exception.code === 'DATASOURCE_RESOURCE_LIMIT'
                  ? 503
                  : 502
            : 500;

    if (!isKnownException) {
      this.logger.error(
        {
          requestId,
          exceptionType: exception instanceof Error ? exception.name : typeof exception,
        },
        'Unhandled request error',
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      code:
        exception instanceof DatasourceConnectionError
          ? exception.code
          : exception instanceof DuplicateImportException
            ? exception.code
            : codeForStatus(status),
      message:
        exception instanceof DatasourceConnectionError
          ? exception.message
          : exception instanceof DuplicateImportException
            ? exception.message
            : messageForStatus(status),
      requestId,
      ...(exception instanceof DuplicateImportException
        ? {
            existingImportId: exception.existingImportId,
            fileHash: exception.fileHash,
            ...(exception.previousImport ? { previousImport: exception.previousImport } : {}),
          }
        : {}),
    };

    response.status(status).json(body);
  }
}
