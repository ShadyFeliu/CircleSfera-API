import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as socketIOClient } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('WebSocket Server', () => {
  let io: Server;
  let serverSocket: any;
  let clientSocket: any;
  let httpServer: any;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      const port = (httpServer.address() as AddressInfo).port;
      clientSocket = socketIOClient(`http://localhost:${port}`);
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      clientSocket.on('connect', done);
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

  test('should handle find_partner event', (done) => {
    const interests = ['música', 'programación'];
    const ageFilter = '18-25';

    // Listen for the event on the server socket
    serverSocket.on('find_partner', (data: any) => {
      expect(data.interests).toEqual(interests);
      expect(data.ageFilter).toBe(ageFilter);
      done();
    });

    // Emit the event from client
    clientSocket.emit('find_partner', { interests, ageFilter });
  });

  test('should handle user reporting', (done) => {
    const reason = 'comportamiento inapropiado';
    
    // Listen for the event on the server socket
    serverSocket.on('report_user', (data: any) => {
      expect(data.reason).toBe(reason);
      done();
    });

    // Emit the event from client
    clientSocket.emit('report_user', { reason });
  });

  test('should handle user disconnection', () => {
    // Test that we can emit a disconnection event
    expect(() => {
      serverSocket.broadcast.emit('partner_disconnected');
    }).not.toThrow();
  });
});
