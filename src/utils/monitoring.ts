import { EventEmitter } from 'events';
import os from 'os';

interface SystemMetrics {
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
    percentage: number;
  };
  cpu: {
    load: number[];
    cores: number;
  };
  connections: {
    current: number;
    total: number;
    peak: number;
  };
  websocket: {
    activeConnections: number;
    totalMessages: number;
    errors: number;
  };
}

class MonitoringService extends EventEmitter {
  private static instance: MonitoringService;
  private metrics: SystemMetrics;
  private startTime: number;

  private constructor() {
    super();
    this.startTime = Date.now();
    this.metrics = {
      uptime: 0,
      memory: {
        total: 0,
        free: 0,
        used: 0,
        percentage: 0
      },
      cpu: {
        load: [],
        cores: os.cpus().length
      },
      connections: {
        current: 0,
        total: 0,
        peak: 0
      },
      websocket: {
        activeConnections: 0,
        totalMessages: 0,
        errors: 0
      }
    };

    this.startMetricsCollection();
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.updateMetrics();
      this.emit('metrics', this.metrics);
    }, 5000);
  }

  private updateMetrics(): void {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    this.metrics = {
      ...this.metrics,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        percentage: (usedMem / totalMem) * 100
      },
      cpu: {
        load: os.loadavg(),
        cores: os.cpus().length
      }
    };
  }

  public recordWebSocketConnection(): void {
    this.metrics.websocket.activeConnections++;
    this.metrics.connections.current++;
    this.metrics.connections.total++;
    if (this.metrics.connections.current > this.metrics.connections.peak) {
      this.metrics.connections.peak = this.metrics.connections.current;
    }
  }

  public recordWebSocketDisconnection(): void {
    this.metrics.websocket.activeConnections--;
    this.metrics.connections.current--;
  }

  public recordWebSocketMessage(): void {
    this.metrics.websocket.totalMessages++;
  }

  public recordWebSocketError(): void {
    this.metrics.websocket.errors++;
  }

  public getMetrics(): SystemMetrics {
    return this.metrics;
  }

  public getHealthStatus(): {status: string; details: object} {
    const cpuUsage = this.metrics.cpu.load[0];
    const memoryUsage = this.metrics.memory.percentage;
    
    const status = 
      cpuUsage < 80 && 
      memoryUsage < 85 && 
      this.metrics.websocket.errors < 100 ? 'healthy' : 'unhealthy';

    return {
      status,
      details: {
        uptime: this.metrics.uptime,
        cpu: cpuUsage,
        memory: memoryUsage,
        connections: this.metrics.websocket.activeConnections,
        errors: this.metrics.websocket.errors
      }
    };
  }
}

export const monitoring = MonitoringService.getInstance();
