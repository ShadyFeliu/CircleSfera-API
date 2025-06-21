import { Request, Response, NextFunction } from 'express';
import { APIError } from './errorHandler';

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.METRICS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

export const validateTimeframe = (req: Request, res: Response, next: NextFunction) => {
  const validTimeframes = ['6h', '12h', '24h', '3d', '7d'];
  const timeframe = req.query.timeframe as string;
  
  if (timeframe && !validTimeframes.includes(timeframe)) {
    throw new APIError(
      `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`,
      400
    );
  }
  next();
};

export const validateTestData = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    throw new APIError('This endpoint is only available in development mode', 403);
  }

  const { days, patterns } = req.body;

  if (!days || !patterns || !Array.isArray(patterns)) {
    throw new APIError(
      'Invalid request body. Expected {days: number, patterns: Array<{type: string, frequency: number, severity: string, jitter: number}>}',
      400
    );
  }

  // Validate each pattern
  patterns.forEach((pattern, index) => {
    if (!pattern.type || typeof pattern.type !== 'string') {
      throw new APIError(`Invalid type in pattern ${index}`, 400);
    }
    if (!pattern.frequency || typeof pattern.frequency !== 'number' || pattern.frequency <= 0) {
      throw new APIError(`Invalid frequency in pattern ${index}`, 400);
    }
    if (!pattern.severity || !['warning', 'critical'].includes(pattern.severity)) {
      throw new APIError(`Invalid severity in pattern ${index}`, 400);
    }
    if (typeof pattern.jitter !== 'number' || pattern.jitter < 0) {
      throw new APIError(`Invalid jitter in pattern ${index}`, 400);
    }
  });

  next();
};
