import { Server, Socket, Namespace } from 'socket.io';
import { predictionAnalytics } from '../utils/predictionAnalytics';
import { alertNotifier } from '../utils/alertNotifier';
import { logger } from '../utils/logger';
import { authenticateWebSocket } from '../middleware/wsAuthMiddleware';
import { applyWsRateLimiting, wsRateLimiter } from '../middleware/wsRateLimiter';

interface AnalyticsSubscription {
  timeframe: string;
  interval: number;
}

interface AnalyticsData {
  summary: {
    totalAlerts: number;
    trend: string;
    hasSeasonality: boolean;
    strongPatterns: number;
  };
  timeSeries: {
    trend: string;
    seasonality?: Record<string, boolean>;
    forecasts: Array<{
      timestamp: number;
      value: number;
    }>;
  };
  distribution: {
    byHour: Record<number, number>;
    byDay: Record<number, number>;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  patterns: Array<{
    pattern: string;
    confidence: number;
    support: number;
    lastSeen?: number;
  }>;
}

interface ExportData {
  summary?: AnalyticsData['summary'];
  timeSeries?: AnalyticsData['timeSeries'];
  patterns?: AnalyticsData['patterns'];
  timestamp: number;
}

export class AnalyticsWebSocketHandler {
  private subscriptions: Map<string, AnalyticsSubscription> = new Map();
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(private io: Server) {
    const analyticsNamespace = this.io.of('/analytics');
    analyticsNamespace.use(authenticateWebSocket);
    analyticsNamespace.use(applyWsRateLimiting);
    this.setupHandlers(analyticsNamespace);
  }

  private setupHandlers(namespace: Namespace) {
    namespace.on('connection', (socket: Socket) => {
      logger.info('Analytics client connected', { socketId: socket.id });

      socket.on('subscribe', (data: AnalyticsSubscription) => {
        this.handleSubscribe(socket, data);
      });

      socket.on('unsubscribe', () => {
        this.handleUnsubscribe(socket);
      });

      socket.on('disconnect', () => {
        this.handleUnsubscribe(socket);
        logger.info('Analytics client disconnected', { socketId: socket.id });
      });
      
      socket.on('error', (error) => {
        if (error.message && error.message.includes('Rate limit exceeded')) {
          logger.warn('Client rate limited', {
            socketId: socket.id,
            ip: socket.handshake.address
          });
        }
      });

      socket.on('export', async (options: {
        format: 'json' | 'csv';
        type: 'full' | 'summary' | 'timeSeries' | 'patterns';
        timeframe: string;
      }) => {
        try {
          // Additional rate limit check for expensive operations
          if (!wsRateLimiter.checkLimit(socket)) {
            socket.emit('export_error', { message: 'Rate limit exceeded for exports' });
            return;
          }
          
          const data = await this.exportAnalytics(
            options.timeframe || this.subscriptions.get(socket.id)?.timeframe || '24h',
            options.format || 'json',
            options.type || 'full'
          );
          socket.emit('export_ready', {
            data,
            format: options.format,
            type: options.type,
            timestamp: Date.now()
          });
        } catch (error) {
          logger.error('Error exporting analytics', { error, socketId: socket.id });
          socket.emit('export_error', { message: 'Error exporting analytics' });
        }
      });
    });
  }

  private handleSubscribe(socket: Socket, data: AnalyticsSubscription) {
    // Clear existing subscription if any
    this.handleUnsubscribe(socket);

    // Validate subscription data
    if (!this.isValidSubscription(data)) {
      socket.emit('error', { message: 'Invalid subscription parameters' });
      return;
    }

    // Store subscription
    this.subscriptions.set(socket.id, data);

    // Setup interval for updates
    const interval = setInterval(async () => {
      try {
        const updates = await this.generateAnalyticsUpdate(data.timeframe);
        socket.emit('analytics_update', updates);
      } catch (error) {
        logger.error('Error generating analytics update', { error, socketId: socket.id });
      }
    }, data.interval);

    this.updateIntervals.set(socket.id, interval);

    // Send initial data
    this.generateAnalyticsUpdate(data.timeframe)
      .then(updates => socket.emit('analytics_update', updates))
      .catch(error => logger.error('Error sending initial analytics', { error }));
  }

  private handleUnsubscribe(socket: Socket) {
    const interval = this.updateIntervals.get(socket.id);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(socket.id);
    }
    this.subscriptions.delete(socket.id);
  }

  private isValidSubscription(data: AnalyticsSubscription): boolean {
    const validTimeframes = ['1h', '6h', '12h', '24h', '3d', '7d'];
    const minInterval = 5000; // 5 seconds
    const maxInterval = 300000; // 5 minutes

    return (
      validTimeframes.includes(data.timeframe) &&
      data.interval >= minInterval &&
      data.interval <= maxInterval
    );
  }

  private async generateAnalyticsUpdate(timeframe: string) {
    // Re-use existing analytics generation logic
    const analyticsData = await this.getAnalyticsData(timeframe);

    return {
      timestamp: Date.now(),
      timeframe,
      ...analyticsData
    };
  }

  private async getAnalyticsData(timeframe: string) {
    try {
      const alerts = this.getAlertsForTimeframe(timeframe);
      const timeSeries = predictionAnalytics.analyzeTimeSeries(alerts);
      const distribution = predictionAnalytics.calculateDistributions(alerts);
      const patterns = predictionAnalytics.findStrongPatterns(alerts);

      return {
        summary: {
          totalAlerts: alerts.length,
          trend: timeSeries.trend,
          hasSeasonality: Object.values(timeSeries.seasonality || {}).some(v => v),
          strongPatterns: patterns.length
        },
        timeSeries,
        distribution,
        patterns
      };
    } catch (error) {
      logger.error('Error getting analytics data', { error, timeframe });
      throw error;
    }
  }

  private getAlertsForTimeframe(timeframe: string) {
    const now = Date.now();
    const timeframeMs = this.parseTimeframe(timeframe);
    
    return alertNotifier.getAlertHistory({
      from: new Date(now - timeframeMs),
      to: new Date(now)
    });
  }

  private parseTimeframe(timeframe: string): number {
    const value = parseInt(timeframe);
    const unit = timeframe.slice(-1);
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // default 24h
    }
  }

  private async exportAnalytics(
    timeframe: string,
    format: 'json' | 'csv',
    type: 'full' | 'summary' | 'timeSeries' | 'patterns'
  ): Promise<string> {
    try {
      const data = await this.getAnalyticsData(timeframe);
      
      // Filter data based on type
      const exportData = this.filterDataForExport(data, type);

      if (format === 'csv') {
        return this.convertToCSV(exportData, type);
      }

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      logger.error('Error exporting analytics', { error, timeframe, format, type });
      throw error;
    }
  }

  private filterDataForExport(data: AnalyticsData, type: string): ExportData {
    switch (type) {
      case 'summary':
        return {
          summary: data.summary,
          timestamp: Date.now()
        };
      case 'timeSeries':
        return {
          timeSeries: data.timeSeries,
          timestamp: Date.now()
        };
      case 'patterns':
        return {
          patterns: data.patterns,
          timestamp: Date.now()
        };
      default:
        return {
          ...data,
          timestamp: Date.now()
        };
    }
  }

  private convertToCSV(data: ExportData, type: string): string {
    switch (type) {
      case 'summary':
        return this.convertSummaryToCSV(data.summary!);
      case 'timeSeries':
        return this.convertTimeSeriesToCSV(data.timeSeries!);
      case 'patterns':
        return this.convertPatternsToCSV(data.patterns!);
      default:
        return this.convertFullDataToCSV(data as AnalyticsData & { timestamp: number });
    }
  }

  private convertSummaryToCSV(summary: AnalyticsData['summary']): string {
    const rows = [
      ['Metric', 'Value'],
      ...Object.entries(summary).map(([metric, value]) => [metric, String(value)])
    ];
    return this.formatCSV(rows);
  }

  private convertTimeSeriesToCSV(timeSeries: AnalyticsData['timeSeries']): string {
    const rows = [
      ['Timestamp', 'Value', 'Trend', 'Seasonality'],
      ...timeSeries.forecasts.map((point) => [
        new Date(point.timestamp).toISOString(),
        String(point.value),
        timeSeries.trend,
        Object.entries(timeSeries.seasonality || {})
          .filter(([, value]) => value)
          .map(([key]) => key)
          .join(';')
      ])
    ];
    return this.formatCSV(rows);
  }

  private convertPatternsToCSV(patterns: AnalyticsData['patterns']): string {
    const rows = [
      ['Pattern', 'Confidence', 'Support', 'Last Occurrence'],
      ...patterns.map(pattern => [
        pattern.pattern,
        String(pattern.confidence),
        String(pattern.support),
        pattern.lastSeen ? new Date(pattern.lastSeen).toISOString() : ''
      ])
    ];
    return this.formatCSV(rows);
  }

  private convertFullDataToCSV(data: AnalyticsData): string {
    const rows = [
      ['Category', 'Metric', 'Value', 'Timestamp'],
      // Summary data
      ...Object.entries(data.summary).map(([metric, value]) => 
        ['Summary', metric, String(value), new Date().toISOString()]
      ),
      // Time series data
      ...data.timeSeries.forecasts.map((point) => 
        ['TimeSeries', 'forecast', String(point.value), new Date(point.timestamp).toISOString()]
      ),
      // Pattern data
      ...data.patterns.map((pattern) => 
        ['Pattern', pattern.pattern, String(pattern.confidence), pattern.lastSeen ? new Date(pattern.lastSeen).toISOString() : '']
      )
    ];
    return this.formatCSV(rows);
  }

  private formatCSV(rows: string[][]): string {
    return rows.map(row => 
      row.map(cell => 
        cell && cell.includes(',') ? `"${cell}"` : cell
      ).join(',')
    ).join('\n');
  }
}
