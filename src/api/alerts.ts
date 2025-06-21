import { Request, Response } from 'express';
import { alertNotifier } from '../utils/alertNotifier';
import { logger } from '../utils/logger';

export const getAlertHistory = async (req: Request, res: Response) => {
  try {
    const { type, severity, from, to } = req.query;
    
    const options = {
      type: type as string | undefined,
      severity: severity as 'warning' | 'critical' | undefined,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined
    };

    const alerts = alertNotifier.getAlertHistory(options);
    
    res.json({
      total: alerts.length,
      alerts
    });
  } catch (error) {
    logger.error('Error fetching alert history', { error });
    res.status(500).json({ error: 'Error fetching alert history' });
  }
};

export const getAlertTrends = async (_req: Request, res: Response) => {
  try {
    const trends = alertNotifier.getAlertTrends();
    res.json(trends);
  } catch (error) {
    logger.error('Error fetching alert trends', { error });
    res.status(500).json({ error: 'Error fetching alert trends' });
  }
};
