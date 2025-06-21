import { Alert } from './alertNotifier';
import { logger } from './logger';
import * as fs from 'fs';
import path from 'path';

interface AlertPattern {
  id: string;
  pattern: {
    alertTypes: string[];
    timeWindow: number;
    severity: 'warning' | 'critical';
    frequency: number;
  };
  occurrences: number;
  lastSeen: number;
  prediction?: {
    nextExpected: number;
    confidence: number;
  };
}

interface PatternMatch {
  patternId: string;
  confidence: number;
  matchedAlerts: Alert[];
}

class AlertPatternAnalyzer {
  private static instance: AlertPatternAnalyzer;
  private patterns: Map<string, AlertPattern> = new Map();
  private readonly MIN_PATTERN_OCCURRENCES = 3;
  private readonly ANALYSIS_INTERVAL = 3600000; // 1 hour

  private constructor() {
    this.loadPatterns();
    this.startAnalysisTimer();
  }

  public static getInstance(): AlertPatternAnalyzer {
    if (!AlertPatternAnalyzer.instance) {
      AlertPatternAnalyzer.instance = new AlertPatternAnalyzer();
    }
    return AlertPatternAnalyzer.instance;
  }

  private async loadPatterns() {
    try {
      const patternsPath = './data/alert-patterns.json';
      if (fs.existsSync(patternsPath)) {
        const data = await fs.promises.readFile(patternsPath, 'utf-8');
        const patterns = JSON.parse(data);
        patterns.forEach((p: AlertPattern) => this.patterns.set(p.id, p));
        logger.info('Alert patterns loaded', { patternCount: patterns.length });
      }
    } catch (error) {
      logger.error('Error loading alert patterns', { error });
    }
  }

  private async savePatterns() {
    try {
      const patternsPath = './data/alert-patterns.json';
      await fs.promises.writeFile(
        patternsPath,
        JSON.stringify(Array.from(this.patterns.values()), null, 2)
      );
      logger.info('Alert patterns saved', { patternCount: this.patterns.size });
    } catch (error) {
      logger.error('Error saving alert patterns', { error });
    }
  }

  private startAnalysisTimer() {
    setInterval(() => {
      this.analyzeArchivedBatches();
    }, this.ANALYSIS_INTERVAL);
  }

  private async analyzeArchivedBatches() {
    try {
      const archivePath = './logs/alert-archives';
      const files = await fs.promises.readdir(archivePath);
      const batches = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async f => {
            const data = await fs.promises.readFile(
              path.join(archivePath, f),
              'utf-8'
            );
            return JSON.parse(data);
          })
      );

      this.detectPatterns(batches);
      await this.savePatterns();
      
      logger.info('Archive analysis completed', {
        batchesAnalyzed: batches.length,
        patternsFound: this.patterns.size
      });
    } catch (error) {
      logger.error('Error analyzing archived batches', { error });
    }
  }

  private detectPatterns(batches: any[]) {
    batches.forEach(batch => {
      const alertGroups = this.groupAlertsByTimeWindow(batch.alerts);
      alertGroups.forEach(group => {
        if (group.length >= 2) {
          const pattern = this.createPattern(group);
          this.updatePattern(pattern);
        }
      });
    });

    // Clean up old patterns
    this.cleanupPatterns();
  }

  private groupAlertsByTimeWindow(alerts: Alert[]): Alert[][] {
    const groups: Alert[][] = [];
    const timeWindow = 300000; // 5 minutes
    
    alerts.sort((a, b) => a.timestamp - b.timestamp);
    
    let currentGroup: Alert[] = [];
    alerts.forEach(alert => {
      if (currentGroup.length === 0) {
        currentGroup.push(alert);
      } else {
        const firstAlert = currentGroup[0];
        if (alert.timestamp - firstAlert.timestamp <= timeWindow) {
          currentGroup.push(alert);
        } else {
          if (currentGroup.length > 1) {
            groups.push([...currentGroup]);
          }
          currentGroup = [alert];
        }
      }
    });

    if (currentGroup.length > 1) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private createPattern(alerts: Alert[]): AlertPattern {
    const alertTypes = [...new Set(alerts.map(a => a.type))];
    const severity = alerts.some(a => a.severity === 'critical') ? 'critical' : 'warning';
    const timeWindow = Math.max(...alerts.map(a => a.timestamp)) - 
                      Math.min(...alerts.map(a => a.timestamp));

    return {
      id: `pattern-${alertTypes.join('-')}-${timeWindow}`,
      pattern: {
        alertTypes,
        timeWindow,
        severity,
        frequency: this.calculateFrequency(alerts)
      },
      occurrences: 1,
      lastSeen: Math.max(...alerts.map(a => a.timestamp))
    };
  }

  private calculateFrequency(alerts: Alert[]): number {
    const timestamps = alerts.map(a => a.timestamp);
    const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
    return alerts.length / (timeSpan / 3600000); // alerts per hour
  }

  private updatePattern(newPattern: AlertPattern) {
    const existing = this.patterns.get(newPattern.id);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = newPattern.lastSeen;
      existing.pattern.frequency = 
        (existing.pattern.frequency * (existing.occurrences - 1) + newPattern.pattern.frequency) / 
        existing.occurrences;
      
      // Update prediction
      if (existing.occurrences >= this.MIN_PATTERN_OCCURRENCES) {
        let avgTimeBetween = 0;
        if (existing.prediction?.nextExpected !== undefined) {
          avgTimeBetween = (existing.lastSeen - existing.prediction.nextExpected) / (existing.occurrences - 1);
        }
        existing.prediction = {
          nextExpected: existing.lastSeen + avgTimeBetween,
          confidence: Math.min(0.5 + (existing.occurrences * 0.1), 0.9)
        };
      }
    } else {
      this.patterns.set(newPattern.id, newPattern);
    }
  }

  private cleanupPatterns() {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    for (const [id, pattern] of this.patterns.entries()) {
      if (now - pattern.lastSeen > thirtyDays && pattern.occurrences < this.MIN_PATTERN_OCCURRENCES) {
        this.patterns.delete(id);
      }
    }
  }

  public matchPatterns(alerts: Alert[]): PatternMatch[] {
    const matches: PatternMatch[] = [];
    
    this.patterns.forEach(pattern => {
      if (pattern.occurrences >= this.MIN_PATTERN_OCCURRENCES) {
        const matchedAlerts = this.findPatternMatch(pattern, alerts);
        if (matchedAlerts.length > 0) {
          matches.push({
            patternId: pattern.id,
            confidence: this.calculateMatchConfidence(pattern, matchedAlerts),
            matchedAlerts
          });
        }
      }
    });

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private findPatternMatch(pattern: AlertPattern, alerts: Alert[]): Alert[] {
    const matchedAlerts: Alert[] = [];
    const patternTypes = new Set(pattern.pattern.alertTypes);
    
    alerts.forEach(alert => {
      if (patternTypes.has(alert.type)) {
        matchedAlerts.push(alert);
      }
    });

    return matchedAlerts;
  }

  private calculateMatchConfidence(pattern: AlertPattern, alerts: Alert[]): number {
    let confidence = 0;

    // Type match percentage
    const typeMatchPercentage = 
      alerts.filter(a => pattern.pattern.alertTypes.includes(a.type)).length / 
      pattern.pattern.alertTypes.length;
    confidence += typeMatchPercentage * 0.4;

    // Severity match
    const severityMatch = 
      alerts.some(a => a.severity === pattern.pattern.severity) ? 0.3 : 0;
    confidence += severityMatch;

    // Time window match
    const timeSpan = Math.max(...alerts.map(a => a.timestamp)) - 
                    Math.min(...alerts.map(a => a.timestamp));
    const timeWindowMatch = 
      Math.abs(timeSpan - pattern.pattern.timeWindow) / pattern.pattern.timeWindow;
    confidence += (1 - timeWindowMatch) * 0.3;

    return confidence;
  }

  public getPatternPredictions(): Array<AlertPattern & { dueIn: number }> {
    const now = Date.now();
    return Array.from(this.patterns.values())
      .filter(p => p.prediction && p.prediction.nextExpected > now)
      .map(p => ({
        ...p,
        dueIn: p.prediction!.nextExpected - now
      }))
      .sort((a, b) => a.dueIn - b.dueIn);
  }
}

export const alertPatternAnalyzer = AlertPatternAnalyzer.getInstance();
