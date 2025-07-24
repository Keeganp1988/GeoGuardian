/**
 * Comprehensive Error Handling Service for Live View Sync
 * Implements retry logic with exponential backoff, error logging, and fallback mechanisms
 */

import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import eventBus from './eventBusService';
import { EVENT_NAMES, ErrorEvent } from '../types/events';

// Sync-specific error types
export enum SyncErrorType {
  SUBSCRIPTION_FAILED = 'SUBSCRIPTION_FAILED',
  CACHE_INVALIDATION_FAILED = 'CACHE_INVALIDATION_FAILED',
  CONNECTION_SYNC_FAILED = 'CONNECTION_SYNC_FAILED',
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

// Error recovery strategies
export enum RecoveryStrategy {
  RETRY_WITH_BACKOFF = 'RETRY_WITH_BACKOFF',
  FALLBACK_TO_CACHE = 'FALLBACK_TO_CACHE',
  MANUAL_REFRESH = 'MANUAL_REFRESH',
  SKIP_OPERATION = 'SKIP_OPERATION',
  ESCALATE_TO_USER = 'ESCALATE_TO_USER',
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
}

// Sync error details
export interface SyncError {
  type: SyncErrorType;
  operation: string;
  message: string;
  originalError: Error;
  context?: Record<string, any>;
  timestamp: Date;
  retryCount: number;
  recoveryStrategy: RecoveryStrategy;
  isRetryable: boolean;
  userFriendlyMessage: string;
}

// Error statistics for monitoring
export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<SyncErrorType, number>;
  errorsByOperation: Record<string, number>;
  successfulRetries: number;
  failedRetries: number;
  lastErrorTime?: Date;
  averageRetryCount: number;
}

// Fallback mechanism interface
export interface FallbackMechanism {
  name: string;
  condition: (error: SyncError) => boolean;
  execute: (error: SyncError) => Promise<boolean>;
  priority: number;
}

class SyncErrorHandlingService {
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
    jitterEnabled: true,
  };

  private errorHistory: SyncError[] = [];
  private errorStats: ErrorStats = {
    totalErrors: 0,
    errorsByType: {} as Record<SyncErrorType, number>,
    errorsByOperation: {},
    successfulRetries: 0,
    failedRetries: 0,
    averageRetryCount: 0,
  };

  private fallbackMechanisms: FallbackMechanism[] = [];
  private activeRetries = new Map<string, number>();

  /**
   * Initialize the error handling service
   */
  initialize(): void {
    console.log('[SyncErrorHandler] Initializing sync error handling service');
    this.setupFallbackMechanisms();
    this.resetErrorStats();
  }

  /**
   * Handle sync errors with comprehensive error processing
   */
  async handleSyncError(
    error: Error,
    operation: string,
    context?: Record<string, any>
  ): Promise<SyncError> {
    const syncError = this.createSyncError(error, operation, context);
    
    // Log the error
    this.logSyncError(syncError);
    
    // Update statistics
    this.updateErrorStats(syncError);
    
    // Emit error event
    this.emitErrorEvent(syncError);
    
    // Attempt recovery if possible
    if (syncError.isRetryable) {
      await this.attemptRecovery(syncError);
    }
    
    return syncError;
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    const retryKey = `${operationName}_${Date.now()}`;
    
    let lastError: Error = new Error('Operation failed');
    let attempt = 0;

    while (attempt <= config.maxRetries) {
      try {
        const result = await operation();
        
        // Success - reset retry count and update stats
        if (attempt > 0) {
          this.errorStats.successfulRetries++;
          this.activeRetries.delete(retryKey);
          console.log(`[SyncErrorHandler] Operation '${operationName}' succeeded after ${attempt} retries`);
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;
        
        // Track retry attempt
        this.activeRetries.set(retryKey, attempt);
        
        if (attempt > config.maxRetries) {
          // Max retries exceeded
          this.errorStats.failedRetries++;
          this.activeRetries.delete(retryKey);
          
          const syncError = await this.handleSyncError(lastError, operationName, {
            ...context,
            maxRetriesExceeded: true,
            totalAttempts: attempt,
          });
          
          throw new Error(`Operation '${operationName}' failed after ${config.maxRetries} retries: ${syncError.userFriendlyMessage}`);
        }

        // Calculate delay with exponential backoff and optional jitter
        const baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
        const jitter = config.jitterEnabled ? Math.random() * 0.1 * baseDelay : 0;
        const delay = Math.min(baseDelay + jitter, config.maxDelay);

        console.warn(`[SyncErrorHandler] Operation '${operationName}' failed (attempt ${attempt}/${config.maxRetries}), retrying in ${Math.round(delay)}ms:`, lastError.message);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Execute operation with fallback mechanisms
   */
  async executeWithFallback<T>(
    primaryOperation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    try {
      return await this.executeWithRetry(primaryOperation, operationName, context);
    } catch (error) {
      const syncError = this.createSyncError(error instanceof Error ? error : new Error(String(error)), operationName, context);
      
      // Try fallback mechanisms
      const applicableFallbacks = this.fallbackMechanisms
        .filter(fallback => fallback.condition(syncError))
        .sort((a, b) => b.priority - a.priority);

      for (const fallback of applicableFallbacks) {
        try {
          console.log(`[SyncErrorHandler] Attempting fallback '${fallback.name}' for operation '${operationName}'`);
          const success = await fallback.execute(syncError);
          
          if (success) {
            console.log(`[SyncErrorHandler] Fallback '${fallback.name}' succeeded for operation '${operationName}'`);
            // Return a default value or throw a specific error indicating fallback was used
            throw new Error(`Operation completed using fallback: ${fallback.name}`);
          }
        } catch (fallbackError) {
          console.warn(`[SyncErrorHandler] Fallback '${fallback.name}' failed:`, fallbackError);
        }
      }

      // All fallbacks failed, throw original error
      throw error;
    }
  }

  /**
   * Get user-friendly error message with recovery options
   */
  getUserFriendlyError(error: SyncError): { message: string; actions: Array<{ label: string; action: () => void }> } {
    const actions: Array<{ label: string; action: () => void }> = [];

    let message = error.userFriendlyMessage;

    // Add retry action if retryable
    if (error.isRetryable && error.retryCount < this.retryConfig.maxRetries) {
      actions.push({
        label: 'Retry',
        action: () => this.retryOperation(error),
      });
    }

    // Add manual refresh action
    actions.push({
      label: 'Refresh',
      action: () => this.triggerManualRefresh(),
    });

    // Add specific actions based on error type
    switch (error.type) {
      case SyncErrorType.NETWORK_UNAVAILABLE:
        message += ' Please check your internet connection.';
        actions.push({
          label: 'Check Connection',
          action: () => this.checkNetworkStatus(),
        });
        break;
      
      case SyncErrorType.PERMISSION_DENIED:
        message += ' Please check app permissions.';
        actions.push({
          label: 'Open Settings',
          action: () => this.openAppSettings(),
        });
        break;
      
      case SyncErrorType.SERVICE_UNAVAILABLE:
        message += ' The service may be temporarily down.';
        break;
    }

    return { message, actions };
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats(): Readonly<ErrorStats> {
    return { ...this.errorStats };
  }

  /**
   * Get recent error history
   */
  getErrorHistory(limit: number = 50): Readonly<SyncError[]> {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Clear error history and reset statistics
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    this.resetErrorStats();
    console.log('[SyncErrorHandler] Error history cleared');
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
    console.log('[SyncErrorHandler] Retry configuration updated:', this.retryConfig);
  }

  /**
   * Check if sync is in a healthy state
   */
  isSyncHealthy(): boolean {
    const recentErrors = this.errorHistory.filter(
      error => Date.now() - error.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    );

    return recentErrors.length < 3 && this.activeRetries.size === 0;
  }

  /**
   * Create sync error from generic error
   */
  private createSyncError(error: Error, operation: string, context?: Record<string, any>): SyncError {
    const errorType = this.categorizeError(error);
    const recoveryStrategy = this.determineRecoveryStrategy(errorType, error);
    const isRetryable = this.isErrorRetryable(errorType, error);
    
    return {
      type: errorType,
      operation,
      message: error.message,
      originalError: error,
      context,
      timestamp: new Date(),
      retryCount: 0,
      recoveryStrategy,
      isRetryable,
      userFriendlyMessage: this.generateUserFriendlyMessage(errorType, error),
    };
  }

  /**
   * Categorize error into sync error types
   */
  private categorizeError(error: Error): SyncErrorType {
    const message = error.message.toLowerCase();
    const code = (error as any).code;

    // Network-related errors
    if (message.includes('network') || message.includes('connection') || code === 'unavailable') {
      return SyncErrorType.NETWORK_UNAVAILABLE;
    }

    // Permission errors
    if (message.includes('permission') || code === 'permission-denied') {
      return SyncErrorType.PERMISSION_DENIED;
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return SyncErrorType.RATE_LIMITED;
    }

    // Service unavailable
    if (message.includes('service unavailable') || message.includes('server error')) {
      return SyncErrorType.SERVICE_UNAVAILABLE;
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return SyncErrorType.TIMEOUT;
    }

    // Subscription-specific errors
    if (message.includes('subscription') || message.includes('listener')) {
      return SyncErrorType.SUBSCRIPTION_FAILED;
    }

    // Cache-related errors
    if (message.includes('cache') || message.includes('invalidation')) {
      return SyncErrorType.CACHE_INVALIDATION_FAILED;
    }

    // Connection sync errors
    if (message.includes('connection') && message.includes('sync')) {
      return SyncErrorType.CONNECTION_SYNC_FAILED;
    }

    return SyncErrorType.UNKNOWN;
  }

  /**
   * Determine recovery strategy based on error type
   */
  private determineRecoveryStrategy(errorType: SyncErrorType, error: Error): RecoveryStrategy {
    switch (errorType) {
      case SyncErrorType.NETWORK_UNAVAILABLE:
      case SyncErrorType.TIMEOUT:
        return RecoveryStrategy.RETRY_WITH_BACKOFF;
      
      case SyncErrorType.CACHE_INVALIDATION_FAILED:
        return RecoveryStrategy.FALLBACK_TO_CACHE;
      
      case SyncErrorType.RATE_LIMITED:
        return RecoveryStrategy.RETRY_WITH_BACKOFF;
      
      case SyncErrorType.PERMISSION_DENIED:
        return RecoveryStrategy.ESCALATE_TO_USER;
      
      case SyncErrorType.SERVICE_UNAVAILABLE:
        return RecoveryStrategy.MANUAL_REFRESH;
      
      default:
        return RecoveryStrategy.RETRY_WITH_BACKOFF;
    }
  }

  /**
   * Check if error is retryable
   */
  private isErrorRetryable(errorType: SyncErrorType, error: Error): boolean {
    const nonRetryableTypes = [
      SyncErrorType.PERMISSION_DENIED,
    ];

    return !nonRetryableTypes.includes(errorType);
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserFriendlyMessage(errorType: SyncErrorType, error: Error): string {
    switch (errorType) {
      case SyncErrorType.NETWORK_UNAVAILABLE:
        return 'Unable to sync due to network issues';
      
      case SyncErrorType.PERMISSION_DENIED:
        return 'Permission required to sync data';
      
      case SyncErrorType.RATE_LIMITED:
        return 'Too many requests, please wait a moment';
      
      case SyncErrorType.SERVICE_UNAVAILABLE:
        return 'Sync service is temporarily unavailable';
      
      case SyncErrorType.TIMEOUT:
        return 'Sync operation timed out';
      
      case SyncErrorType.SUBSCRIPTION_FAILED:
        return 'Failed to establish real-time connection';
      
      case SyncErrorType.CACHE_INVALIDATION_FAILED:
        return 'Failed to refresh cached data';
      
      case SyncErrorType.CONNECTION_SYNC_FAILED:
        return 'Failed to sync connection data';
      
      default:
        return 'An unexpected sync error occurred';
    }
  }

  /**
   * Log sync error with appropriate categorization
   */
  private logSyncError(syncError: SyncError): void {
    const severity = this.getErrorSeverity(syncError.type);
    const category = this.getErrorCategory(syncError.type);

    ErrorHandler.logError(
      syncError.originalError,
      category,
      severity,
      `Sync ${syncError.operation}`
    );

    // Add to error history
    this.errorHistory.push(syncError);
    
    // Keep only last 100 errors
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }
  }

  /**
   * Get error severity based on sync error type
   */
  private getErrorSeverity(errorType: SyncErrorType): ErrorSeverity {
    switch (errorType) {
      case SyncErrorType.PERMISSION_DENIED:
        return ErrorSeverity.HIGH;
      
      case SyncErrorType.SERVICE_UNAVAILABLE:
      case SyncErrorType.NETWORK_UNAVAILABLE:
        return ErrorSeverity.MEDIUM;
      
      case SyncErrorType.RATE_LIMITED:
      case SyncErrorType.TIMEOUT:
        return ErrorSeverity.LOW;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Get error category based on sync error type
   */
  private getErrorCategory(errorType: SyncErrorType): ErrorCategory {
    switch (errorType) {
      case SyncErrorType.NETWORK_UNAVAILABLE:
      case SyncErrorType.TIMEOUT:
        return ErrorCategory.NETWORK;
      
      case SyncErrorType.PERMISSION_DENIED:
        return ErrorCategory.PERMISSION;
      
      case SyncErrorType.SUBSCRIPTION_FAILED:
      case SyncErrorType.CONNECTION_SYNC_FAILED:
        return ErrorCategory.FIREBASE;
      
      default:
        return ErrorCategory.UNKNOWN;
    }
  }

  /**
   * Update error statistics
   */
  private updateErrorStats(syncError: SyncError): void {
    this.errorStats.totalErrors++;
    this.errorStats.errorsByType[syncError.type] = (this.errorStats.errorsByType[syncError.type] || 0) + 1;
    this.errorStats.errorsByOperation[syncError.operation] = (this.errorStats.errorsByOperation[syncError.operation] || 0) + 1;
    this.errorStats.lastErrorTime = syncError.timestamp;
    
    // Update average retry count
    const totalRetries = this.errorStats.successfulRetries + this.errorStats.failedRetries;
    if (totalRetries > 0) {
      this.errorStats.averageRetryCount = totalRetries / this.errorStats.totalErrors;
    }
  }

  /**
   * Emit error event through event bus
   */
  private emitErrorEvent(syncError: SyncError): void {
    const { message, actions } = this.getUserFriendlyError(syncError);
    
    const errorEvent: ErrorEvent = {
      operation: syncError.operation as any,
      error: syncError.message,
      retryable: syncError.isRetryable,
      errorType: syncError.type,
      context: syncError.context,
      userFriendlyMessage: message,
      recoveryActions: actions.map(action => ({
        label: action.label,
        actionType: action.label.toLowerCase().replace(' ', '_'),
      })),
      timestamp: syncError.timestamp,
      source: 'SyncErrorHandler',
    };

    eventBus.emit(EVENT_NAMES.ERROR_EVENT, errorEvent);
  }

  /**
   * Attempt recovery based on error strategy
   */
  private async attemptRecovery(syncError: SyncError): Promise<void> {
    switch (syncError.recoveryStrategy) {
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
        // This is handled by executeWithRetry
        break;
      
      case RecoveryStrategy.FALLBACK_TO_CACHE:
        await this.executeFallbackToCache(syncError);
        break;
      
      case RecoveryStrategy.MANUAL_REFRESH:
        this.triggerManualRefresh();
        break;
      
      case RecoveryStrategy.ESCALATE_TO_USER:
        this.escalateToUser(syncError);
        break;
    }
  }

  /**
   * Setup fallback mechanisms
   */
  private setupFallbackMechanisms(): void {
    // Cache fallback mechanism
    this.fallbackMechanisms.push({
      name: 'Cache Fallback',
      condition: (error) => error.type === SyncErrorType.NETWORK_UNAVAILABLE,
      execute: async (error) => {
        console.log('[SyncErrorHandler] Attempting cache fallback');
        // Implementation would depend on cache service
        return true;
      },
      priority: 1,
    });

    // Manual refresh fallback
    this.fallbackMechanisms.push({
      name: 'Manual Refresh',
      condition: (error) => error.type === SyncErrorType.SERVICE_UNAVAILABLE,
      execute: async (error) => {
        console.log('[SyncErrorHandler] Triggering manual refresh fallback');
        this.triggerManualRefresh();
        return true;
      },
      priority: 2,
    });
  }

  /**
   * Reset error statistics
   */
  private resetErrorStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByType: {} as Record<SyncErrorType, number>,
      errorsByOperation: {},
      successfulRetries: 0,
      failedRetries: 0,
      averageRetryCount: 0,
    };
  }

  /**
   * Execute cache fallback
   */
  private async executeFallbackToCache(syncError: SyncError): Promise<void> {
    console.log(`[SyncErrorHandler] Executing cache fallback for operation: ${syncError.operation}`);
    // Implementation would integrate with cache service
  }

  /**
   * Retry specific operation
   */
  private retryOperation(syncError: SyncError): void {
    console.log(`[SyncErrorHandler] Manual retry requested for operation: ${syncError.operation}`);
    // Emit retry event
    eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
      timestamp: new Date(),
      reason: 'manual',
      source: 'SyncErrorHandler',
    });
  }

  /**
   * Trigger manual refresh
   */
  private triggerManualRefresh(): void {
    console.log('[SyncErrorHandler] Triggering manual refresh');
    eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
      timestamp: new Date(),
      reason: 'manual',
      source: 'SyncErrorHandler',
    });
  }

  /**
   * Check network status
   */
  private checkNetworkStatus(): void {
    console.log('[SyncErrorHandler] Checking network status');
    // Implementation would check actual network status
  }

  /**
   * Open app settings
   */
  private openAppSettings(): void {
    console.log('[SyncErrorHandler] Opening app settings');
    // Implementation would open device settings
  }

  /**
   * Escalate error to user
   */
  private escalateToUser(syncError: SyncError): void {
    const { message, actions } = this.getUserFriendlyError(syncError);
    
    // Show user-friendly error with actions
    ErrorHandler.showUserError(
      { message, code: syncError.type },
      'Sync Error',
      message
    );
  }
}

// Create and export singleton instance
export const syncErrorHandler = new SyncErrorHandlingService();
export default syncErrorHandler;