import { LocationData } from '../firebase/services';
import { subscribeToUserLocation } from '../firebase/services';
import eventBus from './eventBusService';
import syncErrorHandler from './syncErrorHandlingService';
import performanceMonitor from './performanceMonitoringService';
import { EVENT_NAMES, SyncRefreshEvent } from '../types/events';

/**
 * Subscription Manager Service
 * Centralized management for location subscriptions with dynamic add/remove capabilities
 * and subscription refresh functionality
 */

export interface LocationCallback {
  (location: LocationData | null): void;
}

export interface SubscriptionInfo {
  userId: string;
  callback: LocationCallback;
  unsubscribe: () => void;
  createdAt: Date;
  lastUpdate?: Date;
}

export interface SubscriptionState {
  isInitialized: boolean;
  activeSubscriptions: Map<string, SubscriptionInfo>;
  totalSubscriptionCount: number;
  lastRefreshTime?: Date;
  refreshInProgress: boolean;
}

class SubscriptionManagerService {
  private state: SubscriptionState = {
    isInitialized: false,
    activeSubscriptions: new Map(),
    totalSubscriptionCount: 0,
    refreshInProgress: false,
  };

  private eventSubscriptions: Array<{ unsubscribe: () => void }> = [];

  /**
   * Initialize the subscription manager
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      console.log('[SubscriptionManager] Already initialized');
      return;
    }

    // Listen for sync refresh events
    const syncRefreshSub = eventBus.on<SyncRefreshEvent>(
      EVENT_NAMES.SYNC_REFRESH_REQUIRED,
      (event) => this.handleSyncRefreshEvent(event)
    );

    this.eventSubscriptions.push(syncRefreshSub);

    this.state.isInitialized = true;
    console.log('[SubscriptionManager] Initialized successfully');
  }

  /**
   * Subscribe to user location with automatic cleanup
   * @param userId - The user ID to subscribe to
   * @param callback - Callback function to handle location updates
   * @returns Unsubscribe function
   */
  subscribeToUserLocation(userId: string, callback: LocationCallback): () => void {
    if (!this.state.isInitialized) {
      throw new Error('SubscriptionManager not initialized. Call initialize() first.');
    }

    // Start performance timing
    const timingId = `subscription_${userId}_${Date.now()}`;
    performanceMonitor.startTiming(timingId, 'subscription');

    try {
      // Check if subscription already exists
      if (this.state.activeSubscriptions.has(userId)) {
        console.warn(`[SubscriptionManager] Subscription for user ${userId} already exists. Removing old subscription.`);
        this.removeSubscription(userId);
      }

      // Create new subscription
      const unsubscribe = subscribeToUserLocation(userId, (location) => {
        // Update last update time
        const subscription = this.state.activeSubscriptions.get(userId);
        if (subscription) {
          subscription.lastUpdate = new Date();
        }

        // Call the provided callback
        callback(location);
      });

      // Store subscription info
      const subscriptionInfo: SubscriptionInfo = {
        userId,
        callback,
        unsubscribe,
        createdAt: new Date(),
      };

      this.state.activeSubscriptions.set(userId, subscriptionInfo);
      this.state.totalSubscriptionCount = this.state.activeSubscriptions.size;

      // Update memory usage metrics
      performanceMonitor.updateMemoryUsage(
        this.state.totalSubscriptionCount,
        eventBus.getTotalSubscriptionCount(),
        0 // Cache entries would need to be tracked separately
      );

      console.log(`[SubscriptionManager] Added subscription for user: ${userId}. Total: ${this.state.totalSubscriptionCount}`);

      // End performance timing - success
      performanceMonitor.endTiming(timingId, true);

      // Return cleanup function
      return () => {
        this.removeSubscription(userId);
      };
    } catch (error) {
      // End performance timing - failure
      performanceMonitor.endTiming(timingId, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Add new subscription dynamically
   * @param userId - The user ID to subscribe to
   * @param callback - Callback function to handle location updates
   */
  addSubscription(userId: string, callback: LocationCallback): void {
    this.subscribeToUserLocation(userId, callback);
  }

  /**
   * Remove subscription for a specific user
   * @param userId - The user ID to unsubscribe from
   */
  removeSubscription(userId: string): void {
    const subscription = this.state.activeSubscriptions.get(userId);
    
    if (subscription) {
      // Call the unsubscribe function
      subscription.unsubscribe();
      
      // Remove from active subscriptions
      this.state.activeSubscriptions.delete(userId);
      this.state.totalSubscriptionCount = this.state.activeSubscriptions.size;
      
      console.log(`[SubscriptionManager] Removed subscription for user: ${userId}. Total: ${this.state.totalSubscriptionCount}`);
    } else {
      console.warn(`[SubscriptionManager] No subscription found for user: ${userId}`);
    }
  }

  /**
   * Refresh all active subscriptions
   * Re-establishes all active subscriptions with fresh connections
   */
  async refreshAllSubscriptions(): Promise<void> {
    // Use debouncing to prevent rapid refresh calls
    performanceMonitor.debounceSubscriptionChange(
      'refresh_all_subscriptions',
      async () => {
        await this.performRefreshAllSubscriptions();
      }
    );
  }

  /**
   * Internal method to perform the actual subscription refresh
   */
  private async performRefreshAllSubscriptions(): Promise<void> {
    if (this.state.refreshInProgress) {
      console.log('[SubscriptionManager] Refresh already in progress, skipping');
      return;
    }

    this.state.refreshInProgress = true;

    // Start performance timing
    const timingId = `refresh_all_${Date.now()}`;
    performanceMonitor.startTiming(timingId, 'sync');

    try {
      // Use comprehensive error handling with retry logic
      await syncErrorHandler.executeWithRetry(
        async () => {
          console.log(`[SubscriptionManager] Refreshing ${this.state.totalSubscriptionCount} active subscriptions`);

          // Store current subscriptions info
          const subscriptionsToRefresh = Array.from(this.state.activeSubscriptions.values());

          // Remove all current subscriptions
          for (const subscription of subscriptionsToRefresh) {
            subscription.unsubscribe();
          }

          // Clear the map
          this.state.activeSubscriptions.clear();

          // Re-establish all subscriptions
          for (const oldSubscription of subscriptionsToRefresh) {
            const newUnsubscribe = subscribeToUserLocation(oldSubscription.userId, oldSubscription.callback);
            
            const newSubscriptionInfo: SubscriptionInfo = {
              userId: oldSubscription.userId,
              callback: oldSubscription.callback,
              unsubscribe: newUnsubscribe,
              createdAt: new Date(), // New creation time
              lastUpdate: oldSubscription.lastUpdate,
            };

            this.state.activeSubscriptions.set(oldSubscription.userId, newSubscriptionInfo);
          }

          this.state.totalSubscriptionCount = this.state.activeSubscriptions.size;
          this.state.lastRefreshTime = new Date();

          // Update memory usage metrics
          performanceMonitor.updateMemoryUsage(
            this.state.totalSubscriptionCount,
            eventBus.getTotalSubscriptionCount(),
            0 // Cache entries would need to be tracked separately
          );

          console.log(`[SubscriptionManager] Successfully refreshed ${this.state.totalSubscriptionCount} subscriptions`);
        },
        'refreshAllSubscriptions',
        { subscriptionCount: this.state.totalSubscriptionCount }
      );

      // End performance timing - success
      performanceMonitor.endTiming(timingId, true);
    } catch (error) {
      // End performance timing - failure
      performanceMonitor.endTiming(timingId, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      this.state.refreshInProgress = false;
    }
  }

  /**
   * Get active subscription count
   * @returns Number of active subscriptions
   */
  getActiveSubscriptionCount(): number {
    return this.state.totalSubscriptionCount;
  }

  /**
   * Get list of user IDs with active subscriptions
   * @returns Array of user IDs
   */
  getActiveUserIds(): string[] {
    return Array.from(this.state.activeSubscriptions.keys());
  }

  /**
   * Check if a user has an active subscription
   * @param userId - The user ID to check
   * @returns True if subscription exists
   */
  hasSubscription(userId: string): boolean {
    return this.state.activeSubscriptions.has(userId);
  }

  /**
   * Get subscription info for a specific user
   * @param userId - The user ID
   * @returns Subscription info or undefined
   */
  getSubscriptionInfo(userId: string): SubscriptionInfo | undefined {
    return this.state.activeSubscriptions.get(userId);
  }

  /**
   * Get subscription state for debugging/monitoring
   * @returns Current subscription state
   */
  getSubscriptionState(): Readonly<SubscriptionState> {
    return {
      ...this.state,
      activeSubscriptions: new Map(this.state.activeSubscriptions), // Return a copy
    };
  }

  /**
   * Clean up all subscriptions and event listeners
   */
  async cleanup(): Promise<void> {
    console.log('[SubscriptionManager] Cleaning up all subscriptions and listeners');

    // Remove all active subscriptions
    for (const subscription of this.state.activeSubscriptions.values()) {
      subscription.unsubscribe();
    }

    // Clear state
    this.state.activeSubscriptions.clear();
    this.state.totalSubscriptionCount = 0;

    // Remove event listeners
    if (this.eventSubscriptions && Array.isArray(this.eventSubscriptions)) {
      this.eventSubscriptions.forEach(sub => {
        try {
          sub.unsubscribe();
        } catch (error) {
          console.error('[SubscriptionManager] Error unsubscribing:', error);
        }
      });
    }
    this.eventSubscriptions = [];

    this.state.isInitialized = false;
    console.log('[SubscriptionManager] Cleanup completed');
  }

  /**
   * Handle sync refresh events from the event bus
   * @param event - The sync refresh event
   */
  private async handleSyncRefreshEvent(event: SyncRefreshEvent): Promise<void> {
    console.log(`[SubscriptionManager] Handling sync refresh event: ${event.reason}`);

    // Use comprehensive error handling for sync refresh events
    await syncErrorHandler.executeWithRetry(
      async () => {
        // Refresh subscriptions based on the event reason
        switch (event.reason) {
          case 'connection_change':
            // For connection changes, we might need to add/remove specific subscriptions
            // This will be handled by the calling code, but we can refresh all to be safe
            await this.refreshAllSubscriptions();
            break;
          
          case 'cache_invalidation':
            // Cache invalidation might require subscription refresh
            await this.refreshAllSubscriptions();
            break;
          
          case 'network_recovery':
            // Network recovery definitely requires subscription refresh
            await this.refreshAllSubscriptions();
            break;
          
          case 'manual':
            // Manual refresh requested
            await this.refreshAllSubscriptions();
            break;
          
          default:
            console.log(`[SubscriptionManager] Unknown refresh reason: ${event.reason}`);
            break;
        }
      },
      'handleSyncRefreshEvent',
      { reason: event.reason, source: event.source }
    );
  }

  /**
   * Force refresh subscriptions for specific users
   * @param userIds - Array of user IDs to refresh
   */
  async refreshSubscriptionsForUsers(userIds: string[]): Promise<void> {
    console.log(`[SubscriptionManager] Refreshing subscriptions for specific users: ${userIds.join(', ')}`);

    for (const userId of userIds) {
      const subscription = this.state.activeSubscriptions.get(userId);
      if (subscription) {
        // Remove old subscription
        subscription.unsubscribe();
        
        // Create new subscription
        const newUnsubscribe = subscribeToUserLocation(userId, subscription.callback);
        
        // Update subscription info
        const newSubscriptionInfo: SubscriptionInfo = {
          ...subscription,
          unsubscribe: newUnsubscribe,
          createdAt: new Date(),
        };
        
        this.state.activeSubscriptions.set(userId, newSubscriptionInfo);
        console.log(`[SubscriptionManager] Refreshed subscription for user: ${userId}`);
      } else {
        console.warn(`[SubscriptionManager] No subscription found for user: ${userId}`);
      }
    }
  }
}

// Create and export singleton instance
export const subscriptionManager = new SubscriptionManagerService();
export default subscriptionManager;