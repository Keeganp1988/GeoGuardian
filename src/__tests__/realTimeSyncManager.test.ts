import realTimeSyncManager from '../services/realTimeSyncManager';
import eventBus from '../services/eventBusService';
import subscriptionManager from '../services/subscriptionManagerService';
import * as cacheService from '../services/cacheService';
import { 
  EVENT_NAMES, 
  ConnectionChangeEvent, 
  SyncRefreshEvent, 
  NetworkChangeEvent,
  AppStateChangeEvent 
} from '../types/events';

// Mock React Native dependencies
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  getAllKeys: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

// Mock Firebase dependencies
jest.mock('../firebase/firebase', () => ({
  app: {},
  auth: {},
  db: {},
}));

jest.mock('../firebase/services', () => ({
  subscribeToUserLocation: jest.fn(),
  LocationData: {},
}));

// Mock utils
jest.mock('../utils/errorHandling', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
  ErrorCategory: {
    UNKNOWN: 'unknown',
  },
}));

jest.mock('../utils/validation', () => ({
  Validator: {
    validateOrThrow: jest.fn(),
  },
  validationRules: {
    required: jest.fn(),
    string: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('../services/eventBusService');
jest.mock('../services/subscriptionManagerService');
jest.mock('../services/cacheService');

const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;
const mockSubscriptionManager = subscriptionManager as jest.Mocked<typeof subscriptionManager>;
const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('RealTimeSyncManager', () => {
  const testUserId = 'test-user-123';
  const testConnectionId = 'connection-456';

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Reset sync manager state
    await realTimeSyncManager.cleanup();
    
    // Reset retry configuration to defaults
    realTimeSyncManager.updateRetryConfig({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
    });
    
    // Setup default mock implementations
    mockSubscriptionManager.initialize.mockResolvedValue();
    mockSubscriptionManager.refreshAllSubscriptions.mockResolvedValue();
    mockSubscriptionManager.getActiveUserIds.mockReturnValue(['user1', 'user2']);
    mockSubscriptionManager.cleanup.mockResolvedValue();
    
    mockEventBus.on.mockReturnValue({ unsubscribe: jest.fn() });
    mockEventBus.emit.mockImplementation(() => {});
    
    mockCacheService.batchInvalidateWithRefresh.mockResolvedValue();
  });

  afterEach(async () => {
    await realTimeSyncManager.cleanup();
  });

  describe('initializeSync', () => {
    it('should initialize sync for a user successfully', async () => {
      await realTimeSyncManager.initializeSync(testUserId);

      expect(mockSubscriptionManager.initialize).toHaveBeenCalled();
      expect(mockEventBus.on).toHaveBeenCalledTimes(5); // 5 event listeners
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.isInitialized).toBe(true);
      expect(state.errorCount).toBe(0);
      expect(state.lastSyncTime).toBeInstanceOf(Date);
    });

    it('should not reinitialize if already initialized for the same user', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      jest.clearAllMocks();

      await realTimeSyncManager.initializeSync(testUserId);

      expect(mockSubscriptionManager.initialize).not.toHaveBeenCalled();
    });

    it('should cleanup and reinitialize when switching users', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      jest.clearAllMocks();

      await realTimeSyncManager.initializeSync('different-user');

      expect(mockSubscriptionManager.cleanup).toHaveBeenCalled();
      expect(mockSubscriptionManager.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Initialization failed');
      mockSubscriptionManager.initialize.mockRejectedValue(error);

      await expect(realTimeSyncManager.initializeSync(testUserId)).rejects.toThrow('Initialization failed');
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.errorCount).toBe(1);
    });
  });

  describe('refreshSubscriptions', () => {
    beforeEach(async () => {
      await realTimeSyncManager.initializeSync(testUserId);
    });

    it('should refresh subscriptions successfully', async () => {
      await realTimeSyncManager.refreshSubscriptions();

      expect(mockSubscriptionManager.refreshAllSubscriptions).toHaveBeenCalled();
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.activeSubscriptions).toEqual(['user1', 'user2']);
      expect(state.lastSyncTime).toBeInstanceOf(Date);
      expect(state.errorCount).toBe(0);
      expect(state.pendingRefresh).toBe(false);
    });

    it('should skip refresh if already in progress', async () => {
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });

      mockSubscriptionManager.refreshAllSubscriptions.mockImplementationOnce(() => firstPromise);

      const promise1 = realTimeSyncManager.refreshSubscriptions();
      const promise2 = realTimeSyncManager.refreshSubscriptions();

      // Resolve the first promise
      resolveFirst!();
      
      await Promise.all([promise1, promise2]);

      expect(mockSubscriptionManager.refreshAllSubscriptions).toHaveBeenCalledTimes(1);
    });

    it('should force refresh even if already in progress', async () => {
      let resolveFirst: () => void;
      let resolveSecond: () => void;
      
      const firstPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });
      
      const secondPromise = new Promise<void>(resolve => {
        resolveSecond = resolve;
      });

      mockSubscriptionManager.refreshAllSubscriptions
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => secondPromise);

      const promise1 = realTimeSyncManager.refreshSubscriptions();
      const promise2 = realTimeSyncManager.refreshSubscriptions({ forceRefresh: true });

      // Resolve both promises
      resolveFirst!();
      resolveSecond!();
      
      await Promise.all([promise1, promise2]);

      expect(mockSubscriptionManager.refreshAllSubscriptions).toHaveBeenCalledTimes(2);
    });

    it('should handle refresh errors and increment error count', async () => {
      const error = new Error('Refresh failed');
      mockSubscriptionManager.refreshAllSubscriptions.mockRejectedValue(error);

      await expect(realTimeSyncManager.refreshSubscriptions({ retryOnFailure: false })).rejects.toThrow('Refresh failed');
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.errorCount).toBe(1);
      expect(state.pendingRefresh).toBe(false);
    });

    it('should throw error if not initialized', async () => {
      await realTimeSyncManager.cleanup();

      await expect(realTimeSyncManager.refreshSubscriptions()).rejects.toThrow('RealTimeSyncManager not initialized');
    });
  });

  describe('onConnectionChange', () => {
    beforeEach(async () => {
      await realTimeSyncManager.initializeSync(testUserId);
    });

    it('should handle connection added', async () => {
      await realTimeSyncManager.onConnectionChange(testConnectionId, 'added');

      expect(mockCacheService.batchInvalidateWithRefresh).toHaveBeenCalledWith(
        [
          `connections_${testUserId}`,
          `privateConnections_${testUserId}`,
          `contacts_${testUserId}`,
        ],
        expect.any(Function)
      );
    });

    it('should handle connection removed', async () => {
      await realTimeSyncManager.onConnectionChange(testConnectionId, 'removed');

      expect(mockCacheService.batchInvalidateWithRefresh).toHaveBeenCalled();
    });

    it('should handle connection updated', async () => {
      await realTimeSyncManager.onConnectionChange(testConnectionId, 'updated');

      expect(mockCacheService.batchInvalidateWithRefresh).toHaveBeenCalled();
    });

    it('should emit sync refresh event during cache invalidation', async () => {
      // Capture the refresh callback
      let refreshCallback: (() => Promise<void>) | undefined;
      mockCacheService.batchInvalidateWithRefresh.mockImplementation(async (keys, callback) => {
        refreshCallback = callback;
      });

      await realTimeSyncManager.onConnectionChange(testConnectionId, 'added');

      // Execute the callback
      if (refreshCallback) {
        await refreshCallback();
      }

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.SYNC_REFRESH_REQUIRED,
        expect.objectContaining({
          reason: 'connection_change',
          source: 'RealTimeSyncManager',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should ignore connection changes if not initialized', async () => {
      await realTimeSyncManager.cleanup();

      await realTimeSyncManager.onConnectionChange(testConnectionId, 'added');

      expect(mockCacheService.batchInvalidateWithRefresh).not.toHaveBeenCalled();
    });

    it('should handle connection change errors gracefully', async () => {
      const error = new Error('Cache invalidation failed');
      mockCacheService.batchInvalidateWithRefresh.mockRejectedValue(error);

      // Should not throw
      await realTimeSyncManager.onConnectionChange(testConnectionId, 'added');
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.errorCount).toBe(1);
    });
  });

  describe('forceSync', () => {
    beforeEach(async () => {
      await realTimeSyncManager.initializeSync(testUserId);
    });

    it('should perform force sync successfully', async () => {
      await realTimeSyncManager.forceSync();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.SYNC_REFRESH_REQUIRED,
        expect.objectContaining({
          reason: 'manual',
          source: 'RealTimeSyncManager',
          timestamp: expect.any(Date),
        })
      );

      expect(mockSubscriptionManager.refreshAllSubscriptions).toHaveBeenCalled();
    });

    it('should throw error if not initialized', async () => {
      await realTimeSyncManager.cleanup();

      await expect(realTimeSyncManager.forceSync()).rejects.toThrow('RealTimeSyncManager not initialized');
    });

    it('should handle force sync errors', async () => {
      const error = new Error('Force sync failed');
      mockSubscriptionManager.refreshAllSubscriptions.mockRejectedValue(error);

      // Set maxRetries to 0 to disable retries
      realTimeSyncManager.updateRetryConfig({ maxRetries: 0 });

      await expect(realTimeSyncManager.forceSync()).rejects.toThrow('Force sync failed');
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.errorCount).toBeGreaterThan(0);
    });
  });

  describe('event handling', () => {
    beforeEach(async () => {
      await realTimeSyncManager.initializeSync(testUserId);
    });

    it('should handle connection added events', async () => {
      // Get the connection added event handler
      const connectionAddedHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === EVENT_NAMES.CONNECTION_ADDED
      )?.[1];

      expect(connectionAddedHandler).toBeDefined();

      const event: ConnectionChangeEvent = {
        connectionId: testConnectionId,
        changeType: 'added',
        userId: testUserId,
        otherUserId: 'other-user',
        timestamp: new Date(),
      };

      // Execute the handler
      if (connectionAddedHandler) {
        await connectionAddedHandler(event);
      }

      expect(mockCacheService.batchInvalidateWithRefresh).toHaveBeenCalled();
    });

    it('should handle network change events', async () => {
      // Get the network change event handler
      const networkChangeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === EVENT_NAMES.NETWORK_CHANGED
      )?.[1];

      expect(networkChangeHandler).toBeDefined();

      const event: NetworkChangeEvent = {
        isConnected: true,
        connectionType: 'wifi',
        timestamp: new Date(),
      };

      // Execute the handler
      if (networkChangeHandler) {
        await networkChangeHandler(event);
      }

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.SYNC_REFRESH_REQUIRED,
        expect.objectContaining({
          reason: 'network_recovery',
        })
      );

      expect(mockSubscriptionManager.refreshAllSubscriptions).toHaveBeenCalled();
    });

    it('should handle app state change events', async () => {
      // Get the app state change event handler
      const appStateChangeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === EVENT_NAMES.APP_STATE_CHANGED
      )?.[1];

      expect(appStateChangeHandler).toBeDefined();

      const event: AppStateChangeEvent = {
        state: 'active',
        timestamp: new Date(),
      };

      // Execute the handler
      if (appStateChangeHandler) {
        await appStateChangeHandler(event);
      }

      expect(mockSubscriptionManager.refreshAllSubscriptions).toHaveBeenCalled();
    });

    it('should not refresh on app state change if not connected', async () => {
      // First simulate network disconnection
      const networkChangeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === EVENT_NAMES.NETWORK_CHANGED
      )?.[1];

      if (networkChangeHandler) {
        await networkChangeHandler({
          isConnected: false,
          timestamp: new Date(),
        });
      }

      jest.clearAllMocks();

      // Then simulate app becoming active
      const appStateChangeHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === EVENT_NAMES.APP_STATE_CHANGED
      )?.[1];

      if (appStateChangeHandler) {
        await appStateChangeHandler({
          state: 'active',
          timestamp: new Date(),
        });
      }

      expect(mockSubscriptionManager.refreshAllSubscriptions).not.toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should return current sync state', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      
      const state = realTimeSyncManager.getSyncState();
      
      expect(state).toEqual({
        isInitialized: true,
        lastSyncTime: expect.any(Date),
        activeSubscriptions: ['user1', 'user2'],
        pendingRefresh: false,
        errorCount: 0,
        isConnected: true,
        appState: 'active',
      });
    });

    it('should check sync health correctly', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      
      expect(realTimeSyncManager.isSyncHealthy()).toBe(true);
    });

    it('should report unhealthy sync with high error count', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      
      // Simulate multiple errors
      mockSubscriptionManager.refreshAllSubscriptions.mockRejectedValue(new Error('Test error'));
      
      try {
        await realTimeSyncManager.refreshSubscriptions({ retryOnFailure: false });
      } catch {}
      try {
        await realTimeSyncManager.refreshSubscriptions({ retryOnFailure: false });
      } catch {}
      try {
        await realTimeSyncManager.refreshSubscriptions({ retryOnFailure: false });
      } catch {}
      
      expect(realTimeSyncManager.isSyncHealthy()).toBe(false);
    });

    it('should reset error count', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      
      // Simulate error
      mockSubscriptionManager.refreshAllSubscriptions.mockRejectedValue(new Error('Test error'));
      try {
        await realTimeSyncManager.refreshSubscriptions({ retryOnFailure: false });
      } catch {}
      
      expect(realTimeSyncManager.getSyncState().errorCount).toBe(1);
      
      realTimeSyncManager.resetErrorCount();
      
      expect(realTimeSyncManager.getSyncState().errorCount).toBe(0);
    });
  });

  describe('retry configuration', () => {
    it('should update retry configuration', () => {
      const newConfig = {
        maxRetries: 5,
        baseDelay: 2000,
      };

      realTimeSyncManager.updateRetryConfig(newConfig);
      
      const config = realTimeSyncManager.getRetryConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelay).toBe(2000);
      expect(config.backoffMultiplier).toBe(2); // Should keep existing values
    });

    it('should return current retry configuration', () => {
      const config = realTimeSyncManager.getRetryConfig();
      
      expect(config).toEqual({
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      
      // Mock unsubscribe functions
      const unsubscribeMocks = Array(5).fill(0).map(() => jest.fn());
      mockEventBus.on.mockImplementation(() => ({ 
        unsubscribe: unsubscribeMocks[mockEventBus.on.mock.calls.length - 1] 
      }));
      
      // Re-initialize to get the mocked unsubscribe functions
      await realTimeSyncManager.cleanup();
      await realTimeSyncManager.initializeSync(testUserId);
      
      await realTimeSyncManager.cleanup();

      expect(mockSubscriptionManager.cleanup).toHaveBeenCalled();
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.isInitialized).toBe(false);
      expect(state.activeSubscriptions).toEqual([]);
      expect(state.pendingRefresh).toBe(false);
      expect(state.errorCount).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      await realTimeSyncManager.initializeSync(testUserId);
      
      const error = new Error('Cleanup failed');
      mockSubscriptionManager.cleanup.mockRejectedValue(error);

      // Should not throw
      await realTimeSyncManager.cleanup();
      
      const state = realTimeSyncManager.getSyncState();
      expect(state.isInitialized).toBe(false);
    });
  });
});