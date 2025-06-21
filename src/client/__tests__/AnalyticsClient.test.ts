import { AnalyticsClient } from '../AnalyticsClient';
import {
  TestServer,
  setupTestEnvironment,
  createTestClient,
  wait,
  mockAnalyticsData,
  validSubscriptionOptions,
  invalidSubscriptionOptions,
  createMockError
} from './utils/testHelpers';

describe('AnalyticsClient', () => {
  let testEnv: ReturnType<typeof setupTestEnvironment>;
  let client: AnalyticsClient;

  beforeEach(() => {
    testEnv = setupTestEnvironment();
    client = new AnalyticsClient(createTestClient(testEnv.url, testEnv.apiKey));
  });

  afterEach(() => {
    client.disconnect();
    testEnv.cleanup();
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should handle connection timeout', (done) => {
      const timeoutClient = new AnalyticsClient(createTestClient(testEnv.url, testEnv.apiKey, {
        connectionTimeout: 100
      }));

      timeoutClient.on('error', (error) => {
        expect(error.message).toContain('Connection timeout');
        done();
      });

      timeoutClient.connect();
      // Don't emit connect event, let it timeout
    });

    it('should handle invalid server responses', (done) => {
      client.on('error', (error) => {
        expect(error.message).toContain('Invalid server response');
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      // Emit malformed data
      testEnv.server.emit('analytics_update', null);
    });
    it('should connect successfully', (done) => {
      client.on('connected', () => {
        expect(client['socket']?.connected).toBe(true);
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
    });
    });

    it('should handle connection errors', (done) => {
      client.on('error', (error) => {
        expect(error.message).toBe('Connection failed');
        done();
      });

      client.connect();
      testEnv.server.emit('connect_error', new Error('Connection failed'));
    });

    it('should attempt reconnection on disconnect', (done) => {
      let reconnectAttempts = 0;

      client.on('reconnecting', ({ attempt }) => {
        reconnectAttempts = attempt;
        if (attempt === 3) {
          expect(reconnectAttempts).toBe(3);
          done();
        }
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('disconnect');
    });

    it('should handle multiple connection attempts gracefully', () => {
      client.connect();
      client.connect(); // Second connect should be ignored
      expect(client['socket']).toBeTruthy();
    });

    it('should clean up resources on disconnect', () => {
      client.connect();
      client.disconnect();
      expect(client['socket']).toBeNull();
      expect(client['retryCount']).toBe(0);
      expect(client['retryTimeout']).toBeNull();
    });

    it('should stop reconnection attempts after max attempts', (done) => {
      let reconnectAttempts = 0;
      
      client.on('reconnect_failed', () => {
        expect(reconnectAttempts).toBe(3);
        done();
      });

      client.on('reconnecting', ({ attempt }) => {
        reconnectAttempts = attempt;
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('disconnect');
    });

    it('should not attempt reconnection when autoReconnect is false', (done) => {
      const noReconnectClient = new AnalyticsClient(createTestClient(testEnv.url, testEnv.apiKey, {
        autoReconnect: false
      }));

      noReconnectClient.on('disconnected', () => {
        setTimeout(() => {
          expect(noReconnectClient['retryTimeout']).toBeNull();
          done();
        }, 100);
      });

      noReconnectClient.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('disconnect');
    });
  });

  describe('Subscription Management', () => {
    it('should validate timeframe format', () => {
      client.connect();
      testEnv.server.emit('connect');

      expect(() => {
        client.subscribe({
          timeframe: '24x', // Invalid format
          interval: 5000
        });
      }).toThrow('Invalid timeframe format');
    });

    it('should validate interval range', () => {
      client.connect();
      testEnv.server.emit('connect');

      expect(() => {
        client.subscribe({
          timeframe: '24h',
          interval: 1000 // Too low
        });
      }).toThrow('Interval must be between 5000 and 300000');
    });
    it('should handle subscription correctly', (done) => {
      testEnv.server.on('subscribe', (data) => {
        expect(data).toEqual(validSubscriptionOptions);
        done();
      });

      client.on('connected', () => {
        client.subscribe(validSubscriptionOptions);
      });

      client.connect();
      testEnv.server.emit('connect');
    });

    it('should throw error when subscribing without connection', () => {
      expect(() => {
        client.subscribe({ timeframe: '24h', interval: 5000 });
      }).toThrow('Client not connected');
    });

    it('should handle unsubscribe correctly', (done) => {
      testEnv.server.on('unsubscribe', () => {
        expect(client['subscriptionOptions']).toBeNull();
        done();
      });

      client.on('connected', () => {
        client.subscribe({ timeframe: '24h', interval: 5000 });
        client.unsubscribe();
      });

      client.connect();
      testEnv.server.emit('connect');
    });

    it('should resubscribe after reconnection', (done) => {
      let subscribeCount = 0;
      testEnv.server.on('subscribe', (data) => {
        subscribeCount++;
        if (subscribeCount === 2) {
          expect(data).toEqual(validSubscriptionOptions);
          done();
        }
      });

      client.on('connected', () => {
        client.subscribe(validSubscriptionOptions);
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('disconnect');
      setTimeout(() => testEnv.server.emit('connect'), 100);
    });

    it('should handle invalid subscription parameters', () => {
      client.connect();
      testEnv.server.emit('connect');

      expect(() => {
        client.subscribe(invalidSubscriptionOptions as any);
      }).toThrow();

      expect(() => {
        client.subscribe({
          timeframe: '24h',
          interval: 0
        } as any);
      }).toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should respect maximum backoff delay', (done) => {
      const maxDelay = 30000;
      let currentDelay = 0;

      client.on('rate_limited', ({ delay }) => {
        currentDelay = delay;
        if (currentDelay >= maxDelay) {
          expect(currentDelay).toBe(maxDelay);
          done();
        }
      });

      client.connect();
      testEnv.server.emit('connect');

      // Trigger multiple rate limits to reach max delay
      for (let i = 0; i < 5; i++) {
        testEnv.server.emit('error', createMockError('Rate limit exceeded'));
      }
    });
    it('should handle rate limit errors', (done) => {
      client.on('rate_limited', ({ delay }) => {
        expect(delay).toBeLessThanOrEqual(30000);
        expect(client['subscriptionOptions']?.interval).toBeGreaterThan(5000);
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      client.subscribe(validSubscriptionOptions);
      testEnv.server.emit('error', createMockError('Rate limit exceeded'));
    });

    it('should increase subscription interval on rate limit', (done) => {
      const initialInterval = 5000;
      
      client.on('rate_limited', () => {
        expect(client['subscriptionOptions']?.interval).toBe(10000);
        done();
      });

      client.on('connected', () => {
        client.subscribe({ timeframe: '24h', interval: initialInterval });
        testEnv.server.emit('error', createMockError('Rate limit exceeded'));
      });

      client.connect();
      testEnv.server.emit('connect');
    });

    it('should reset subscription interval after successful reconnection', (done) => {
      const initialInterval = 5000;
      
      client.on('connected', () => {
        if (!client['subscriptionOptions']) {
          client.subscribe({ timeframe: '24h', interval: initialInterval });
          testEnv.server.emit('error', createMockError('Rate limit exceeded'));
        } else if (client['subscriptionOptions'].interval > initialInterval) {
          // Simulate successful reconnection
          testEnv.server.emit('disconnect');
          setTimeout(() => {
            testEnv.server.emit('connect');
            expect(client['subscriptionOptions']?.interval).toBe(initialInterval);
            done();
          }, 100);
        }
      });

      client.connect();
      testEnv.server.emit('connect');
    });

    it('should handle multiple rate limits with exponential backoff', (done) => {
      const intervals: number[] = [];
      
      client.on('rate_limited', ({ delay }) => {
        intervals.push(delay);
        if (intervals.length === 3) {
          expect(intervals[1]).toBeGreaterThan(intervals[0]);
          expect(intervals[2]).toBeGreaterThan(intervals[1]);
          done();
        }
      });

      client.connect();
      testEnv.server.emit('connect');
      
      // Simulate multiple rate limit errors
      testEnv.server.emit('error', createMockError('Rate limit exceeded'));
      setTimeout(() => testEnv.server.emit('error', createMockError('Rate limit exceeded')), 100);
      setTimeout(() => testEnv.server.emit('error', createMockError('Rate limit exceeded')), 200);
    });
  });

  describe('Data Export', () => {
    it('should validate export format', async () => {
      client.connect();
      testEnv.server.emit('connect');

      await expect(client.exportData({
        format: 'invalid' as any,
        type: 'full',
        timeframe: '24h'
      })).rejects.toThrow('Invalid export format');
    });

    it('should handle concurrent exports', async () => {
      client.connect();
      testEnv.server.emit('connect');

      const export1 = client.exportData({
        format: 'json',
        type: 'full',
        timeframe: '24h'
      });

      const export2 = client.exportData({
        format: 'json',
        type: 'summary',
        timeframe: '24h'
      });

      setTimeout(() => {
        testEnv.server.emit('export_ready', { data: 'export1' });
        testEnv.server.emit('export_ready', { data: 'export2' });
      }, 100);

      const [result1, result2] = await Promise.all([export1, export2]);
      expect(result1.data).toBe('export1');
      expect(result2.data).toBe('export2');
    });
    it('should handle successful export', async () => {
      const exportData = { data: 'test' };
      const exportOptions = {
        format: 'json' as const,
        type: 'full' as const,
        timeframe: '24h'
      };

      client.connect();
      testEnv.server.emit('connect');

      setTimeout(() => {
        testEnv.server.emit('export_ready', exportData);
      }, 100);

      const result = await client.exportData(exportOptions);
      expect(result).toEqual(exportData);
    });

    it('should handle export timeout', async () => {
      client.connect();
      testEnv.server.emit('connect');

      // Override the Promise to resolve immediately for test purposes
      jest.spyOn(global, 'setTimeout').mockImplementationOnce((cb) => {
        cb();
        return {} as any;
      });

      await expect(client.exportData({
        format: 'json',
        type: 'full',
        timeframe: '24h'
      })).rejects.toThrow('Export timeout');
    });

    it('should handle export errors', async () => {
      const errorMessage = createMockError('Export failed');

      client.connect();
      testEnv.server.emit('connect');

      setTimeout(() => {
        testEnv.server.emit('export_error', errorMessage);
      }, 100);

      await expect(client.exportData({
        format: 'json',
        type: 'full',
        timeframe: '24h'
      })).rejects.toEqual(errorMessage);
    });
  });

  describe('Analytics Updates', () => {
    it('should handle analytics updates with valid data', (done) => {
      client.on('update', (data) => {
        expect(data).toEqual(mockAnalyticsData);
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('analytics_update', mockAnalyticsData);
    });

    it('should validate analytics data structure', (done) => {
      client.on('error', (error) => {
        expect(error.message).toContain('Invalid analytics data structure');
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('analytics_update', { invalidKey: 'data' });
    });
  });

  describe('Connection State Management', () => {
    it('should maintain correct connection state', () => {
      expect(client.isConnected()).toBe(false);
      
      client.connect();
      testEnv.server.emit('connect');
      expect(client.isConnected()).toBe(true);
      
      testEnv.server.emit('disconnect');
      expect(client.isConnected()).toBe(false);
    });

    it('should handle multiple disconnect calls gracefully', () => {
      client.connect();
      testEnv.server.emit('connect');
      
      client.disconnect();
      client.disconnect(); // Should not throw
      
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Subscription State Management', () => {
    it('should maintain subscription state through reconnections', (done) => {
      const subscription = { timeframe: '24h', interval: 5000 };
      let reconnectCount = 0;

      client.on('connected', () => {
        if (reconnectCount === 0) {
          client.subscribe(subscription);
          testEnv.server.emit('disconnect');
        } else if (reconnectCount === 1) {
          expect(client['subscriptionOptions']).toEqual(subscription);
          done();
        }
        reconnectCount++;
      });

      client.connect();
      testEnv.server.emit('connect');
      
      // Simulate reconnection
      setTimeout(() => testEnv.server.emit('connect'), 100);
    });

    it('should clear subscription state on manual disconnect', () => {
      client.connect();
      testEnv.server.emit('connect');
      
      client.subscribe({ timeframe: '24h', interval: 5000 });
      expect(client['subscriptionOptions']).toBeTruthy();
      
      client.disconnect();
      expect(client['subscriptionOptions']).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors with details', (done) => {
      const errorDetails = { code: 'ECONNREFUSED', syscall: 'connect' };
      
      client.on('error', (error) => {
        expect(error.code).toBe(errorDetails.code);
        expect(error.syscall).toBe(errorDetails.syscall);
        done();
      });

      client.connect();
      testEnv.server.emit('connect_error', errorDetails);
    });

    it('should handle internal errors gracefully', (done) => {
      const handler = () => { throw new Error('Internal error'); };
      
      client.on('error', (error) => {
        expect(error.message).toBe('Internal error');
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      client.on('analytics_update', handler);
      testEnv.server.emit('analytics_update', mockAnalyticsData);
    });
  });

  describe('Error Handling', () => {
    it('should handle server disconnect during export', async () => {
      client.connect();
      testEnv.server.emit('connect');

      const exportPromise = client.exportData({
        format: 'json',
        type: 'full',
        timeframe: '24h'
      });

      // Simulate server disconnect during export
      testEnv.server.emit('disconnect');

      await expect(exportPromise).rejects.toThrow('Connection lost during export');
    });

    it('should handle multiple errors in rapid succession', (done) => {
      const errors: Error[] = [];
      
      client.on('error', (error) => {
        errors.push(error);
        if (errors.length === 3) {
          expect(errors.length).toBe(3);
          expect(errors[0].message).not.toBe(errors[1].message);
          done();
        }
      });

      client.connect();
      testEnv.server.emit('connect');
      
      // Emit multiple different errors rapidly
      testEnv.server.emit('error', new Error('Error 1'));
      testEnv.server.emit('error', new Error('Error 2'));
      testEnv.server.emit('error', new Error('Error 3'));
    });

    it('should handle errors during subscription updates', (done) => {
      client.on('error', (error) => {
        expect(error.message).toContain('Subscription update failed');
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      client.subscribe(validSubscriptionOptions);
      
      // Simulate error during subscription update
      testEnv.server.emit('subscription_error', new Error('Subscription update failed'));
    });
  });

  describe('Cleanup', () => {
    it('should properly clean up all resources on disconnect', () => {
      const timeoutSpy = jest.spyOn(global, 'clearTimeout');
      const intervalSpy = jest.spyOn(global, 'clearInterval');
      
      client.connect();
      testEnv.server.emit('connect');
      client.subscribe(validSubscriptionOptions);
      
      client.disconnect();
      
      expect(timeoutSpy).toHaveBeenCalled();
      expect(intervalSpy).toHaveBeenCalled();
      expect(client['socket']).toBeNull();
      expect(client['subscriptionOptions']).toBeNull();
      expect(client['retryCount']).toBe(0);
      expect(client['retryTimeout']).toBeNull();
    });

    it('should clean up partial subscriptions on error', (done) => {
      client.connect();
      testEnv.server.emit('connect');
      
      // Start subscription but simulate error before completion
      client.subscribe(validSubscriptionOptions);
      testEnv.server.emit('error', new Error('Subscription failed'));
      
      setTimeout(() => {
        expect(client['subscriptionOptions']).toBeNull();
        done();
      }, 100);
    });
  });

  describe('Event Handling', () => {
    it('should clean up event listeners on disconnect', () => {
      const startListeners = client.listenerCount('analytics_update');
      
      client.connect();
      testEnv.server.emit('connect');
      
      const handler = () => {};
      client.on('analytics_update', handler);
      
      client.disconnect();
      
      expect(client.listenerCount('analytics_update')).toBe(startListeners);
    });

    it('should emit events in correct order during reconnection', (done) => {
      const events: string[] = [];
      
      ['disconnected', 'reconnecting', 'connected'].forEach(event => {
        client.on(event, () => events.push(event));
      });

      client.on('connected', () => {
        if (events.length === 3) {
          expect(events).toEqual(['disconnected', 'reconnecting', 'connected']);
          done();
        }
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('disconnect');
      setTimeout(() => testEnv.server.emit('connect'), 200);
    });
    it('should emit all events with correct data', (done) => {
      const events: string[] = [];
      
      ['connected', 'disconnected', 'error', 'update', 'rate_limited'].forEach(event => {
        client.on(event, () => events.push(event));
      });

      client.on('rate_limited', () => {
        expect(events).toContain('connected');
        expect(events).toContain('rate_limited');
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('error', createMockError('Rate limit exceeded'));
    });

    it('should handle malformed server messages gracefully', (done) => {
      client.on('error', (error) => {
        expect(error.message).toContain('Invalid data');
        done();
      });

      client.connect();
      testEnv.server.emit('connect');
      testEnv.server.emit('analytics_update', 'invalid data');
    });
  });
});
