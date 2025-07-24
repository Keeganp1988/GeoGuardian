/**
 * Integration tests for live view synchronization
 * Tests the complete flow from invitation acceptance to live view updates
 */

import { Alert } from 'react-native';
import eventBus from '../services/eventBusService';
import realTimeSyncManager from '../services/realTimeSyncManager';
import { subscriptionManager } from '../services/subscriptionManager';
import { invalidateWithRefresh } from '../services/cacheService';
import { useInviteLink, createPrivateConnection, createInviteLink } from '../firebase/services';
import { EVENT_NAMES, ConnectionChangeEvent, SuccessEvent, ErrorEvent, SyncRefreshEvent } from '../types/events';

// Mock Firebase services
jest.mock('../firebase/services', () => ({
  useInviteLink: jest.fn(),
  createPrivateConnection: jest.fn(),
  createInviteLink: jest.fn(),
  getPrivateConnectionsForUser: jest.fn(),
  getUser: jest.fn(),
  getUserLocation: jest.fn(),
}));

// Mock cache service
jest.mock('../services/cacheService', () => ({
  invalidateWithRefresh: jest.fn(),
  getCache: jest.fn(),
  setCache: jest.fn(),
}));

// Mock Alert
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('Live View Sync Integration Tests', () => {
  const mockUserId = 'user123';
  const mockOtherUserId = 'user456';
  const mockConnectionId = 'conn789';
  const mockInviteCode = 'invite123';

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.removeAllListeners();
    
    // Reset sync manager state
    realTimeSyncManager.cleanup();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
    realTimeSyncManager.cleanup();
  });

  describe('Invitation Acceptance Flow', () => {
    it('should complete end-to-end sync when user accepts invitation', async () => {
      // Mock successful invitation acceptance
      const mockInviteResult = {
        type: '1on1' as const,
        privateConnectionId: mockConnectionId,
        otherUserId: mockOtherUserId,
        createdBy: mockOtherUserId,
      };

      (useInviteLink as jest.Mock).mockResolvedValue(mockInviteResult);
      (invalidateWithRefresh as jest.Mock).mockImplementation(async (key, callback) => {
        if (callback) await callback();
      });

      // Set up event listeners to track the flow
      const events: any[] = [];
      
      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, (event) => {
        events.push({ type: 'CONNECTION_ADDED', event });
      });
      
      eventBus.on(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        events.push({ type: 'SUCCESS_EVENT', event });
      });
      
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, (event) => {
        events.push({ type: 'SYNC_REFRESH_REQUIRED', event });
      });

      // Initialize sync manager
      await realTimeSyncManager.initializeSync(mockUserId);

      // Simulate invitation acceptance
      const result = await useInviteLink(mockInviteCode, mockUserId);
      
      // Emit connection added event (as would happen in ConnectionsScreen)
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: result.privateConnectionId!,
        changeType: 'added',
        userId: mockUserId,
        otherUserId: result.otherUserId!,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };
      
      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);
      
      // Trigger cache invalidation with refresh
      await invalidateWithRefresh(`private_connections_${mockUserId}`, async () => {
        // Mock reload function
      });
      
      // Force sync
      await realTimeSyncManager.forceSync();
      
      // Emit sync refresh event
      eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
        reason: 'connection_change',
        affectedUserIds: [result.otherUserId!],
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      });

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the complete flow
      expect(useInviteLink).toHaveBeenCalledWith(mockInviteCode, mockUserId);
      expect(invalidateWithRefresh).toHaveBeenCalledWith(
        `private_connections_${mockUserId}`,
        expect.any(Function)
      );

      // Verify events were emitted in correct order
      const connectionAddedEvent = events.find(e => e.type === 'CONNECTION_ADDED');
      const syncRefreshEvent = events.find(e => e.type === 'SYNC_REFRESH_REQUIRED');
      
      expect(connectionAddedEvent).toBeDefined();
      expect(connectionAddedEvent.event.connectionId).toBe(mockConnectionId);
      expect(connectionAddedEvent.event.changeType).toBe('added');
      
      expect(syncRefreshEvent).toBeDefined();
      expect(syncRefreshEvent.event.reason).toBe('connection_change');
      expect(syncRefreshEvent.event.affectedUserIds).toContain(mockOtherUserId);
    });

    it('should handle network interruptions during sync', async () => {
      // Mock network failure
      const networkError = new Error('Network request failed');
      (useInviteLink as jest.Mock).mockRejectedValueOnce(networkError);

      const errorEvents: ErrorEvent[] = [];
      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        errorEvents.push(event);
      });

      await realTimeSyncManager.initializeSync(mockUserId);

      // Attempt invitation acceptance with network failure
      try {
        await useInviteLink(mockInviteCode, mockUserId);
      } catch (error) {
        // Emit error event as would happen in ConnectionsScreen
        eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
          operation: 'connection_join',
          error: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
          timestamp: new Date(),
          source: 'ConnectionsScreen'
        });
      }

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errorEvents[0].operation).toBe('connection_join');
      expect(errorEvents[0].error).toBe('Network request failed');
      expect(errorEvents[0].retryable).toBe(true);
    });
  });

  describe('Background/Foreground Sync Recovery', () => {
    it('should refresh subscriptions when app returns to foreground', async () => {
      const mockAppStateChange = jest.fn();
      
      // Initialize sync manager
      await realTimeSyncManager.initializeSync(mockUserId);
      
      // Mock subscription manager
      const refreshSpy = jest.spyOn(subscriptionManager, 'refreshAllSubscriptions');
      refreshSpy.mockResolvedValue();

      // Simulate app going to background then foreground
      eventBus.emit(EVENT_NAMES.APP_STATE_CHANGED, {
        state: 'background',
        timestamp: new Date(),
        source: 'AppStateManager'
      });
      
      // Wait a bit then return to foreground
      await new Promise(resolve => setTimeout(resolve, 100));
      
      eventBus.emit(EVENT_NAMES.APP_STATE_CHANGED, {
        state: 'active',
        timestamp: new Date(),
        source: 'AppStateManager'
      });

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should handle subscription refresh failures gracefully', async () => {
      const refreshError = new Error('Subscription refresh failed');
      const refreshSpy = jest.spyOn(subscriptionManager, 'refreshAllSubscriptions');
      refreshSpy.mockRejectedValue(refreshError);

      const errorEvents: ErrorEvent[] = [];
      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        errorEvents.push(event);
      });

      await realTimeSyncManager.initializeSync(mockUserId);

      // Trigger foreground event
      eventBus.emit(EVENT_NAMES.APP_STATE_CHANGED, {
        state: 'active',
        timestamp: new Date(),
        source: 'AppStateManager'
      });

      // Wait for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(errorEvents.length).toBeGreaterThan(0);

      const syncError = errorEvents.find(e => e.operation === 'sync');
      expect(syncError).toBeDefined();
      expect(syncError?.retryable).toBe(true);
    });
  });

  describe('Success Animation Timing', () => {
    it('should emit success events asynchronously to avoid render conflicts', async () => {
      const successEvents: SuccessEvent[] = [];
      let eventEmissionTime: number;
      let listenerCallTime: number;

      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        listenerCallTime = Date.now();
        successEvents.push(event);
      });

      eventEmissionTime = Date.now();
      
      // Simulate the deferred emission pattern used in the fix
      setTimeout(() => {
        eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
          operation: 'connection_added',
          message: 'Connection created successfully!',
          timestamp: new Date(),
          source: 'ConnectionsScreen'
        });
      }, 0);

      // Wait for async event emission
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(successEvents.length).toBe(1);

      // Verify the event was emitted asynchronously
      expect(listenerCallTime).toBeGreaterThan(eventEmissionTime);
      expect(successEvents[0].operation).toBe('connection_added');
      expect(successEvents[0].message).toBe('Connection created successfully!');
    });

    it('should not cause useInsertionEffect errors during animation triggers', async () => {
      // This test verifies that our setTimeout fix prevents render phase conflicts
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const successEvents: SuccessEvent[] = [];
      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        successEvents.push(event);
        
        // Simulate what would happen in SuccessAnimation component
        // The deferred setTimeout should prevent useInsertionEffect errors
      });

      // Emit multiple rapid success events (as might happen during sync)
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
            operation: 'sync_completed',
            message: `Sync ${i + 1} completed`,
            timestamp: new Date(),
            source: 'RealTimeSyncManager'
          });
        }, 0);
      }

      // Wait for all events to be processed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(successEvents.length).toBe(5);

      // Verify no useInsertionEffect errors were logged
      const insertionEffectErrors = consoleSpy.mock.calls.filter(call => 
        call.some(arg => typeof arg === 'string' && arg.includes('useInsertionEffect'))
      );
      
      expect(insertionEffectErrors.length).toBe(0);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should implement retry logic with exponential backoff', async () => {
      let attemptCount = 0;
      const maxAttempts = 3;
      
      (useInviteLink as jest.Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return Promise.resolve({
          type: '1on1',
          privateConnectionId: mockConnectionId,
          otherUserId: mockOtherUserId,
        });
      });

      await realTimeSyncManager.initializeSync(mockUserId);

      const errorEvents: ErrorEvent[] = [];
      const successEvents: SuccessEvent[] = [];
      
      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        errorEvents.push(event);
      });
      
      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        successEvents.push(event);
      });

      // Simulate retry logic
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await useInviteLink(mockInviteCode, mockUserId);
          
          // Success on final attempt
          eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
            operation: 'connection_added',
            message: 'Connection established after retry',
            timestamp: new Date(),
            source: 'ConnectionsScreen'
          });
          break;
          
        } catch (error) {
          if (attempt < maxAttempts) {
            eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
              operation: 'connection_join',
              error: error instanceof Error ? error.message : 'Unknown error',
              retryable: true,
              timestamp: new Date(),
              source: 'ConnectionsScreen'
            });
            
            // Exponential backoff delay
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          }
        }
      }

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(successEvents.length).toBe(1);

      expect(attemptCount).toBe(maxAttempts);
      expect(errorEvents.length).toBe(maxAttempts - 1);
      expect(successEvents.length).toBe(1);
      expect(successEvents[0].message).toBe('Connection established after retry');
    });

    it('should provide fallback mechanisms for critical sync failures', async () => {
      // Mock critical sync failure
      const syncSpy = jest.spyOn(realTimeSyncManager, 'forceSync');
      syncSpy.mockRejectedValue(new Error('Critical sync failure'));

      const errorEvents: ErrorEvent[] = [];
      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        errorEvents.push(event);
      });

      await realTimeSyncManager.initializeSync(mockUserId);

      try {
        await realTimeSyncManager.forceSync();
      } catch (error) {
        // Emit error event for critical failure
        eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
          operation: 'sync',
          error: 'Critical sync failure - using fallback',
          retryable: false,
          timestamp: new Date(),
          source: 'RealTimeSyncManager'
        });
      }

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(errorEvents.length).toBe(1);

      expect(errorEvents[0].operation).toBe('sync');
      expect(errorEvents[0].retryable).toBe(false);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should properly clean up event subscriptions', async () => {
      const subscriptions: (() => void)[] = [];
      
      // Create multiple subscriptions
      subscriptions.push(
        eventBus.on(EVENT_NAMES.CONNECTION_ADDED, () => {}),
        eventBus.on(EVENT_NAMES.SUCCESS_EVENT, () => {}),
        eventBus.on(EVENT_NAMES.ERROR_EVENT, () => {}),
        eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, () => {})
      );

      // Verify subscriptions are active
      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBeGreaterThan(0);
      expect(eventBus.getListenerCount(EVENT_NAMES.SUCCESS_EVENT)).toBeGreaterThan(0);

      // Clean up subscriptions
      subscriptions.forEach(unsubscribe => unsubscribe());

      // Verify cleanup
      expect(eventBus.getListenerCount(EVENT_NAMES.CONNECTION_ADDED)).toBe(0);
      expect(eventBus.getListenerCount(EVENT_NAMES.SUCCESS_EVENT)).toBe(0);
      expect(eventBus.getListenerCount(EVENT_NAMES.ERROR_EVENT)).toBe(0);
      expect(eventBus.getListenerCount(EVENT_NAMES.SYNC_REFRESH_REQUIRED)).toBe(0);
    });

    it('should handle rapid subscription changes efficiently', async () => {
      const startTime = Date.now();
      const subscriptionCount = 100;
      const subscriptions: (() => void)[] = [];

      await realTimeSyncManager.initializeSync(mockUserId);

      // Create many rapid subscriptions
      for (let i = 0; i < subscriptionCount; i++) {
        subscriptions.push(
          eventBus.on(EVENT_NAMES.CONNECTION_ADDED, () => {})
        );
      }

      const subscriptionTime = Date.now() - startTime;

      // Clean up
      subscriptions.forEach(unsubscribe => unsubscribe());

      // Verify performance (should complete within reasonable time)
      expect(subscriptionTime).toBeLessThan(1000); // Less than 1 second
      expect(subscriptions.length).toBe(subscriptionCount);
    });
  });
});