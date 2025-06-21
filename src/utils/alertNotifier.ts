import { logger } from './logger';

export interface Alert {
  type: string;
  value: number;
  threshold: number;
  timestamp: number;
  severity: 'warning' | 'critical';
  message: string;
}

interface NotificationChannel {
  name: string;
  enabled: boolean;
  notify: (alert: Alert) => Promise<void>;
}

class AlertNotifier {
  private static instance: AlertNotifier;
  private channels: Map<string, NotificationChannel> = new Map();
  private alertHistory: Alert[] = [];
  private readonly MAX_HISTORY = 1000;

  private constructor() {
    this.initializeChannels();
  }

  public static getInstance(): AlertNotifier {
    if (!AlertNotifier.instance) {
      AlertNotifier.instance = new AlertNotifier();
    }
    return AlertNotifier.instance;
  }

  private async initializeChannels() {
    // Slack notification channel
    if (process.env.SLACK_WEBHOOK_URL) {
      this.channels.set('slack', {
        name: 'Slack',
        enabled: true,
        notify: async (alert) => {
          try {
            const response = await fetch(process.env.SLACK_WEBHOOK_URL!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `🚨 *Alert*: ${alert.message}\n*Type*: ${alert.type}\n*Value*: ${alert.value}\n*Threshold*: ${alert.threshold}\n*Severity*: ${alert.severity}`
              })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          } catch (error) {
            logger.error('Failed to send Slack notification', { error });
          }
        }
      });
    }

    // Email notification channel
    if (process.env.EMAIL_ENABLED === 'true') {
      this.channels.set('email', {
        name: 'Email',
        enabled: true,
        notify: async (alert) => {
          // Implement email notification logic here
          logger.info('Email notification would be sent', { alert });
        }
      });
    }

    // Webhook notification channel
    if (process.env.WEBHOOK_URL) {
      this.channels.set('webhook', {
        name: 'Webhook',
        enabled: true,
        notify: async (alert) => {
          try {
            const response = await fetch(process.env.WEBHOOK_URL!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(alert)
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          } catch (error) {
            logger.error('Failed to send webhook notification', { error });
          }
        }
      });
    }
  }

  public async notifyAlert(alert: Alert) {
    // Add to history
    this.alertHistory.push({
      ...alert,
      timestamp: Date.now()
    });

    // Trim history if needed
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory = this.alertHistory.slice(-this.MAX_HISTORY);
    }
    
    // Update prediction accuracy tracking for non-predicted alerts
    if (alert.type !== 'predicted_alert_pattern') {
      try {
        // Import here to avoid circular dependency
        const { predictionAccuracyTracker } = require('./predictionAccuracy');
        if (predictionAccuracyTracker) {
          // Use the alert pattern to verify predictions
          if (alert.type) {
            predictionAccuracyTracker.verifyPrediction(
              `pattern-${alert.type}`, 
              [alert]
            );
          }
        }
      } catch (error) {
        logger.warn('Failed to update prediction accuracy', { error });
      }
    }

    // Notify all enabled channels
    const notifications = Array.from(this.channels.values())
      .filter(channel => channel.enabled)
      .map(channel => channel.notify(alert));

    await Promise.allSettled(notifications);

    logger.info('Alert notifications sent', { alert });
  }

  public getAlertHistory(options: {
    type?: string;
    severity?: 'warning' | 'critical';
    from?: Date;
    to?: Date;
  } = {}) {
    let filtered = this.alertHistory;

    if (options.type) {
      filtered = filtered.filter(alert => alert.type === options.type);
    }

    if (options.severity) {
      filtered = filtered.filter(alert => alert.severity === options.severity);
    }

    if (options.from) {
      filtered = filtered.filter(alert => alert.timestamp >= options.from!.getTime());
    }

    if (options.to) {
      filtered = filtered.filter(alert => alert.timestamp <= options.to!.getTime());
    }

    return filtered;
  }

  public getAlertTrends() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const lastHour = this.alertHistory.filter(a => a.timestamp >= oneHourAgo);
    const lastDay = this.alertHistory.filter(a => a.timestamp >= oneDayAgo);

    return {
      lastHour: {
        total: lastHour.length,
        byType: this.groupByType(lastHour),
        bySeverity: this.groupBySeverity(lastHour)
      },
      lastDay: {
        total: lastDay.length,
        byType: this.groupByType(lastDay),
        bySeverity: this.groupBySeverity(lastDay)
      },
      trending: this.identifyTrends(lastDay)
    };
  }

  private groupByType(alerts: Alert[]) {
    return alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private groupBySeverity(alerts: Alert[]) {
    return alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private identifyTrends(alerts: Alert[]) {
    const trends = new Map<string, {
      count: number;
      increasing: boolean;
      avgValue: number;
    }>();

    // Group alerts by type and analyze trends
    alerts.forEach(alert => {
      const existing = trends.get(alert.type) || {
        count: 0,
        increasing: false,
        avgValue: 0
      };

      existing.count++;
      existing.avgValue = (existing.avgValue * (existing.count - 1) + alert.value) / existing.count;
      trends.set(alert.type, existing);
    });

    return Array.from(trends.entries())
      .map(([type, data]) => ({
        type,
        ...data
      }))
      .sort((a, b) => b.count - a.count);
  }
}

export const alertNotifier = AlertNotifier.getInstance();
