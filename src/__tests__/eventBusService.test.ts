import eventBus from '../services/eventBusService';
import { EVENT_NAMES, ConnectionChangeEvent, SyncRefreshEvent } from '../types/events';

describe('EventBusService', () => {
  beforeEach(() => {
    // Clean up all listeners before each test
    eventBus.removeAllListenersForAllEvents();
  });

  afterEach(() => {
    // Clean up all listeners after each test
    eventBus.removeAllListenersForAllEvents();
  });

  describe('Event Emission and Subscription', () => {
    it('should emit and receive events correctly', () => {
      const mockCallback = jest.fn();
      const testData = { test: 'data' };

      // Subscribe to event
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, mockCallback);

      // Emit event
      eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, testData);

      // Verify callback was called with correct data
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(testData);
    });

    it('should handle multiple listeners for the same event', () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();
      const testData = { test: 'data' };

      // Subscribe multiple listeners
      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback1);
      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback2);

      // Emit event
      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, testData);

      // Verify both callbacks were called
      expect(mockCallback1).toHaveBeenCalledTimes(1);
      expect(mockCallback2).toHaveBeenCalledTimes(1);
      expect(mockCallback1).toHaveBeenCalledWith(testData);
      expect(mockCallback2).toHaveBeenCalledWith(testData);
    });

    it('should handle events with no listeners gracefully', () => {
      // Should not throw error when emitting to event with no listeners
      expect(() => {
        eventBus.emit(EVENT_NAMES.NETWORK_CHANGED, { isConnected: true });
      }).not.toThrow();
    });

    it('should handle events with no data payload', () => {
      const mockCallback = jest.fn();

      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, mockCallback);
      eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED);

      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Subscription Management', () => {
    it('should return subscription object with unsubscribe method', () => {
      const mockCallback = jest.fn();
      
      const subscription = eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback);
      
      expect(subscription).toHaveProperty('unsubscribe');
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('should unsubscribe correctly using subscription object', () => {
      const mockCallback = jest.fn();
      const testData = { test: 'data' };

      const subscription = eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback);
      
      // Emit event - should be received
      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, testData);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      subscription.unsubscribe();

      // Emit event again - should not be received
      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, testData);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should unsubscribe correctly using off method', () => {
      const mockCallback = jest.fn();
      const testData = { test: 'data' };

      eventBus.on(EVENT_NAMES.CONNECTION_REMOVED, mockCallback);
      
      // Emit event - should be received
      eventBus.emit(EVENT_NAMES.CONNECTION_REMOVED, testData);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Unsubscribe using off method
      eventBus.off(EVENT_NAMES.CONNECTION_REMOVED, mockCallback);

      // Emit event again - should not be received
      eventBus.emit(EVENT_NAMES.CONNECTION_REMOVED, testData);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should handle multiple subscriptions and unsubscriptions', () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();
      const testData = { test: 'data' };

      const subscription1 = eventBus.on(EVENT_NAMES.CACHE_INVALIDATED, mockCallback1);
      const subscription2 = eventBus.on(EVENT_NAMES.CACHE_INVALIDATED, mockCallback2);

      // Both should receive the event
      eventBus.emit(EVENT_NAMES.CACHE_INVALIDATED, testData);
      expect(mockCallback1).toHaveBeenCalledTimes(1);
      expect(mockCallback2).toHaveBeenCalledTimes(1);

      // Unsubscribe first callback
      subscription1.unsubscribe();

      // Only second callback should receive the event
      eventBus.emit(EVENT_NAMES.CACHE_INVALIDATED, testData);
      expect(mockCallback1).toHaveBeenCalledTimes(1); // Still 1
      expect(mockCallback2).toHaveBeenCalledTimes(2); // Now 2

      // Unsubscribe second callback
      subscription2.unsubscribe();

      // No callbacks should receive the event
      eventBus.emit(EVENT_NAMES.CACHE_INVALIDATED, testData);
      expect(mockCallback1).toHaveBeenCalledTimes(1); // Still 1
      expect(mockCallback2).toHaveBeenCalledTimes(2); // Still 2
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in event listeners gracefully', () => {
      const mockCallback1 = jest.fn(() => {
        throw new Error('Test error');
      });
      const mockCallback2 = jest.fn();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      eventBus.on(EVENT_NAMES.CONNECTION_UPDATED, mockCallback1);
      eventBus.on(EVENT_NAMES.CONNECTION_UPDATED, mockCallback2);

      // Should not throw error even if one callback throws
      expect(() => {
        eventBus.emit(EVENT_NAMES.CONNECTION_UPDATED, { test: 'data' });
      }).not.toThrow();

      // Both callbacks should have been called
      expect(mockCallback1).toHaveBeenCalledTimes(1);
      expect(mockCallback2).toHaveBeenCalledTimes(1);

      // Error should have been logged
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Utility Methods', () => {
    it('should return correct listener count', () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();

      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBe(0);

      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback1);
      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBe(1);

      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback2);
      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBe(2);
    });

    it('should return active events correctly', () => {
      const mockCallback = jest.fn();

      expect(eventBus.getActiveEvents()).toEqual([]);

      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback);
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, mockCallback);

      const activeEvents = eventBus.getActiveEvents();
      expect(activeEvents).toContain(EVENT_NAMES.CONNECTION_ADDED);
      expect(activeEvents).toContain(EVENT_NAMES.SYNC_REFRESH_REQUIRED);
      expect(activeEvents.length).toBe(2);
    });

    it('should return correct total subscription count', () => {
      const mockCallback = jest.fn();

      expect(eventBus.getTotalSubscriptionCount()).toBe(0);

      const sub1 = eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback);
      expect(eventBus.getTotalSubscriptionCount()).toBe(1);

      const sub2 = eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, mockCallback);
      expect(eventBus.getTotalSubscriptionCount()).toBe(2);

      sub1.unsubscribe();
      expect(eventBus.getTotalSubscriptionCount()).toBe(1);

      sub2.unsubscribe();
      expect(eventBus.getTotalSubscriptionCount()).toBe(0);
    });

    it('should remove all listeners for specific event', () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();

      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback1);
      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback2);
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, mockCallback1);

      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBe(2);
      expect(eventBus.getListenerCount(EVENT_NAMES.SYNC_REFRESH_REQUIRED)).toBe(1);

      eventBus.removeAllListeners(EVENT_NAMES.CONNECTION_ADDED);

      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBe(0);
      expect(eventBus.getListenerCount(EVENT_NAMES.SYNC_REFRESH_REQUIRED)).toBe(1);
    });

    it('should remove all listeners for all events', () => {
      const mockCallback = jest.fn();

      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback);
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, mockCallback);
      eventBus.on(EVENT_NAMES.CACHE_INVALIDATED, mockCallback);

      expect(eventBus.getTotalSubscriptionCount()).toBe(3);

      eventBus.removeAllListenersForAllEvents();

      expect(eventBus.getTotalSubscriptionCount()).toBe(0);
      expect(eventBus.getActiveEvents()).toEqual([]);
    });
  });

  describe('Type Safety', () => {
    it('should work with typed event payloads', () => {
      const mockCallback = jest.fn();
      
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: 'test-id',
        changeType: 'added',
        userId: 'user1',
        otherUserId: 'user2',
        timestamp: new Date(),
      };

      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, mockCallback);
      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);

      expect(mockCallback).toHaveBeenCalledWith(connectionEvent);
    });

    it('should work with different event types', () => {
      const connectionCallback = jest.fn();
      const syncCallback = jest.fn();

      const connectionEvent: ConnectionChangeEvent = {
        connectionId: 'test-id',
        changeType: 'updated',
        userId: 'user1',
        otherUserId: 'user2',
        timestamp: new Date(),
      };

      const syncEvent: SyncRefreshEvent = {
        reason: 'connection_change',
        affectedUserIds: ['user1', 'user2'],
        timestamp: new Date(),
      };

      eventBus.on(EVENT_NAMES.CONNECTION_UPDATED, connectionCallback);
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, syncCallback);

      eventBus.emit(EVENT_NAMES.CONNECTION_UPDATED, connectionEvent);
      eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, syncEvent);

      expect(connectionCallback).toHaveBeenCalledWith(connectionEvent);
      expect(syncCallback).toHaveBeenCalledWith(syncEvent);
    });
  });
});