import { Request, Response } from 'express';
import { monitoring } from '../utils/monitoring';
import { logAggregator } from '../utils/logAggregator';
import { logger } from '../utils/logger';

export const getMetrics = async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange || '24h';
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '6h':
        startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const [systemMetrics, logStats] = await Promise.all([
      monitoring.getMetrics(),
      logAggregator.aggregateLogs(startDate, now)
    ]);

    const response = {
      timestamp: new Date().toISOString(),
      timeRange,
      system: {
        uptime: systemMetrics.uptime,
        memory: systemMetrics.memory,
        cpu: systemMetrics.cpu,
      },
      websocket: {
        connections: systemMetrics.connections,
        stats: systemMetrics.websocket,
      },
      logs: {
        total: logStats.totalEntries,
        byLevel: {
          error: logStats.errorCount,
          warn: logStats.warnCount,
          info: logStats.infoCount,
          http: logStats.httpCount,
          debug: logStats.debugCount,
        },
        topErrors: logStats.topErrors,
        timeDistribution: logStats.timeDistribution,
        mostActiveUsers: logStats.mostActiveUsers,
      },
    };

    res.json(response);
  } catch (error) {
    logger.error('Error fetching metrics', { error });
    res.status(500).json({ error: 'Error fetching metrics' });
  }
};

export const getRecentErrors = async (req: Request, res: Response) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 15;
    const errors = await logAggregator.getRecentErrors(minutes);
    res.json({
      timestamp: new Date().toISOString(),
      timeRange: `${minutes} minutes`,
      errors,
    });
  } catch (error) {
    logger.error('Error fetching recent errors', { error });
    res.status(500).json({ error: 'Error fetching recent errors' });
  }
};

export const getHealthMetrics = async (_req: Request, res: Response) => {
  try {
    const health = monitoring.getHealthStatus();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Error fetching health metrics', { error });
    res.status(500).json({ error: 'Error fetching health metrics' });
  }
};
