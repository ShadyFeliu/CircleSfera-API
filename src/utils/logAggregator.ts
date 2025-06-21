import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import readline from 'readline';
import { logger } from './logger';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: any;
}

interface LogAggregation {
  totalEntries: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  httpCount: number;
  debugCount: number;
  topErrors: Array<{message: string; count: number}>;
  timeDistribution: {[hour: string]: number};
  mostActiveUsers: Array<{userId: string; actionCount: number}>;
}

export class LogAggregator {
  private static instance: LogAggregator;
  private logDir: string;

  private constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
  }

  public static getInstance(): LogAggregator {
    if (!LogAggregator.instance) {
      LogAggregator.instance = new LogAggregator();
    }
    return LogAggregator.instance;
  }

  private async parseLogFile(filePath: string): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const logParts = line.match(/^(.*?)\s+\[(.*?)\]:\s+(.*)$/);
        if (logParts) {
          const [, timestamp, level, rest] = logParts;
          const metadata = rest.includes('{') ? 
            JSON.parse(rest.substring(rest.indexOf('{'))) : 
            undefined;
          const message = rest.includes('{') ? 
            rest.substring(0, rest.indexOf('{')).trim() : 
            rest;

          entries.push({
            timestamp,
            level,
            message,
            metadata
          });
        }
      } catch (error) {
        logger.warn(`Error parsing log line: ${line}`, { error });
      }
    }

    return entries;
  }

  public async aggregateLogs(startDate?: Date, endDate?: Date): Promise<LogAggregation> {
    const aggregation: LogAggregation = {
      totalEntries: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      httpCount: 0,
      debugCount: 0,
      topErrors: [],
      timeDistribution: {},
      mostActiveUsers: []
    };

    const errorMap = new Map<string, number>();
    const userActivityMap = new Map<string, number>();

    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const entries = await this.parseLogFile(filePath);

        for (const entry of entries) {
          const entryDate = new Date(entry.timestamp);
          
          if (startDate && entryDate < startDate) continue;
          if (endDate && entryDate > endDate) continue;

          aggregation.totalEntries++;

          // Count by level
          switch (entry.level.toLowerCase()) {
            case 'error': aggregation.errorCount++; break;
            case 'warn': aggregation.warnCount++; break;
            case 'info': aggregation.infoCount++; break;
            case 'http': aggregation.httpCount++; break;
            case 'debug': aggregation.debugCount++; break;
          }

          // Aggregate errors
          if (entry.level.toLowerCase() === 'error') {
            const errorMessage = entry.message;
            errorMap.set(errorMessage, (errorMap.get(errorMessage) || 0) + 1);
          }

          // Time distribution
          const hour = entryDate.getHours().toString().padStart(2, '0');
          aggregation.timeDistribution[hour] = (aggregation.timeDistribution[hour] || 0) + 1;

          // User activity
          if (entry.metadata?.userId) {
            userActivityMap.set(
              entry.metadata.userId,
              (userActivityMap.get(entry.metadata.userId) || 0) + 1
            );
          }
        }
      }

      // Process error map
      aggregation.topErrors = Array.from(errorMap.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Process user activity
      aggregation.mostActiveUsers = Array.from(userActivityMap.entries())
        .map(([userId, actionCount]) => ({ userId, actionCount }))
        .sort((a, b) => b.actionCount - a.actionCount)
        .slice(0, 10);

      return aggregation;

    } catch (error) {
      logger.error('Error aggregating logs', { error });
      throw error;
    }
  }

  public async getRecentErrors(minutes: number = 15): Promise<LogEntry[]> {
    const cutoff = new Date(Date.now() - minutes * 60000);
    const errors: LogEntry[] = [];

    try {
      const files = await fs.readdir(this.logDir);
      const errorFiles = files.filter(file => file.includes('error'));

      for (const file of errorFiles) {
        const filePath = path.join(this.logDir, file);
        const entries = await this.parseLogFile(filePath);

        errors.push(...entries.filter(entry => 
          new Date(entry.timestamp) > cutoff
        ));
      }

      return errors.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    } catch (error) {
      logger.error('Error getting recent errors', { error });
      throw error;
    }
  }
}

export const logAggregator = LogAggregator.getInstance();
