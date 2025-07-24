// Mock all external dependencies first
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  multiRemove: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../utils/errorHandling', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
  ErrorCategory: {
    UNKNOWN: 'UNKNOWN',
  },
}));

jest.mock('../utils/validation', () => ({
  Validator: {
    validateOrThrow: jest.fn(),
  },
  validationRules: {
    required: jest.fn(() => ({ type: 'required' })),
    string: jest.fn(() => ({ type: 'string' })),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setCache,
  getCache,
  removeCache,
  invalidateWithRefresh,
  batchInvalidateWithRefresh,
  onCacheChange,
  offCacheChange,
  clearCacheChangeListeners,
  getCacheChangeListenerCount,
  CacheChangeType,
  CacheChangeListener,
  RefreshCallback
} from '../services/cacheService';

describe('Enhanced Cache Service', () => {
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    clearCacheChangeListeners();
  });

  describe('Cache Change Listeners', () => {
    it('should add and remove cache change listeners', () => {
      const listener1: CacheChangeListener = jest.fn();
      const listener2: CacheChangeListener = jest.fn();

      expect(getCacheChangeListenerCount()).toBe(0);

      const unsubscribe1 = onCacheChange(listener1);
      expect(getCacheChangeListenerCount()).toBe(1);

      const unsubscribe2 = onCacheChange(listener2);
      expect(getCacheChangeListenerCount()).toBe(2);

      unsubscribe1();
      expect(getCacheChangeListenerCount()).toBe(1);

      offCacheChange(listener2);
      expect(getCacheChangeListenerCount()).toBe(0);
    });

    it('should clear all cache change listeners', () => {
      const listener1: CacheChangeListener = jest.fn();
      const listener2: CacheChangeListener = jest.fn();

      onCacheChange(listener1);
      onCacheChange(listener2);
      expect(getCacheChangeListenerCount()).toBe(2);

      clearCacheChangeListeners();
      expect(getCacheChangeListenerCount()).toBe(0);
    });

    it('should notify listeners when cache is updated', async () => {
      const listener: CacheChangeListener = jest.fn();
      onCacheChange(listener);

      mockAsyncStorage.setItem.mockResolvedValue();

      await setCache('test-key', 'test-value');

      expect(listener).toHaveBeenCalledWith('test-key', 'updated');
    });

    it('should notify listeners when cache is removed', async () => {
      const listener: CacheChangeListener = jest.fn();
      onCacheChange(listener);

      mockAsyncStorage.removeItem.mockResolvedValue();

      await removeCache('test-key');

      expect(listener).toHaveBeenCalledWith('test-key', 'removed');
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener: CacheChangeListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener: CacheChangeListener = jest.fn();

      onCacheChange(errorListener);
      onCacheChange(normalListener);

      mockAsyncStorage.setItem.mockResolvedValue();

      // Should not throw despite listener error
      await expect(setCache('test-key', 'test-value')).resolves.toBe(true);

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('invalidateWithRefresh', () => {
    it('should invalidate cache and trigger refresh callback', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);
      const listener: CacheChangeListener = jest.fn();
      
      onCacheChange(listener);
      mockAsyncStorage.removeItem.mockResolvedValue();

      await invalidateWithRefresh('test-key', refreshCallback);

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(listener).toHaveBeenCalledWith('test-key', 'invalidated');
      expect(refreshCallback).toHaveBeenCalled();
    });

    it('should invalidate cache without refresh callback', async () => {
      const listener: CacheChangeListener = jest.fn();
      
      onCacheChange(listener);
      mockAsyncStorage.removeItem.mockResolvedValue();

      await invalidateWithRefresh('test-key');

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(listener).toHaveBeenCalledWith('test-key', 'invalidated');
    });

    it('should handle refresh callback errors gracefully', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockRejectedValue(new Error('Refresh error'));
      const listener: CacheChangeListener = jest.fn();
      
      onCacheChange(listener);
      mockAsyncStorage.removeItem.mockResolvedValue();

      // Should not throw despite callback error
      await expect(invalidateWithRefresh('test-key', refreshCallback)).resolves.toBeUndefined();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(listener).toHaveBeenCalledWith('test-key', 'invalidated');
      expect(refreshCallback).toHaveBeenCalled();
    });

    it('should handle cache removal errors gracefully', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);
      
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw despite storage error
      await expect(invalidateWithRefresh('test-key', refreshCallback)).resolves.toBeUndefined();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('test-key');
      // Callback should not be called if cache removal fails
      expect(refreshCallback).not.toHaveBeenCalled();
    });
  });

  describe('batchInvalidateWithRefresh', () => {
    it('should batch invalidate multiple cache keys and trigger refresh callback', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);
      const listener: CacheChangeListener = jest.fn();
      const cacheKeys = ['key1', 'key2', 'key3'];
      
      onCacheChange(listener);
      mockAsyncStorage.multiRemove.mockResolvedValue();

      await batchInvalidateWithRefresh(cacheKeys, refreshCallback);

      expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith(cacheKeys);
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenCalledWith('key1', 'invalidated');
      expect(listener).toHaveBeenCalledWith('key2', 'invalidated');
      expect(listener).toHaveBeenCalledWith('key3', 'invalidated');
      expect(refreshCallback).toHaveBeenCalled();
    });

    it('should batch invalidate without refresh callback', async () => {
      const listener: CacheChangeListener = jest.fn();
      const cacheKeys = ['key1', 'key2'];
      
      onCacheChange(listener);
      mockAsyncStorage.multiRemove.mockResolvedValue();

      await batchInvalidateWithRefresh(cacheKeys);

      expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith(cacheKeys);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should handle empty cache keys array', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);
      
      await batchInvalidateWithRefresh([], refreshCallback);

      expect(mockAsyncStorage.multiRemove).not.toHaveBeenCalled();
      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should handle invalid cache keys array', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);
      
      // Should not throw with invalid input
      await expect(batchInvalidateWithRefresh(null as any, refreshCallback)).resolves.toBeUndefined();
      await expect(batchInvalidateWithRefresh(undefined as any, refreshCallback)).resolves.toBeUndefined();

      expect(mockAsyncStorage.multiRemove).not.toHaveBeenCalled();
      expect(refreshCallback).not.toHaveBeenCalled();
    });

    it('should handle batch refresh callback errors gracefully', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockRejectedValue(new Error('Batch refresh error'));
      const listener: CacheChangeListener = jest.fn();
      const cacheKeys = ['key1', 'key2'];
      
      onCacheChange(listener);
      mockAsyncStorage.multiRemove.mockResolvedValue();

      // Should not throw despite callback error
      await expect(batchInvalidateWithRefresh(cacheKeys, refreshCallback)).resolves.toBeUndefined();

      expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith(cacheKeys);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(refreshCallback).toHaveBeenCalled();
    });

    it('should handle batch storage errors gracefully', async () => {
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);
      const cacheKeys = ['key1', 'key2'];
      
      mockAsyncStorage.multiRemove.mockRejectedValue(new Error('Batch storage error'));

      // Should not throw despite storage error
      await expect(batchInvalidateWithRefresh(cacheKeys, refreshCallback)).resolves.toBeUndefined();

      expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith(cacheKeys);
      // Callback should not be called if batch removal fails
      expect(refreshCallback).not.toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should handle multiple listeners with different operations', async () => {
      const listener1: CacheChangeListener = jest.fn();
      const listener2: CacheChangeListener = jest.fn();
      const refreshCallback: RefreshCallback = jest.fn().mockResolvedValue(undefined);

      onCacheChange(listener1);
      onCacheChange(listener2);

      mockAsyncStorage.setItem.mockResolvedValue();
      mockAsyncStorage.removeItem.mockResolvedValue();
      mockAsyncStorage.multiRemove.mockResolvedValue();

      // Test set cache
      await setCache('key1', 'value1');
      expect(listener1).toHaveBeenCalledWith('key1', 'updated');
      expect(listener2).toHaveBeenCalledWith('key1', 'updated');

      // Test remove cache
      await removeCache('key2');
      expect(listener1).toHaveBeenCalledWith('key2', 'removed');
      expect(listener2).toHaveBeenCalledWith('key2', 'removed');

      // Test invalidate with refresh
      await invalidateWithRefresh('key3', refreshCallback);
      expect(listener1).toHaveBeenCalledWith('key3', 'invalidated');
      expect(listener2).toHaveBeenCalledWith('key3', 'invalidated');
      expect(refreshCallback).toHaveBeenCalled();

      // Test batch invalidate
      await batchInvalidateWithRefresh(['key4', 'key5']);
      expect(listener1).toHaveBeenCalledWith('key4', 'invalidated');
      expect(listener1).toHaveBeenCalledWith('key5', 'invalidated');
      expect(listener2).toHaveBeenCalledWith('key4', 'invalidated');
      expect(listener2).toHaveBeenCalledWith('key5', 'invalidated');
    });

    it('should maintain listener state across operations', async () => {
      const listener: CacheChangeListener = jest.fn();
      
      const unsubscribe = onCacheChange(listener);
      expect(getCacheChangeListenerCount()).toBe(1);

      mockAsyncStorage.setItem.mockResolvedValue();
      await setCache('test', 'value');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      expect(getCacheChangeListenerCount()).toBe(0);

      await setCache('test2', 'value2');
      // Listener should not be called after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});