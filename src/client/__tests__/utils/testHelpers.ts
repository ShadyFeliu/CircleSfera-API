import { EventEmitter } from 'events';
import { Server } from 'mock-socket';

export interface MockServerEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: any) => void;
  analytics_update: (data: any) => void;
  export_ready: (data: any) => void;
  export_error: (error: any) => void;
}

export class TestServer extends EventEmitter {
  private server: Server;
  private eventLog: Array<{event: string; data?: any}> = [];

  constructor(url: string) {
    super();
    this.server = new Server(url);
    this.setupEventLogging();
  }

  private setupEventLogging() {
    const events = [
      'connect',
      'disconnect',
      'error',
      'subscribe',
      'unsubscribe',
      'export',
      'analytics_update'
    ];

    events.forEach(event => {
      this.server.on(event, (data?: any) => {
        this.eventLog.push({ event, data });
      });
    });
  }

  public emit(event: string, data?: any): void {
    this.server.emit(event, data);
    this.eventLog.push({ event, data });
  }

  public getEventLog() {
    return [...this.eventLog];
  }

  public clearEventLog() {
    this.eventLog = [];
  }

  public close() {
    this.server.close();
    this.eventLog = [];
  }

  public hasReceivedEvent(event: string): boolean {
    return this.eventLog.some(log => log.event === event);
  }

  public getEventCount(event: string): number {
    return this.eventLog.filter(log => log.event === event).length;
  }

  public getLastEventData(event: string): any | null {
    const events = this.eventLog.filter(log => log.event === event);
    return events.length > 0 ? events[events.length - 1].data : null;
  }
}

export const createTestClient = (url: string, apiKey: string, options = {}) => {
  const defaultOptions = {
    retry: {
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      factor: 2
    },
    autoReconnect: true
  };

  return {
    url,
    apiKey,
    ...defaultOptions,
    ...options
  };
};

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createMockError = (message: string, code?: string) => ({
  message,
  code,
  timestamp: Date.now()
});

export const mockAnalyticsData = {
  summary: {
    totalAlerts: 100,
    trend: 'increasing',
    hasSeasonality: true,
    strongPatterns: 3
  },
  timeSeries: {
    trend: 'increasing',
    seasonality: {
      daily: true,
      weekly: false,
      monthly: false
    },
    forecasts: [
      { timestamp: Date.now(), value: 10 },
      { timestamp: Date.now() + 3600000, value: 15 }
    ]
  },
  distribution: {
    byHour: { '0': 5, '1': 8, '2': 3 },
    byDay: { '0': 20, '1': 25, '2': 30 },
    byType: { 'error': 30, 'warning': 70 },
    bySeverity: { 'critical': 20, 'warning': 80 }
  }
};

export const validSubscriptionOptions = {
  timeframe: '24h',
  interval: 5000
};

export const invalidSubscriptionOptions = {
  timeframe: 'invalid',
  interval: -1
};

export class MockLogger {
  public logs: Array<{level: string; message: string; meta?: any}> = [];

  info(message: string, meta?: any) {
    this.logs.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: any) {
    this.logs.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: any) {
    this.logs.push({ level: 'error', message, meta });
  }

  clear() {
    this.logs = [];
  }

  getLastLog() {
    return this.logs[this.logs.length - 1];
  }

  getLogsByLevel(level: string) {
    return this.logs.filter(log => log.level === level);
  }
}

export const setupTestEnvironment = () => {
  const url = 'ws://localhost:8080';
  const apiKey = 'test-api-key';
  const server = new TestServer(url);
  const logger = new MockLogger();

  return {
    url,
    apiKey,
    server,
    logger,
    cleanup: () => {
      server.close();
      logger.clear();
    }
  };
};
