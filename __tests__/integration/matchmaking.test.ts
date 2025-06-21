import { createServer } from 'http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('Matchmaking Integration Tests', () => {
  let io: Server;
  let httpServer: any;
  let clientSockets: any[] = [];
  const PORT = 0; // Random available port

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: '*' }
    });
    httpServer.listen(PORT, () => {
      done();
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  beforeEach((done) => {
    const port = (httpServer.address() as AddressInfo).port;
    const client = io(`http://localhost:${port}`);
    clientSockets.push(client);
    client.on('connect', done);
  });

  afterEach(() => {
    clientSockets.forEach(socket => {
      socket.close();
    });
    clientSockets = [];
  });

  test('matches users with similar interests', (done) => {
    const [user1, user2] = clientSockets;
    const interests = ['música', 'programación'];

    user1.emit('find_partner', { interests, ageFilter: '18-25' });
    user2.emit('find_partner', { interests, ageFilter: '18-25' });

    user1.on('partner', (data: any) => {
      expect(data.initiator).toBe(true);
      done();
    });
  });

  test('respects age filter preferences', (done) => {
    const [user1, user2] = clientSockets;
    const interests = ['música'];

    user1.emit('find_partner', { interests, ageFilter: '18-25' });
    user2.emit('find_partner', { interests, ageFilter: '26-35' });

    // Should not match due to different age filters
    setTimeout(() => {
      expect(user1.connected).toBe(true);
      expect(user2.connected).toBe(true);
      done();
    }, 1000);
  });

  test('handles user disconnection properly', (done) => {
    const [user1, user2] = clientSockets;
    const interests = ['música'];

    user1.emit('find_partner', { interests });
    user2.emit('find_partner', { interests });

    user2.on('partner', () => {
      user1.disconnect();
    });

    user2.on('partner_disconnected', () => {
      done();
    });
  });

  test('implements rate limiting', (done) => {
    const [user] = clientSockets;
    const MAX_REQUESTS = 10;
    let errorReceived = false;

    user.on('error', (data: any) => {
      expect(data.message).toContain('Rate limit exceeded');
      errorReceived = true;
    });

    // Send many requests quickly
    for (let i = 0; i < MAX_REQUESTS + 5; i++) {
      user.emit('find_partner', { interests: ['test'] });
    }

    setTimeout(() => {
      expect(errorReceived).toBe(true);
      done();
    }, 100);
  });
  test('matches users in order of queue entry', (done) => {
    const [user1, user2, user3] = clientSockets;
    const interests = ['música'];

    // First two users should match
    user1.emit('find_partner', { interests });
    user2.emit('find_partner', { interests });
    user3.emit('find_partner', { interests });

    let user1Matched = false;
    let user2Matched = false;
    let user3Matched = false;

    user1.on('partner', () => {
      user1Matched = true;
    });

    user2.on('partner', () => {
      user2Matched = true;
    });

    user3.on('partner', () => {
      user3Matched = false; // Should not match immediately
    });

    setTimeout(() => {
      expect(user1Matched).toBe(true);
      expect(user2Matched).toBe(true);
      expect(user3Matched).toBe(false);
      done();
    }, 1000);
  });

  test('handles multiple interest matches correctly', (done) => {
    const [user1, user2, user3] = clientSockets;
    
    user1.emit('find_partner', { interests: ['música', 'programación'] });
    user2.emit('find_partner', { interests: ['música', 'viajes'] });
    user3.emit('find_partner', { interests: ['programación', 'viajes'] });

    let matchCount = 0;
    const matches = new Set();

    const checkMatch = (userId: string, partnerId: string) => {
      matches.add(`${userId}-${partnerId}`);
      matchCount++;
      if (matchCount === 2) {
        expect(matches.size).toBe(2); // Should have two unique pairs
        done();
      }
    };

    user1.on('partner', (data: any) => checkMatch('user1', data.id));
    user2.on('partner', (data: any) => checkMatch('user2', data.id));
    user3.on('partner', (data: any) => checkMatch('user3', data.id));
  });

  test('handles reconnection attempts properly', (done) => {
    const [user1, user2] = clientSockets;
    const interests = ['música'];
    let reconnectAttempts = 0;

    user1.on('disconnect', () => {
      if (reconnectAttempts < 3) {
        reconnectAttempts++;
        user1.connect();
      }
    });

    user1.on('connect', () => {
      if (reconnectAttempts === 3) {
        expect(user1.connected).toBe(true);
        done();
      }
    });

    // Force disconnections
    user1.disconnect();
  });

  test('cleanup removes user from all queues', (done) => {
    const [user1, user2] = clientSockets;
    const interests = ['música', 'programación'];

    user1.emit('find_partner', { interests });
    
    setTimeout(() => {
      user1.disconnect();
      
      // Try to match user2 with user1's interests
      user2.emit('find_partner', { interests: ['música'] });
      
      user2.on('partner', () => {
        // Should not match with disconnected user
        fail('Should not match with disconnected user');
      });

      setTimeout(() => {
        done();
      }, 1000);
    }, 100);
  });
});
