import { Request, Response } from 'express';
import { monitoring } from '../utils/monitoring';
import { logger } from '../utils/logger';

export const getMetrics = async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange || '24h';
    const now = new Date();

    const systemMetrics = monitoring.getMetrics();

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
        total: 0,
        byLevel: {
          error: 0,
          warn: 0,
          info: 0,
          http: 0,
          debug: 0,
        },
        topErrors: [],
        timeDistribution: {},
        mostActiveUsers: [],
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
    res.json({
      timestamp: new Date().toISOString(),
      timeRange: `${minutes} minutes`,
      errors: [],
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
