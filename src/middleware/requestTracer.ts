import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      traceId: string;
      startTime: number;
    }
  }
}

export const requestTracer = (req: Request, res: Response, next: NextFunction) => {
  // Generate trace ID
  req.traceId = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // Add trace ID to response headers
  res.setHeader('X-Request-ID', req.traceId);

  // Log request start
  logger.info('Request started', {
    traceId: req.traceId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.info('Request completed', {
      traceId: req.traceId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
  });

  next();
};

export const getTraceContext = (req: Request) => ({
  traceId: req.traceId,
  path: req.path,
  method: req.method,
  startTime: req.startTime
});
