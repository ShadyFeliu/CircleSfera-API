import { AnalyticsClient } from '../AnalyticsClient';

describe('AnalyticsClient', () => {
  let client: AnalyticsClient;

  beforeEach(() => {
    client = new AnalyticsClient({ 
      url: 'http://localhost:3001', 
      apiKey: 'test-key' 
    });
  });

  afterEach(() => {
    client.disconnect();
  });

  describe('Basic Functionality', () => {
    it('should create client instance', () => {
      expect(client).toBeInstanceOf(AnalyticsClient);
    });

    it('should have correct initial state', () => {
      expect(client.isConnected).toBe(false);
    });

    it('should handle disconnect when not connected', () => {
      expect(() => client.disconnect()).not.toThrow();
    });

    it('should throw error when subscribing while not connected', () => {
      expect(() => {
        client.subscribe({
          timeframe: '1h',
          interval: 5000
        });
      }).toThrow('Client not connected');
    });
  });

  describe('Event Handling', () => {
    it('should handle event listeners', () => {
      const handler = jest.fn();
      client.on('connected', handler);
      client.off('connected', handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle error events', () => {
      const errorHandler = jest.fn();
      client.on('error', errorHandler);
      
      // Simulate an error
      client.emit('error', new Error('Test error'));
      
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Configuration', () => {
    it('should accept valid configuration', () => {
      const config = {
        url: 'http://localhost:3001',
        apiKey: 'test-key',
        connectionTimeout: 5000,
        autoReconnect: true,
        maxReconnectAttempts: 3
      };
      
      const testClient = new AnalyticsClient(config);
      expect(testClient).toBeInstanceOf(AnalyticsClient);
      testClient.disconnect();
    });
  });
});
