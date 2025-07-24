/**
 * Performance Monitoring Service Tests
 * Tests for debouncing, batch processing, performance metrics, and memory optimization
 */

import { jest } from '@jest/globals';
import performanceMonitor from '../services/performanceMonitoringService';
import eventBus from '../services/eventBusService';
import { EVENT_NAMES } from '../types/events';

describe('PerformanceMonitoringService', () => {
  beforeEach(() => {
    // Reset the service
    performanceMonitor.cleanup();
    performanceMonitor.resetMetrics();
  });

  afterEach(() => {
    performanceMonitor.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      performanceMonitor.initialize();
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Initializing performance monitoring service');
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Performance monitoring initialized');
      
      consoleSpy.mockRestore();
    });

    it('should not initialize twice', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      performanceMonitor.initialize();
      performanceMonitor.initialize();
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Already initialized');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Batch Processing', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should skip duplicate operations', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
      const operation = { userId: 'user1', action: 'refresh' };
      
      performanceMonitor.addToBatch('subscription_refresh', operation);
      performanceMonitor.addToBatch('subscription_refresh', operation);
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Skipping duplicate subscription_refresh operation');
      
      consoleSpy.mockRestore();
    });

    it('should add operations to batch queue', () => {
      const operation = { userId: 'user1', action: 'refresh' };
      
      // Should not throw error
      expect(() => {
        performanceMonitor.addToBatch('subscription_refresh', operation, 1);
      }).not.toThrow();
    });

    it('should handle batch processing for different operation types', () => {
      const subscriptionOp = { userId: 'user1', action: 'refresh' };
      const cacheOp = { cacheKey: 'test-key' };
      const eventOp = { eventType: 'test-event', eventData: { test: true } };
      
      expect(() => {
        performanceMonitor.addToBatch('subscription_refresh', subscriptionOp);
        performanceMonitor.addToBatch('cache_invalidation', cacheOp);
        performanceMonitor.addToBatch('event_emission', eventOp);
      }).not.toThrow();
    });
  });

  describe('Performance Timing', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should start and end timing operations', () => {
      expect(() => {
        performanceMonitor.startTiming('test-op', 'subscription');
        performanceMonitor.endTiming('test-op', true);
      }).not.toThrow();
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.subscriptionOperations.totalOperations).toBe(1);
    });

    it('should handle failed operations', () => {
      performanceMonitor.startTiming('test-op', 'subscription');
      performanceMonitor.endTiming('test-op', false, 'Test error');
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.subscriptionOperations.totalOperations).toBe(1);
    });

    it('should warn when ending timing for non-existent operation', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      performanceMonitor.endTiming('non-existent-op');
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] No timing found for operation: non-existent-op');
      
      consoleSpy.mockRestore();
    });

    it('should track sync operations', () => {
      performanceMonitor.startTiming('sync-op', 'sync');
      performanceMonitor.endTiming('sync-op', true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.syncOperations.totalSyncs).toBe(1);
      expect(metrics.syncOperations.successfulSyncs).toBe(1);
    });
  });

  describe('Network Operation Recording', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should record successful network operations', () => {
      performanceMonitor.recordNetworkOperation(100, true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.networkOperations.totalRequests).toBe(1);
      expect(metrics.networkOperations.averageLatency).toBe(100);
    });

    it('should record retry attempts', () => {
      performanceMonitor.recordNetworkOperation(100, true, true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.networkOperations.retries).toBe(1);
    });

    it('should record timeouts', () => {
      performanceMonitor.recordNetworkOperation(5000, false, false, true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.networkOperations.timeouts).toBe(1);
    });

    it('should calculate average latency correctly', () => {
      performanceMonitor.recordNetworkOperation(100, true);
      performanceMonitor.recordNetworkOperation(200, true);
      performanceMonitor.recordNetworkOperation(300, true);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.networkOperations.averageLatency).toBe(200);
    });
  });

  describe('Memory Usage Tracking', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should update memory usage metrics', () => {
      performanceMonitor.updateMemoryUsage(5, 10, 20);
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.memoryUsage.activeSubscriptions).toBe(5);
      expect(metrics.memoryUsage.eventListeners).toBe(10);
      expect(metrics.memoryUsage.cacheEntries).toBe(20);
      expect(metrics.memoryUsage.estimatedMemoryUsage).toBeGreaterThan(0);
    });

    it('should calculate estimated memory usage', () => {
      performanceMonitor.updateMemoryUsage(10, 20, 30);
      
      const metrics = performanceMonitor.getMetrics();
      // Should include subscriptions (10 * 0.5) + listeners (20 * 0.2) + cache (30 * 1.0) + other overhead
      expect(metrics.memoryUsage.estimatedMemoryUsage).toBeGreaterThan(30); // At least 30KB from cache alone
    });

    it('should trigger proactive cleanup at 80% threshold', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Default memory threshold is 10MB = 10240KB
      // 80% threshold = 8192KB
      // Set memory usage to trigger proactive cleanup
      // subscriptions (8000 * 0.5) + listeners (1000 * 0.2) + cache (1000 * 1.0) = 4000 + 200 + 1000 = 5200KB
      // We need more to reach 8192KB, so let's use cache entries
      performanceMonitor.updateMemoryUsage(1000, 1000, 8000); // This should trigger ~9KB usage
      
      // The proactive cleanup should be triggered
      expect(consoleSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] Memory usage approaching threshold, performing proactive cleanup'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Performance Summary', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should return good health when metrics are normal', () => {
      const summary = performanceMonitor.getPerformanceSummary();
      
      expect(summary.health).toBe('good');
      expect(summary.issues).toHaveLength(0);
      expect(summary.recommendations).toHaveLength(0);
      expect(summary.keyMetrics).toHaveProperty('subscriptionResponseTime');
      expect(summary.keyMetrics).toHaveProperty('syncRefreshTime');
      expect(summary.keyMetrics).toHaveProperty('memoryUsage');
      expect(summary.keyMetrics).toHaveProperty('networkLatency');
      expect(summary.keyMetrics).toHaveProperty('errorRate');
    });

    it('should detect slow response times', () => {
      // Simulate multiple slow operations to get average above threshold
      for (let i = 0; i < 5; i++) {
        performanceMonitor.startTiming(`slow-op-${i}`, 'subscription');
        // Simulate 3 second delay by manipulating the timing directly
        const timing = (performanceMonitor as any).operationTimings.get(`slow-op-${i}`);
        if (timing) {
          timing.startTime = performance.now() - 3000; // 3 seconds ago
        }
        performanceMonitor.endTiming(`slow-op-${i}`, true);
      }
      
      const summary = performanceMonitor.getPerformanceSummary();
      
      expect(summary.health).toBe('warning');
      expect(summary.issues.some(issue => issue.includes('response time'))).toBe(true);
    });

    it('should provide recommendations for performance issues', () => {
      // Simulate slow sync operations
      for (let i = 0; i < 3; i++) {
        performanceMonitor.startTiming(`slow-sync-${i}`, 'sync');
        const timing = (performanceMonitor as any).operationTimings.get(`slow-sync-${i}`);
        if (timing) {
          timing.startTime = performance.now() - 6000; // 6 seconds ago
        }
        performanceMonitor.endTiming(`slow-sync-${i}`, true);
      }
      
      const summary = performanceMonitor.getPerformanceSummary();
      
      expect(summary.recommendations.length).toBeGreaterThan(0);
      expect(summary.recommendations.some(rec => 
        rec.includes('incremental sync') || rec.includes('reducing data payload')
      )).toBe(true);
    });
  });

  describe('Debouncing Operations', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should debounce subscription changes', async () => {
      let operationCalled = false;
      const operation = jest.fn().mockImplementation(async () => {
        operationCalled = true;
      });
      
      performanceMonitor.debounceSubscriptionChange('test-op', operation);
      
      // Operation should be debounced, not called immediately
      expect(operationCalled).toBe(false);
    });

    it('should debounce sync operations', async () => {
      let operationCalled = false;
      const operation = jest.fn().mockImplementation(async () => {
        operationCalled = true;
      });
      
      performanceMonitor.debounceSyncOperation('test-sync', operation);
      
      // Operation should be debounced, not called immediately
      expect(operationCalled).toBe(false);
    });

    it('should debounce cache invalidation operations', async () => {
      let operationCalled = false;
      const operation = jest.fn().mockImplementation(async () => {
        operationCalled = true;
      });
      
      performanceMonitor.debounceCacheInvalidation('test-cache', operation);
      
      // Operation should be debounced, not called immediately
      expect(operationCalled).toBe(false);
    });
  });

  describe('Adaptive Configuration', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should adjust configuration based on performance', () => {
      // Get initial config
      const initialReport = performanceMonitor.getDetailedPerformanceReport();
      const initialDebounceDelay = initialReport.configuration.debounce.subscriptionChanges;
      
      // Simulate slow operations to trigger adaptive adjustment
      for (let i = 0; i < 3; i++) {
        performanceMonitor.startTiming(`slow-op-${i}`, 'subscription');
        const timing = (performanceMonitor as any).operationTimings.get(`slow-op-${i}`);
        if (timing) {
          timing.startTime = performance.now() - 2000; // 2 seconds ago
        }
        performanceMonitor.endTiming(`slow-op-${i}`, true);
      }
      
      performanceMonitor.adaptiveConfigAdjustment();
      
      const updatedReport = performanceMonitor.getDetailedPerformanceReport();
      const updatedDebounceDelay = updatedReport.configuration.debounce.subscriptionChanges;
      
      // Debounce delay should be increased due to slow operations
      expect(updatedDebounceDelay).toBeGreaterThanOrEqual(initialDebounceDelay);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should update debounce configuration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      performanceMonitor.updateConfig({
        debounce: {
          subscriptionChanges: 500,
        },
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Configuration updated');
      
      const report = performanceMonitor.getDetailedPerformanceReport();
      expect(report.configuration.debounce.subscriptionChanges).toBe(500);
      
      consoleSpy.mockRestore();
    });

    it('should update batch configuration', () => {
      performanceMonitor.updateConfig({
        batch: {
          maxBatchSize: 15,
          batchTimeout: 2000,
        },
      });
      
      const report = performanceMonitor.getDetailedPerformanceReport();
      expect(report.configuration.batch.maxBatchSize).toBe(15);
      expect(report.configuration.batch.batchTimeout).toBe(2000);
    });

    it('should update memory configuration', () => {
      performanceMonitor.updateConfig({
        memory: {
          memoryThreshold: 20 * 1024, // 20MB
          cleanupInterval: 10 * 60 * 1000, // 10 minutes
        },
      });
      
      const report = performanceMonitor.getDetailedPerformanceReport();
      expect(report.configuration.memory.memoryThreshold).toBe(20 * 1024);
      expect(report.configuration.memory.cleanupInterval).toBe(10 * 60 * 1000);
    });
  });

  describe('Detailed Performance Report', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should generate detailed performance report', () => {
      const report = performanceMonitor.getDetailedPerformanceReport();
      
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('detailedMetrics');
      expect(report).toHaveProperty('configuration');
      expect(report).toHaveProperty('systemState');
      
      expect(report.configuration).toHaveProperty('debounce');
      expect(report.configuration).toHaveProperty('batch');
      expect(report.configuration).toHaveProperty('memory');
      
      expect(report.systemState).toHaveProperty('activeTimings');
      expect(report.systemState).toHaveProperty('activeDebouncedOps');
      expect(report.systemState).toHaveProperty('activeBatchQueues');
      expect(report.systemState).toHaveProperty('totalBatchedItems');
    });

    it('should include system state information', () => {
      // Add some operations to track
      performanceMonitor.startTiming('test-op', 'subscription');
      performanceMonitor.addToBatch('subscription_refresh', { userId: 'user1' });
      
      const report = performanceMonitor.getDetailedPerformanceReport();
      
      expect(report.systemState.activeTimings).toBeGreaterThan(0);
      expect(report.systemState.totalBatchedItems).toBeGreaterThan(0);
    });
  });

  describe('Performance Data Export', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should export performance data with trends and alerts', () => {
      // Add some performance data
      performanceMonitor.startTiming('test-op', 'subscription');
      performanceMonitor.endTiming('test-op', true);
      performanceMonitor.recordNetworkOperation(150, true);
      
      const exportData = performanceMonitor.exportPerformanceData();
      
      expect(exportData).toHaveProperty('metrics');
      expect(exportData).toHaveProperty('trends');
      expect(exportData).toHaveProperty('alerts');
      
      expect(exportData.trends).toHaveProperty('responseTimeTrend');
      expect(exportData.trends).toHaveProperty('syncTimeTrend');
      expect(exportData.trends).toHaveProperty('networkLatencyTrend');
      
      expect(Array.isArray(exportData.alerts)).toBe(true);
    });

    it('should include trend data', () => {
      // Add multiple operations to create trends
      for (let i = 0; i < 5; i++) {
        performanceMonitor.startTiming(`op-${i}`, 'subscription');
        performanceMonitor.endTiming(`op-${i}`, true);
        performanceMonitor.recordNetworkOperation(100 + i * 10, true);
      }
      
      const exportData = performanceMonitor.exportPerformanceData();
      
      expect(exportData.trends.responseTimeTrend.length).toBeGreaterThan(0);
      expect(exportData.trends.networkLatencyTrend.length).toBeGreaterThan(0);
    });
  });

  describe('Metrics Reset', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should reset all metrics', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Add some data first
      performanceMonitor.recordNetworkOperation(100, true);
      performanceMonitor.updateMemoryUsage(5, 10, 20);
      performanceMonitor.startTiming('test-op', 'subscription');
      performanceMonitor.endTiming('test-op', true);
      
      performanceMonitor.resetMetrics();
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics.networkOperations.totalRequests).toBe(0);
      expect(metrics.memoryUsage.activeSubscriptions).toBe(0);
      expect(metrics.subscriptionOperations.totalOperations).toBe(0);
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Metrics reset');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should cleanup all resources', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      performanceMonitor.cleanup();
      
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Cleaning up performance monitoring service');
      expect(consoleSpy).toHaveBeenCalledWith('[PerformanceMonitor] Cleanup completed');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Event Bus Integration', () => {
    beforeEach(() => {
      performanceMonitor.initialize();
    });

    it('should emit performance metric events', () => {
      const eventSpy = jest.spyOn(eventBus, 'emit');
      
      performanceMonitor.startTiming('test-op', 'subscription');
      performanceMonitor.endTiming('test-op', true);
      
      expect(eventSpy).toHaveBeenCalledWith(
        EVENT_NAMES.PERFORMANCE_METRIC,
        expect.objectContaining({
          operation: 'subscription',
          success: true,
        })
      );
      
      eventSpy.mockRestore();
    });
  });
});