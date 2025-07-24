import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import backgroundSyncRecoveryService from '../services/backgroundSyncRecoveryService';
import eventBus from '../services/eventBusService';
import realTimeSyncManager from '../services/realTimeSyncManager';
import { EVENT_NAMES, NetworkChangeEvent, AppStateChangeEvent } from '../types/events';

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

// Mock dependencies
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));

jest.mock('../services/eventBusService');
jest.mock('../services/realTimeSyncManager');
jest.mock('../services/cacheService', () => ({
  invalidateWithRefresh: jest.fn(),
  batchInvalidateWithRefresh: jest.fn(),
}));

const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;
const mockRealTimeSyncManager = realTimeSyncManager as jest.Mocked<typeof realTimeSyncManager>;
const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;
const mockAppState = AppState as jest.Mocked<typeof AppState>;

describe('BackgroundSyncRecoveryService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Reset service state
    await backgroundSyncRecoveryService.cleanup();
    backgroundSyncRecoveryService.clearQueue();

    // Setup default mocks
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      type: 'wifi',
    } as any);

    mockNetInfo.addEventListener.mockReturnValue(() => {});
    mockAppState.currentState = 'active';
    mockEventBus.emit.mockImplementation(() => {});
    mockRealTimeSyncManager.forceSync.mockResolvedValue();
    mockRealTimeSyncManager.refreshSubscriptions.mockResolvedValue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await backgroundSyncRecoveryService.initialize();

      const state = backgroundSyncRecoveryService.getState();
      expect(state.isListening).toBe(true);
      expect(state.currentAppState).toBe('active');
      expect(state.isNetworkConnected).toBe(true);
      expect(state.networkType).toBe('wifi');
    });

    it('should not initialize twice', async () => {
      await backgroundSyncRecoveryService.initialize();
      
      // Clear the mock to test the second call
      mockNetInfo.fetch.mockClear();
      
      await backgroundSyncRecoveryService.initialize();

      // Should not call NetInfo.fetch again
      expect(mockNetInfo.fetch).not.toHaveBeenCalled();
    });

    it('should set up app state listener', async () => {
      await backgroundSyncRecoveryService.initialize();

      expect(mockAppState.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should set up network listener', async () => {
      await backgroundSyncRecoveryService.initialize();

      expect(mockNetInfo.addEventListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      await backgroundSyncRecoveryService.initialize();
    });

    it('should add items to queue', () => {
      const queueId = backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      expect(queueId).toBeDefined();
      expect(typeof queueId).toBe('string');

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(1);
      expect(state.pendingOperations).toContain('sync');
    });

    it('should limit queue size', () => {
      // Add more items than the max queue size (50)
      for (let i = 0; i < 55; i++) {
        backgroundSyncRecoveryService.addToQueue('sync', { reason: `test_${i}` });
      }

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(50); // Should be limited to max size
    });

    it('should clear queue', () => {
      backgroundSyncRecoveryService.addToQueue('sync');
      backgroundSyncRecoveryService.addToQueue('subscription_refresh');

      let state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(2);

      backgroundSyncRecoveryService.clearQueue();

      state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(0);
      expect(state.pendingOperations).toHaveLength(0);
    });
  });

  describe('app state changes', () => {
    let appStateChangeHandler: (nextAppState: string) => void;

    beforeEach(async () => {
      await backgroundSyncRecoveryService.initialize();

      // Get the app state change handler
      const addEventListenerCall = mockAppState.addEventListener.mock.calls.find(
        call => call[0] === 'change'
      );
      appStateChangeHandler = addEventListenerCall?.[1] as any;
    });

    it('should handle app becoming active', async () => {
      // Simulate app becoming active
      appStateChangeHandler('active');

      // Should emit app state change event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.APP_STATE_CHANGED,
        expect.objectContaining({
          state: 'active',
          source: 'BackgroundSyncRecoveryService',
        })
      );

      // Should add sync operations to queue
      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBeGreaterThan(0);
      expect(state.pendingOperations).toContain('sync');
      expect(state.pendingOperations).toContain('subscription_refresh');
    });

    it('should handle app going to background', () => {
      appStateChangeHandler('background');

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.APP_STATE_CHANGED,
        expect.objectContaining({
          state: 'background',
          source: 'BackgroundSyncRecoveryService',
        })
      );

      const state = backgroundSyncRecoveryService.getState();
      expect(state.currentAppState).toBe('background');
    });
  });

  describe('network changes', () => {
    let networkChangeHandler: (state: any) => void;

    beforeEach(async () => {
      await backgroundSyncRecoveryService.initialize();

      // Get the network change handler
      networkChangeHandler = mockNetInfo.addEventListener.mock.calls[0][0];
    });

    it('should handle network recovery', async () => {
      // First simulate network loss
      networkChangeHandler({
        isConnected: false,
        type: 'none',
      });

      // Then simulate network recovery
      networkChangeHandler({
        isConnected: true,
        type: 'wifi',
      });

      // Should emit network change event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.NETWORK_CHANGED,
        expect.objectContaining({
          isConnected: true,
          connectionType: 'wifi',
          source: 'BackgroundSyncRecoveryService',
        })
      );

      // Should add sync operations to queue
      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBeGreaterThan(0);
      expect(state.pendingOperations).toContain('sync');
      expect(state.pendingOperations).toContain('subscription_refresh');
    });

    it('should handle network loss', () => {
      networkChangeHandler({
        isConnected: false,
        type: 'none',
      });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.NETWORK_CHANGED,
        expect.objectContaining({
          isConnected: false,
          connectionType: 'none',
          source: 'BackgroundSyncRecoveryService',
        })
      );

      const state = backgroundSyncRecoveryService.getState();
      expect(state.isNetworkConnected).toBe(false);
      expect(state.networkType).toBe('none');
    });
  });

  describe('queue processing', () => {
    beforeEach(async () => {
      await backgroundSyncRecoveryService.initialize();
    });

    it('should process sync operations', async () => {
      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      await backgroundSyncRecoveryService.forceProcessQueue();

      expect(mockRealTimeSyncManager.forceSync).toHaveBeenCalled();

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(0); // Queue should be empty after processing
    });

    it('should process subscription refresh operations', async () => {
      backgroundSyncRecoveryService.addToQueue('subscription_refresh', { reason: 'test' });

      await backgroundSyncRecoveryService.forceProcessQueue();

      expect(mockRealTimeSyncManager.refreshSubscriptions).toHaveBeenCalledWith({
        forceRefresh: true,
      });

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(0);
    });

    it('should process connection sync operations', async () => {
      backgroundSyncRecoveryService.addToQueue('connection_sync', { reason: 'test' });

      await backgroundSyncRecoveryService.forceProcessQueue();

      expect(mockRealTimeSyncManager.forceSync).toHaveBeenCalled();

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(0);
    });

    it('should retry failed operations', async () => {
      // Make the first call fail, second call succeed
      mockRealTimeSyncManager.forceSync
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce();

      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' }, 2);

      await backgroundSyncRecoveryService.forceProcessQueue();

      // Should have been called twice (initial + 1 retry)
      expect(mockRealTimeSyncManager.forceSync).toHaveBeenCalledTimes(2);

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(0); // Should be empty after successful retry
    });

    it('should discard operations after max retries', async () => {
      // Make all calls fail
      mockRealTimeSyncManager.forceSync.mockRejectedValue(new Error('Network error'));

      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' }, 2);

      await backgroundSyncRecoveryService.forceProcessQueue();

      // Should have been called 2 times (initial + 1 retry, then discarded)
      expect(mockRealTimeSyncManager.forceSync).toHaveBeenCalledTimes(2);

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(0); // Should be empty after max retries exceeded
    });

    it('should not process queue when network is disconnected', async () => {
      // Simulate network disconnection
      const networkChangeHandler = mockNetInfo.addEventListener.mock.calls[0][0];
      networkChangeHandler({
        isConnected: false,
        type: 'none',
      });

      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      await backgroundSyncRecoveryService.forceProcessQueue();

      expect(mockRealTimeSyncManager.forceSync).not.toHaveBeenCalled();

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(1); // Queue should still have the item
    });

    it('should not process queue when app is in background', async () => {
      // Simulate app going to background
      const appStateChangeHandler = mockAppState.addEventListener.mock.calls.find(
        call => call[0] === 'change'
      )?.[1] as any;
      appStateChangeHandler('background');

      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      await backgroundSyncRecoveryService.forceProcessQueue();

      expect(mockRealTimeSyncManager.forceSync).not.toHaveBeenCalled();

      const state = backgroundSyncRecoveryService.getState();
      expect(state.queueSize).toBe(1); // Queue should still have the item
    });
  });

  describe('periodic queue processing', () => {
    beforeEach(async () => {
      await backgroundSyncRecoveryService.initialize();
    });

    it('should process queue periodically', async () => {
      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      // Fast-forward time by 30 seconds (the processing interval)
      jest.advanceTimersByTime(30000);

      expect(mockRealTimeSyncManager.forceSync).toHaveBeenCalled();
    });

    it('should not process queue periodically when network is disconnected', async () => {
      // Simulate network disconnection
      const networkChangeHandler = mockNetInfo.addEventListener.mock.calls[0][0];
      networkChangeHandler({
        isConnected: false,
        type: 'none',
      });

      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      // Fast-forward time by 30 seconds
      jest.advanceTimersByTime(30000);

      expect(mockRealTimeSyncManager.forceSync).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup properly', async () => {
      await backgroundSyncRecoveryService.initialize();

      backgroundSyncRecoveryService.addToQueue('sync');
      backgroundSyncRecoveryService.addToQueue('subscription_refresh');

      await backgroundSyncRecoveryService.cleanup();

      const state = backgroundSyncRecoveryService.getState();
      expect(state.isListening).toBe(false);
      expect(state.queueSize).toBe(0);
      expect(state.pendingOperations).toHaveLength(0);

      expect(mockAppState.removeEventListener).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await backgroundSyncRecoveryService.initialize();
    });

    it('should handle initialization errors gracefully', async () => {
      mockNetInfo.fetch.mockRejectedValueOnce(new Error('Network fetch failed'));

      await expect(backgroundSyncRecoveryService.initialize()).rejects.toThrow('Network fetch failed');
    });

    it('should handle queue processing errors gracefully', async () => {
      mockRealTimeSyncManager.forceSync.mockRejectedValue(new Error('Sync failed'));

      backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });

      // Should not throw, but handle error internally
      await expect(backgroundSyncRecoveryService.forceProcessQueue()).resolves.not.toThrow();
    });
  });
});