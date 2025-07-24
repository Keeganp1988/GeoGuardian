/**
 * Performance Optimization and Monitoring Service
 * Provides debouncing, batch processing, performance metrics, and memory optimization
 * for the live view sync system
 */

import eventBus from './eventBusService';
import { EVENT_NAMES, PerformanceMetricEvent } from '../types/events';

// Performance metrics interfaces
export interface PerformanceMetrics {
  subscriptionOperations: {
    totalOperations: number;
    averageResponseTime: number;
    successRate: number;
    errorRate: number;
    lastOperationTime?: Date;
  };
  syncOperations: {
    totalSyncs: number;
    averageRefreshTime: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncTime?: Date;
  };
  memoryUsage: {
    activeSubscriptions: number;
    eventListeners: number;
    cacheEntries: number;
    estimatedMemoryUsage: number; // in KB
  };
  networkOperations: {
    totalRequests: number;
    averageLatency: number;
    timeouts: number;
    retries: number;
  };
  batchOperations: {
    totalBatches: number;
    averageBatchSize: number;
    batchProcessingTime: number;
    itemsProcessed: number;
  };
}

export interface DebounceConfig {
  subscriptionChanges: number;
  syncOperations: number;
  cacheInvalidation: number;
  eventEmission: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchTimeout: number;
  maxConcurrentBatches: number;
}

export interface MemoryOptimizationConfig {
  maxSubscriptionHistory: number;
  maxEventHistory: number;
  cleanupInterval: number;
  memoryThreshold: number; // in KB
}

// Operation timing interface
interface OperationTiming {
  startTime: number;
  endTime?: number;
  duration?: number;
  operation: string;
  success?: boolean;
  error?: string;
}

// Batch operation interface
interface BatchOperation<T = any> {
  id: string;
  operation: string;
  data: T;
  timestamp: Date;
  priority: number;
}

// Debounced operation interface
interface DebouncedOperation {
  id: string;
  operation: () => Promise<void>;
  timeout: NodeJS.Timeout;
  lastCall: Date;
}

class PerformanceMonitoringService {
  private metrics: PerformanceMetrics = {
    subscriptionOperations: {
      totalOperations: 0,
      averageResponseTime: 0,
      successRate: 100,
      errorRate: 0,
    },
    syncOperations: {
      totalSyncs: 0,
      averageRefreshTime: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
    },
    memoryUsage: {
      activeSubscriptions: 0,
      eventListeners: 0,
      cacheEntries: 0,
      estimatedMemoryUsage: 0,
    },
    networkOperations: {
      totalRequests: 0,
      averageLatency: 0,
      timeouts: 0,
      retries: 0,
    },
    batchOperations: {
      totalBatches: 0,
      averageBatchSize: 0,
      batchProcessingTime: 0,
      itemsProcessed: 0,
    },
  };

  private debounceConfig: DebounceConfig = {
    subscriptionChanges: 300, // 300ms
    syncOperations: 500, // 500ms
    cacheInvalidation: 200, // 200ms
    eventEmission: 100, // 100ms
  };

  private batchConfig: BatchConfig = {
    maxBatchSize: 10,
    batchTimeout: 1000, // 1 second
    maxConcurrentBatches: 3,
  };

  private memoryConfig: MemoryOptimizationConfig = {
    maxSubscriptionHistory: 100,
    maxEventHistory: 50,
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    memoryThreshold: 10 * 1024, // 10MB
  };

  // Internal state
  private operationTimings: Map<string, OperationTiming> = new Map();
  private debouncedOperations: Map<string, DebouncedOperation> = new Map();
  private batchQueues: Map<string, BatchOperation[]> = new Map();
  private batchTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private activeBatches = 0;
  private cleanupInterval?: NodeJS.Timeout;
  private isInitialized = false;

  // Response time tracking
  private responseTimeHistory: number[] = [];
  private syncTimeHistory: number[] = [];
  private networkLatencyHistory: number[] = [];

  /**
   * Initialize the performance monitoring service
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log('[PerformanceMonitor] Already initialized');
      return;
    }

    console.log('[PerformanceMonitor] Initializing performance monitoring service');

    // Start memory cleanup interval
    this.startMemoryCleanup();

    // Listen for performance-related events
    this.setupEventListeners();

    this.isInitialized = true;
    console.log('[PerformanceMonitor] Performance monitoring initialized');
  }

  /**
   * Debounce rapid subscription changes
   * @param operationId - Unique identifier for the operation
   * @param operation - The operation to debounce
   * @param delay - Optional custom delay (uses config default if not provided)
   */
  debounceSubscriptionChange(
    operationId: string,
    operation: () => Promise<void>,
    delay?: number
  ): void {
    const debounceDelay = delay ?? this.debounceConfig.subscriptionChanges;
    this.debounceOperation(operationId, operation, debounceDelay, 'subscription_change');
  }

  /**
   * Debounce sync operations
   * @param operationId - Unique identifier for the operation
   * @param operation - The operation to debounce
   * @param delay - Optional custom delay
   */
  debounceSyncOperation(
    operationId: string,
    operation: () => Promise<void>,
    delay?: number
  ): void {
    const debounceDelay = delay ?? this.debounceConfig.syncOperations;
    this.debounceOperation(operationId, operation, debounceDelay, 'sync_operation');
  }

  /**
   * Debounce cache invalidation operations
   * @param operationId - Unique identifier for the operation
   * @param operation - The operation to debounce
   * @param delay - Optional custom delay
   */
  debounceCacheInvalidation(
    operationId: string,
    operation: () => Promise<void>,
    delay?: number
  ): void {
    const debounceDelay = delay ?? this.debounceConfig.cacheInvalidation;
    this.debounceOperation(operationId, operation, debounceDelay, 'cache_invalidation');
  }

  /**
   * Add operation to batch queue for processing
   * @param batchType - Type of batch operation
   * @param operation - The operation data
   * @param priority - Priority level (higher = more important)
   */
  addToBatch<T>(batchType: string, operation: T, priority: number = 0): void {
    if (!this.batchQueues.has(batchType)) {
      this.batchQueues.set(batchType, []);
    }

    const batch = this.batchQueues.get(batchType)!;

    // Check for duplicate operations to avoid redundant processing
    const isDuplicate = batch.some(existing =>
      JSON.stringify(existing.data) === JSON.stringify(operation)
    );

    if (isDuplicate) {
      console.debug(`[PerformanceMonitor] Skipping duplicate ${batchType} operation`);
      return;
    }

    const batchOperation: BatchOperation<T> = {
      id: `${batchType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation: batchType,
      data: operation,
      timestamp: new Date(),
      priority,
    };

    batch.push(batchOperation);

    // Sort by priority (higher priority first)
    batch.sort((a, b) => b.priority - a.priority);

    // Process batch if it reaches max size
    if (batch.length >= this.batchConfig.maxBatchSize) {
      this.processBatch(batchType);
    } else {
      // Set timeout to process batch if it doesn't reach max size
      this.setBatchTimeout(batchType);
    }
  }

  /**
   * Start timing an operation
   * @param operationId - Unique identifier for the operation
   * @param operationType - Type of operation for metrics
   */
  startTiming(operationId: string, operationType: string): void {
    const timing: OperationTiming = {
      startTime: performance.now(),
      operation: operationType,
    };

    this.operationTimings.set(operationId, timing);
  }

  /**
   * End timing an operation and record metrics
   * @param operationId - Unique identifier for the operation
   * @param success - Whether the operation was successful
   * @param error - Error message if operation failed
   */
  endTiming(operationId: string, success: boolean = true, error?: string): void {
    const timing = this.operationTimings.get(operationId);
    if (!timing) {
      console.warn(`[PerformanceMonitor] No timing found for operation: ${operationId}`);
      return;
    }

    timing.endTime = performance.now();
    timing.duration = timing.endTime - timing.startTime;
    timing.success = success;
    timing.error = error;

    // Update metrics based on operation type
    this.updateMetricsFromTiming(timing);

    // Clean up timing record
    this.operationTimings.delete(operationId);

    // Emit performance metric event
    this.emitPerformanceMetric(timing);
  }

  /**
   * Record network operation metrics
   * @param latency - Network latency in milliseconds
   * @param success - Whether the request was successful
   * @param isRetry - Whether this was a retry attempt
   * @param isTimeout - Whether the request timed out
   */
  recordNetworkOperation(
    latency: number,
    success: boolean,
    isRetry: boolean = false,
    isTimeout: boolean = false
  ): void {
    this.metrics.networkOperations.totalRequests++;

    if (success) {
      this.networkLatencyHistory.push(latency);
      this.metrics.networkOperations.averageLatency = this.calculateAverage(this.networkLatencyHistory);
    }

    if (isRetry) {
      this.metrics.networkOperations.retries++;
    }

    if (isTimeout) {
      this.metrics.networkOperations.timeouts++;
    }

    // Keep history size manageable
    if (this.networkLatencyHistory.length > this.memoryConfig.maxEventHistory) {
      this.networkLatencyHistory = this.networkLatencyHistory.slice(-this.memoryConfig.maxEventHistory);
    }
  }

  /**
   * Update memory usage metrics
   * @param subscriptions - Number of active subscriptions
   * @param eventListeners - Number of event listeners
   * @param cacheEntries - Number of cache entries
   */
  updateMemoryUsage(subscriptions: number, eventListeners: number, cacheEntries: number): void {
    this.metrics.memoryUsage.activeSubscriptions = subscriptions;
    this.metrics.memoryUsage.eventListeners = eventListeners;
    this.metrics.memoryUsage.cacheEntries = cacheEntries;

    // Estimate memory usage (rough calculation)
    const estimatedUsage =
      (subscriptions * 0.5) + // ~0.5KB per subscription
      (eventListeners * 0.2) + // ~0.2KB per event listener
      (cacheEntries * 1.0) + // ~1KB per cache entry
      (this.operationTimings.size * 0.1) + // ~0.1KB per timing record
      (this.debouncedOperations.size * 0.3) + // ~0.3KB per debounced operation
      (this.batchQueues.size * 0.2) + // ~0.2KB per batch queue
      (this.responseTimeHistory.length * 0.01) + // ~0.01KB per history entry
      (this.syncTimeHistory.length * 0.01) + // ~0.01KB per history entry
      (this.networkLatencyHistory.length * 0.01); // ~0.01KB per history entry

    this.metrics.memoryUsage.estimatedMemoryUsage = estimatedUsage;

    // Check if memory usage exceeds threshold
    if (estimatedUsage > this.memoryConfig.memoryThreshold) {
      console.warn(`[PerformanceMonitor] Memory usage (${estimatedUsage.toFixed(2)}KB) exceeds threshold (${this.memoryConfig.memoryThreshold}KB)`);
      this.performMemoryCleanup();
    }

    // Proactive cleanup at 80% threshold
    if (estimatedUsage > this.memoryConfig.memoryThreshold * 0.8) {
      console.log(`[PerformanceMonitor] Memory usage approaching threshold, performing proactive cleanup`);
      this.performProactiveCleanup();
    }
  }

  /**
   * Get current performance metrics
   * @returns Current performance metrics
   */
  getMetrics(): Readonly<PerformanceMetrics> {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  /**
   * Get performance summary for monitoring dashboards
   */
  getPerformanceSummary(): {
    health: 'good' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    keyMetrics: Record<string, number>;
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let health: 'good' | 'warning' | 'critical' = 'good';

    // Check subscription performance
    if (this.metrics.subscriptionOperations.errorRate > 10) {
      issues.push(`High subscription error rate: ${this.metrics.subscriptionOperations.errorRate.toFixed(1)}%`);
      health = 'warning';
    }

    if (this.metrics.subscriptionOperations.averageResponseTime > 2000) {
      issues.push(`Slow subscription response time: ${this.metrics.subscriptionOperations.averageResponseTime.toFixed(0)}ms`);
      recommendations.push('Consider optimizing subscription logic or reducing batch sizes');
      health = 'warning';
    }

    // Check sync performance
    if (this.metrics.syncOperations.failedSyncs > this.metrics.syncOperations.successfulSyncs * 0.1) {
      issues.push('High sync failure rate');
      health = 'critical';
    }

    if (this.metrics.syncOperations.averageRefreshTime > 5000) {
      issues.push(`Slow sync refresh time: ${this.metrics.syncOperations.averageRefreshTime.toFixed(0)}ms`);
      recommendations.push('Consider implementing incremental sync or reducing data payload');
      health = 'warning';
    }

    // Check memory usage
    if (this.metrics.memoryUsage.estimatedMemoryUsage > this.memoryConfig.memoryThreshold * 0.8) {
      issues.push(`High memory usage: ${this.metrics.memoryUsage.estimatedMemoryUsage.toFixed(2)}KB`);
      recommendations.push('Consider reducing cache size or implementing more aggressive cleanup');
      if (this.metrics.memoryUsage.estimatedMemoryUsage > this.memoryConfig.memoryThreshold) {
        health = 'critical';
      } else {
        health = 'warning';
      }
    }

    // Check network performance
    if (this.metrics.networkOperations.timeouts > this.metrics.networkOperations.totalRequests * 0.05) {
      issues.push('High network timeout rate');
      recommendations.push('Consider increasing timeout values or implementing better retry logic');
      health = 'warning';
    }

    return {
      health,
      issues,
      recommendations,
      keyMetrics: {
        subscriptionResponseTime: this.metrics.subscriptionOperations.averageResponseTime,
        syncRefreshTime: this.metrics.syncOperations.averageRefreshTime,
        memoryUsage: this.metrics.memoryUsage.estimatedMemoryUsage,
        networkLatency: this.metrics.networkOperations.averageLatency,
        errorRate: this.metrics.subscriptionOperations.errorRate,
      },
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    debounce?: Partial<DebounceConfig>;
    batch?: Partial<BatchConfig>;
    memory?: Partial<MemoryOptimizationConfig>;
  }): void {
    if (config.debounce) {
      this.debounceConfig = { ...this.debounceConfig, ...config.debounce };
    }

    if (config.batch) {
      this.batchConfig = { ...this.batchConfig, ...config.batch };
    }

    if (config.memory) {
      this.memoryConfig = { ...this.memoryConfig, ...config.memory };
    }

    console.log('[PerformanceMonitor] Configuration updated');
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      subscriptionOperations: {
        totalOperations: 0,
        averageResponseTime: 0,
        successRate: 100,
        errorRate: 0,
      },
      syncOperations: {
        totalSyncs: 0,
        averageRefreshTime: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
      },
      memoryUsage: {
        activeSubscriptions: 0,
        eventListeners: 0,
        cacheEntries: 0,
        estimatedMemoryUsage: 0,
      },
      networkOperations: {
        totalRequests: 0,
        averageLatency: 0,
        timeouts: 0,
        retries: 0,
      },
      batchOperations: {
        totalBatches: 0,
        averageBatchSize: 0,
        batchProcessingTime: 0,
        itemsProcessed: 0,
      },
    };

    this.responseTimeHistory = [];
    this.syncTimeHistory = [];
    this.networkLatencyHistory = [];

    console.log('[PerformanceMonitor] Metrics reset');
  }

  /**
   * Adaptive configuration adjustment based on performance metrics
   */
  adaptiveConfigAdjustment(): void {
    const summary = this.getPerformanceSummary();

    // Adjust debounce timings based on performance
    if (this.metrics.subscriptionOperations.averageResponseTime > 1000) {
      // Increase debounce delays to reduce load
      this.debounceConfig.subscriptionChanges = Math.min(
        this.debounceConfig.subscriptionChanges * 1.2,
        1000
      );
      console.log(`[PerformanceMonitor] Increased subscription debounce to ${this.debounceConfig.subscriptionChanges}ms due to slow response times`);
    } else if (this.metrics.subscriptionOperations.averageResponseTime < 200) {
      // Decrease debounce delays for better responsiveness
      this.debounceConfig.subscriptionChanges = Math.max(
        this.debounceConfig.subscriptionChanges * 0.9,
        100
      );
    }

    // Adjust batch sizes based on processing time
    if (this.metrics.batchOperations.batchProcessingTime > 2000) {
      // Reduce batch size to improve processing time
      this.batchConfig.maxBatchSize = Math.max(
        Math.floor(this.batchConfig.maxBatchSize * 0.8),
        3
      );
      console.log(`[PerformanceMonitor] Reduced batch size to ${this.batchConfig.maxBatchSize} due to slow processing`);
    } else if (this.metrics.batchOperations.batchProcessingTime < 500) {
      // Increase batch size for better efficiency
      this.batchConfig.maxBatchSize = Math.min(
        Math.floor(this.batchConfig.maxBatchSize * 1.1),
        20
      );
    }

    // Adjust memory cleanup frequency based on usage
    if (this.metrics.memoryUsage.estimatedMemoryUsage > this.memoryConfig.memoryThreshold * 0.7) {
      // More frequent cleanup
      this.memoryConfig.cleanupInterval = Math.max(
        this.memoryConfig.cleanupInterval * 0.8,
        60000 // Minimum 1 minute
      );
      console.log(`[PerformanceMonitor] Increased cleanup frequency due to high memory usage`);
    }
  }

  /**
   * Get detailed performance report for debugging
   */
  getDetailedPerformanceReport(): {
    timestamp: Date;
    summary: {
      health: 'good' | 'warning' | 'critical';
      issues: string[];
      recommendations: string[];
      keyMetrics: Record<string, number>;
    };
    detailedMetrics: PerformanceMetrics;
    configuration: {
      debounce: DebounceConfig;
      batch: BatchConfig;
      memory: MemoryOptimizationConfig;
    };
    systemState: {
      activeTimings: number;
      activeDebouncedOps: number;
      activeBatchQueues: number;
      totalBatchedItems: number;
    };
  } {
    const totalBatchedItems = Array.from(this.batchQueues.values())
      .reduce((total, queue) => total + queue.length, 0);

    return {
      timestamp: new Date(),
      summary: this.getPerformanceSummary(),
      detailedMetrics: this.getMetrics(),
      configuration: {
        debounce: { ...this.debounceConfig },
        batch: { ...this.batchConfig },
        memory: { ...this.memoryConfig },
      },
      systemState: {
        activeTimings: this.operationTimings.size,
        activeDebouncedOps: this.debouncedOperations.size,
        activeBatchQueues: this.batchQueues.size,
        totalBatchedItems,
      },
    };
  }

  /**
   * Export performance data for external monitoring
   */
  exportPerformanceData(): {
    metrics: PerformanceMetrics;
    trends: {
      responseTimeTrend: number[]; // Last 10 response times
      syncTimeTrend: number[]; // Last 10 sync times
      networkLatencyTrend: number[]; // Last 10 network latencies
    };
    alerts: Array<{
      level: 'warning' | 'critical';
      message: string;
      timestamp: Date;
    }>;
  } {
    const alerts: Array<{ level: 'warning' | 'critical'; message: string; timestamp: Date }> = [];
    const summary = this.getPerformanceSummary();

    // Generate alerts based on performance issues
    (summary.issues ?? []).forEach(issue => {
      const level = summary.health === 'critical' ? 'critical' : 'warning';
      alerts.push({
        level,
        message: issue,
        timestamp: new Date(),
      });
    });

    return {
      metrics: this.getMetrics(),
      trends: {
        responseTimeTrend: this.responseTimeHistory.slice(-10),
        syncTimeTrend: this.syncTimeHistory.slice(-10),
        networkLatencyTrend: this.networkLatencyHistory.slice(-10),
      },
      alerts,
    };
  }

  /**
   * Cleanup and shutdown
   */
  cleanup(): void {
    console.log('[PerformanceMonitor] Cleaning up performance monitoring service');

    // Clear all debounced operations
    (Array.from(this.debouncedOperations.values()) ?? []).forEach(op => clearTimeout(op.timeout));
    this.debouncedOperations.clear();

    // Clear all batch timeouts
    (Array.from(this.batchTimeouts.values()) ?? []).forEach(timeout => clearTimeout(timeout));
    this.batchTimeouts.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear all data
    this.operationTimings.clear();
    this.batchQueues.clear();
    this.responseTimeHistory = [];
    this.syncTimeHistory = [];
    this.networkLatencyHistory = [];

    this.isInitialized = false;
    console.log('[PerformanceMonitor] Cleanup completed');
  }

  /**
   * Generic debounce operation implementation
   */
  private debounceOperation(
    operationId: string,
    operation: () => Promise<void>,
    delay: number,
    operationType: string
  ): void {
    // Clear existing debounced operation if it exists
    const existing = this.debouncedOperations.get(operationId);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Create new debounced operation
    const timeout = setTimeout(async () => {
      try {
        const startTime = performance.now();
        await operation();
        const endTime = performance.now();

        // Record successful debounced operation
        console.log(`[PerformanceMonitor] Debounced ${operationType} completed in ${(endTime - startTime).toFixed(2)}ms`);
      } catch (error) {
        console.error(`[PerformanceMonitor] Debounced ${operationType} failed:`, error);
      } finally {
        this.debouncedOperations.delete(operationId);
      }
    }, delay);

    this.debouncedOperations.set(operationId, {
      id: operationId,
      operation,
      timeout,
      lastCall: new Date(),
    });
  }

  /**
   * Set timeout for batch processing
   */
  private setBatchTimeout(batchType: string): void {
    // Clear existing timeout
    const existingTimeout = this.batchTimeouts.get(batchType);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.processBatch(batchType);
    }, this.batchConfig.batchTimeout);

    this.batchTimeouts.set(batchType, timeout);
  }

  /**
   * Process a batch of operations
   */
  private async processBatch(batchType: string): Promise<void> {
    const batch = this.batchQueues.get(batchType);
    if (!batch || batch.length === 0) {
      return;
    }

    // Check if we can process more batches
    if (this.activeBatches >= this.batchConfig.maxConcurrentBatches) {
      console.log(`[PerformanceMonitor] Max concurrent batches reached, deferring ${batchType} batch`);
      return;
    }

    // Clear timeout
    const timeout = this.batchTimeouts.get(batchType);
    if (timeout) {
      clearTimeout(timeout);
      this.batchTimeouts.delete(batchType);
    }

    // Take operations from queue
    const operations = batch.splice(0, this.batchConfig.maxBatchSize);
    this.activeBatches++;

    const startTime = performance.now();

    try {
      console.log(`[PerformanceMonitor] Processing batch of ${operations.length} ${batchType} operations`);

      // Process operations based on type
      await this.executeBatchOperations(batchType, operations);

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Update batch metrics
      this.metrics.batchOperations.totalBatches++;
      this.metrics.batchOperations.itemsProcessed += operations.length;
      this.metrics.batchOperations.averageBatchSize =
        this.metrics.batchOperations.itemsProcessed / this.metrics.batchOperations.totalBatches;
      this.metrics.batchOperations.batchProcessingTime =
        (this.metrics.batchOperations.batchProcessingTime + processingTime) / 2;

      console.log(`[PerformanceMonitor] Batch processed in ${processingTime.toFixed(2)}ms`);
    } catch (error) {
      console.error(`[PerformanceMonitor] Batch processing failed for ${batchType}:`, error);
    } finally {
      this.activeBatches--;

      // Process remaining operations if any
      if (batch.length > 0) {
        this.setBatchTimeout(batchType);
      }
    }
  }

  /**
   * Execute batch operations based on type
   */
  private async executeBatchOperations(batchType: string, operations: BatchOperation[]): Promise<void> {
    switch (batchType) {
      case 'subscription_refresh':
        // Batch subscription refresh operations
        await this.batchSubscriptionRefresh(operations);
        break;

      case 'cache_invalidation':
        // Batch cache invalidation operations
        await this.batchCacheInvalidation(operations);
        break;

      case 'event_emission':
        // Batch event emission operations
        await this.batchEventEmission(operations);
        break;

      default:
        console.warn(`[PerformanceMonitor] Unknown batch type: ${batchType}`);
        break;
    }
  }

  /**
   * Batch subscription refresh operations
   */
  private async batchSubscriptionRefresh(operations: BatchOperation[]): Promise<void> {
    // Group operations by user ID to avoid duplicate refreshes
    const userIds = new Set<string>();
    (operations ?? []).forEach(op => {
      if (op.data && typeof op.data === 'object' && 'userId' in op.data) {
        userIds.add((op.data as any).userId);
      }
    });

    console.log(`[PerformanceMonitor] Batch refreshing subscriptions for ${userIds.size} users`);

    // Emit batch refresh event
    eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
      timestamp: new Date(),
      reason: 'batch_operation',
      source: 'PerformanceMonitor',
      affectedUserIds: Array.from(userIds),
    });
  }

  /**
   * Batch cache invalidation operations
   */
  private async batchCacheInvalidation(operations: BatchOperation[]): Promise<void> {
    // Collect all cache keys to invalidate
    const cacheKeys = new Set<string>();
    (operations ?? []).forEach(op => {
      if (op.data && typeof op.data === 'object' && 'cacheKey' in op.data) {
        cacheKeys.add((op.data as any).cacheKey);
      }
    });

    console.log(`[PerformanceMonitor] Batch invalidating ${cacheKeys.size} cache keys`);

    // Emit batch cache invalidation event
    eventBus.emit(EVENT_NAMES.CACHE_INVALIDATED, {
      cacheKeys: Array.from(cacheKeys),
      timestamp: new Date(),
      source: 'PerformanceMonitor',
    });
  }

  /**
   * Batch event emission operations
   */
  private async batchEventEmission(operations: BatchOperation[]): Promise<void> {
    // Group events by type and emit them
    const eventGroups = new Map<string, any[]>();

    (operations ?? []).forEach(op => {
      if (op.data && typeof op.data === 'object' && 'eventType' in op.data && 'eventData' in op.data) {
        const { eventType, eventData } = op.data as any;
        if (!eventGroups.has(eventType)) {
          eventGroups.set(eventType, []);
        }
        eventGroups.get(eventType)!.push(eventData);
      }
    });

    // Emit grouped events
    (Array.from(eventGroups.entries()) ?? []).forEach(([eventType, eventDataArray]) => {
      console.log(`[PerformanceMonitor] Batch emitting ${eventDataArray.length} ${eventType} events`);
      eventBus.emit(eventType as any, {
        batchData: eventDataArray,
        timestamp: new Date(),
        source: 'PerformanceMonitor',
      });
    });
  }

  /**
   * Update metrics from operation timing
   */
  private updateMetricsFromTiming(timing: OperationTiming): void {
    if (timing.duration === undefined || timing.duration === null) return;

    switch (timing.operation) {
      case 'subscription':
        this.metrics.subscriptionOperations.totalOperations++;
        this.responseTimeHistory.push(timing.duration);
        this.metrics.subscriptionOperations.averageResponseTime = this.calculateAverage(this.responseTimeHistory);

        if (timing.success) {
          this.metrics.subscriptionOperations.successRate =
            ((this.metrics.subscriptionOperations.totalOperations - 1) * this.metrics.subscriptionOperations.successRate + 100) /
            this.metrics.subscriptionOperations.totalOperations;
        } else {
          this.metrics.subscriptionOperations.errorRate =
            (this.metrics.subscriptionOperations.errorRate * (this.metrics.subscriptionOperations.totalOperations - 1) + 100) /
            this.metrics.subscriptionOperations.totalOperations;
        }
        this.metrics.subscriptionOperations.lastOperationTime = new Date();
        break;

      case 'sync':
        this.metrics.syncOperations.totalSyncs++;
        this.syncTimeHistory.push(timing.duration);
        this.metrics.syncOperations.averageRefreshTime = this.calculateAverage(this.syncTimeHistory);

        if (timing.success) {
          this.metrics.syncOperations.successfulSyncs++;
        } else {
          this.metrics.syncOperations.failedSyncs++;
        }
        this.metrics.syncOperations.lastSyncTime = new Date();
        break;
    }

    // Keep history size manageable
    if (this.responseTimeHistory.length > this.memoryConfig.maxEventHistory) {
      this.responseTimeHistory = this.responseTimeHistory.slice(-this.memoryConfig.maxEventHistory);
    }
    if (this.syncTimeHistory.length > this.memoryConfig.maxEventHistory) {
      this.syncTimeHistory = this.syncTimeHistory.slice(-this.memoryConfig.maxEventHistory);
    }
  }

  /**
   * Calculate average from array of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  /**
   * Emit performance metric event
   */
  private emitPerformanceMetric(timing: OperationTiming): void {
    const metricEvent: PerformanceMetricEvent = {
      operation: timing.operation,
      duration: timing.duration!,
      success: timing.success!,
      error: timing.error,
      timestamp: new Date(),
      source: 'PerformanceMonitor',
    };

    eventBus.emit(EVENT_NAMES.PERFORMANCE_METRIC, metricEvent);
  }

  /**
   * Setup event listeners for automatic metric collection
   */
  private setupEventListeners(): void {
    // Listen for sync events to automatically track performance
    eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, () => {
      this.startTiming('auto_sync', 'sync');
    });

    eventBus.on(EVENT_NAMES.SUCCESS_EVENT, (event) => {
      if (event && typeof event === 'object' && 'operation' in event) {
        this.endTiming('auto_sync', true);
      }
    });

    eventBus.on(EVENT_NAMES.ERROR_EVENT, (event) => {
      if (event && typeof event === 'object' && 'operation' in event) {
        this.endTiming('auto_sync', false, (event as any).error);
      }
    });
  }

  /**
   * Start memory cleanup interval
   */
  private startMemoryCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performMemoryCleanup();
    }, this.memoryConfig.cleanupInterval);
  }

  /**
   * Perform memory cleanup
   */
  private performMemoryCleanup(): void {
    console.log('[PerformanceMonitor] Performing memory cleanup');

    // Clean up old operation timings
    const now = Date.now();
    const oldTimings: string[] = [];

    (Array.from(this.operationTimings.entries()) ?? []).forEach(([id, timing]) => {
      if (now - timing.startTime > 60000) { // 1 minute old
        oldTimings.push(id);
      }
    });

    (oldTimings ?? []).forEach(id => this.operationTimings.delete(id));

    // Clean up old debounced operations
    const oldDebounced: string[] = [];
    (Array.from(this.debouncedOperations.entries()) ?? []).forEach(([id, op]) => {
      if (now - op.lastCall.getTime() > 300000) { // 5 minutes old
        clearTimeout(op.timeout);
        oldDebounced.push(id);
      }
    });

    (oldDebounced ?? []).forEach(id => this.debouncedOperations.delete(id));

    // Trim history arrays
    if (this.responseTimeHistory.length > this.memoryConfig.maxEventHistory) {
      this.responseTimeHistory = this.responseTimeHistory.slice(-this.memoryConfig.maxEventHistory);
    }
    if (this.syncTimeHistory.length > this.memoryConfig.maxEventHistory) {
      this.syncTimeHistory = this.syncTimeHistory.slice(-this.memoryConfig.maxEventHistory);
    }
    if (this.networkLatencyHistory.length > this.memoryConfig.maxEventHistory) {
      this.networkLatencyHistory = this.networkLatencyHistory.slice(-this.memoryConfig.maxEventHistory);
    }

    console.log(`[PerformanceMonitor] Cleanup completed - removed ${oldTimings.length} timings, ${oldDebounced.length} debounced operations`);
  }

  /**
   * Perform proactive cleanup when memory usage approaches threshold
   */
  private performProactiveCleanup(): void {
    console.log('[PerformanceMonitor] Performing proactive memory cleanup');

    const now = Date.now();

    // More aggressive cleanup for operation timings (30 seconds instead of 1 minute)
    const oldTimings: string[] = [];
    (Array.from(this.operationTimings.entries()) ?? []).forEach(([id, timing]) => {
      if (now - timing.startTime > 30000) { // 30 seconds old
        oldTimings.push(id);
      }
    });
    (oldTimings ?? []).forEach(id => this.operationTimings.delete(id));

    // More aggressive cleanup for debounced operations (2 minutes instead of 5 minutes)
    const oldDebounced: string[] = [];
    (Array.from(this.debouncedOperations.entries()) ?? []).forEach(([id, op]) => {
      if (now - op.lastCall.getTime() > 120000) { // 2 minutes old
        clearTimeout(op.timeout);
        oldDebounced.push(id);
      }
    });
    (oldDebounced ?? []).forEach(id => this.debouncedOperations.delete(id));

    // Trim history arrays to 75% of max size
    const targetHistorySize = Math.floor(this.memoryConfig.maxEventHistory * 0.75);

    if (this.responseTimeHistory.length > targetHistorySize) {
      this.responseTimeHistory = this.responseTimeHistory.slice(-targetHistorySize);
    }
    if (this.syncTimeHistory.length > targetHistorySize) {
      this.syncTimeHistory = this.syncTimeHistory.slice(-targetHistorySize);
    }
    if (this.networkLatencyHistory.length > targetHistorySize) {
      this.networkLatencyHistory = this.networkLatencyHistory.slice(-targetHistorySize);
    }

    // Clear old batch operations
    const oldBatches: string[] = [];
    (Array.from(this.batchQueues.entries()) ?? []).forEach(([batchType, operations]) => {
      const filteredOps = operations.filter(op =>
        now - op.timestamp.getTime() < 60000 // Keep operations less than 1 minute old
      );
      if (filteredOps.length !== operations.length) {
        this.batchQueues.set(batchType, filteredOps);
        oldBatches.push(batchType);
      }
    });

    console.log(`[PerformanceMonitor] Proactive cleanup completed - removed ${oldTimings.length} timings, ${oldDebounced.length} debounced operations, cleaned ${oldBatches.length} batch queues`);
  }
}

// Create and export singleton instance
export const performanceMonitor = new PerformanceMonitoringService();
export default performanceMonitor;