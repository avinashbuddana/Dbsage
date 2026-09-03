import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import { getOrCreateRequestId } from '../request-id';
import type { RequestWithId } from '../types/request-with-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = getOrCreateRequestId(request.id ?? request.header('x-request-id'));
    request.id = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
