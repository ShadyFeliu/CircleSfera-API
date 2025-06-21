import { Alert } from './alertNotifier';

export interface PredictionMetadata {
  seasonality?: {
    daily?: boolean;
    weekly?: boolean;
    monthly?: boolean;
  };
  correlation?: {
    patterns: string[];
    strength: number;
  };
  impact?: {
    severity: 'low' | 'medium' | 'high';
    scope: 'local' | 'global';
  };
}

export const predictionUtils = {
  /**
   * Detect seasonality in alert patterns
   */
  detectSeasonality(alerts: Alert[]): PredictionMetadata['seasonality'] {
    const timestamps = alerts.map(a => new Date(a.timestamp));
    return {
      daily: checkDailyPattern(timestamps),
      weekly: checkWeeklyPattern(timestamps),
      monthly: checkMonthlyPattern(timestamps)
    };
  },

  /**
   * Find correlations between different alert patterns
   */
  findCorrelations(alerts: Alert[]): PredictionMetadata['correlation'][] {
    const correlations: PredictionMetadata['correlation'][] = [];
    const types = new Set(alerts.map(a => a.type));
    
    // Compare each pair of alert types
    Array.from(types).forEach((type1, i) => {
      Array.from(types).slice(i + 1).forEach(type2 => {
        const strength = calculateCorrelationStrength(
          alerts.filter(a => a.type === type1),
          alerts.filter(a => a.type === type2)
        );
        
        if (strength > 0.5) {
          correlations.push({
            patterns: [type1, type2],
            strength
          });
        }
      });
    });

    return correlations;
  },

  /**
   * Assess potential impact of predicted alerts
   */
  assessImpact(alerts: Alert[]): PredictionMetadata['impact'] {
    const severity = calculateSeverity(alerts);
    const scope = determineScope(alerts);
    
    return { severity, scope };
  }
};

function checkDailyPattern(timestamps: Date[]): boolean {
  const hourDistribution = new Array(24).fill(0);
  timestamps.forEach(t => hourDistribution[t.getHours()]++);
  
  // Calculate standard deviation of distribution
  const mean = hourDistribution.reduce((a, b) => a + b) / 24;
  const variance = hourDistribution.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 24;
  const stdDev = Math.sqrt(variance);
  
  // High standard deviation indicates patterns
  return stdDev > mean * 0.5;
}

function checkWeeklyPattern(timestamps: Date[]): boolean {
  const dayDistribution = new Array(7).fill(0);
  timestamps.forEach(t => dayDistribution[t.getDay()]++);
  
  const mean = dayDistribution.reduce((a, b) => a + b) / 7;
  const variance = dayDistribution.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 7;
  const stdDev = Math.sqrt(variance);
  
  return stdDev > mean * 0.5;
}

function checkMonthlyPattern(timestamps: Date[]): boolean {
  const dayDistribution = new Array(31).fill(0);
  timestamps.forEach(t => dayDistribution[t.getDate() - 1]++);
  
  const mean = dayDistribution.reduce((a, b) => a + b) / 31;
  const variance = dayDistribution.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 31;
  const stdDev = Math.sqrt(variance);
  
  return stdDev > mean * 0.5;
}

function calculateCorrelationStrength(alerts1: Alert[], alerts2: Alert[]): number {
  // Use time-based correlation
  const window = 300000; // 5 minutes
  let correlatedCount = 0;
  
  alerts1.forEach(a1 => {
    if (alerts2.some(a2 => Math.abs(a2.timestamp - a1.timestamp) <= window)) {
      correlatedCount++;
    }
  });
  
  return correlatedCount / Math.max(alerts1.length, alerts2.length);
}

function calculateSeverity(alerts: Alert[]): 'low' | 'medium' | 'high' {
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const ratio = criticalCount / alerts.length;
  
  if (ratio > 0.5) return 'high';
  if (ratio > 0.2) return 'medium';
  return 'low';
}

function determineScope(alerts: Alert[]): 'local' | 'global' {
  // Determine scope based on alert types and patterns
  const types = new Set(alerts.map(a => a.type));
  const hasSystemWideTypes = Array.from(types).some(t => 
    t.includes('system') || t.includes('global') || t.includes('network')
  );
  
  return hasSystemWideTypes ? 'global' : 'local';
}
