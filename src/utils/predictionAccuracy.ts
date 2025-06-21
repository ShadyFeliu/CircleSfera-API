import { Alert } from './alertNotifier';
import { logger } from './logger';
import * as fs from 'fs';

interface PredictionAccuracyMetric {
  patternId: string;
  predictedTime: number;
  actualTime: number | null;
  confidence: number;
  accuracy: number | null;
  verified: boolean;
}

class PredictionAccuracyTracker {
  private static instance: PredictionAccuracyTracker;
  private metrics: PredictionAccuracyMetric[] = [];
  private readonly MAX_METRICS = 1000;
  private readonly ACCURACY_THRESHOLD = 0.8; // 80% accuracy required for high confidence
  private readonly TIME_TOLERANCE = 1800000; // 30 minutes tolerance

  private constructor() {
    this.loadMetrics();
    this.startPeriodicSave();
  }

  public static getInstance(): PredictionAccuracyTracker {
    if (!PredictionAccuracyTracker.instance) {
      PredictionAccuracyTracker.instance = new PredictionAccuracyTracker();
    }
    return PredictionAccuracyTracker.instance;
  }

  private async loadMetrics() {
    try {
      const metricsPath = './data/prediction-accuracy.json';
      if (fs.existsSync(metricsPath)) {
        const data = await fs.promises.readFile(metricsPath, 'utf-8');
        this.metrics = JSON.parse(data);
        logger.info('Prediction accuracy metrics loaded', { 
          count: this.metrics.length 
        });
      }
    } catch (error) {
      logger.error('Error loading prediction accuracy metrics', { error });
    }
  }

  private startPeriodicSave() {
    setInterval(() => {
      this.saveMetrics();
    }, 3600000); // Save every hour
  }

  private async saveMetrics() {
    try {
      const metricsPath = './data/prediction-accuracy.json';
      await fs.promises.writeFile(
        metricsPath,
        JSON.stringify(this.metrics, null, 2)
      );
      logger.info('Prediction accuracy metrics saved', { 
        count: this.metrics.length 
      });
    } catch (error) {
      logger.error('Error saving prediction accuracy metrics', { error });
    }
  }

  public recordPrediction(prediction: any) {
    this.metrics.push({
      patternId: prediction.id,
      predictedTime: prediction.prediction.nextExpected,
      actualTime: null,
      confidence: prediction.prediction.confidence,
      accuracy: null,
      verified: false
    });

    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }
  }

  public verifyPrediction(patternId: string, actualAlerts: Alert[]) {
    const unverifiedPredictions = this.metrics
      .filter(m => m.patternId === patternId && !m.verified);

    unverifiedPredictions.forEach(prediction => {
      const relevantAlert = this.findRelevantAlert(prediction, actualAlerts);
      if (relevantAlert) {
        const accuracy = this.calculateAccuracy(
          prediction.predictedTime,
          relevantAlert.timestamp
        );
        prediction.actualTime = relevantAlert.timestamp;
        prediction.accuracy = accuracy;
        prediction.verified = true;

        logger.info('Prediction verified', {
          patternId,
          accuracy,
          timeDiff: Math.abs(prediction.predictedTime - relevantAlert.timestamp)
        });
      }
    });
  }

  private findRelevantAlert(prediction: PredictionAccuracyMetric, alerts: Alert[]): Alert | null {
    // Look for alerts within a time window around the prediction
    const windowStart = prediction.predictedTime - this.TIME_TOLERANCE;
    const windowEnd = prediction.predictedTime + this.TIME_TOLERANCE;

    return alerts
      .filter(a => a.timestamp >= windowStart && a.timestamp <= windowEnd)
      .sort((a, b) => 
        Math.abs(a.timestamp - prediction.predictedTime) - 
        Math.abs(b.timestamp - prediction.predictedTime)
      )[0] || null;
  }

  private calculateAccuracy(predicted: number, actual: number): number {
    const timeDiff = Math.abs(predicted - actual);
    // Calculate accuracy as a percentage, with full accuracy within 5 minutes
    // and decreasing linearly up to the tolerance window
    const fiveMinutes = 300000;
    if (timeDiff <= fiveMinutes) return 1;
    
    const accuracyLoss = (timeDiff - fiveMinutes) / (this.TIME_TOLERANCE - fiveMinutes);
    return Math.max(0, 1 - accuracyLoss);
  }

  public getAccuracyMetrics() {
    const verifiedPredictions = this.metrics.filter(m => m.verified);
    
    if (verifiedPredictions.length === 0) {
      return {
        totalPredictions: 0,
        verifiedPredictions: 0,
        averageAccuracy: 0,
        highConfidenceAccuracy: 0
      };
    }

    const accuracies = verifiedPredictions.map(p => p.accuracy!);
    const highConfidencePredictions = verifiedPredictions
      .filter(p => p.confidence >= this.ACCURACY_THRESHOLD);

    return {
      totalPredictions: this.metrics.length,
      verifiedPredictions: verifiedPredictions.length,
      averageAccuracy: this.calculateAverage(accuracies),
      highConfidenceAccuracy: highConfidencePredictions.length > 0
        ? this.calculateAverage(highConfidencePredictions.map(p => p.accuracy!))
        : 0,
      byPattern: this.getPatternAccuracies(),
      recentTrend: this.calculateRecentTrend()
    };
  }

  private calculateAverage(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private getPatternAccuracies() {
    const patternGroups = new Map<string, PredictionAccuracyMetric[]>();
    
    this.metrics
      .filter(m => m.verified)
      .forEach(metric => {
        const metrics = patternGroups.get(metric.patternId) || [];
        metrics.push(metric);
        patternGroups.set(metric.patternId, metrics);
      });

    return Array.from(patternGroups.entries()).map(([patternId, metrics]) => ({
      patternId,
      predictions: metrics.length,
      accuracy: this.calculateAverage(metrics.map(m => m.accuracy!)),
      trend: this.calculateTrend(metrics)
    }));
  }

  private calculateTrend(metrics: PredictionAccuracyMetric[]): 'improving' | 'stable' | 'degrading' {
    if (metrics.length < 5) return 'stable';

    const recentMetrics = metrics.slice(-5);
    const recentAvg = this.calculateAverage(recentMetrics.map(m => m.accuracy!));
    const overallAvg = this.calculateAverage(metrics.map(m => m.accuracy!));

    if (recentAvg > overallAvg + 0.1) return 'improving';
    if (recentAvg < overallAvg - 0.1) return 'degrading';
    return 'stable';
  }

  private calculateRecentTrend(): { trend: 'improving' | 'stable' | 'degrading'; confidence: number } {
    const recentMetrics = this.metrics
      .filter(m => m.verified)
      .slice(-20);

    if (recentMetrics.length < 10) {
      return { trend: 'stable', confidence: 0 };
    }

    const midpoint = Math.floor(recentMetrics.length / 2);
    const firstHalf = recentMetrics.slice(0, midpoint);
    const secondHalf = recentMetrics.slice(midpoint);

    const firstHalfAvg = this.calculateAverage(firstHalf.map(m => m.accuracy!));
    const secondHalfAvg = this.calculateAverage(secondHalf.map(m => m.accuracy!));

    const difference = secondHalfAvg - firstHalfAvg;
    const trend = difference > 0.05 ? 'improving' : 
                 difference < -0.05 ? 'degrading' : 'stable';

    return {
      trend,
      confidence: Math.min(1, recentMetrics.length / 20)
    };
  }
}

export const predictionAccuracyTracker = PredictionAccuracyTracker.getInstance();
