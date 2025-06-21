import { Socket } from 'socket.io';
import { logger } from '../utils/logger';

export const authenticateWebSocket = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token;

  if (!token || token !== process.env.METRICS_API_KEY) {
    logger.warn('Unauthorized WebSocket connection attempt', {
      socketId: socket.id,
      ip: socket.handshake.address
    });
    return next(new Error('Authentication failed'));
  }

  logger.info('WebSocket client authenticated', {
    socketId: socket.id,
    ip: socket.handshake.address
  });
  next();
};
