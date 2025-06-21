import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log error
  logger.error('API Error', {
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name
    },
    request: {
      path: req.path,
      method: req.method,
      ip: req.ip
    },
    isOperational
  });

  // Send error response
  res.status(statusCode).json({
    error: {
      message: isOperational ? err.message : 'Internal Server Error',
      code: err.name,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'APIError';
    Error.captureStackTrace(this, this.constructor);
  }
}
