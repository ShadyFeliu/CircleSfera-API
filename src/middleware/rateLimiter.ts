import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Base rate limiter configuration
const createLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    handler: (req, res, next, options) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        limit: options.max,
        windowMs: options.windowMs
      });
      res.status(429).json(options.message);
    },
    skip: (req) => {
      // Skip rate limiting for health checks from known monitoring services
      const monitoringIPs = process.env.MONITORING_IPS?.split(',') || [];
      return req.path === '/health' && monitoringIPs.includes(req.ip);
    }
  });
};

// API rate limiter
export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Metrics endpoint rate limiter (more restrictive)
export const metricsLimiter = createLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // limit each IP to 30 requests per windowMs
  message: 'Too many metrics requests, please try again later'
});

// Health check rate limiter (less restrictive)
export const healthLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute
  message: 'Too many health check requests'
});
