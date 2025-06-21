import { Alert } from './alertNotifier';
import { logger } from './logger';
import * as fs from 'fs';

interface AlertCorrelation {
  primaryAlert: Alert;
  relatedAlerts: Alert[];
  correlationType: 'cause' | 'effect' | 'related';
  confidence: number;
}

interface AlertBatch {
  id: string;
  alerts: Alert[];
  correlations: AlertCorrelation[];
  timestamp: number;
  processed: boolean;
}

class AlertProcessor {
  private static instance: AlertProcessor;
  private batches: Map<string, AlertBatch> = new Map();
  private readonly BATCH_WINDOW = 300000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 86400000; // 24 hours
  private currentBatchId: string = '';

  private constructor() {
    this.startNewBatch();
    this.startCleanupTimer();
  }

  public static getInstance(): AlertProcessor {
    if (!AlertProcessor.instance) {
      AlertProcessor.instance = new AlertProcessor();
    }
    return AlertProcessor.instance;
  }

  private startNewBatch() {
    this.currentBatchId = `batch-${Date.now()}`;
    this.batches.set(this.currentBatchId, {
      id: this.currentBatchId,
      alerts: [],
      correlations: [],
      timestamp: Date.now(),
      processed: false
    });

    // Process previous batch if it exists
    setTimeout(() => {
      this.processBatch(this.currentBatchId);
    }, this.BATCH_WINDOW);
  }

  private startCleanupTimer() {
    setInterval(() => {
      this.cleanupOldBatches();
    }, this.CLEANUP_INTERVAL);
  }

  public addAlert(alert: Alert) {
    const batch = this.batches.get(this.currentBatchId);
    if (batch && !batch.processed) {
      batch.alerts.push(alert);
    }
  }

  private async processBatch(batchId: string) {
    const batch = this.batches.get(batchId);
    if (!batch || batch.processed) return;

    try {
      // Find correlations
      batch.correlations = this.findCorrelations(batch.alerts);

      // Archive batch
      await this.archiveBatch(batch);

      batch.processed = true;
      logger.info('Batch processed successfully', {
        batchId,
        alertCount: batch.alerts.length,
        correlationCount: batch.correlations.length
      });

      // Start new batch if this was the current one
      if (batchId === this.currentBatchId) {
        this.startNewBatch();
      }
    } catch (error) {
      logger.error('Error processing batch', { error, batchId });
    }
  }

  private findCorrelations(alerts: Alert[]): AlertCorrelation[] {
    const correlations: AlertCorrelation[] = [];

    // Group alerts by type
    const alertsByType = new Map<string, Alert[]>();
    alerts.forEach(alert => {
      const typeAlerts = alertsByType.get(alert.type) || [];
      typeAlerts.push(alert);
      alertsByType.set(alert.type, typeAlerts);
    });

    // Find temporal correlations
    alerts.forEach(alert => {
      const timeWindow = 60000; // 1 minute
      const relatedAlerts = alerts.filter(a => 
        a !== alert && 
        Math.abs(a.timestamp - alert.timestamp) <= timeWindow
      );

      if (relatedAlerts.length > 0) {
        correlations.push({
          primaryAlert: alert,
          relatedAlerts,
          correlationType: this.determineCorrelationType(alert, relatedAlerts),
          confidence: this.calculateCorrelationConfidence(alert, relatedAlerts)
        });
      }
    });

    return correlations;
  }

  private determineCorrelationType(
    primary: Alert,
    related: Alert[]
  ): 'cause' | 'effect' | 'related' {
    // If primary alert happens before all related alerts, it might be a cause
    if (related.every(r => r.timestamp > primary.timestamp)) {
      return 'cause';
    }
    
    // If primary alert happens after all related alerts, it might be an effect
    if (related.every(r => r.timestamp < primary.timestamp)) {
      return 'effect';
    }

    return 'related';
  }

  private calculateCorrelationConfidence(
    primary: Alert,
    related: Alert[]
  ): number {
    let confidence = 0;

    // Time-based confidence
    const timeProximity = related.reduce((acc, r) => 
      acc + (1 / Math.abs(r.timestamp - primary.timestamp)), 0
    ) / related.length;
    confidence += timeProximity * 0.4; // 40% weight

    // Type-based confidence
    const sameTypeCount = related.filter(r => r.type === primary.type).length;
    confidence += (sameTypeCount / related.length) * 0.3; // 30% weight

    // Severity-based confidence
    const sameSeverityCount = related.filter(r => r.severity === primary.severity).length;
    confidence += (sameSeverityCount / related.length) * 0.3; // 30% weight

    return Math.min(confidence, 1);
  }

  private async archiveBatch(batch: AlertBatch) {
    try {
      // Ensure directory exists
      const dirPath = './logs/alert-archives';
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Archive to file system
      const archivePath = `${dirPath}/${batch.id}.json`;
      await fs.promises.writeFile(
        archivePath,
        JSON.stringify(batch, null, 2)
      );

      logger.info('Batch archived successfully', { batchId: batch.id });
    } catch (error) {
      logger.error('Error archiving batch', { error, batchId: batch.id });
      throw error;
    }
  }

  private async cleanupOldBatches() {
    const now = Date.now();
    const oldBatches = Array.from(this.batches.entries())
      .filter(([_, batch]) => now - batch.timestamp > this.CLEANUP_INTERVAL);

    for (const [id, batch] of oldBatches) {
      try {
        await this.archiveBatch(batch);
        this.batches.delete(id);
        logger.info('Old batch cleaned up', { batchId: id });
      } catch (error) {
        logger.error('Error cleaning up batch', { error, batchId: id });
      }
    }
  }

  public getBatchSummary(batchId: string) {
    const batch = this.batches.get(batchId);
    if (!batch) return null;

    return {
      id: batch.id,
      alertCount: batch.alerts.length,
      correlationCount: batch.correlations.length,
      timestamp: batch.timestamp,
      processed: batch.processed,
      correlations: batch.correlations.map(c => ({
        type: c.correlationType,
        confidence: c.confidence,
        alertTypes: [c.primaryAlert.type, ...c.relatedAlerts.map(a => a.type)]
      }))
    };
  }
}

export const alertProcessor = AlertProcessor.getInstance();
