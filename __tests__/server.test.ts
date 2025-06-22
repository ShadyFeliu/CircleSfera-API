import { createServer } from 'http';
import { Server, Socket as ServerSocket } from 'socket.io';
import { io as socketIOClient, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('WebSocket Server', () => {
  let io: Server;
  let serverSocket: ServerSocket;
  let clientSocket: ClientSocket;
  let httpServer: ReturnType<typeof createServer>;

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    
    return new Promise<void>((resolve) => {
      httpServer.listen(() => {
        const port = (httpServer.address() as AddressInfo).port;
        clientSocket = socketIOClient(`http://localhost:${port}`);
        io.on('connection', (socket) => {
          serverSocket = socket;
        });
        clientSocket.on('connect', resolve);
      });
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
    httpServer.close();
  });

  test('should establish WebSocket connection', () => {
    expect(clientSocket.connected).toBe(true);
    expect(serverSocket).toBeDefined();
  });

  test('should handle find_partner event', () => {
    const interests = ['música', 'programación'];
    const ageFilter = '18-25';

    return new Promise<void>((resolve) => {
      // Listen for the event on the server socket
      serverSocket.on('find_partner', (data: { interests: string[]; ageFilter: string }) => {
        expect(data.interests).toEqual(interests);
        expect(data.ageFilter).toBe(ageFilter);
        resolve();
      });

      // Emit the event from client
      clientSocket.emit('find_partner', { interests, ageFilter });
    });
  });

  test('should handle user reporting', () => {
    const reason = 'comportamiento inapropiado';
    
    return new Promise<void>((resolve) => {
      // Listen for the event on the server socket
      serverSocket.on('report_user', (data: { reason: string }) => {
        expect(data.reason).toBe(reason);
        resolve();
      });

      // Emit the event from client
      clientSocket.emit('report_user', { reason });
    });
  });

  test('should handle user disconnection', () => {
    // Test that we can emit a disconnection event
    expect(() => {
      serverSocket.broadcast.emit('partner_disconnected');
    }).not.toThrow();
  });
});
