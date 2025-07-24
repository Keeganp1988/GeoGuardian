import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import eventBus from './eventBusService';
// Dynamic import to avoid circular dependency
import {
  EVENT_NAMES,
  NetworkChangeEvent,
  AppStateChangeEvent,
  EventSubscription
} from '../types/events';

/**
 * Background Sync Recovery Service
 * Handles app state changes, network connectivity changes, and background sync recovery
 */

export interface BackgroundSyncQueueItem {
  id: string;
  operation: 'sync' | 'subscription_refresh' | 'connection_sync';
  data?: any;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
}

export interface BackgroundSyncState {
  isListening: boolean;
  currentAppState: AppStateStatus;
  isNetworkConnected: boolean;
  networkType?: string;
  queueSize: number;
  lastSyncAttempt?: Date;
  pendingOperations: string[];
}

class BackgroundSyncRecoveryService {
  private state: BackgroundSyncState = {
    isListening: false,
    currentAppState: 'active',
    isNetworkConnected: true,
    queueSize: 0,
    pendingOperations: [],
  };

  private syncQueue: BackgroundSyncQueueItem[] = [];
  private appStateSubscription?: EventSubscription;
  private netInfoUnsubscribe?: (() => void);
  private processingQueue = false;
  private queueProcessingInterval?: NodeJS.Timeout;

  // Configuration
  private readonly QUEUE_PROCESSING_INTERVAL = 30000; // 30 seconds
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly DEFAULT_MAX_RETRIES = 3;

  /**
   * Initialize the background sync recovery service
   */
  async initialize(): Promise<void> {
    if (this.state.isListening) {
      console.log('[BackgroundSyncRecovery] Already initialized');
      return;
    }

    try {
      console.log('[BackgroundSyncRecovery] Initializing background sync recovery');

      // Get initial app state
      this.state.currentAppState = AppState.currentState;

      // Get initial network state
      const netInfoState = await NetInfo.fetch();
      this.state.isNetworkConnected = netInfoState.isConnected ?? false;
      this.state.networkType = netInfoState.type;

      // Set up app state listener
      this.setupAppStateListener();

      // Set up network connectivity listener
      this.setupNetworkListener();

      // Start queue processing
      this.startQueueProcessing();

      this.state.isListening = true;

      console.log('[BackgroundSyncRecovery] Background sync recovery initialized successfully');
      console.log('[BackgroundSyncRecovery] Initial state:', {
        appState: this.state.currentAppState,
        networkConnected: this.state.isNetworkConnected,
        networkType: this.state.networkType,
      });
    } catch (error) {
      console.error('[BackgroundSyncRecovery] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Add operation to background sync queue
   */
  addToQueue(
    operation: BackgroundSyncQueueItem['operation'],
    data?: any,
    maxRetries: number = this.DEFAULT_MAX_RETRIES
  ): string {
    // Check queue size limit
    if (this.syncQueue.length >= this.MAX_QUEUE_SIZE) {
      console.warn('[BackgroundSyncRecovery] Queue is full, removing oldest item');
      this.syncQueue.shift();
    }

    const queueItem: BackgroundSyncQueueItem = {
      id: `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      data,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries,
    };

    this.syncQueue.push(queueItem);
    this.state.queueSize = this.syncQueue.length;
    this.state.pendingOperations = this.syncQueue.map(item => item.operation);

    console.log(`[BackgroundSyncRecovery] Added ${operation} to queue (${queueItem.id}). Queue size: ${this.state.queueSize}`);

    // Try to process queue immediately if network is available
    if (this.state.isNetworkConnected && this.state.currentAppState === 'active') {
      this.processQueue();
    }

    return queueItem.id;
  }

  /**
   * Get current background sync state
   */
  getState(): Readonly<BackgroundSyncState> {
    return { ...this.state };
  }

  /**
   * Force process the sync queue
   */
  async forceProcessQueue(): Promise<void> {
    console.log('[BackgroundSyncRecovery] Force processing queue');
    await this.processQueue();
  }

  /**
   * Clear the sync queue
   */
  clearQueue(): void {
    console.log(`[BackgroundSyncRecovery] Clearing queue (${this.syncQueue.length} items)`);
    this.syncQueue = [];
    this.state.queueSize = 0;
    this.state.pendingOperations = [];
  }

  /**
   * Clean up and stop the service
   */
  async cleanup(): Promise<void> {
    console.log('[BackgroundSyncRecovery] Cleaning up background sync recovery');

    try {
      // Stop queue processing
      if (this.queueProcessingInterval) {
        clearInterval(this.queueProcessingInterval);
        this.queueProcessingInterval = undefined;
      }

      // Remove app state listener
      if (this.appStateSubscription) {
        this.appStateSubscription.unsubscribe();
        this.appStateSubscription = undefined;
      }

      // Remove network listener
      if (this.netInfoUnsubscribe) {
        this.netInfoUnsubscribe();
        this.netInfoUnsubscribe = undefined;
      }

      // Clear queue
      this.clearQueue();

      // Reset state
      this.state = {
        isListening: false,
        currentAppState: 'active',
        isNetworkConnected: true,
        queueSize: 0,
        pendingOperations: [],
      };

      console.log('[BackgroundSyncRecovery] Cleanup completed');
    } catch (error) {
      console.error('[BackgroundSyncRecovery] Error during cleanup:', error);
    }
  }

  /**
   * Set up app state change listener
   */
  private setupAppStateListener(): void {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const previousAppState = this.state.currentAppState;
      this.state.currentAppState = nextAppState;

      console.log(`[BackgroundSyncRecovery] App state changed: ${previousAppState} -> ${nextAppState}`);

      // Emit app state change event
      const appStateEvent: AppStateChangeEvent = {
        state: nextAppState as 'active' | 'background' | 'inactive',
        timestamp: new Date(),
        source: 'BackgroundSyncRecoveryService',
      };

      eventBus.emit(EVENT_NAMES.APP_STATE_CHANGED, appStateEvent);

      // Handle app becoming active
      if (nextAppState === 'active' && previousAppState !== 'active') {
        this.handleAppBecameActive();
      }

      // Handle app going to background
      if (nextAppState === 'background' && previousAppState === 'active') {
        this.handleAppWentToBackground();
      }
    };

    // Subscribe to app state changes - modern React Native returns a subscription
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Create subscription object for cleanup
    this.appStateSubscription = {
      unsubscribe: () => {
        // Use the subscription's remove method if available
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
        // Note: AppState.removeEventListener doesn't exist in React Native 0.79.5+
        // The subscription.remove() method is the correct approach
      }
    };
  }

  /**
   * Set up network connectivity listener
   */
  private setupNetworkListener(): void {
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const wasConnected = this.state.isNetworkConnected;
      const isConnected = state.isConnected ?? false;

      this.state.isNetworkConnected = isConnected;
      this.state.networkType = state.type;

      console.log(`[BackgroundSyncRecovery] Network state changed:`, {
        isConnected,
        type: state.type,
        wasConnected,
      });

      // Emit network change event
      const networkEvent: NetworkChangeEvent = {
        isConnected,
        connectionType: state.type as 'wifi' | 'cellular' | 'none',
        timestamp: new Date(),
        source: 'BackgroundSyncRecoveryService',
      };

      eventBus.emit(EVENT_NAMES.NETWORK_CHANGED, networkEvent);

      // Handle network recovery
      if (isConnected && !wasConnected) {
        this.handleNetworkRecovery();
      }

      // Handle network loss
      if (!isConnected && wasConnected) {
        this.handleNetworkLoss();
      }
    });
  }

  /**
   * Handle app becoming active
   */
  private async handleAppBecameActive(): Promise<void> {
    try {
      console.log('[BackgroundSyncRecovery] App became active, triggering sync recovery');

      // Add sync operation to queue
      this.addToQueue('sync', { reason: 'app_became_active' });

      // Add subscription refresh to queue
      this.addToQueue('subscription_refresh', { reason: 'app_became_active' });

      // Process queue if network is available
      if (this.state.isNetworkConnected) {
        await this.processQueue();
      }
    } catch (error) {
      console.error('[BackgroundSyncRecovery] Error handling app became active:', error);
    }
  }

  /**
   * Handle app going to background
   */
  private handleAppWentToBackground(): void {
    console.log('[BackgroundSyncRecovery] App went to background');

    // We could implement background task registration here if needed
    // For now, we just log the state change
  }

  /**
   * Handle network recovery
   */
  private async handleNetworkRecovery(): Promise<void> {
    try {
      console.log('[BackgroundSyncRecovery] Network recovered, triggering sync recovery');

      // Add sync operation to queue
      this.addToQueue('sync', { reason: 'network_recovery' });

      // Add subscription refresh to queue
      this.addToQueue('subscription_refresh', { reason: 'network_recovery' });

      // Process queue immediately
      await this.processQueue();
    } catch (error) {
      console.error('[BackgroundSyncRecovery] Error handling network recovery:', error);
    }
  }

  /**
   * Handle network loss
   */
  private handleNetworkLoss(): void {
    console.log('[BackgroundSyncRecovery] Network lost');

    // Operations will be queued and processed when network recovers
  }

  /**
   * Start queue processing interval
   */
  private startQueueProcessing(): void {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
    }

    this.queueProcessingInterval = setInterval(() => {
      if (this.state.isNetworkConnected && this.state.currentAppState === 'active') {
        this.processQueue();
      }
    }, this.QUEUE_PROCESSING_INTERVAL);

    console.log(`[BackgroundSyncRecovery] Started queue processing (interval: ${this.QUEUE_PROCESSING_INTERVAL}ms)`);
  }

  /**
   * Process the sync queue
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.syncQueue.length === 0) {
      return;
    }

    if (!this.state.isNetworkConnected) {
      console.log('[BackgroundSyncRecovery] Network not available, skipping queue processing');
      return;
    }

    this.processingQueue = true;
    this.state.lastSyncAttempt = new Date();

    console.log(`[BackgroundSyncRecovery] Processing queue (${this.syncQueue.length} items)`);

    const itemsToProcess = [...this.syncQueue];
    const processedItems: string[] = [];
    const failedItems: BackgroundSyncQueueItem[] = [];

    for (const item of itemsToProcess) {
      try {
        console.log(`[BackgroundSyncRecovery] Processing queue item: ${item.operation} (${item.id})`);

        await this.processQueueItem(item);
        processedItems.push(item.id);

        console.log(`[BackgroundSyncRecovery] Successfully processed: ${item.operation} (${item.id})`);
      } catch (error) {
        console.error(`[BackgroundSyncRecovery] Failed to process queue item ${item.operation} (${item.id}):`, error);

        item.retryCount++;

        if (item.retryCount <= item.maxRetries) {
          console.log(`[BackgroundSyncRecovery] Will retry ${item.operation} (${item.id}). Retry ${item.retryCount}/${item.maxRetries}`);
          // Try again immediately
          try {
            console.log(`[BackgroundSyncRecovery] Retrying queue item: ${item.operation} (${item.id})`);
            await this.processQueueItem(item);
            processedItems.push(item.id);
            console.log(`[BackgroundSyncRecovery] Successfully processed on retry: ${item.operation} (${item.id})`);
          } catch (retryError) {
            console.error(`[BackgroundSyncRecovery] Retry failed for ${item.operation} (${item.id}):`, retryError);
            if (item.retryCount < item.maxRetries) {
              failedItems.push(item);
            } else {
              console.error(`[BackgroundSyncRecovery] Max retries exceeded for ${item.operation} (${item.id}). Discarding.`);
              processedItems.push(item.id);
            }
          }
        } else {
          console.error(`[BackgroundSyncRecovery] Max retries exceeded for ${item.operation} (${item.id}). Discarding.`);
          processedItems.push(item.id);
        }
      }
    }

    // Remove processed items from queue
    this.syncQueue = this.syncQueue.filter(item => !processedItems.includes(item.id));

    // Add failed items back to queue for retry
    this.syncQueue.push(...failedItems);

    // Update state
    this.state.queueSize = this.syncQueue.length;
    this.state.pendingOperations = this.syncQueue.map(item => item.operation);

    console.log(`[BackgroundSyncRecovery] Queue processing completed. Processed: ${processedItems.length}, Failed: ${failedItems.length}, Remaining: ${this.syncQueue.length}`);

    this.processingQueue = false;
  }

  /**
   * Process a single queue item
   */
  private async processQueueItem(item: BackgroundSyncQueueItem): Promise<void> {
    // Dynamic import to avoid circular dependency
    const { default: realTimeSyncManager } = await import('./realTimeSyncManager');
    
    switch (item.operation) {
      case 'sync':
        await realTimeSyncManager.forceSync();
        break;

      case 'subscription_refresh':
        await realTimeSyncManager.refreshSubscriptions({ forceRefresh: true });
        break;

      case 'connection_sync':
        // This could be used for specific connection-related sync operations
        await realTimeSyncManager.forceSync();
        break;

      default:
        throw new Error(`Unknown queue operation: ${item.operation}`);
    }
  }
}

// Create and export singleton instance
export const backgroundSyncRecoveryService = new BackgroundSyncRecoveryService();
export default backgroundSyncRecoveryService;