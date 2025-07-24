import subscriptionManager from '../services/subscriptionManagerService';
import eventBus from '../services/eventBusService';
import { EVENT_NAMES, SyncRefreshEvent } from '../types/events';
import { LocationData } from '../firebase/services';

// Mock the firebase services
jest.mock('../firebase/services', () => ({
  subscribeToUserLocation: jest.fn(),
  LocationData: {},
}));

// Mock the event bus service
jest.mock('../services/eventBusService', () => ({
  on: jest.fn(),
  emit: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
  removeAllListenersForAllEvents: jest.fn(),
  getListenerCount: jest.fn(),
  getActiveEvents: jest.fn(),
  getTotalSubscriptionCount: jest.fn(),
}));

import { subscribeToUserLocation } from '../firebase/services';

const mockSubscribeToUserLocation = subscribeToUserLocation as jest.MockedFunction<typeof subscribeToUserLocation>;
const mockEventBusOn = eventBus.on as jest.MockedFunction<typeof eventBus.on>;

describe('SubscriptionManagerService', () => {
  let mockUnsubscribe: jest.Mock;
  let mockCallback: jest.Mock;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock functions
    mockUnsubscribe = jest.fn();
    mockCallback = jest.fn();
    
    // Mock subscribeToUserLocation to return an unsubscribe function
    mockSubscribeToUserLocation.mockReturnValue(mockUnsubscribe);
    
    // Mock event bus on method
    mockEventBusOn.mockReturnValue({ unsubscribe: jest.fn() });
    
    // Clean up any existing state
    await subscriptionManager.cleanup();
  });

  afterEach(async () => {
    // Clean up after each test
    await subscriptionManager.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await subscriptionManager.initialize();
      
      const state = subscriptionManager.getSubscriptionState();
      expect(state.isInitialized).toBe(true);
      expect(state.totalSubscriptionCount).toBe(0);
      expect(state.refreshInProgress).toBe(false);
    });

    it('should not initialize twice', async () => {
      await subscriptionManager.initialize();
      await subscriptionManager.initialize();
      
      // Should only call eventBus.on once
      expect(mockEventBusOn).toHaveBeenCalledTimes(1);
    });

    it('should set up event listeners during initialization', async () => {
      await subscriptionManager.initialize();
      
      expect(mockEventBusOn).toHaveBeenCalledWith(
        EVENT_NAMES.SYNC_REFRESH_REQUIRED,
        expect.any(Function)
      );
    });
  });

  describe('Subscription Management', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should create a new subscription', () => {
      const userId = 'user123';
      const unsubscribe = subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      expect(mockSubscribeToUserLocation).toHaveBeenCalledWith(userId, expect.any(Function));
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      expect(subscriptionManager.hasSubscription(userId)).toBe(true);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should replace existing subscription for the same user', () => {
      const userId = 'user123';
      const firstCallback = jest.fn();
      const secondCallback = jest.fn();
      
      // Create first subscription
      subscriptionManager.subscribeToUserLocation(userId, firstCallback);
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      
      // Create second subscription for same user
      subscriptionManager.subscribeToUserLocation(userId, secondCallback);
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1); // First subscription should be unsubscribed
    });

    it('should handle multiple subscriptions for different users', () => {
      const user1 = 'user1';
      const user2 = 'user2';
      const user3 = 'user3';
      
      subscriptionManager.subscribeToUserLocation(user1, mockCallback);
      subscriptionManager.subscribeToUserLocation(user2, mockCallback);
      subscriptionManager.subscribeToUserLocation(user3, mockCallback);
      
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(3);
      expect(subscriptionManager.getActiveUserIds()).toEqual(
        expect.arrayContaining([user1, user2, user3])
      );
    });

    it('should remove subscription correctly', () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      
      subscriptionManager.removeSubscription(userId);
      
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(0);
      expect(subscriptionManager.hasSubscription(userId)).toBe(false);
    });

    it('should handle removing non-existent subscription gracefully', () => {
      const userId = 'nonexistent';
      
      // Should not throw error
      expect(() => {
        subscriptionManager.removeSubscription(userId);
      }).not.toThrow();
      
      expect(mockUnsubscribe).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function that removes subscription', () => {
      const userId = 'user123';
      const unsubscribe = subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      
      unsubscribe();
      
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(0);
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should throw error when subscribing without initialization', async () => {
      // Clean up to test uninitialized state
      await subscriptionManager.cleanup();
      
      expect(() => {
        subscriptionManager.subscribeToUserLocation('user123', mockCallback);
      }).toThrow('SubscriptionManager not initialized');
    });
  });

  describe('Subscription Information', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should provide subscription info', () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      const info = subscriptionManager.getSubscriptionInfo(userId);
      expect(info).toBeDefined();
      expect(info!.userId).toBe(userId);
      expect(info!.callback).toBe(mockCallback);
      expect(info!.createdAt).toBeInstanceOf(Date);
      expect(typeof info!.unsubscribe).toBe('function');
    });

    it('should return undefined for non-existent subscription info', () => {
      const info = subscriptionManager.getSubscriptionInfo('nonexistent');
      expect(info).toBeUndefined();
    });

    it('should update last update time when location callback is called', () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      // Get the callback that was passed to subscribeToUserLocation
      const firebaseCallback = mockSubscribeToUserLocation.mock.calls[0][1];
      
      const mockLocation: LocationData = {
        userId,
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: new Date(),
        circleMembers: [],
      };
      
      // Simulate location update
      firebaseCallback(mockLocation);
      
      const info = subscriptionManager.getSubscriptionInfo(userId);
      expect(info!.lastUpdate).toBeInstanceOf(Date);
      expect(mockCallback).toHaveBeenCalledWith(mockLocation);
    });
  });

  describe('Subscription Refresh', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should refresh all subscriptions', async () => {
      const user1 = 'user1';
      const user2 = 'user2';
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      subscriptionManager.subscribeToUserLocation(user1, callback1);
      subscriptionManager.subscribeToUserLocation(user2, callback2);
      
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(2);
      
      await subscriptionManager.refreshAllSubscriptions();
      
      // Should have called unsubscribe for old subscriptions
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
      
      // Should have created new subscriptions
      expect(mockSubscribeToUserLocation).toHaveBeenCalledTimes(4); // 2 initial + 2 refresh
      
      // Should maintain the same subscription count
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(2);
      
      const state = subscriptionManager.getSubscriptionState();
      expect(state.lastRefreshTime).toBeInstanceOf(Date);
    });

    it('should not refresh if refresh is already in progress', async () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      // Manually set the refresh in progress flag to simulate an ongoing refresh
      const state = (subscriptionManager as any).state;
      state.refreshInProgress = true;
      
      // Try to refresh while already in progress
      await subscriptionManager.refreshAllSubscriptions();
      
      // Should not have called unsubscribe since refresh was skipped
      expect(mockUnsubscribe).not.toHaveBeenCalled();
      
      // Reset the flag for cleanup
      state.refreshInProgress = false;
    });

    it('should refresh subscriptions for specific users', async () => {
      const user1 = 'user1';
      const user2 = 'user2';
      const user3 = 'user3';
      
      subscriptionManager.subscribeToUserLocation(user1, mockCallback);
      subscriptionManager.subscribeToUserLocation(user2, mockCallback);
      subscriptionManager.subscribeToUserLocation(user3, mockCallback);
      
      await subscriptionManager.refreshSubscriptionsForUsers([user1, user3]);
      
      // Should have refreshed only 2 subscriptions
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
      expect(mockSubscribeToUserLocation).toHaveBeenCalledTimes(5); // 3 initial + 2 refresh
    });

    it('should handle refresh errors gracefully', async () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      // Make subscribeToUserLocation throw an error during refresh
      mockSubscribeToUserLocation.mockImplementationOnce(() => {
        throw new Error('Firebase error');
      });
      
      await expect(subscriptionManager.refreshAllSubscriptions()).rejects.toThrow('Firebase error');
      
      const state = subscriptionManager.getSubscriptionState();
      expect(state.refreshInProgress).toBe(false);
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should handle sync refresh events', async () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      // Get the event handler that was registered
      const eventHandler = mockEventBusOn.mock.calls[0][1];
      
      const syncEvent: SyncRefreshEvent = {
        timestamp: new Date(),
        reason: 'connection_change',
        affectedUserIds: [userId],
      };
      
      // Simulate event emission
      await eventHandler(syncEvent);
      
      // Should have triggered a refresh
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should handle different sync refresh reasons', async () => {
      const userId = 'user123';
      subscriptionManager.subscribeToUserLocation(userId, mockCallback);
      
      const eventHandler = mockEventBusOn.mock.calls[0][1];
      
      const reasons: Array<SyncRefreshEvent['reason']> = [
        'connection_change',
        'cache_invalidation',
        'network_recovery',
        'manual'
      ];
      
      for (const reason of reasons) {
        const syncEvent: SyncRefreshEvent = {
          timestamp: new Date(),
          reason,
        };
        
        await eventHandler(syncEvent);
      }
      
      // Should have triggered refresh for each reason
      expect(mockUnsubscribe).toHaveBeenCalledTimes(reasons.length);
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should clean up all subscriptions and listeners', async () => {
      const user1 = 'user1';
      const user2 = 'user2';
      
      subscriptionManager.subscribeToUserLocation(user1, mockCallback);
      subscriptionManager.subscribeToUserLocation(user2, mockCallback);
      
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(2);
      
      await subscriptionManager.cleanup();
      
      // Should have unsubscribed from all subscriptions
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
      
      // Should reset state
      const state = subscriptionManager.getSubscriptionState();
      expect(state.isInitialized).toBe(false);
      expect(state.totalSubscriptionCount).toBe(0);
      expect(state.activeSubscriptions.size).toBe(0);
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should provide read-only state', () => {
      const state = subscriptionManager.getSubscriptionState();
      
      // Should be a copy, not the original
      expect(state.activeSubscriptions).not.toBe((subscriptionManager as any).state.activeSubscriptions);
      
      // Should contain correct initial state
      expect(state.isInitialized).toBe(true);
      expect(state.totalSubscriptionCount).toBe(0);
      expect(state.refreshInProgress).toBe(false);
    });

    it('should track subscription count correctly', () => {
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(0);
      
      subscriptionManager.subscribeToUserLocation('user1', mockCallback);
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      
      subscriptionManager.subscribeToUserLocation('user2', mockCallback);
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(2);
      
      subscriptionManager.removeSubscription('user1');
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
    });

    it('should provide active user IDs', () => {
      const user1 = 'user1';
      const user2 = 'user2';
      
      subscriptionManager.subscribeToUserLocation(user1, mockCallback);
      subscriptionManager.subscribeToUserLocation(user2, mockCallback);
      
      const activeUserIds = subscriptionManager.getActiveUserIds();
      expect(activeUserIds).toHaveLength(2);
      expect(activeUserIds).toContain(user1);
      expect(activeUserIds).toContain(user2);
    });
  });

  describe('Add Subscription Method', () => {
    beforeEach(async () => {
      await subscriptionManager.initialize();
    });

    it('should add subscription using addSubscription method', () => {
      const userId = 'user123';
      
      subscriptionManager.addSubscription(userId, mockCallback);
      
      expect(subscriptionManager.hasSubscription(userId)).toBe(true);
      expect(subscriptionManager.getActiveSubscriptionCount()).toBe(1);
      expect(mockSubscribeToUserLocation).toHaveBeenCalledWith(userId, expect.any(Function));
    });
  });
});