/**
 * Example usage of Enhanced Cache Service
 * This file demonstrates how to use the new cache invalidation and refresh functionality
 */

import {
  setCache,
  getCache,
  invalidateWithRefresh,
  batchInvalidateWithRefresh,
  onCacheChange,
  CacheChangeListener,
  RefreshCallback
} from './cacheService';

// Example: Setting up cache change listeners
export const setupCacheListeners = () => {
  const cacheListener: CacheChangeListener = (key, changeType) => {
    console.log(`Cache ${changeType}: ${key}`);

    // Handle different change types
    switch (changeType) {
      case 'invalidated':
        console.log(`Cache key ${key} was invalidated - refresh triggered`);
        break;
      case 'updated':
        console.log(`Cache key ${key} was updated with new data`);
        break;
      case 'removed':
        console.log(`Cache key ${key} was removed`);
        break;
    }
  };

  // Add listener and get cleanup function
  const unsubscribe = onCacheChange(cacheListener);

  return unsubscribe;
};

// Example: Invalidating cache with refresh callback for location subscriptions
export const refreshLocationSubscriptions = async (userId: string) => {
  const refreshCallback: RefreshCallback = async () => {
    console.log('Refreshing location subscriptions...');

    // Simulate subscription refresh logic
    // In real implementation, this would:
    // 1. Get updated contact list
    // 2. Re-establish location subscriptions
    // 3. Update live view data

    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work
    console.log('Location subscriptions refreshed successfully');
  };

  // Invalidate location cache and trigger refresh
  await invalidateWithRefresh(`locations_${userId}`, refreshCallback);
};

// Example: Batch invalidation for connection changes
export const handleConnectionChange = async (userId: string, connectionIds: string[]) => {
  const refreshCallback: RefreshCallback = async () => {
    console.log('Refreshing all connection-related data...');

    // Simulate comprehensive refresh
    // In real implementation, this would:
    // 1. Refresh contact list
    // 2. Update location subscriptions
    // 3. Sync live view data
    // 4. Update UI state

    await new Promise(resolve => setTimeout(resolve, 200)); // Simulate async work
    console.log('Connection data refresh completed');
  };

  // Build cache keys to invalidate
  const cacheKeys = [
    `connections_${userId}`,
    `contacts_${userId}`,
    ...connectionIds.map(id => `user_location_${id}`),
    ...connectionIds.map(id => `user_profile_${id}`)
  ];

  // Batch invalidate all related cache entries
  await batchInvalidateWithRefresh(cacheKeys, refreshCallback);
};

// Example: Real-time sync scenario
export const demonstrateRealTimeSync = async () => {
  console.log('=== Enhanced Cache Service Demo ===');

  // Setup cache listeners
  const unsubscribe = setupCacheListeners();

  try {
    // Simulate user data
    const userId = 'user123';
    const connectionIds = ['conn1', 'conn2', 'conn3'];

    // 1. Set some initial cache data
    console.log('\n1. Setting initial cache data...');
    await setCache(`connections_${userId}`, ['conn1', 'conn2']);
    await setCache(`locations_${userId}`, { lat: 40.7128, lng: -74.0060 });

    // 2. Simulate location subscription refresh
    console.log('\n2. Refreshing location subscriptions...');
    await refreshLocationSubscriptions(userId);

    // 3. Simulate connection change (new contact added)
    console.log('\n3. Handling connection change...');
    await handleConnectionChange(userId, connectionIds);

    console.log('\n=== Demo completed successfully ===');

  } catch (error) {
    console.error('Demo failed:', error);
  } finally {
    // Cleanup listeners
    unsubscribe();
  }
};

// Example: Error handling scenarios
export const demonstrateErrorHandling = async () => {
  console.log('=== Error Handling Demo ===');

  const unsubscribe = setupCacheListeners();

  try {
    // Callback that throws an error
    const faultyRefreshCallback: RefreshCallback = async () => {
      throw new Error('Simulated refresh error');
    };

    // This should handle the error gracefully
    console.log('\n1. Testing error handling in refresh callback...');
    await invalidateWithRefresh('test_key', faultyRefreshCallback);

    // Batch operation with error
    console.log('\n2. Testing batch operation with error...');
    await batchInvalidateWithRefresh(['key1', 'key2'], faultyRefreshCallback);

    console.log('\n=== Error handling demo completed ===');

  } catch (error) {
    console.error('Unexpected error in demo:', error);
  } finally {
    unsubscribe();
  }
};

// Export for testing or demonstration purposes
export default {
  setupCacheListeners,
  refreshLocationSubscriptions,
  handleConnectionChange,
  demonstrateRealTimeSync,
  demonstrateErrorHandling
};