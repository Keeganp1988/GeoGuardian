import eventBus from './eventBusService';
import subscriptionManager from './subscriptionManagerService';
import { invalidateWithRefresh, batchInvalidateWithRefresh } from './cacheService';
import backgroundSyncRecoveryService from './backgroundSyncRecoveryService';
import syncErrorHandler from './syncErrorHandlingService';
import { 
  EVENT_NAMES, 
  ConnectionChangeEvent, 
  SyncRefreshEvent, 
  NetworkChangeEvent,
  AppStateChangeEvent,
  LoadingStateEvent,
  SuccessEvent,
  ErrorEvent,
  EventSubscription 
} from '../types/events';

/**
 * Real-time Sync Manager Service
 * Main sync coordination service that orchestrates cache and subscription updates
 */

export interface SyncState {
  isInitialized: boolean;
  lastSyncTime?: Date;
  activeSubscriptions: string[];
  pendingRefresh: boolean;
  errorCount: number;
  isConnected: boolean;
  appState: 'active' | 'background' | 'inactive';
}

export interface SyncOptions {
  forceRefresh?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  affectedUserIds?: string[];
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

class RealTimeSyncManagerService {
  private state: SyncState = {
    isInitialized: false,
    activeSubscriptions: [],
    pendingRefresh: false,
    errorCount: 0,
    isConnected: true,
    appState: 'active',
  };

  private eventSubscriptions: EventSubscription[] = [];
  private currentUserId?: string;
  
  // Retry configuration with exponential backoff
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffMultiplier: 2,
  };

  /**
   * Initialize sync for a user
   * @param userId - The user ID to initialize sync for
   */
  async initializeSync(userId: string): Promise<void> {
    if (this.state.isInitialized && this.currentUserId === userId) {
      console.log('[RealTimeSyncManager] Already initialized for user:', userId);
      return;
    }

    // Use comprehensive error handling with retry logic
    await syncErrorHandler.executeWithRetry(
      async () => {
        // Emit loading state
        this.emitLoadingState(true, 'sync', 'Initializing sync...');

        try {
          console.log('[RealTimeSyncManager] Initializing sync for user:', userId);
          
          // Clean up existing subscriptions if switching users
          if (this.state.isInitialized && this.currentUserId !== userId) {
            await this.cleanup();
          }

          this.currentUserId = userId;

          // Initialize sync error handler
          syncErrorHandler.initialize();

          // Initialize subscription manager
          await subscriptionManager.initialize();

          // Initialize background sync recovery service
          await backgroundSyncRecoveryService.initialize();

          // Set up event listeners
          this.setupEventListeners();

          // Update state
          this.state.isInitialized = true;
          this.state.errorCount = 0;
          this.state.lastSyncTime = new Date();
          this.state.activeSubscriptions = subscriptionManager.getActiveUserIds();

          console.log('[RealTimeSyncManager] Sync initialized successfully for user:', userId);
          
          // Emit success event
          this.emitSuccessEvent('sync_completed', 'Sync initialized successfully');
        } finally {
          // Always clear loading state
          this.emitLoadingState(false, 'sync');
        }
      },
      'initializeSync',
      { userId }
    );
  }

  /**
   * Refresh all subscriptions
   */
  async refreshSubscriptions(options: SyncOptions = {}): Promise<void> {
    if (!this.state.isInitialized) {
      throw new Error('RealTimeSyncManager not initialized. Call initializeSync() first.');
    }

    if (this.state.pendingRefresh && !options.forceRefresh) {
      console.log('[RealTimeSyncManager] Refresh already in progress, skipping');
      return;
    }

    this.state.pendingRefresh = true;

    // Use comprehensive error handling with fallback mechanisms
    await syncErrorHandler.executeWithFallback(
      async () => {
        // Emit loading state
        this.emitLoadingState(true, 'sync', 'Refreshing subscriptions...');

        try {
          console.log('[RealTimeSyncManager] Refreshing subscriptions');

          // Refresh subscription manager subscriptions
          await subscriptionManager.refreshAllSubscriptions();

          // Update active subscriptions list
          this.state.activeSubscriptions = subscriptionManager.getActiveUserIds();
          this.state.lastSyncTime = new Date();
          this.state.errorCount = 0;

          console.log(`[RealTimeSyncManager] Successfully refreshed ${this.state.activeSubscriptions.length} subscriptions`);
          
          // Emit success event
          this.emitSuccessEvent('sync_completed', `Refreshed ${this.state.activeSubscriptions.length} subscriptions`);
        } finally {
          this.state.pendingRefresh = false;
          // Always clear loading state
          this.emitLoadingState(false, 'sync');
        }
      },
      'refreshSubscriptions',
      { options }
    );
  }

  /**
   * Handle connection changes
   * @param connectionId - The connection ID that changed
   * @param changeType - Type of change (added, removed, updated)
   */
  async onConnectionChange(connectionId: string, changeType: 'added' | 'removed' | 'updated'): Promise<void> {
    if (!this.state.isInitialized) {
      console.warn('[RealTimeSyncManager] Not initialized, ignoring connection change');
      return;
    }

    // Use comprehensive error handling for connection changes
    await syncErrorHandler.executeWithRetry(
      async () => {
        console.log(`[RealTimeSyncManager] Handling connection change: ${changeType} for connection:`, connectionId);

        // Invalidate relevant cache entries
        const cacheKeys = [
          `connections_${this.currentUserId}`,
          `privateConnections_${this.currentUserId}`,
          `contacts_${this.currentUserId}`,
        ];

        await batchInvalidateWithRefresh(cacheKeys, async () => {
          // Emit sync refresh event
          const syncEvent: SyncRefreshEvent = {
            timestamp: new Date(),
            reason: 'connection_change',
            source: 'RealTimeSyncManager',
          };

          eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, syncEvent);
        });

        // For new connections, we might need to add new subscriptions
        if (changeType === 'added') {
          // The subscription manager will handle this through the sync refresh event
          console.log('[RealTimeSyncManager] New connection added, subscriptions will be refreshed');
        }

        // For removed connections, clean up subscriptions
        if (changeType === 'removed') {
          // Note: We don't have the user ID from connectionId alone
          // The subscription manager will handle cleanup during refresh
          console.log('[RealTimeSyncManager] Connection removed, subscriptions will be refreshed');
        }
      },
      'onConnectionChange',
      { connectionId, changeType }
    );
  }

  /**
   * Force sync with server
   */
  async forceSync(): Promise<void> {
    if (!this.state.isInitialized) {
      throw new Error('RealTimeSyncManager not initialized. Call initializeSync() first.');
    }

    // Use comprehensive error handling with retry logic
    await syncErrorHandler.executeWithRetry(
      async () => {
        // Emit loading state
        this.emitLoadingState(true, 'sync', 'Force syncing...');

        try {
          console.log('[RealTimeSyncManager] Force sync requested');

          // Emit manual sync refresh event
          const syncEvent: SyncRefreshEvent = {
            timestamp: new Date(),
            reason: 'manual',
            source: 'RealTimeSyncManager',
          };

          eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, syncEvent);

          // Refresh subscriptions
          await this.refreshSubscriptions({ forceRefresh: true });

          console.log('[RealTimeSyncManager] Force sync completed');
          
          // Emit success event
          this.emitSuccessEvent('sync_completed', 'Force sync completed successfully');
        } finally {
          // Always clear loading state
          this.emitLoadingState(false, 'sync');
        }
      },
      'forceSync'
    );
  }

  /**
   * Get current sync state
   */
  getSyncState(): Readonly<SyncState> {
    return { ...this.state };
  }

  /**
   * Check if sync is healthy (low error count, recent sync)
   */
  isSyncHealthy(): boolean {
    const now = new Date();
    const timeSinceLastSync = this.state.lastSyncTime 
      ? now.getTime() - this.state.lastSyncTime.getTime()
      : Infinity;

    // Consider sync healthy if:
    // - Error count is low (< 3)
    // - Last sync was within 5 minutes
    // - Currently initialized
    return (
      this.state.isInitialized &&
      this.state.errorCount < 3 &&
      timeSinceLastSync < 5 * 60 * 1000 // 5 minutes
    );
  }

  /**
   * Reset error count (useful after successful operations)
   */
  resetErrorCount(): void {
    this.state.errorCount = 0;
  }

  /**
   * Clean up all subscriptions and event listeners
   */
  async cleanup(): Promise<void> {
    console.log('[RealTimeSyncManager] Cleaning up sync manager');

    try {
      // Remove event listeners
      if (this.eventSubscriptions && Array.isArray(this.eventSubscriptions)) {
        (this.eventSubscriptions ?? []).forEach(sub => {
          try {
            sub.unsubscribe();
          } catch (error) {
            console.error('[RealTimeSyncManager] Error unsubscribing:', error);
          }
        });
      }
      this.eventSubscriptions = [];

      // Clean up subscription manager
      await subscriptionManager.cleanup();

      // Clean up background sync recovery service
      await backgroundSyncRecoveryService.cleanup();

      // Reset state
      this.state = {
        isInitialized: false,
        activeSubscriptions: [],
        pendingRefresh: false,
        errorCount: 0,
        isConnected: true,
        appState: 'active',
      };

      this.currentUserId = undefined;

      console.log('[RealTimeSyncManager] Cleanup completed');
    } catch (error) {
      console.error('[RealTimeSyncManager] Error during cleanup:', error);
      // Even if cleanup fails, reset the state to prevent inconsistent state
      this.state.isInitialized = false;
      this.state.activeSubscriptions = [];
      this.state.pendingRefresh = false;
      this.state.errorCount = 0;
      this.currentUserId = undefined;
    }
  }

  /**
   * Set up event listeners for sync coordination
   */
  private setupEventListeners(): void {
    // Listen for connection changes
    const connectionAddedSub = eventBus.on<ConnectionChangeEvent>(
      EVENT_NAMES.CONNECTION_ADDED,
      (event) => this.handleConnectionChangeEvent(event, 'added')
    );

    const connectionRemovedSub = eventBus.on<ConnectionChangeEvent>(
      EVENT_NAMES.CONNECTION_REMOVED,
      (event) => this.handleConnectionChangeEvent(event, 'removed')
    );

    const connectionUpdatedSub = eventBus.on<ConnectionChangeEvent>(
      EVENT_NAMES.CONNECTION_UPDATED,
      (event) => this.handleConnectionChangeEvent(event, 'updated')
    );

    // Listen for network changes
    const networkChangeSub = eventBus.on<NetworkChangeEvent>(
      EVENT_NAMES.NETWORK_CHANGED,
      (event) => this.handleNetworkChangeEvent(event)
    );

    // Listen for app state changes
    const appStateChangeSub = eventBus.on<AppStateChangeEvent>(
      EVENT_NAMES.APP_STATE_CHANGED,
      (event) => this.handleAppStateChangeEvent(event)
    );

    // Store subscriptions for cleanup
    this.eventSubscriptions.push(
      connectionAddedSub,
      connectionRemovedSub,
      connectionUpdatedSub,
      networkChangeSub,
      appStateChangeSub
    );
  }

  /**
   * Handle connection change events
   */
  private async handleConnectionChangeEvent(
    event: ConnectionChangeEvent, 
    changeType: 'added' | 'removed' | 'updated'
  ): Promise<void> {
    try {
      console.log(`[RealTimeSyncManager] Received connection ${changeType} event:`, event.connectionId);
      await this.onConnectionChange(event.connectionId, changeType);
    } catch (error) {
      console.error(`[RealTimeSyncManager] Error handling connection ${changeType} event:`, error);
    }
  }

  /**
   * Handle network change events
   */
  private async handleNetworkChangeEvent(event: NetworkChangeEvent): Promise<void> {
    try {
      console.log('[RealTimeSyncManager] Network state changed:', event.isConnected);
      
      this.state.isConnected = event.isConnected;

      // Notify LocalDBController of network state change
      const { localDBController } = await import('./localDBController');
      await localDBController.setOnlineStatus(event.isConnected);

      if (event.isConnected) {
        // Network recovered, trigger sync refresh
        const syncEvent: SyncRefreshEvent = {
          timestamp: new Date(),
          reason: 'network_recovery',
          source: 'RealTimeSyncManager',
        };

        eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, syncEvent);
        
        // Refresh subscriptions after network recovery
        await this.refreshSubscriptions({ forceRefresh: true });
      }
    } catch (error) {
      console.error('[RealTimeSyncManager] Error handling network change:', error);
    }
  }

  /**
   * Handle app state change events
   */
  private async handleAppStateChangeEvent(event: AppStateChangeEvent): Promise<void> {
    try {
      console.log('[RealTimeSyncManager] App state changed:', event.state);
      
      this.state.appState = event.state;

      if (event.state === 'active' && this.state.isConnected) {
        // App became active, refresh subscriptions
        console.log('[RealTimeSyncManager] App became active, refreshing subscriptions');
        await this.refreshSubscriptions({ forceRefresh: true });
      }
    } catch (error) {
      console.error('[RealTimeSyncManager] Error handling app state change:', error);
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff(operation: () => Promise<void>): Promise<void> {
    // If maxRetries is 0, don't retry at all, just throw the error
    if (this.retryConfig.maxRetries === 0) {
      await operation();
      return;
    }

    let attempt = 0;
    let delay = this.retryConfig.baseDelay;

    while (attempt < this.retryConfig.maxRetries) {
      try {
        await operation();
        return; // Success, exit retry loop
      } catch (error) {
        attempt++;
        
        if (attempt >= this.retryConfig.maxRetries) {
          console.error(`[RealTimeSyncManager] Operation failed after ${attempt} attempts:`, error);
          throw error;
        }

        console.warn(`[RealTimeSyncManager] Operation failed (attempt ${attempt}/${this.retryConfig.maxRetries}), retrying in ${delay}ms:`, error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Increase delay for next attempt (exponential backoff)
        delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelay);
      }
    }
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
    console.log('[RealTimeSyncManager] Updated retry config:', this.retryConfig);
  }

  /**
   * Get retry configuration
   */
  getRetryConfig(): Readonly<RetryConfig> {
    return { ...this.retryConfig };
  }

  /**
   * Emit loading state event
   */
  private emitLoadingState(isLoading: boolean, operation: LoadingStateEvent['operation'], message?: string): void {
    const loadingEvent: LoadingStateEvent = {
      isLoading,
      operation,
      message,
      timestamp: new Date(),
      source: 'RealTimeSyncManager',
    };

    eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, loadingEvent);
  }

  /**
   * Emit success event
   */
  private emitSuccessEvent(operation: SuccessEvent['operation'], message?: string, contactName?: string): void {
    const successEvent: SuccessEvent = {
      operation,
      message,
      contactName,
      timestamp: new Date(),
      source: 'RealTimeSyncManager',
    };

    // Defer event emission to avoid render phase conflicts
    setTimeout(() => {
      eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, successEvent);
    }, 0);
  }

  /**
   * Emit error event
   */
  private emitErrorEvent(operation: ErrorEvent['operation'], error: string, retryable: boolean): void {
    const errorEvent: ErrorEvent = {
      operation,
      error,
      retryable,
      timestamp: new Date(),
      source: 'RealTimeSyncManager',
    };

    eventBus.emit(EVENT_NAMES.ERROR_EVENT, errorEvent);
  }
}

// Create and export singleton instance
export const realTimeSyncManager = new RealTimeSyncManagerService();
export default realTimeSyncManager;