import { Alert } from './alertNotifier';
import { PredictionMetadata } from './predictionUtils';
import { logger } from './logger';

interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

interface AlertDistribution {
  byHour: Record<number, number>;
  byDay: Record<number, number>;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

interface PatternStrength {
  pattern: string;
  confidence: number;
  support: number;
}

export class PredictionAnalytics {
  private static instance: PredictionAnalytics;

  private constructor() {}

  public static getInstance(): PredictionAnalytics {
    if (!PredictionAnalytics.instance) {
      PredictionAnalytics.instance = new PredictionAnalytics();
    }
    return PredictionAnalytics.instance;
  }

  /**
   * Analyze time series data for patterns
   */
  public analyzeTimeSeries(alerts: Alert[]): {
    trend: 'increasing' | 'decreasing' | 'stable';
    seasonality: PredictionMetadata['seasonality'];
    forecasts: TimeSeriesPoint[];
  } {
    try {
      // Sort alerts by timestamp
      const sortedAlerts = [...alerts].sort((a, b) => a.timestamp - b.timestamp);
      
      // Calculate trend
      const trend = this.calculateTrend(sortedAlerts);
      
      // Calculate seasonality using decomposition
      const seasonality = this.decomposeTimeSeries(sortedAlerts);
      
      // Generate forecasts
      const forecasts = this.generateForecasts(sortedAlerts, trend, seasonality);

      return { trend, seasonality, forecasts };
    } catch (error) {
      logger.error('Error analyzing time series', { error });
      throw error;
    }
  }

  /**
   * Calculate alert distributions
   */
  public calculateDistributions(alerts: Alert[]): AlertDistribution {
    const distribution: AlertDistribution = {
      byHour: {},
      byDay: {},
      byType: {},
      bySeverity: {}
    };

    alerts.forEach(alert => {
      const date = new Date(alert.timestamp);
      const hour = date.getHours();
      const day = date.getDay();

      // Hour distribution
      distribution.byHour[hour] = (distribution.byHour[hour] || 0) + 1;

      // Day distribution
      distribution.byDay[day] = (distribution.byDay[day] || 0) + 1;

      // Type distribution
      distribution.byType[alert.type] = (distribution.byType[alert.type] || 0) + 1;

      // Severity distribution
      distribution.bySeverity[alert.severity] = (distribution.bySeverity[alert.severity] || 0) + 1;
    });

    return distribution;
  }

  /**
   * Identify strong patterns in alerts
   */
  public findStrongPatterns(alerts: Alert[]): PatternStrength[] {
    const patterns: Map<string, { count: number; timestamps: number[] }> = new Map();

    // Group alerts by type and collect timestamps
    alerts.forEach(alert => {
      const existing = patterns.get(alert.type) || { count: 0, timestamps: [] };
      existing.count++;
      existing.timestamps.push(alert.timestamp);
      patterns.set(alert.type, existing);
    });

    // Analyze each pattern
    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        confidence: this.calculatePatternConfidence(data.timestamps),
        support: data.count / alerts.length
      }))
      .filter(p => p.confidence > 0.5) // Only return strong patterns
      .sort((a, b) => b.confidence - a.confidence);
  }

  private calculateTrend(alerts: Alert[]): 'increasing' | 'decreasing' | 'stable' {
    if (alerts.length < 2) return 'stable';

    // Use linear regression
    const n = alerts.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    alerts.forEach((alert, i) => {
      sumX += i;
      sumY += alert.value;
      sumXY += i * alert.value;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    if (Math.abs(slope) < 0.1) return 'stable';
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  private decomposeTimeSeries(alerts: Alert[]): PredictionMetadata['seasonality'] {
    // Convert to regular time series
    const timeSeriesData = this.convertToRegularTimeSeries(alerts);
    
    return {
      daily: this.detectDailySeasonality(timeSeriesData),
      weekly: this.detectWeeklySeasonality(timeSeriesData),
      monthly: this.detectMonthlySeasonality(timeSeriesData)
    };
  }

  private convertToRegularTimeSeries(alerts: Alert[]): TimeSeriesPoint[] {
    const hourlyBuckets = new Map<number, number>();
    
    alerts.forEach(alert => {
      const hourTimestamp = Math.floor(alert.timestamp / 3600000) * 3600000;
      hourlyBuckets.set(
        hourTimestamp,
        (hourlyBuckets.get(hourTimestamp) || 0) + 1
      );
    });

    return Array.from(hourlyBuckets.entries())
      .map(([timestamp, value]) => ({ timestamp, value }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculatePatternConfidence(timestamps: number[]): number {
    if (timestamps.length < 3) return 0;

    // Calculate intervals between events
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    // Calculate standard deviation of intervals
    const mean = intervals.reduce((a, b) => a + b) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation indicates more regular patterns
    const normalizedStdDev = stdDev / mean;
    return Math.max(0, 1 - normalizedStdDev);
  }

  private generateForecasts(
    alerts: Alert[],
    trend: 'increasing' | 'decreasing' | 'stable',
    seasonality: PredictionMetadata['seasonality']
  ): TimeSeriesPoint[] {
    const forecasts: TimeSeriesPoint[] = [];
    const lastTimestamp = alerts[alerts.length - 1].timestamp;
    
    // Generate 24 hourly forecasts
    for (let i = 1; i <= 24; i++) {
      const timestamp = lastTimestamp + (i * 3600000);
      let value = this.calculateBaselineValue(alerts);

      // Apply trend
      if (trend === 'increasing') value *= 1.1;
      if (trend === 'decreasing') value *= 0.9;

      // Apply seasonality
      if (seasonality && seasonality.daily) {
        value *= this.calculateSeasonalFactor(new Date(timestamp).getHours());
      }

      forecasts.push({ timestamp, value });
    }

    return forecasts;
  }

  private calculateBaselineValue(alerts: Alert[]): number {
    // Use median of last 24 hours
    const recent = alerts.slice(-24);
    const values = recent.map(a => a.value).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];
  }

  private calculateSeasonalFactor(hour: number): number {
    // Simple seasonal factors based on typical business hours
    const businessHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
    if (businessHours.includes(hour)) return 1.2;
    if (hour >= 1 && hour <= 5) return 0.8;
    return 1.0;
  }

  private detectDailySeasonality(data: TimeSeriesPoint[]): boolean {
    return this.detectSeasonality(data, 24);
  }

  private detectWeeklySeasonality(data: TimeSeriesPoint[]): boolean {
    return this.detectSeasonality(data, 24 * 7);
  }

  private detectMonthlySeasonality(data: TimeSeriesPoint[]): boolean {
    return this.detectSeasonality(data, 24 * 30);
  }

  private detectSeasonality(data: TimeSeriesPoint[], period: number): boolean {
    if (data.length < period * 2) return false;

    const segments = Math.floor(data.length / period);
    const patterns = new Array(period).fill(0);

    // Accumulate values for each position in the period
    for (let i = 0; i < segments * period; i++) {
      const position = i % period;
      patterns[position] += data[i].value;
    }

    // Normalize by number of segments
    const normalizedPattern = patterns.map(v => v / segments);

    // Calculate coefficient of variation
    const mean = normalizedPattern.reduce((a, b) => a + b) / period;
    const variance = normalizedPattern.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const cv = Math.sqrt(variance) / mean;

    // High coefficient of variation indicates seasonality
    return cv > 0.2;
  }
}

export const predictionAnalytics = PredictionAnalytics.getInstance();
