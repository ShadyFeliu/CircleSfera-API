import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Create specific limiters for different alert endpoints
export const alertHistoryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many alert history requests, please try again later' },
  handler: (req, res, next, options) => {
    logger.warn('Alert history rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json(options.message);
  }
});

export const alertTrendsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many alert trends requests, please try again later' }
});

export const alertDashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many dashboard requests, please try again later' }
});
