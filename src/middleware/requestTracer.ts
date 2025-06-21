import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface TraceData {
  requestId: string;
  timestamp: number;
  method: string;
  url: string;
  ip: string;
  userAgent?: string;
  duration?: number;
}

export const requestTracer = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  const traceData: TraceData = {
    requestId,
    timestamp: startTime,
    method: req.method,
    url: req.url,
    ip: req.ip || 'unknown',
    userAgent: req.get('User-Agent') || undefined
  };

  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  logger.info('Request started', traceData);

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    traceData.duration = duration;

    logger.info('Request completed', {
      ...traceData,
      statusCode: res.statusCode,
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const getTraceContext = (req: Request) => ({
  requestId: req.headers['x-request-id'] as string || 'unknown',
  timestamp: Date.now()
});
