import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { monitoring } from './monitoring';

interface TraceMetrics {
  path: string;
  method: string;
  duration: number;
  timestamp: number;
  statusCode: number;
  hasError: boolean;
  traceId: string;
}

interface WebSocketMetrics {
  eventType: string;
  duration: number;
  timestamp: number;
  socketId: string;
  hasError: boolean;
  traceId: string;
}

interface AlertThresholds {
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  wsConnectionErrors: number;
  wsLatency: number;
}

class TraceAnalyzer {
  private static instance: TraceAnalyzer;
  private metrics: TraceMetrics[] = [];
  private wsMetrics: WebSocketMetrics[] = [];
  private readonly MAX_METRICS = 1000;
  private readonly alertThresholds: AlertThresholds;

  private constructor() {
    this.alertThresholds = {
      errorRate: Number(process.env.ALERT_THRESHOLD_ERROR_RATE) || 0.1,
      avgResponseTime: Number(process.env.ALERT_THRESHOLD_AVG_RESPONSE) || 1000,
      p95ResponseTime: Number(process.env.ALERT_THRESHOLD_P95_RESPONSE) || 3000,
      wsConnectionErrors: Number(process.env.ALERT_THRESHOLD_WS_ERRORS) || 50,
      wsLatency: Number(process.env.ALERT_THRESHOLD_WS_LATENCY) || 500
    };
    
    this.startPeriodicAnalysis();
  }

  public static getInstance(): TraceAnalyzer {
    if (!TraceAnalyzer.instance) {
      TraceAnalyzer.instance = new TraceAnalyzer();
    }
    return TraceAnalyzer.instance;
  }

  public recordTrace(metrics: TraceMetrics) {
    this.metrics.push(metrics);
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Record performance metrics
    // monitoring.recordRequestMetric({
    //   path: metrics.path,
    //   duration: metrics.duration,
    //   statusCode: metrics.statusCode
    // });
  }
  
  public recordWebSocketMetric(metric: WebSocketMetrics) {
    this.wsMetrics.push(metric);
    if (this.wsMetrics.length > this.MAX_METRICS) {
      this.wsMetrics = this.wsMetrics.slice(-this.MAX_METRICS);
    }

    // monitoring.recordWebSocketMetric({
    //   eventType: metric.eventType,
    //   duration: metric.duration,
    //   hasError: metric.hasError
    // });
  }

  public getWebSocketMetrics(socketId?: string) {
    const metrics = socketId ? 
      this.wsMetrics.filter(m => m.socketId === socketId) :
      this.wsMetrics;

    if (metrics.length === 0) return null;

    const latencies = metrics.map(m => m.duration);
    return {
      count: metrics.length,
      averageLatency: latencies.reduce((a, b) => a + b, 0) / metrics.length,
      p95Latency: this.calculatePercentile(latencies, 95),
      errorRate: metrics.filter(m => m.hasError).length / metrics.length,
      eventTypes: this.groupByEventType(metrics)
    };
  }

  private groupByEventType(metrics: WebSocketMetrics[]) {
    const groups = new Map<string, number>();
    metrics.forEach(metric => {
      const count = groups.get(metric.eventType) || 0;
      groups.set(metric.eventType, count + 1);
    });
    return Object.fromEntries(groups);
  }

  public getPathMetrics(path: string) {
    const pathMetrics = this.metrics.filter(m => m.path === path);
    if (pathMetrics.length === 0) return null;

    const durations = pathMetrics.map(m => m.duration);
    return {
      count: pathMetrics.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / pathMetrics.length,
      p95: this.calculatePercentile(durations, 95),
      p99: this.calculatePercentile(durations, 99),
      errorRate: pathMetrics.filter(m => m.hasError).length / pathMetrics.length,
      recentErrors: pathMetrics.filter(m => m.hasError).slice(-5)
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  private startPeriodicAnalysis() {
    setInterval(() => {
      this.analyzeMetrics();
    }, 300000); // Every 5 minutes
  }

  private analyzeMetrics() {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(m => now - m.timestamp < 300000);
    const recentWsMetrics = this.wsMetrics.filter(m => now - m.timestamp < 300000);

    const analysis = {
      http: {
        totalRequests: recentMetrics.length,
        averageResponseTime: 0,
        errorRate: 0,
        pathAnalysis: new Map<string, {
          count: number;
          averageDuration: number;
          errorCount: number;
        }>()
      },
      websocket: {
        totalEvents: recentWsMetrics.length,
        averageLatency: 0,
        errorRate: 0,
        eventTypeAnalysis: new Map<string, {
          count: number;
          averageLatency: number;
          errorCount: number;
        }>()
      }
    };

    // HTTP metrics analysis
    recentMetrics.forEach(metric => {
      // Update path-specific metrics
      const pathStats = analysis.http.pathAnalysis.get(metric.path) || {
        count: 0,
        averageDuration: 0,
        errorCount: 0
      };

      pathStats.count++;
      pathStats.averageDuration = (pathStats.averageDuration * (pathStats.count - 1) + metric.duration) / pathStats.count;
      if (metric.hasError) pathStats.errorCount++;

      analysis.http.pathAnalysis.set(metric.path, pathStats);
    });

    // Calculate overall HTTP metrics
    if (recentMetrics.length > 0) {
      analysis.http.averageResponseTime = recentMetrics.reduce((acc, m) => acc + m.duration, 0) / recentMetrics.length;
      analysis.http.errorRate = recentMetrics.filter(m => m.hasError).length / recentMetrics.length;
    }

    // WebSocket metrics analysis
    recentWsMetrics.forEach(metric => {
      const eventStats = analysis.websocket.eventTypeAnalysis.get(metric.eventType) || {
        count: 0,
        averageLatency: 0,
        errorCount: 0
      };

      eventStats.count++;
      eventStats.averageLatency = 
        (eventStats.averageLatency * (eventStats.count - 1) + metric.duration) / eventStats.count;
      if (metric.hasError) eventStats.errorCount++;

      analysis.websocket.eventTypeAnalysis.set(metric.eventType, eventStats);
    });

    // Calculate overall WebSocket metrics
    if (recentWsMetrics.length > 0) {
      analysis.websocket.averageLatency = 
        recentWsMetrics.reduce((acc, m) => acc + m.duration, 0) / recentWsMetrics.length;
      analysis.websocket.errorRate = 
        recentWsMetrics.filter(m => m.hasError).length / recentWsMetrics.length;
    }

    // Log analysis and check thresholds
    logger.info('System Analysis', { analysis });

    this.checkThresholds(analysis);
  }
  
  private checkThresholds(analysis: any) {
    const alerts = [];

    // HTTP alerts
    if (analysis.http.errorRate > this.alertThresholds.errorRate) {
      alerts.push({
        type: 'http_error_rate',
        value: analysis.http.errorRate,
        threshold: this.alertThresholds.errorRate
      });
    }

    if (analysis.http.averageResponseTime > this.alertThresholds.avgResponseTime) {
      alerts.push({
        type: 'http_response_time',
        value: analysis.http.averageResponseTime,
        threshold: this.alertThresholds.avgResponseTime
      });
    }

    // WebSocket alerts
    if (analysis.websocket.errorRate > this.alertThresholds.errorRate) {
      alerts.push({
        type: 'websocket_error_rate',
        value: analysis.websocket.errorRate,
        threshold: this.alertThresholds.errorRate
      });
    }

    if (analysis.websocket.averageLatency > this.alertThresholds.wsLatency) {
      alerts.push({
        type: 'websocket_latency',
        value: analysis.websocket.averageLatency,
        threshold: this.alertThresholds.wsLatency
      });
    }

    if (alerts.length > 0) {
      logger.warn('Performance thresholds exceeded', { alerts });
      // Here you could trigger external alerting systems
    }
  }
}

export const traceAnalyzer = TraceAnalyzer.getInstance();

// Middleware to measure request performance
export const measureRequestPerformance = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    traceAnalyzer.recordTrace({
      path: req.path,
      method: req.method,
      duration,
      timestamp: startTime,
      statusCode: res.statusCode,
      hasError: res.statusCode >= 400,
      traceId: (req as any).traceId ?? ''
    });
  });

  next();
};
