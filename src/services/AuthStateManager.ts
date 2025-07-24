export interface AuthStateUpdate {
  type: 'user' | 'isAuthenticated' | 'isLocalDBReady' | 'isInitializing';
  value: any;
  timestamp: number;
}

export interface AuthStateBatch {
  id: string;
  updates: AuthStateUpdate[];
  timestamp: number;
  isComplete: boolean;
  transitionDuration: number;
}

export interface TransitionConfig {
  debounceDelay: number;
  batchWindow: number;
  maxTransitionTime: number;
  enableSmoothing: boolean;
}

export interface AuthStateManager {
  // State batching
  batchStateUpdates(updates: AuthStateUpdate[]): void;
  flushPendingUpdates(): void;
  
  // Debouncing
  debounceAuthStateChange(callback: () => void, delay?: number): void;
  
  // Transition management
  beginAuthTransition(): void;
  completeAuthTransition(): void;
  isInTransition(): boolean;
  
  // Error recovery
  detectCorruptedState(): boolean;
  recoverAuthState(): void;
  fallbackToDirectUpdates(): void;
  resetAuthFlow(): void;
}

class AuthStateManagerImpl implements AuthStateManager {
  private pendingUpdates: AuthStateUpdate[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private transitionTimeoutId: NodeJS.Timeout | null = null;
  private isTransitioning = false;
  private transitionStartTime = 0;
  private listeners: ((updates: AuthStateUpdate[]) => void)[] = [];
  
  private config: TransitionConfig = {
    debounceDelay: 30, // Reduced to 30ms for faster response while still preventing rapid updates
    batchWindow: 75, // Reduced to 75ms for more responsive batching
    maxTransitionTime: 2000, // 2 second max timeout as per requirements
    enableSmoothing: true
  };

  constructor() {
    console.log('🔄 AuthStateManager: Initialized with config:', this.config);
  }

  // Subscribe to batched state updates
  subscribe(listener: (updates: AuthStateUpdate[]) => void): () => void {
    // Ensure listeners array is properly initialized
    if (!this.listeners || !Array.isArray(this.listeners)) {
      this.listeners = [];
    }
    
    this.listeners.push(listener);
    return () => {
      if (this.listeners && Array.isArray(this.listeners)) {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      }
    };
  }

  // Batch state updates within the configured window
  batchStateUpdates(updates: AuthStateUpdate[]): void {
    console.log('🔄 AuthStateManager: Batching updates:', updates.length);
    
    // Add updates to pending batch
    this.pendingUpdates.push(...updates);
    
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    // Set new timeout to flush updates after batch window
    this.batchTimeout = setTimeout(() => {
      this.flushPendingUpdates();
    }, this.config.batchWindow);
  }

  // Flush all pending updates immediately
  flushPendingUpdates(): void {
    if (this.pendingUpdates.length === 0) {
      return;
    }

    console.log('🔄 AuthStateManager: Flushing', this.pendingUpdates.length, 'pending updates');
    
    // Create a copy of updates and clear pending
    const updatesToFlush = [...this.pendingUpdates];
    this.pendingUpdates = [];
    
    // Clear batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    // Ensure listeners array is properly initialized before using
    if (!this.listeners || !Array.isArray(this.listeners)) {
      console.warn('🔄 AuthStateManager: Listeners array is null or not an array, reinitializing');
      this.listeners = [];
      return;
    }
    
    // Notify all listeners with batched updates
    if (this.listeners && Array.isArray(this.listeners) && this.listeners.length > 0) {
      try {
        (this.listeners ?? []).forEach(listener => {
          try {
            if (typeof listener === 'function') {
              listener(updatesToFlush);
            }
          } catch (error) {
            console.error('🔄 AuthStateManager: Error in listener:', error);
          }
        });
      } catch (error) {
        console.error('🔄 AuthStateManager: Error iterating listeners:', error);
        // Reinitialize listeners array if corrupted
        this.listeners = [];
      }
    }
  }

  // Debounce rapid authentication state changes
  debounceAuthStateChange(callback: () => void, delay?: number): void {
    const debounceDelay = delay || this.config.debounceDelay;
    
    console.log('🔄 AuthStateManager: Debouncing auth state change with delay:', debounceDelay);
    
    // Clear existing debounce timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    // If we're in transition mode, use immediate execution to prevent delays
    if (this.isTransitioning && this.config.enableSmoothing) {
      console.log('🔄 AuthStateManager: In transition mode, executing callback immediately');
      try {
        callback();
      } catch (error) {
        console.error('🔄 AuthStateManager: Error in immediate callback execution:', error);
      }
      return;
    }
    
    // Set new debounce timeout
    this.debounceTimeout = setTimeout(() => {
      console.log('🔄 AuthStateManager: Executing debounced callback');
      try {
        callback();
      } catch (error) {
        console.error('🔄 AuthStateManager: Error in debounced callback execution:', error);
      }
      this.debounceTimeout = null;
    }, debounceDelay);
  }

  // Begin authentication transition
  beginAuthTransition(): void {
    console.log('🔄 AuthStateManager: Beginning auth transition');
    
    this.isTransitioning = true;
    this.transitionStartTime = Date.now();
    
    // Set timeout to prevent infinite loading states (2 second max as per requirements)
    const timeoutId = setTimeout(() => {
      if (this.isTransitioning) {
        console.warn('🔄 AuthStateManager: Auth transition timeout reached after', this.config.maxTransitionTime, 'ms, forcing completion');
        this.completeAuthTransition();
      }
    }, this.config.maxTransitionTime);
    
    // Store timeout ID for cleanup
    this.transitionTimeoutId = timeoutId;
  }

  // Complete authentication transition
  completeAuthTransition(): void {
    if (!this.isTransitioning) {
      return;
    }

    const transitionDuration = Date.now() - this.transitionStartTime;
    console.log('🔄 AuthStateManager: Completing auth transition after', transitionDuration, 'ms');
    
    this.isTransitioning = false;
    this.transitionStartTime = 0;
    
    // Clear transition timeout
    if (this.transitionTimeoutId) {
      clearTimeout(this.transitionTimeoutId);
      this.transitionTimeoutId = null;
    }
    
    // Flush any remaining updates
    this.flushPendingUpdates();
  }

  // Check if currently in transition
  isInTransition(): boolean {
    return this.isTransitioning;
  }

  // Update configuration
  updateConfig(newConfig: Partial<TransitionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔄 AuthStateManager: Updated config:', this.config);
  }

  // Get current configuration
  getConfig(): TransitionConfig {
    return { ...this.config };
  }

  // Error recovery strategies
  detectCorruptedState(): boolean {
    try {
      // Check for inconsistent state conditions
      const hasStaleUpdates = Array.isArray(this.pendingUpdates) && 
        this.pendingUpdates.some(update => 
          update && update.timestamp && 
          Date.now() - update.timestamp > this.config.maxTransitionTime
        );
      
      const hasLongRunningTransition = this.isTransitioning && 
        this.transitionStartTime > 0 &&
        (Date.now() - this.transitionStartTime) > this.config.maxTransitionTime;
      
      const hasInvalidListeners = !Array.isArray(this.listeners);
      
      return hasStaleUpdates || hasLongRunningTransition || hasInvalidListeners;
    } catch (error) {
      console.error('🔄 AuthStateManager: Error detecting corrupted state:', error);
      return true; // Assume corrupted if we can't check
    }
  }

  recoverAuthState(): void {
    console.warn('🔄 AuthStateManager: Recovering from corrupted state');
    
    try {
      // Ensure arrays are properly initialized
      if (!Array.isArray(this.pendingUpdates)) {
        this.pendingUpdates = [];
      }
      
      if (!Array.isArray(this.listeners)) {
        this.listeners = [];
      }
      
      // Clear stale updates safely
      this.pendingUpdates = this.pendingUpdates.filter(update => {
        try {
          return update && 
                 update.timestamp && 
                 Date.now() - update.timestamp <= this.config.maxTransitionTime;
        } catch (error) {
          console.warn('🔄 AuthStateManager: Removing invalid update during recovery:', error);
          return false;
        }
      });
      
      // Force complete transition if stuck
      if (this.isTransitioning && 
          this.transitionStartTime > 0 && 
          (Date.now() - this.transitionStartTime) > this.config.maxTransitionTime) {
        this.completeAuthTransition();
      }
      
      // Clear timeouts safely
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = null;
      }
      
      if (this.transitionTimeoutId) {
        clearTimeout(this.transitionTimeoutId);
        this.transitionTimeoutId = null;
      }
      
      // Reset transition state
      this.isTransitioning = false;
      this.transitionStartTime = 0;
      
      console.log('🔄 AuthStateManager: State recovery completed');
    } catch (error) {
      console.error('🔄 AuthStateManager: Error during state recovery:', error);
      // Force reset everything as last resort
      this.resetAuthFlow();
    }
  }

  fallbackToDirectUpdates(): void {
    console.warn('🔄 AuthStateManager: Falling back to direct updates');
    
    // Flush any pending updates immediately
    this.flushPendingUpdates();
    
    // Disable batching temporarily
    const originalBatchWindow = this.config.batchWindow;
    this.config.batchWindow = 0;
    
    // Re-enable batching after a short delay
    setTimeout(() => {
      this.config.batchWindow = originalBatchWindow;
      console.log('🔄 AuthStateManager: Batching re-enabled');
    }, 1000);
  }

  resetAuthFlow(): void {
    console.log('🔄 AuthStateManager: Resetting auth flow');
    
    // Complete any ongoing transition
    if (this.isTransitioning) {
      this.completeAuthTransition();
    }
    
    // Clear all pending updates
    this.pendingUpdates = [];
    
    // Clear timeouts
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    if (this.transitionTimeoutId) {
      clearTimeout(this.transitionTimeoutId);
      this.transitionTimeoutId = null;
    }
    
    // Reset state
    this.isTransitioning = false;
    this.transitionStartTime = 0;
  }

  // Cleanup method
  cleanup(): void {
    console.log('🔄 AuthStateManager: Cleaning up');
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    if (this.transitionTimeoutId) {
      clearTimeout(this.transitionTimeoutId);
      this.transitionTimeoutId = null;
    }
    
    this.pendingUpdates = [];
    this.isTransitioning = false;
    this.listeners = [];
  }
}

// Export singleton instance
const authStateManager = new AuthStateManagerImpl();
export default authStateManager;