import { Request, Response } from 'express';
import { alertPatternAnalyzer } from '../utils/alertPatternAnalyzer';
import { predictionAccuracyTracker } from '../utils/predictionAccuracy';
import { logger } from '../utils/logger';

export const getPredictions = async (req: Request, res: Response) => {
  try {
    const timeframe = req.query.timeframe || '24h';
    const predictions = alertPatternAnalyzer.getPatternPredictions();
    
    // Filter predictions based on timeframe
    const timeframeMs = parseTimeframe(timeframe as string);
    const filteredPredictions = predictions.filter(p => p.dueIn <= timeframeMs);

    res.json({
      timestamp: Date.now(),
      timeframe,
      predictions: filteredPredictions.map(p => ({
        id: p.id,
        pattern: {
          types: p.pattern.alertTypes,
          severity: p.pattern.severity,
          frequency: p.pattern.frequency
        },
        prediction: {
          expectedAt: p.prediction?.nextExpected,
          confidence: p.prediction?.confidence,
          dueIn: p.dueIn,
          dueInHuman: formatDuration(p.dueIn)
        },
        history: {
          occurrences: p.occurrences,
          lastSeen: p.lastSeen
        }
      }))
    });
  } catch (error) {
    logger.error('Error fetching predictions', { error });
    res.status(500).json({ error: 'Error fetching predictions' });
  }
};

export const getPredictionAccuracy = async (req: Request, res: Response) => {
  try {
    const metrics = predictionAccuracyTracker.getAccuracyMetrics();
    
    res.json({
      timestamp: Date.now(),
      metrics
    });
  } catch (error) {
    logger.error('Error fetching prediction accuracy', { error });
    res.status(500).json({ error: 'Error fetching prediction accuracy' });
  }
};

// Development-only endpoint for generating test data
export const generateTestData = async (req: Request, res: Response) => {
  try {
    const { predictionDevTools } = require('../utils/devTools');
    const options = req.body;
    
    const alerts = await predictionDevTools.generateTestData(options);
    res.json({
      generated: alerts.length,
      timespan: `${options.days} days`,
      patterns: options.patterns.map(p => p.type)
    });
  } catch (error) {
    logger.error('Error generating test data', { error });
    res.status(500).json({ error: 'Error generating test data' });
  }
};

const parseTimeframe = (timeframe: string): number => {
  const value = parseInt(timeframe);
  const unit = timeframe.slice(-1);
  switch (unit) {
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000; // default 24h
  }
};

const formatDuration = (ms: number): string => {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} days`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};
