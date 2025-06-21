import { Request, Response } from 'express';
import { predictionAnalytics } from '../utils/predictionAnalytics';
import { alertNotifier } from '../utils/alertNotifier';
import { logger } from '../utils/logger';

export const getAnalyticsDashboard = async (req: Request, res: Response) => {
  try {
    const { timeframe = '24h' } = req.query;
    const timeframeMs = parseTimeframe(timeframe as string);
    const now = Date.now();

    // Get recent alerts
    const alerts = alertNotifier.getAlertHistory({
      from: new Date(now - timeframeMs),
      to: new Date(now)
    });

    // Generate analytics
    const timeSeries = predictionAnalytics.analyzeTimeSeries(alerts);
    const distribution = predictionAnalytics.calculateDistributions(alerts);
    const patterns = predictionAnalytics.findStrongPatterns(alerts);

    // Generate visualizations
    const visualizations = generateVisualizations({
      timeSeries,
      distribution,
      patterns
    });

    res.json({
      timestamp: now,
      timeframe,
      analytics: {
        summary: {
          totalAlerts: alerts.length,
          trend: timeSeries.trend,
          hasSeasonality: Object.values(timeSeries.seasonality).some(v => v),
          strongPatterns: patterns.length
        },
        timeSeries,
        distribution,
        patterns,
        visualizations
      }
    });
  } catch (error) {
    logger.error('Error generating analytics dashboard', { error });
    res.status(500).json({ error: 'Error generating analytics dashboard' });
  }
};

interface ChartData {
  type: 'line' | 'bar' | 'pie';
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string[];
  }>;
}

function generateVisualizations(data: any): Record<string, ChartData> {
  return {
    timeSeriesChart: generateTimeSeriesChart(data.timeSeries),
    distributionCharts: {
      hourly: generateDistributionChart(data.distribution.byHour, 'Hourly Distribution'),
      daily: generateDistributionChart(data.distribution.byDay, 'Daily Distribution'),
      type: generatePieChart(data.distribution.byType, 'Alert Types'),
      severity: generatePieChart(data.distribution.bySeverity, 'Alert Severity')
    },
    patternConfidenceChart: generatePatternConfidenceChart(data.patterns)
  };
}

function generateTimeSeriesChart(timeSeries: any): ChartData {
  const allPoints = [...timeSeries.forecasts];
  
  return {
    type: 'line',
    labels: allPoints.map(p => new Date(p.timestamp).toISOString()),
    datasets: [
      {
        label: 'Alert Count',
        data: allPoints.map(p => p.value),
        backgroundColor: ['rgba(54, 162, 235, 0.2)']
      }
    ]
  };
}

function generateDistributionChart(
  distribution: Record<number, number>,
  label: string
): ChartData {
  const sortedEntries = Object.entries(distribution)
    .sort(([a], [b]) => Number(a) - Number(b));

  return {
    type: 'bar',
    labels: sortedEntries.map(([key]) => key),
    datasets: [
      {
        label,
        data: sortedEntries.map(([_, value]) => value),
        backgroundColor: ['rgba(54, 162, 235, 0.2)']
      }
    ]
  };
}

function generatePieChart(
  distribution: Record<string, number>,
  label: string
): ChartData {
  const entries = Object.entries(distribution);
  const colors = generateColors(entries.length);

  return {
    type: 'pie',
    labels: entries.map(([key]) => key),
    datasets: [
      {
        label,
        data: entries.map(([_, value]) => value),
        backgroundColor: colors
      }
    ]
  };
}

function generatePatternConfidenceChart(patterns: any[]): ChartData {
  return {
    type: 'bar',
    labels: patterns.map(p => p.pattern),
    datasets: [
      {
        label: 'Pattern Confidence',
        data: patterns.map(p => p.confidence),
        backgroundColor: ['rgba(75, 192, 192, 0.2)']
      }
    ]
  };
}

function generateColors(count: number): string[] {
  const baseColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6384', '#C9CBCF'
  ];

  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
}

function parseTimeframe(timeframe: string): number {
  const value = parseInt(timeframe);
  const unit = timeframe.slice(-1);
  switch (unit) {
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000; // default 24h
  }
}
