import { Request, Response, NextFunction } from 'express';
import { APIError } from './errorHandler';

// Add pagination interface
interface PaginationParams {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
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

// Add type declaration
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams;
    }
  }
}
