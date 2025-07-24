// Shared service patterns to reduce code duplication

import { ErrorHandler, ErrorCategory } from './errorHandling';

// Service configuration interface
interface ServiceInitConfig {
  [key: string]: any;
}

// Common service initialization pattern
export const createServiceInitializer = (serviceName: string) => {
  return {
    initialize: async (config?: ServiceInitConfig) => {
      try {
        // Service-specific initialization logic would go here
        return true;
      } catch (error) {
        ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, `${serviceName} initialization`);
        return false;
      }
    },

    cleanup: async () => {
      try {
        // Service-specific cleanup logic would go here
        return true;
      } catch (error) {
        ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, `${serviceName} cleanup`);
        return false;
      }
    }
  };
};

// Common async operation wrapper
export const withServiceErrorHandling = async <T>(
  operation: () => Promise<T>,
  serviceName: string,
  operationName: string,
  showUserError: boolean = false
): Promise<T | null> => {
  try {
    return await operation();
  } catch (error) {
    const appError = ErrorHandler.logError(
      error,
      ErrorCategory.UNKNOWN,
      undefined,
      `${serviceName}.${operationName}`
    );

    if (showUserError) {
      ErrorHandler.showUserError(appError, `${serviceName} Error`);
    }

    return null;
  }
};

// Common subscription cleanup pattern
export const createSubscriptionManager = () => {
  const subscriptions: Array<() => void> = [];

  return {
    add: (unsubscribe: () => void) => {
      subscriptions.push(unsubscribe);
    },

    cleanup: () => {
      if (subscriptions && Array.isArray(subscriptions)) {
        subscriptions.forEach(unsubscribe => {
          try {
            unsubscribe();
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('Error cleaning up subscription:', error);
            }
          }
        });
      }
      subscriptions.length = 0;
    },

    count: () => subscriptions.length
  };
};

// Common retry pattern
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error = new Error('Operation failed');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw error;
      }

      // Log retry attempt for debugging in development only
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  throw lastError;
};

// Common debounce pattern for services
export const createDebouncer = (delay: number = 300) => {
  let timeoutId: NodeJS.Timeout | null = null;

  return {
    debounce: <T extends (...args: unknown[]) => any>(fn: T): T => {
      return ((...args: Parameters<T>) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
          fn(...args);
        }, delay);
      }) as T;
    },

    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
};

// Common throttle pattern for services
export const createThrottler = (delay: number = 1000) => {
  let lastExecution = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return {
    throttle: <T extends (...args: unknown[]) => any>(fn: T): T => {
      return ((...args: Parameters<T>) => {
        const now = Date.now();

        if (now - lastExecution >= delay) {
          lastExecution = now;
          fn(...args);
        } else if (!timeoutId) {
          timeoutId = setTimeout(() => {
            lastExecution = Date.now();
            fn(...args);
            timeoutId = null;
          }, delay - (now - lastExecution));
        }
      }) as T;
    },

    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
};

// Common service state management
export const createServiceState = <T>(initialState: T) => {
  let state = initialState;
  const listeners: Array<(state: T) => void> = [];

  return {
    getState: () => state,

    setState: (newState: Partial<T>) => {
      state = { ...state, ...newState };
      listeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Error in state listener:', error);
          }
        }
      });
    },

    subscribe: (listener: (state: T) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      };
    },

    reset: () => {
      state = initialState;
      listeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Error in state listener during reset:', error);
          }
        }
      });
    }
  };
};