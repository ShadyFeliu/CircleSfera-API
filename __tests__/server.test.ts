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

  test('should emit user count on connection', (done) => {
    clientSocket.on('user_count', (count: number) => {
      expect(count).toBe(1);
      done();
    });
    clientSocket.emit('get_user_count');
  });

  test('should handle find_partner event', (done) => {
    const interests = ['música', 'programación'];
    const ageFilter = '18-25';

    clientSocket.emit('find_partner', { interests, ageFilter });
    
    serverSocket.on('find_partner', (data: any) => {
      expect(data.interests).toEqual(interests);
      expect(data.ageFilter).toBe(ageFilter);
      done();
    });
  });

  test('should handle user reporting', (done) => {
    const reason = 'comportamiento inapropiado';
    
    clientSocket.emit('report_user', { reason });
    
    serverSocket.on('report_user', (data: any) => {
      expect(data.reason).toBe(reason);
      done();
    });
  });

  test('should handle user disconnection', (done) => {
    clientSocket.on('partner_disconnected', () => {
      done();
    });
    
    // Simulate partner disconnection
    serverSocket.broadcast.emit('partner_disconnected');
  });
});
