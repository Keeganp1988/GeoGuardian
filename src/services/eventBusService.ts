import { EventName, EventCallback, EventSubscription, EventPayload } from '../types/events';

/**
 * Lightweight Event Bus Service for decoupled communication between components
 * Provides event emission and subscription with automatic cleanup
 */
class EventBusService {
    private listeners: Map<EventName, Set<EventCallback>> = new Map();
    private subscriptionCounter = 0;
    private subscriptions: Map<number, { eventName: EventName; callback: EventCallback }> = new Map();

    /**
     * Emit an event with optional data payload
     * @param eventName - The name of the event to emit
     * @param data - Optional data payload to send with the event
     */
    emit<T = EventPayload>(eventName: EventName, data?: T): void {
        const eventListeners = this.listeners.get(eventName);

        if (!eventListeners || eventListeners.size === 0) {
            // Log for debugging purposes but don't throw error
            console.debug(`[EventBus] No listeners for event: ${eventName}`);
            return;
        }

        // Create a copy of listeners to avoid issues if listeners are modified during emission
        const listenersArray = Array.from(eventListeners);

        listenersArray.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EventBus] Error in event listener for ${eventName}:`, error);
            }
        });
    }

    /**
     * Subscribe to an event
     * @param eventName - The name of the event to listen for
     * @param callback - The callback function to execute when the event is emitted
     * @returns EventSubscription object with unsubscribe method
     */
    on<T = EventPayload>(eventName: EventName, callback: EventCallback<T>): EventSubscription {
        // Get or create the set of listeners for this event
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }

        const eventListeners = this.listeners.get(eventName)!;
        eventListeners.add(callback);

        // Create subscription tracking
        const subscriptionId = ++this.subscriptionCounter;
        this.subscriptions.set(subscriptionId, { eventName, callback });

        // Return subscription object with unsubscribe method
        return {
            unsubscribe: () => {
                this.removeListener(eventName, callback);
                this.subscriptions.delete(subscriptionId);
            }
        };
    }

    /**
     * Remove a specific event listener
     * @param eventName - The name of the event
     * @param callback - The callback function to remove
     */
    off(eventName: EventName, callback: EventCallback): void {
        this.removeListener(eventName, callback);
    }

    /**
     * Remove all listeners for a specific event
     * @param eventName - The name of the event to clear
     */
    removeAllListeners(eventName: EventName): void {
        const eventListeners = this.listeners.get(eventName);
        if (eventListeners) {
            eventListeners.clear();
        }
    }

    /**
     * Remove all listeners for all events
     */
    removeAllListenersForAllEvents(): void {
        this.listeners.clear();
        this.subscriptions.clear();
        this.subscriptionCounter = 0;
    }

    /**
     * Get the number of listeners for a specific event
     * @param eventName - The name of the event
     * @returns Number of listeners
     */
    getListenerCount(eventName: EventName): number {
        const eventListeners = this.listeners.get(eventName);
        return eventListeners ? eventListeners.size : 0;
    }

    /**
     * Get all active event names
     * @returns Array of event names that have listeners
     */
    getActiveEvents(): EventName[] {
        return Array.from(this.listeners.keys()).filter(eventName =>
            this.listeners.get(eventName)!.size > 0
        );
    }

    /**
     * Get total number of active subscriptions
     * @returns Total number of subscriptions across all events
     */
    getTotalSubscriptionCount(): number {
        return this.subscriptions.size;
    }

    /**
     * Private method to remove a listener
     */
    private removeListener(eventName: EventName, callback: EventCallback): void {
        const eventListeners = this.listeners.get(eventName);
        if (eventListeners) {
            eventListeners.delete(callback);

            // Clean up empty event listener sets
            if (eventListeners.size === 0) {
                this.listeners.delete(eventName);
            }
        }
    }
}

// Create and export singleton instance
export const eventBus = new EventBusService();
export default eventBus;