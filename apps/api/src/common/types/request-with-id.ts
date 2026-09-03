import type { Request } from 'express';

export type RequestWithId = Omit<Request, 'id'> & { id?: string };
