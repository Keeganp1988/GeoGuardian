/**
 * Example usage of the Event Bus Service
 * This file demonstrates how to use the event bus for decoupled communication
 */

import eventBus from './eventBusService';
import { EVENT_NAMES, ConnectionChangeEvent, SyncRefreshEvent } from '../types/events';

// Example 1: Basic event emission and subscription
export function basicUsageExample() {
  // Subscribe to an event
  const subscription = eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, (data: SyncRefreshEvent) => {
    console.log('Sync refresh required:', data);
    // Handle sync refresh logic here
  });

  // Emit an event
  eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
    reason: 'connection_change',
    affectedUserIds: ['user1', 'user2'],
    timestamp: new Date(),
  });

  // Clean up when done (automatic cleanup)
  subscription.unsubscribe();
}

// Example 2: Connection change handling
export function connectionChangeExample() {
  const handleConnectionChange = (event: ConnectionChangeEvent) => {
    switch (event.changeType) {
      case 'added':
        console.log(`New connection added: ${event.connectionId}`);
        // Trigger sync refresh for new connection
        eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
          reason: 'connection_change',
          affectedUserIds: [event.otherUserId],
          timestamp: new Date(),
        });
        break;
      case 'removed':
        console.log(`Connection removed: ${event.connectionId}`);
        break;
      case 'updated':
        console.log(`Connection updated: ${event.connectionId}`);
        break;
    }
  };

  // Subscribe to connection events
  const connectionSubscription = eventBus.on(EVENT_NAMES.CONNECTION_ADDED, handleConnectionChange);
  
  // Simulate a new connection being added
  eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, {
    connectionId: 'conn-123',
    changeType: 'added',
    userId: 'current-user',
    otherUserId: 'new-contact',
    timestamp: new Date(),
  });

  return connectionSubscription;
}

// Example 3: Multiple event listeners with cleanup
export function multipleListenersExample() {
  const subscriptions: Array<{ unsubscribe: () => void }> = [];

  // Subscribe to multiple events
  subscriptions.push(
    eventBus.on(EVENT_NAMES.CACHE_INVALIDATED, (data) => {
      console.log('Cache invalidated:', data);
    })
  );

  subscriptions.push(
    eventBus.on(EVENT_NAMES.NETWORK_CHANGED, (data) => {
      console.log('Network changed:', data);
    })
  );

  subscriptions.push(
    eventBus.on(EVENT_NAMES.APP_STATE_CHANGED, (data) => {
      console.log('App state changed:', data);
    })
  );

  // Cleanup function to unsubscribe from all events
  const cleanup = () => {
    if (subscriptions && Array.isArray(subscriptions)) {
      (subscriptions ?? []).forEach(sub => sub.unsubscribe());
    }
  };

  return cleanup;
}

// Example 4: React Hook pattern (for reference)
export function useEventBusExample() {
  // This would be used in a React component
  // useEffect(() => {
  //   const subscription = eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, (data) => {
  //     // Handle sync refresh in component
  //   });
  //
  //   return () => {
  //     subscription.unsubscribe();
  //   };
  // }, []);
}

// Example 5: Service integration pattern
export class ExampleService {
  private subscriptions: Array<{ unsubscribe: () => void }> = [];

  constructor() {
    this.initializeEventListeners();
  }

  private initializeEventListeners() {
    // Listen for connection changes
    this.subscriptions.push(
      eventBus.on(EVENT_NAMES.CONNECTION_ADDED, this.handleConnectionAdded.bind(this))
    );

    this.subscriptions.push(
      eventBus.on(EVENT_NAMES.SYNC_REFRESH_REQUIRED, this.handleSyncRefresh.bind(this))
    );
  }

  private handleConnectionAdded(event: ConnectionChangeEvent) {
    console.log('Service handling new connection:', event.connectionId);
    // Service-specific logic here
  }

  private handleSyncRefresh(event: SyncRefreshEvent) {
    console.log('Service handling sync refresh:', event.reason);
    // Service-specific sync logic here
  }

  // Method to trigger events from this service
  public notifyConnectionChange(connectionId: string, changeType: 'added' | 'removed' | 'updated', userId: string, otherUserId: string) {
    eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, {
      connectionId,
      changeType,
      userId,
      otherUserId,
      timestamp: new Date(),
    });
  }

  // Cleanup method
  public destroy() {
    if (this.subscriptions && Array.isArray(this.subscriptions)) {
      (this.subscriptions ?? []).forEach(sub => sub.unsubscribe());
    }
    this.subscriptions = [];
  }
}