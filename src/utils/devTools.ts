import { Alert } from './alertNotifier';
import { logger } from './logger';
import { alertPatternAnalyzer } from './alertPatternAnalyzer';
import { predictionAccuracyTracker } from './predictionAccuracy';
import fs from 'fs/promises';
import path from 'path';

/**
 * Development tools for testing and debugging the prediction system
 */
class PredictionDevTools {
  private static instance: PredictionDevTools;

  private constructor() {}

  public static getInstance(): PredictionDevTools {
    if (!PredictionDevTools.instance) {
      PredictionDevTools.instance = new PredictionDevTools();
    }
    return PredictionDevTools.instance;
  }

  /**
   * Generate synthetic alert data for testing
   */
  public async generateTestData(options: {
    days: number;
    patterns: Array<{
      type: string;
      frequency: number; // alerts per day
      severity: 'warning' | 'critical';
      jitter: number; // random time variation in minutes
    }>;
  }) {
    const alerts: Alert[] = [];
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    options.patterns.forEach(pattern => {
      const intervalMs = msPerDay / pattern.frequency;
      let timestamp = now - (options.days * msPerDay);

      while (timestamp < now) {
        // Add random jitter
        const jitterMs = (Math.random() * 2 - 1) * (pattern.jitter * 60 * 1000);
        const alertTime = timestamp + jitterMs;

        alerts.push({
          type: pattern.type,
          value: Math.random() * 100,
          threshold: 50,
          timestamp: alertTime,
          severity: pattern.severity,
          message: `Test alert for ${pattern.type}`
        });

        timestamp += intervalMs;
      }
    });

    // Sort by timestamp
    alerts.sort((a, b) => a.timestamp - b.timestamp);

    // Save to file for reference
    await this.saveTestData(alerts);

    return alerts;
  }

  /**
   * Simulate prediction system with test data
   */
  public async simulatePredictions(alerts: Alert[]) {
    const results = {
      patterns: [] as any[],
      predictions: [] as any[],
      accuracy: null as any
    };

    // Process alerts in chronological order
    for (const alert of alerts) {
      const patterns = alertPatternAnalyzer.matchPatterns([alert]);
      if (patterns.length > 0) {
        results.patterns.push({
          timestamp: alert.timestamp,
          alert: alert.type,
          matches: patterns
        });
      }

      // Update prediction accuracy
      predictionAccuracyTracker.verifyPrediction(
        `pattern-${alert.type}`,
        [alert]
      );
    }

    // Get final results
    results.predictions = alertPatternAnalyzer.getPatternPredictions();
    results.accuracy = predictionAccuracyTracker.getAccuracyMetrics();

    // Save simulation results
    await this.saveSimulationResults(results);

    return results;
  }

  /**
   * Analyze prediction system performance
   */
  public async analyzePredictionPerformance() {
    const metrics = predictionAccuracyTracker.getAccuracyMetrics();
    const patterns = alertPatternAnalyzer.getPatternPredictions();

    const analysis = {
      overallAccuracy: metrics.averageAccuracy,
      confidenceDistribution: this.calculateConfidenceDistribution(patterns),
      patternEffectiveness: this.analyzePatternEffectiveness(metrics.byPattern),
      recommendations: this.generateRecommendations(metrics, patterns)
    };

    await this.saveAnalysis(analysis);
    return analysis;
  }

  private calculateConfidenceDistribution(predictions: any[]) {
    const ranges = {
      low: 0, // < 0.4
      medium: 0, // 0.4 - 0.7
      high: 0 // > 0.7
    };

    predictions.forEach(p => {
      const confidence = p.prediction?.confidence || 0;
      if (confidence < 0.4) ranges.low++;
      else if (confidence < 0.7) ranges.medium++;
      else ranges.high++;
    });

    return ranges;
  }

  private analyzePatternEffectiveness(patternMetrics: any[]) {
    return patternMetrics.map(pattern => ({
      patternId: pattern.patternId,
      effectiveness: {
        accuracy: pattern.accuracy,
        reliability: pattern.predictions > 10 ? 'high' : 'low',
        trend: pattern.trend,
        recommendation: this.getPatternRecommendation(pattern)
      }
    }));
  }

  private getPatternRecommendation(pattern: any) {
    if (pattern.accuracy < 0.5) {
      return 'Consider removing or refining this pattern';
    }
    if (pattern.trend === 'degrading') {
      return 'Pattern accuracy is declining, investigate possible causes';
    }
    if (pattern.predictions < 5) {
      return 'Need more data to establish reliable pattern';
    }
    return 'Pattern is performing well';
  }

  private generateRecommendations(metrics: any, patterns: any[]) {
    const recommendations = [];

    if (metrics.averageAccuracy < 0.6) {
      recommendations.push('Overall prediction accuracy is low, consider adjusting pattern detection thresholds');
    }

    if (patterns.length === 0) {
      recommendations.push('No active patterns detected, may need to adjust pattern detection sensitivity');
    }

    if (metrics.recentTrend.trend === 'degrading') {
      recommendations.push('Prediction accuracy is trending downward, review recent system changes');
    }

    return recommendations;
  }

  private async saveTestData(alerts: Alert[]) {
    const filepath = path.join(__dirname, '../../data/test-data.json');
    await fs.writeFile(filepath, JSON.stringify(alerts, null, 2));
  }

  private async saveSimulationResults(results: any) {
    const filepath = path.join(__dirname, '../../data/simulation-results.json');
    await fs.writeFile(filepath, JSON.stringify(results, null, 2));
  }

  private async saveAnalysis(analysis: any) {
    const filepath = path.join(__dirname, '../../data/prediction-analysis.json');
    await fs.writeFile(filepath, JSON.stringify(analysis, null, 2));
  }
}

export const predictionDevTools = PredictionDevTools.getInstance();
