import realTimeSyncManager from '../services/realTimeSyncManager';
import backgroundSyncRecoveryService from '../services/backgroundSyncRecoveryService';

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

jest.mock('../services/eventBusService');
jest.mock('../services/cacheService', () => ({
  invalidateWithRefresh: jest.fn(),
  batchInvalidateWithRefresh: jest.fn(),
}));

jest.mock('../services/subscriptionManagerService', () => ({
  initialize: jest.fn(),
  cleanup: jest.fn(),
  refreshAllSubscriptions: jest.fn(),
  getActiveUserIds: jest.fn(() => []),
}));

// Mock React Native dependencies
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({
    isConnected: true,
    type: 'wifi',
  })),
  addEventListener: jest.fn(() => () => {}),
}));

describe('Background Sync Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clean up services
    await realTimeSyncManager.cleanup();
    await backgroundSyncRecoveryService.cleanup();
  });

  afterEach(async () => {
    // Clean up after each test
    await realTimeSyncManager.cleanup();
    await backgroundSyncRecoveryService.cleanup();
  });

  it('should initialize background sync recovery when real-time sync manager initializes', async () => {
    // Initialize the real-time sync manager
    await realTimeSyncManager.initializeSync('test-user-id');

    // Verify that both services are initialized
    const syncState = realTimeSyncManager.getSyncState();
    const backgroundState = backgroundSyncRecoveryService.getState();

    expect(syncState.isInitialized).toBe(true);
    expect(backgroundState.isListening).toBe(true);
  });

  it('should maintain background sync recovery when real-time sync manager cleans up', async () => {
    // Initialize both services
    await realTimeSyncManager.initializeSync('test-user-id');

    // Verify they are initialized
    let syncState = realTimeSyncManager.getSyncState();
    let backgroundState = backgroundSyncRecoveryService.getState();
    expect(syncState.isInitialized).toBe(true);
    expect(backgroundState.isListening).toBe(true);

    // Clean up the real-time sync manager
    await realTimeSyncManager.cleanup();

    // Verify real-time sync manager is cleaned up
    syncState = realTimeSyncManager.getSyncState();
    expect(syncState.isInitialized).toBe(false);
    
    // Background sync service should remain active (it's independent)
    backgroundState = backgroundSyncRecoveryService.getState();
    expect(backgroundState.isListening).toBe(true);
  });

  it('should handle multiple initialization calls gracefully', async () => {
    // Initialize multiple times
    await realTimeSyncManager.initializeSync('test-user-id');
    await realTimeSyncManager.initializeSync('test-user-id');
    await realTimeSyncManager.initializeSync('test-user-id');

    // Should still be properly initialized
    const syncState = realTimeSyncManager.getSyncState();
    const backgroundState = backgroundSyncRecoveryService.getState();

    expect(syncState.isInitialized).toBe(true);
    expect(backgroundState.isListening).toBe(true);
  });

  it('should maintain independent state for both services', async () => {
    await realTimeSyncManager.initializeSync('test-user-id');

    // Add items to background sync queue
    backgroundSyncRecoveryService.addToQueue('sync', { reason: 'test' });
    backgroundSyncRecoveryService.addToQueue('subscription_refresh', { reason: 'test' });

    const syncState = realTimeSyncManager.getSyncState();
    const backgroundState = backgroundSyncRecoveryService.getState();

    // Real-time sync manager should have its own state
    expect(syncState.activeSubscriptions).toEqual([]);
    expect(syncState.isInitialized).toBe(true);

    // Background sync service should have its own queue
    expect(backgroundState.queueSize).toBe(2);
    expect(backgroundState.pendingOperations).toContain('sync');
    expect(backgroundState.pendingOperations).toContain('subscription_refresh');
    expect(backgroundState.isListening).toBe(true);
  });
});