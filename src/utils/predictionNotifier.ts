import { alertPatternAnalyzer } from './alertPatternAnalyzer';
import { alertNotifier } from './alertNotifier';
import { predictionAccuracyTracker } from './predictionAccuracy';
import { logger } from './logger';
import { AlertPattern } from './alertPatternAnalyzer';

interface PredictionCheck {
  patternId: string;
  nextCheck: number;
  notified: boolean;
}

class PredictionNotifier {
  private static instance: PredictionNotifier;
  private checks: Map<string, PredictionCheck> = new Map();
  private readonly CHECK_INTERVAL = 300000; // 5 minutes
  private readonly NOTIFICATION_THRESHOLD = 0.7; // 70% confidence

  private constructor() {
    this.startCheckTimer();
  }

  public static getInstance(): PredictionNotifier {
    if (!PredictionNotifier.instance) {
      PredictionNotifier.instance = new PredictionNotifier();
    }
    return PredictionNotifier.instance;
  }

  private startCheckTimer() {
    setInterval(() => {
      this.checkPredictions();
    }, this.CHECK_INTERVAL);
  }

  private async checkPredictions() {
    try {
      const predictions = alertPatternAnalyzer.getPatternPredictions();
      const now = Date.now();

      // Add new predictions to checks
      predictions.forEach(prediction => {
        if (!this.checks.has(prediction.id)) {
          this.checks.set(prediction.id, {
            patternId: prediction.id,
            nextCheck: this.calculateNextCheck(prediction.dueIn),
            notified: false
          });
        }
      });

      // Check predictions and send notifications
      for (const [id, check] of this.checks.entries()) {
        if (now >= check.nextCheck && !check.notified) {
          const prediction = predictions.find(p => p.id === id);
          if (prediction) {
            if (prediction.prediction && typeof prediction.prediction.confidence === 'number' && prediction.prediction.confidence >= this.NOTIFICATION_THRESHOLD) {
              await this.notifyPrediction(prediction);
              check.notified = true;
            }
            check.nextCheck = this.calculateNextCheck(prediction.dueIn);
          }
        }
      }

      // Clean up old checks
      this.cleanupChecks(predictions);
    } catch (error) {
      logger.error('Error checking predictions', { error });
    }
  }

  private calculateNextCheck(dueIn: number): number {
    // Check more frequently as we get closer to prediction
    if (dueIn <= 3600000) { // 1 hour
      return Date.now() + 300000; // 5 minutes
    } else if (dueIn <= 86400000) { // 24 hours
      return Date.now() + 3600000; // 1 hour
    }
    return Date.now() + 21600000; // 6 hours
  }

  private async notifyPrediction(prediction: AlertPattern & { dueIn: number }) {
    const alert = {
      type: 'predicted_alert_pattern',
      value: prediction.pattern.frequency,
      threshold: 0,
      timestamp: Date.now(),
      severity: 'warning' as 'warning' | 'critical',
      message: `Predicted alert pattern: ${prediction.pattern.alertTypes.join(', ')} expected in ${formatDuration(prediction.dueIn)}`
    };

    // Record this prediction for accuracy tracking
    predictionAccuracyTracker.recordPrediction(prediction);

    await alertNotifier.notifyAlert(alert);
    logger.info('Prediction notification sent', { prediction });
  }

  private cleanupChecks(currentPredictions: Array<AlertPattern & { dueIn: number }>) {
    const predictionsSet = new Set(currentPredictions.map(p => p.id));
    for (const [id] of this.checks.entries()) {
      if (!predictionsSet.has(id)) {
        this.checks.delete(id);
      }
    }
  }
}

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

export const predictionNotifier = PredictionNotifier.getInstance();
