import { io, Socket } from 'socket.io-client';
import EventEmitter from 'events';

interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
}

interface ClientConfig {
  url: string;
  apiKey: string;
  retry?: Partial<RetryConfig>;
  autoReconnect?: boolean;
}

interface SubscriptionOptions {
  timeframe: string;
  interval: number;
}

export class AnalyticsClient extends EventEmitter {
  private socket: Socket | null = null;
  private retryCount = 0;
  private retryTimeout: NodeJS.Timeout | null = null;
  private subscriptionOptions: SubscriptionOptions | null = null;
  
  private readonly config: ClientConfig;
  private readonly retryConfig: RetryConfig;

  constructor(config: ClientConfig) {
    super();
    this.config = config;
    this.retryConfig = {
      maxAttempts: 10,
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 2,
      ...config.retry
    };
  }

  public connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(this.config.url, {
      auth: {
        token: this.config.apiKey
      },
      reconnection: false // We handle reconnection ourselves
    });

    this.setupSocketListeners();
  }

  public disconnect(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.retryCount = 0;
  }

  public subscribe(options: SubscriptionOptions): void {
    if (!this.socket?.connected) {
      throw new Error('Client not connected');
    }

    this.subscriptionOptions = options;
    this.socket.emit('subscribe', options);
  }

  public unsubscribe(): void {
    if (!this.socket?.connected) return;
    
    this.socket.emit('unsubscribe');
    this.subscriptionOptions = null;
  }

  public async exportData(options: {
    format: 'json' | 'csv';
    type: 'full' | 'summary' | 'timeSeries' | 'patterns';
    timeframe: string;
  }): Promise<any> {
    if (!this.socket?.connected) {
      throw new Error('Client not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Export timeout'));
      }, 30000);

      const cleanup = () => {
        this.socket?.off('export_ready', handleSuccess);
        this.socket?.off('export_error', handleError);
        clearTimeout(timeout);
      };

      const handleSuccess = (data: any) => {
        cleanup();
        resolve(data);
      };

      const handleError = (error: any) => {
        cleanup();
        reject(error);
      };

      this.socket.once('export_ready', handleSuccess);
      this.socket.once('export_error', handleError);
      this.socket.emit('export', options);
    });
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.retryCount = 0;
      this.emit('connected');

      // Resubscribe if we had an active subscription
      if (this.subscriptionOptions) {
        this.subscribe(this.subscriptionOptions);
      }
    });

    this.socket.on('disconnect', () => {
      this.emit('disconnected');
      if (this.config.autoReconnect !== false) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (error: any) => {
      this.emit('error', error);
      if (error.message?.includes('Rate limit exceeded')) {
        this.handleRateLimit();
      }
    });

    this.socket.on('analytics_update', (data: any) => {
      this.emit('update', data);
    });

    this.socket.on('connect_error', (error: Error) => {
      this.emit('error', error);
      if (this.config.autoReconnect !== false) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.retryTimeout || this.retryCount >= this.retryConfig.maxAttempts) {
      if (this.retryCount >= this.retryConfig.maxAttempts) {
        this.emit('reconnect_failed');
      }
      return;
    }

    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.factor, this.retryCount),
      this.retryConfig.maxDelay
    );

    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.retryCount++;
      this.emit('reconnecting', { attempt: this.retryCount, delay });
      this.connect();
    }, delay);
  }

  private handleRateLimit(): void {
    // Implement exponential backoff for rate limits
    const backoffDelay = Math.min(
      1000 * Math.pow(2, this.retryCount),
      30000
    );
    
    this.emit('rate_limited', { delay: backoffDelay });
    
    if (this.subscriptionOptions) {
      // Increase update interval to reduce request frequency
      this.subscriptionOptions.interval = Math.min(
        this.subscriptionOptions.interval * 2,
        300000 // Max 5 minutes
      );
    }
  }
}

// Usage example:
/*
const client = new AnalyticsClient({
  url: 'https://api.circlesfera.com/analytics',
  apiKey: 'your-api-key',
  retry: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 10000,
    factor: 2
  },
  autoReconnect: true
});

client.on('connected', () => {
  console.log('Connected to analytics service');
  client.subscribe({
    timeframe: '24h',
    interval: 5000
  });
});

client.on('update', (data) => {
  console.log('Received analytics update:', data);
});

client.on('error', (error) => {
  console.error('Analytics error:', error);
});

client.connect();
*/
