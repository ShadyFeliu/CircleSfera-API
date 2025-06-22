import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { monitoring } from './monitoring';

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize } = format;

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to Winston
winston.addColors(colors);

// Custom format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Create logger instance
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports: [
    // Console transport for development
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        logFormat
      ),
    }),
    // Rotating file transport for errors
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        logFormat
      )
    }),
    // Rotating file transport for all logs
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        logFormat
      )
    })
  ],
  // Add error handling
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        logFormat
      )
    })
  ],
  // Add rejection handling
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        logFormat
      )
    })
  ]
});

// Integrate with monitoring
logger.on('data', (log) => {
  if (log.level === 'error') {
    monitoring.recordWebSocketError();
  }
});

// Create a stream for Morgan HTTP logging
const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logWebSocketEvent = (event: string, socketId: string, data?: unknown) => {
  logger.info('WebSocket Event', {
    event,
    socketId,
    data,
    connections: monitoring.getMetrics().websocket.activeConnections,
  });
};

export const logUserAction = (action: string, userId: string, details?: unknown) => {
  logger.info('User Action', {
    action,
    userId,
    details,
    timestamp: new Date().toISOString(),
  });
};

export const logError = (error: Error, context?: unknown) => {
  logger.error('Error Occurred', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    context,
    timestamp: new Date().toISOString(),
  });
  
  monitoring.recordWebSocketError();
};

export const logMetrics = () => {
  const metrics = monitoring.getMetrics();
  logger.info('System Metrics', {
    metrics,
    timestamp: new Date().toISOString(),
  });
};

// Setup periodic metrics logging
setInterval(() => {
  logMetrics();
}, 300000); // Log metrics every 5 minutes

export { logger, stream };
