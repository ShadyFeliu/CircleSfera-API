import express from 'express';
import { createServer } from "http";
import { Server } from "socket.io";
import { monitoring } from './utils/monitoring';
import { securityHeaders } from './security-headers';
import { logger, logWebSocketEvent, logError, logUserAction } from './utils/logger';
import morgan from 'morgan';
import * as metricsController from './api/metrics';
import * as predictionsController from './api/predictions';
import * as analyticsController from './api/analytics';
import { alertDashboardLimiter } from './middleware/alertRateLimiter';

const app = express();
const httpServer = createServer(app);

// Add security headers middleware
app.use((req, res, next) => {
  Object.entries(securityHeaders.securityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});

// Add logging middleware
app.use(morgan('combined', { stream: logger.stream }));

// API routes
app.get('/health', metricsController.getHealthMetrics);

// Protected metrics routes
app.use('/api/metrics', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.METRICS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.get('/api/metrics', metricsController.getMetrics);
app.get('/api/metrics/errors', metricsController.getRecentErrors);

// Import prediction validators
import { validateApiKey, validateTimeframe, validateTestData } from './middleware/predictionValidator';

// Predictions API routes
app.get('/api/predictions',
  validateApiKey,
  alertDashboardLimiter,
  validateTimeframe,
  predictionsController.getPredictions
);

app.get('/api/predictions/accuracy',
  validateApiKey,
  alertDashboardLimiter,
  predictionsController.getPredictionAccuracy
);

app.get('/api/analytics/dashboard',
  validateApiKey,
  alertDashboardLimiter,
  validateTimeframe,
  analyticsController.getAnalyticsDashboard
);

// Development-only routes for testing prediction system
if (process.env.NODE_ENV !== 'production') {
  app.use(express.json());
  app.post('/dev/generate-test-data', validateTestData, predictionsController.generateTestData);
}

// Socket.IO setup
const io = new Server(httpServer, {
  cors: securityHeaders.corsOptions
});

io.on("connection", (socket) => {
  monitoring.recordWebSocketConnection();
  logWebSocketEvent('connection', socket.id);
  
  socket.on('disconnect', () => {
    monitoring.recordWebSocketDisconnection();
    logWebSocketEvent('disconnect', socket.id);
  });

  socket.on('error', (error) => {
    monitoring.recordWebSocketError();
    logError(error, { socketId: socket.id });
  });

  socket.on("find_partner", (data) => {
    monitoring.recordWebSocketMessage();
    logUserAction('find_partner', socket.id, data);
    // ... rest of the handler
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  logError(error, { type: 'uncaughtException' });
  monitoring.recordWebSocketError();
});

process.on('unhandledRejection', (reason, promise) => {
  logError(reason instanceof Error ? reason : new Error(String(reason)), {
    type: 'unhandledRejection',
    promise
  });
  monitoring.recordWebSocketError();
});

// Initialize prediction utilities
import { predictionNotifier } from './utils/predictionNotifier';
import { predictionAccuracyTracker } from './utils/predictionAccuracy';

// Initialize WebSocket analytics handler
import { AnalyticsWebSocketHandler } from './websocket/analyticsHandler';
const analyticsHandler = new AnalyticsWebSocketHandler(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info(`🚀 Servidor de señalización iniciado`, {
    port: PORT,
    environment: process.env.NODE_ENV,
    security: {
      headers: Object.keys(securityHeaders.securityHeaders).length,
      cors: securityHeaders.corsOptions.origin
    }
  });
});
