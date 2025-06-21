import { Request, Response, NextFunction } from 'express';
import { APIError } from './errorHandler';
import { logger } from '../utils/logger';

// Add pagination interface
interface PaginationParams {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
}

interface AlertData {
  message: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateAlertHistoryRequest = (req: Request, res: Response, next: NextFunction) => {
  const { type, severity, from, to, page, limit } = req.query;

  // Validate severity if provided
  if (severity && !['warning', 'critical'].includes(severity as string)) {
    throw new APIError('Invalid severity value. Must be either "warning" or "critical"', 400);
  }

  // Validate dates if provided
  if (from) {
    const fromDate = new Date(from as string);
    if (isNaN(fromDate.getTime())) {
      throw new APIError('Invalid "from" date format', 400);
    }
  }

  if (to) {
    const toDate = new Date(to as string);
    if (isNaN(toDate.getTime())) {
      throw new APIError('Invalid "to" date format', 400);
    }
  }

  // Validate date range
  if (from && to) {
    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    if (fromDate > toDate) {
      throw new APIError('"from" date cannot be later than "to" date', 400);
    }

    // Limit range to 30 days
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > thirtyDays) {
      throw new APIError('Date range cannot exceed 30 days', 400);
    }
  }

  // Validate pagination parameters
  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 50;

  if (pageNum < 1) {
    throw new APIError('Page number must be greater than 0', 400);
  }

  if (limitNum < 1 || limitNum > 100) {
    throw new APIError('Limit must be between 1 and 100', 400);
  }

  // Add pagination params to request
  req.pagination = {
    page: pageNum,
    limit: limitNum,
    totalPages: 0,
    totalItems: 0
  };

  next();
};

export const validateAlertAggregationParams = (req: Request, res: Response, next: NextFunction) => {
  const { interval } = req.query;

  if (interval) {
    const validIntervals = ['1h', '6h', '12h', '24h', '7d'];
    if (!validIntervals.includes(interval as string)) {
      throw new APIError(`Invalid interval. Must be one of: ${validIntervals.join(', ')}`, 400);
    }
  }

  next();
};

export const validateAlert = (alert: AlertData): ValidationResult => {
  const errors: string[] = [];

  // Validate required fields
  if (!alert.message || typeof alert.message !== 'string') {
    errors.push('Message is required and must be a string');
  }

  if (!alert.level || !['info', 'warning', 'error', 'critical'].includes(alert.level)) {
    errors.push('Level must be one of: info, warning, error, critical');
  }

  if (!alert.source || typeof alert.source !== 'string') {
    errors.push('Source is required and must be a string');
  }

  // Validate message length
  if (alert.message && alert.message.length > 1000) {
    errors.push('Message must be less than 1000 characters');
  }

  // Validate source length
  if (alert.source && alert.source.length > 100) {
    errors.push('Source must be less than 100 characters');
  }

  // Validate timestamp if provided
  if (alert.timestamp !== undefined) {
    if (typeof alert.timestamp !== 'number' || alert.timestamp < 0) {
      errors.push('Timestamp must be a positive number');
    }
    
    const now = Date.now();
    const maxPastTime = 24 * 60 * 60 * 1000; // 24 hours
    const maxFutureTime = 5 * 60 * 1000; // 5 minutes
    
    if (alert.timestamp < now - maxPastTime) {
      errors.push('Timestamp cannot be more than 24 hours in the past');
    }
    
    if (alert.timestamp > now + maxFutureTime) {
      errors.push('Timestamp cannot be more than 5 minutes in the future');
    }
  }

  // Validate metadata if provided
  if (alert.metadata !== undefined) {
    if (typeof alert.metadata !== 'object' || alert.metadata === null) {
      errors.push('Metadata must be an object');
    } else {
      const metadataKeys = Object.keys(alert.metadata);
      if (metadataKeys.length > 20) {
        errors.push('Metadata cannot have more than 20 keys');
      }
      
      for (const key of metadataKeys) {
        if (key.length > 50) {
          errors.push('Metadata keys must be less than 50 characters');
        }
        
        const value = alert.metadata[key];
        if (typeof value === 'string' && value.length > 500) {
          errors.push('Metadata string values must be less than 500 characters');
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const alertValidator = (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = req.body as AlertData;
    const validation = validateAlert(alert);

    if (!validation.isValid) {
      logger.warn('Invalid alert data', {
        errors: validation.errors,
        alert: {
          message: alert.message,
          level: alert.level,
          source: alert.source
        }
      });

      return res.status(400).json({
        error: 'Invalid alert data',
        details: validation.errors
      });
    }

    next();
  } catch (error) {
    logger.error('Error validating alert', { error });
    res.status(500).json({ error: 'Error validating alert' });
  }
};

// Alert types enum
export const AlertTypes = {
  SYSTEM: 'system',
  USER: 'user',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  NETWORK: 'network'
} as const;

export type AlertType = typeof AlertTypes[keyof typeof AlertTypes];

// Add type declaration
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams;
    }
  }
}
