import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

interface RateLimitInfo {
  count: number;
  firstRequest: number;
}

export class WebSocketRateLimiter {
  private static instance: WebSocketRateLimiter;
  private rateLimits: Map<string, RateLimitInfo> = new Map();
  private connectionsPerIP: Map<string, number> = new Map();

  // Configuration
  private readonly WINDOW_MS = 60000; // 1 minute
  private readonly MAX_REQUESTS = 600; // 10 requests per second
  private readonly MAX_CONNECTIONS_PER_IP = 5;
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  private constructor() {
    this.startCleanupInterval();
  }

  public static getInstance(): WebSocketRateLimiter {
    if (!WebSocketRateLimiter.instance) {
      WebSocketRateLimiter.instance = new WebSocketRateLimiter();
    }
    return WebSocketRateLimiter.instance;
  }

  public checkConnection(socket: Socket): boolean {
    const clientIP = socket.handshake.address;
    const currentConnections = this.connectionsPerIP.get(clientIP) || 0;

    if (currentConnections >= this.MAX_CONNECTIONS_PER_IP) {
      logger.warn('Connection limit exceeded', {
        ip: clientIP,
        connections: currentConnections
      });
      return false;
    }

    this.connectionsPerIP.set(clientIP, currentConnections + 1);
    return true;
  }

  public checkLimit(socket: Socket): boolean {
    const now = Date.now();
    const clientIP = socket.handshake.address;
    const limitInfo = this.rateLimits.get(clientIP) || { count: 0, firstRequest: now };

    // Reset counter if window has passed
    if (now - limitInfo.firstRequest > this.WINDOW_MS) {
      limitInfo.count = 0;
      limitInfo.firstRequest = now;
    }

    limitInfo.count++;
    this.rateLimits.set(clientIP, limitInfo);

    if (limitInfo.count > this.MAX_REQUESTS) {
      logger.warn('Rate limit exceeded for WebSocket', {
        ip: clientIP,
        socketId: socket.id,
        requestCount: limitInfo.count
      });
      return false;
    }

    return true;
  }

  public removeConnection(socket: Socket): void {
    const clientIP = socket.handshake.address;
    const currentConnections = this.connectionsPerIP.get(clientIP) || 0;
    
    if (currentConnections > 0) {
      this.connectionsPerIP.set(clientIP, currentConnections - 1);
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Clean up rate limits
      for (const [ip, info] of this.rateLimits.entries()) {
        if (now - info.firstRequest > this.WINDOW_MS) {
          this.rateLimits.delete(ip);
        }
      }

      // Clean up connection counts for IPs with no connections
      for (const [ip, count] of this.connectionsPerIP.entries()) {
        if (count <= 0) {
          this.connectionsPerIP.delete(ip);
        }
      }
    }, this.CLEANUP_INTERVAL);
  }
}

export const wsRateLimiter = WebSocketRateLimiter.getInstance();

export const applyWsRateLimiting = (socket: Socket, next: (err?: Error) => void) => {
  if (!wsRateLimiter.checkConnection(socket)) {
    return next(new Error('Connection limit exceeded'));
  }

  // Add rate limit check to all incoming events
  // @ts-ignore - Accessing private property 'onevent' from socket.io for event interception
  // This is necessary for rate limiting WebSocket events but may break in future socket.io versions
  const originalOnevent = socket.onevent;
  // @ts-ignore - Overriding private property 'onevent' from socket.io
  socket.onevent = function(this: Socket, packet: any) {
    if (!wsRateLimiter.checkLimit(this)) {
      this.emit('error', { message: 'Rate limit exceeded' });
      return;
    }
    originalOnevent.call(this, packet);
  };

  // Handle disconnect
  socket.on('disconnect', () => {
    wsRateLimiter.removeConnection(socket);
  });

  next();
};
