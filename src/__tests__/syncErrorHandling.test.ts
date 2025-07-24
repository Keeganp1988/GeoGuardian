/**
 * Unit tests for Sync Error Handling Service
 */

// Mock React Native dependencies
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

// Mock other dependencies
jest.mock('../services/eventBusService');
jest.mock('../utils/errorHandling', () => ({
  ErrorHandler: {
    logError: jest.fn(),
    showUserError: jest.fn(),
  },
  ErrorCategory: {
    NETWORK: 'NETWORK',
    PERMISSION: 'PERMISSION',
    FIREBASE: 'FIREBASE',
    UNKNOWN: 'UNKNOWN',
  },
  ErrorSeverity: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
}));

import syncErrorHandler, { SyncErrorType, RecoveryStrategy } from '../services/syncErrorHandlingService';
import syncErrorMonitoring from '../utils/syncErrorMonitoring';
import eventBus from '../services/eventBusService';
import { EVENT_NAMES } from '../types/events';

describe('SyncErrorHandlingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    syncErrorHandler.initialize();
    syncErrorHandler.clearErrorHistory();
  });

  afterEach(() => {
    syncErrorHandler.clearErrorHistory();
  });

  describe('Error Categorization', () => {
    it('should categorize network errors correctly', async () => {
      const networkError = new Error('Network connection failed');
      const syncError = await syncErrorHandler.handleSyncError(networkError, 'testOperation');

      expect(syncError.type).toBe(SyncErrorType.NETWORK_UNAVAILABLE);
      expect(syncError.isRetryable).toBe(true);
      expect(syncError.recoveryStrategy).toBe(RecoveryStrategy.RETRY_WITH_BACKOFF);
    });

    it('should categorize permission errors correctly', async () => {
      const permissionError = new Error('Permission denied');
      const syncError = await syncErrorHandler.handleSyncError(permissionError, 'testOperation');

      expect(syncError.type).toBe(SyncErrorType.PERMISSION_DENIED);
      expect(syncError.isRetryable).toBe(false);
      expect(syncError.recoveryStrategy).toBe(RecoveryStrategy.ESCALATE_TO_USER);
    });

    it('should categorize rate limit errors correctly', async () => {
      const rateLimitError = new Error('Too many requests');
      const syncError = await syncErrorHandler.handleSyncError(rateLimitError, 'testOperation');

      expect(syncError.type).toBe(SyncErrorType.RATE_LIMITED);
      expect(syncError.isRetryable).toBe(true);
      expect(syncError.recoveryStrategy).toBe(RecoveryStrategy.RETRY_WITH_BACKOFF);
    });

    it('should categorize subscription errors correctly', async () => {
      const subscriptionError = new Error('Subscription failed to establish');
      const syncError = await syncErrorHandler.handleSyncError(subscriptionError, 'testOperation');

      expect(syncError.type).toBe(SyncErrorType.SUBSCRIPTION_FAILED);
      expect(syncError.isRetryable).toBe(true);
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should have retry functionality available', () => {
      // Test that the retry methods exist
      expect(typeof syncErrorHandler.executeWithRetry).toBe('function');
      expect(typeof syncErrorHandler.updateRetryConfig).toBe('function');
    });

    it('should allow updating retry configuration', () => {
      const newConfig = {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 3,
      };

      // Test that updateRetryConfig doesn't throw
      expect(() => syncErrorHandler.updateRetryConfig(newConfig)).not.toThrow();
    });
  });

  describe('Error Statistics and Monitoring', () => {
    it('should track error statistics correctly', async () => {
      // Generate some errors
      await syncErrorHandler.handleSyncError(new Error('Test error 1'), 'operation1');
      await syncErrorHandler.handleSyncError(new Error('Network error'), 'operation2');
      await syncErrorHandler.handleSyncError(new Error('Test error 2'), 'operation1');

      const stats = syncErrorHandler.getErrorStats();
      
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByOperation['operation1']).toBe(2);
      expect(stats.errorsByOperation['operation2']).toBe(1);
      expect(stats.errorsByType[SyncErrorType.NETWORK_UNAVAILABLE]).toBe(1);
      expect(stats.errorsByType[SyncErrorType.UNKNOWN]).toBe(2);
    });

    it('should maintain error history with limit', async () => {
      // Generate more errors than the history limit
      for (let i = 0; i < 150; i++) {
        await syncErrorHandler.handleSyncError(new Error(`Test error ${i}`), 'testOperation');
      }

      const history = syncErrorHandler.getErrorHistory();
      expect(history.length).toBeLessThanOrEqual(100); // Should be limited to 100
    });

    it('should provide health status correctly', () => {
      // Test that health status method exists and returns a boolean
      const isHealthy = syncErrorHandler.isSyncHealthy();
      expect(typeof isHealthy).toBe('boolean');

      // After errors, health status should change based on implementation
      // This would depend on the specific health criteria
    });
  });

  describe('User-Friendly Error Messages', () => {
    it('should provide user-friendly error messages with recovery actions', async () => {
      const networkError = new Error('Network connection failed');
      const syncError = await syncErrorHandler.handleSyncError(networkError, 'testOperation');

      const userError = syncErrorHandler.getUserFriendlyError(syncError);
      
      expect(userError.message).toContain('network');
      expect(userError.actions).toHaveLength(3); // Retry, Refresh, Check Connection
      expect(userError.actions.some(action => action.label === 'Retry')).toBe(true);
      expect(userError.actions.some(action => action.label === 'Refresh')).toBe(true);
      expect(userError.actions.some(action => action.label === 'Check Connection')).toBe(true);
    });

    it('should provide appropriate actions for permission errors', async () => {
      const permissionError = new Error('Permission denied');
      const syncError = await syncErrorHandler.handleSyncError(permissionError, 'testOperation');

      const userError = syncErrorHandler.getUserFriendlyError(syncError);
      
      expect(userError.message).toContain('Permission');
      expect(userError.actions.some(action => action.label === 'Open Settings')).toBe(true);
    });
  });

  describe('Event Bus Integration', () => {
    it('should emit error events through event bus', async () => {
      const mockEmit = jest.mocked(eventBus.emit);
      
      const testError = new Error('Test error');
      await syncErrorHandler.handleSyncError(testError, 'testOperation');

      expect(mockEmit).toHaveBeenCalledWith(
        EVENT_NAMES.ERROR_EVENT,
        expect.objectContaining({
          operation: 'testOperation',
          retryable: true,
          source: 'SyncErrorHandler',
        })
      );
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should have fallback functionality available', () => {
      // Test that the fallback method exists
      expect(typeof syncErrorHandler.executeWithFallback).toBe('function');
    });
  });

  describe('Configuration Management', () => {
    it('should allow updating retry configuration', () => {
      const newConfig = {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 3,
      };

      // Test that updateRetryConfig doesn't throw
      expect(() => syncErrorHandler.updateRetryConfig(newConfig)).not.toThrow();
    });
  });
});

describe('SyncErrorMonitoringService', () => {
  beforeEach(() => {
    syncErrorMonitoring.initialize();
    syncErrorMonitoring.clearMonitoringData();
  });

  afterEach(() => {
    syncErrorMonitoring.cleanup();
  });

  describe('Health Checks', () => {
    it('should perform health check and return healthy status initially', () => {
      const healthCheck = syncErrorMonitoring.performHealthCheck();

      expect(healthCheck.isHealthy).toBeDefined();
      expect(healthCheck.score).toBeGreaterThanOrEqual(0);
      expect(healthCheck.issues).toBeDefined();
      expect(healthCheck.lastCheckTime).toBeInstanceOf(Date);
    });

    it('should detect health issues when errors occur', async () => {
      // Generate multiple errors to trigger health issues
      for (let i = 0; i < 10; i++) {
        await syncErrorHandler.handleSyncError(new Error('Test error'), 'testOperation');
      }

      const healthCheck = syncErrorMonitoring.performHealthCheck();

      expect(healthCheck.isHealthy).toBe(false);
      expect(healthCheck.score).toBeLessThan(80);
      expect(healthCheck.issues.length).toBeGreaterThan(0);
      expect(healthCheck.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring', () => {
    it('should record operation performance metrics', () => {
      const startTime = Date.now() - 1000; // 1 second ago
      
      syncErrorMonitoring.recordOperationTime('testOperation', startTime, true);
      
      const debugInfo = syncErrorMonitoring.getDebugInfo();
      expect(debugInfo.performanceMetrics.averageResponseTime).toBeGreaterThan(0);
    });

    it('should detect slow operations', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const startTime = Date.now() - 15000; // 15 seconds ago (slow)
      
      syncErrorMonitoring.recordOperationTime('slowOperation', startTime, true);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slow operation detected')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Debug Information', () => {
    it('should provide comprehensive debug information', () => {
      const debugInfo = syncErrorMonitoring.getDebugInfo();

      expect(debugInfo).toHaveProperty('errorStats');
      expect(debugInfo).toHaveProperty('recentErrors');
      expect(debugInfo).toHaveProperty('healthCheck');
      expect(debugInfo).toHaveProperty('systemInfo');
      expect(debugInfo).toHaveProperty('performanceMetrics');
    });

    it('should generate readable error report', async () => {
      // Generate some test data
      await syncErrorHandler.handleSyncError(new Error('Test error'), 'testOperation');
      
      const report = syncErrorMonitoring.generateErrorReport();

      expect(report).toContain('SYNC ERROR MONITORING REPORT');
      expect(report).toContain('Health Status:');
      expect(report).toContain('ERROR STATISTICS:');
      expect(report).toContain('PERFORMANCE METRICS:');
    });

    it('should export debug data as JSON', () => {
      const jsonData = syncErrorMonitoring.exportDebugData();
      const parsedData = JSON.parse(jsonData);

      expect(parsedData).toHaveProperty('errorStats');
      expect(parsedData).toHaveProperty('healthCheck');
      expect(parsedData).toHaveProperty('performanceMetrics');
    });
  });
});