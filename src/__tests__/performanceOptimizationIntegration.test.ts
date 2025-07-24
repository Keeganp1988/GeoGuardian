/**
 * Performance Optimization Integration Tests
 * Tests the integration between performance monitoring and event bus
 */

import { jest } from '@jest/globals';
import performanceMonitor from '../services/performanceMonitoringService';
import eventBus from '../services/eventBusService';
import { EVENT_NAMES } from '../types/events';

describe('Performance Optimization Integration', () => {
  beforeEach(() => {
    // Reset services
    performanceMonitor.cleanup();
    performanceMonitor.resetMetrics();
  });

  afterEach(() => {
    performanceMonitor.cleanup();
  });

  describe('Performance Monitoring with Event Bus', () => {
    it('should emit performance events during operations', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Listen for performance events
      const performanceEvents: any[] = [];
      const eventSubscription = eventBus.on(EVENT_NAMES.PERFORMANCE_METRIC, (event) => {
        performanceEvents.push(event);
      });

      // Perform operations that should emit events
      performanceMonitor.startTiming('test-op', 'subscription');
      performanceMonitor.endTiming('test-op', true);
      
      // Wait for events to be emitted
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that performance events were emitted
      expect(performanceEvents.length).toBeGreaterThan(0);
      expect(performanceEvents.some(event => event.operation === 'subscription')).toBe(true);

      // Cleanup
      eventSubscription.unsubscribe();
    });

    it('should handle batch operations for multiple sync events', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Add multiple operations to batch
      performanceMonitor.addToBatch('subscription_refresh', { userId: 'user1' }, 1);
      performanceMonitor.addToBatch('subscription_refresh', { userId: 'user2' }, 2);
      performanceMonitor.addToBatch('cache_invalidation', { cacheKey: 'test-key' }, 1);

      // Get detailed report to check batch state
      const report = performanceMonitor.getDetailedPerformanceReport();
      expect(report.systemState.totalBatchedItems).toBeGreaterThan(0);
    });

    it('should adapt configuration based on performance', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Get initial configuration
      const initialReport = performanceMonitor.getDetailedPerformanceReport();
      const initialDebounceDelay = initialReport.configuration.debounce.subscriptionChanges;

      // Simulate slow operations by directly manipulating metrics
      for (let i = 0; i < 3; i++) {
        performanceMonitor.startTiming(`slow-op-${i}`, 'subscription');
        // Simulate slow operation by manipulating timing
        const timing = (performanceMonitor as any).operationTimings.get(`slow-op-${i}`);
        if (timing) {
          timing.startTime = performance.now() - 2000; // 2 seconds ago
        }
        performanceMonitor.endTiming(`slow-op-${i}`, true);
      }

      // Trigger adaptive configuration adjustment
      performanceMonitor.adaptiveConfigAdjustment();

      // Check that configuration was adapted
      const updatedReport = performanceMonitor.getDetailedPerformanceReport();
      const updatedDebounceDelay = updatedReport.configuration.debounce.subscriptionChanges;

      expect(updatedDebounceDelay).toBeGreaterThanOrEqual(initialDebounceDelay);
    });

    it('should provide comprehensive performance summary', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Perform various operations
      performanceMonitor.recordNetworkOperation(150, true);
      performanceMonitor.updateMemoryUsage(5, 10, 20);
      
      performanceMonitor.startTiming('test-sync', 'sync');
      performanceMonitor.endTiming('test-sync', true);

      // Get performance summary
      const summary = performanceMonitor.getPerformanceSummary();

      expect(summary).toHaveProperty('health');
      expect(summary).toHaveProperty('issues');
      expect(summary).toHaveProperty('recommendations');
      expect(summary).toHaveProperty('keyMetrics');

      expect(summary.keyMetrics).toHaveProperty('subscriptionResponseTime');
      expect(summary.keyMetrics).toHaveProperty('syncRefreshTime');
      expect(summary.keyMetrics).toHaveProperty('memoryUsage');
      expect(summary.keyMetrics).toHaveProperty('networkLatency');
      expect(summary.keyMetrics).toHaveProperty('errorRate');
    });

    it('should export performance data for monitoring', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Perform operations to generate data
      performanceMonitor.recordNetworkOperation(100, true);
      performanceMonitor.recordNetworkOperation(200, true);
      
      performanceMonitor.startTiming('export-test', 'subscription');
      performanceMonitor.endTiming('export-test', true);
      
      // Export performance data
      const exportData = performanceMonitor.exportPerformanceData();

      expect(exportData).toHaveProperty('metrics');
      expect(exportData).toHaveProperty('trends');
      expect(exportData).toHaveProperty('alerts');

      expect(exportData.trends.networkLatencyTrend.length).toBeGreaterThan(0);
      expect(Array.isArray(exportData.alerts)).toBe(true);
    });
  });

  describe('Memory Optimization', () => {
    it('should perform proactive cleanup when memory usage is high', async () => {
      // Initialize services
      performanceMonitor.initialize();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Simulate high memory usage
      performanceMonitor.updateMemoryUsage(1000, 1000, 8000);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] Memory usage approaching threshold, performing proactive cleanup'
      );

      consoleSpy.mockRestore();
    });

    it('should clean up old performance data periodically', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Add some timing operations
      for (let i = 0; i < 10; i++) {
        performanceMonitor.startTiming(`op-${i}`, 'subscription');
        performanceMonitor.endTiming(`op-${i}`, true);
      }

      // Get initial state
      const initialReport = performanceMonitor.getDetailedPerformanceReport();
      const initialActiveTimings = initialReport.systemState.activeTimings;

      // Trigger cleanup (this would normally happen automatically)
      (performanceMonitor as any).performMemoryCleanup();

      // Check that cleanup occurred
      const finalReport = performanceMonitor.getDetailedPerformanceReport();
      // Active timings should be 0 since all operations completed
      expect(finalReport.systemState.activeTimings).toBe(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle subscription errors gracefully', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Simulate subscription error
      performanceMonitor.startTiming('error-op', 'subscription');
      performanceMonitor.endTiming('error-op', false, 'Subscription failed');

      const metrics = performanceMonitor.getMetrics();
      expect(metrics.subscriptionOperations.totalOperations).toBe(1);
      
      // Error rate should be calculated
      const summary = performanceMonitor.getPerformanceSummary();
      expect(summary.keyMetrics.errorRate).toBeGreaterThan(0);
    });

    it('should provide recovery recommendations for performance issues', async () => {
      // Initialize services
      performanceMonitor.initialize();

      // Simulate performance issues
      for (let i = 0; i < 5; i++) {
        performanceMonitor.startTiming(`slow-op-${i}`, 'sync');
        const timing = (performanceMonitor as any).operationTimings.get(`slow-op-${i}`);
        if (timing) {
          timing.startTime = performance.now() - 6000; // 6 seconds ago
        }
        performanceMonitor.endTiming(`slow-op-${i}`, true);
      }

      const summary = performanceMonitor.getPerformanceSummary();
      
      expect(summary.health).toBe('warning');
      expect(summary.recommendations.length).toBeGreaterThan(0);
      expect(summary.recommendations.some(rec => 
        rec.includes('incremental sync') || rec.includes('reducing data payload')
      )).toBe(true);
    });
  });
});