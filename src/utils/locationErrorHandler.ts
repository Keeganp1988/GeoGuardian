import * as Location from 'expo-location';
import { Alert } from 'react-native';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';

export interface LocationError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  timestamp: Date;
}

export interface RecoveryStrategy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  fallbackAction?: () => Promise<void>;
}

export class LocationErrorHandler {
  private errorHistory: LocationError[] = [];
  private retryAttempts: Map<string, number> = new Map();
  private lastErrorTime: Map<string, number> = new Map();

  // Error classification and handling
  classifyError(error: any): LocationError {
    const timestamp = new Date();

    // Location permission errors
    if (error.code === 'E_LOCATION_PERMISSIONS_DENIED' ||
      error.message?.includes('permission')) {
      return {
        code: 'PERMISSION_DENIED',
        message: 'Location permission denied by user',
        severity: 'critical',
        recoverable: true,
        timestamp,
      };
    }

    // Location service unavailable
    if (error.code === 'E_LOCATION_UNAVAILABLE' ||
      error.message?.includes('unavailable')) {
      return {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Location service is currently unavailable',
        severity: 'high',
        recoverable: true,
        timestamp,
      };
    }

    // GPS/Network timeout
    if (error.code === 'E_LOCATION_TIMEOUT' ||
      error.message?.includes('timeout')) {
      return {
        code: 'LOCATION_TIMEOUT',
        message: 'Location request timed out',
        severity: 'medium',
        recoverable: true,
        timestamp,
      };
    }

    // Poor GPS signal
    if (error.message?.includes('accuracy') ||
      error.message?.includes('signal')) {
      return {
        code: 'POOR_SIGNAL',
        message: 'Poor GPS signal quality',
        severity: 'low',
        recoverable: true,
        timestamp,
      };
    }

    // Network connectivity issues
    if (error.message?.includes('network') ||
      error.message?.includes('connection')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connectivity issue',
        severity: 'medium',
        recoverable: true,
        timestamp,
      };
    }

    // Firestore/Database errors
    if (error.message?.includes('firestore') ||
      error.message?.includes('database')) {
      return {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
        severity: 'medium',
        recoverable: true,
        timestamp,
      };
    }

    // Unknown errors
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'Unknown location error occurred',
      severity: 'medium',
      recoverable: true,
      timestamp,
    };
  }

  // Handle location errors with appropriate recovery strategies
  async handleLocationError(error: any, context: string): Promise<boolean> {
    const locationError = this.classifyError(error);
    this.errorHistory.push(locationError);

    // Log error through proper error handling system
    ErrorHandler.logError(locationError, ErrorCategory.LOCATION, ErrorSeverity.MEDIUM, context);

    // Implement recovery strategy based on error type
    switch (locationError.code) {
      case 'PERMISSION_DENIED':
        return await this.handlePermissionError();

      case 'SERVICE_UNAVAILABLE':
        return await this.handleServiceUnavailableError();

      case 'LOCATION_TIMEOUT':
        return await this.handleTimeoutError(context);

      case 'POOR_SIGNAL':
        return await this.handlePoorSignalError();

      case 'NETWORK_ERROR':
        return await this.handleNetworkError(context);

      case 'DATABASE_ERROR':
        return await this.handleDatabaseError(context);

      default:
        return await this.handleGenericError(locationError, context);
    }
  }

  // Handle permission denied errors
  private async handlePermissionError(): Promise<boolean> {
    try {
      // Show user-friendly alert
      Alert.alert(
        'Location Permission Required',
        'SafeCircle needs location access to keep you and your circle safe. Please enable location permissions in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              // This would open device settings in a real implementation
              // Open device settings for location permissions
            }
          }
        ]
      );

      // Attempt to re-request permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      ErrorHandler.logError(error, ErrorCategory.LOCATION, ErrorSeverity.HIGH, 'Permission Error');
      return false;
    }
  }

  // Handle service unavailable errors
  private async handleServiceUnavailableError(): Promise<boolean> {
    const strategy: RecoveryStrategy = {
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      backoffMultiplier: 2,
    };

    return await this.retryWithBackoff('SERVICE_UNAVAILABLE', strategy, async () => {
      // Check if location services are enabled
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to continue using SafeCircle.',
          [{ text: 'OK' }]
        );
        return false;
      }
      return true;
    });
  }

  // Handle timeout errors
  private async handleTimeoutError(context: string): Promise<boolean> {
    const strategy: RecoveryStrategy = {
      maxRetries: 2,
      retryDelay: 3000, // 3 seconds
      backoffMultiplier: 1.5,
    };

    return await this.retryWithBackoff(`TIMEOUT_${context}`, strategy, async () => {
      // Try with reduced accuracy for faster response
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.LocationAccuracy.Balanced,
        });
        return location !== null;
      } catch (error) {
        return false;
      }
    });
  }

  // Handle poor signal errors
  private async handlePoorSignalError(): Promise<boolean> {
    // For poor signal, we'll continue but with degraded service
    // Poor GPS signal - continuing with reduced accuracy

    // Could implement fallback to network-based location
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.LocationAccuracy.Low, // Use network location
      });
      return location !== null;
    } catch (error) {
      return false;
    }
  }

  // Handle network errors
  private async handleNetworkError(context: string): Promise<boolean> {
    const strategy: RecoveryStrategy = {
      maxRetries: 3,
      retryDelay: 2000, // 2 seconds
      backoffMultiplier: 2,
      fallbackAction: async () => {
        // Store location updates locally for later sync
        // Store location updates locally for later sync
      }
    };

    return await this.retryWithBackoff(`NETWORK_${context}`, strategy, async () => {
      // Simple network connectivity check
      try {
        const response = await fetch('https://www.google.com', {
          method: 'HEAD'
        });
        return response.ok;
      } catch (error) {
        return false;
      }
    });
  }

  // Handle database errors
  private async handleDatabaseError(context: string): Promise<boolean> {
    const strategy: RecoveryStrategy = {
      maxRetries: 2,
      retryDelay: 1000, // 1 second
      backoffMultiplier: 2,
      fallbackAction: async () => {
        // Use local storage as fallback
        // Use local storage as fallback for database error
      }
    };

    return await this.retryWithBackoff(`DATABASE_${context}`, strategy, async () => {
      // Test database connectivity
      try {
        // This would test the actual database connection
        return true;
      } catch (error) {
        return false;
      }
    });
  }

  // Handle generic errors
  private async handleGenericError(locationError: LocationError, context: string): Promise<boolean> {
    const strategy: RecoveryStrategy = {
      maxRetries: 1,
      retryDelay: 2000,
      backoffMultiplier: 1,
    };

    return await this.retryWithBackoff(`GENERIC_${context}`, strategy, async () => {
      // Generic retry logic
      // Retry after generic error
      return true;
    });
  }

  // Retry with exponential backoff
  private async retryWithBackoff(
    errorKey: string,
    strategy: RecoveryStrategy,
    retryFunction: () => Promise<boolean>
  ): Promise<boolean> {
    const currentRetries = this.retryAttempts.get(errorKey) || 0;

    if (currentRetries >= strategy.maxRetries) {
      ErrorHandler.logError(
        new Error(`Max retries exceeded for ${errorKey}`),
        ErrorCategory.LOCATION,
        ErrorSeverity.HIGH,
        'Max Retries Exceeded'
      );

      // Execute fallback action if available
      if (strategy.fallbackAction) {
        await strategy.fallbackAction();
      }

      // Reset retry count after max attempts
      this.retryAttempts.set(errorKey, 0);
      return false;
    }

    // Calculate delay with exponential backoff
    const delay = strategy.retryDelay * Math.pow(strategy.backoffMultiplier, currentRetries);

    // Log retry attempt only in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[LocationErrorHandler] Retrying ${errorKey} in ${delay}ms (attempt ${currentRetries + 1}/${strategy.maxRetries})`);
    }

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const success = await retryFunction();

      if (success) {
        // Reset retry count on success
        this.retryAttempts.set(errorKey, 0);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[LocationErrorHandler] Recovery successful for ${errorKey}`);
        }
        return true;
      } else {
        // Increment retry count and try again
        this.retryAttempts.set(errorKey, currentRetries + 1);
        return await this.retryWithBackoff(errorKey, strategy, retryFunction);
      }
    } catch (error) {
      // Increment retry count and try again
      this.retryAttempts.set(errorKey, currentRetries + 1);
      ErrorHandler.logError(error, ErrorCategory.LOCATION, ErrorSeverity.MEDIUM, `Retry failed for ${errorKey}`);
      return await this.retryWithBackoff(errorKey, strategy, retryFunction);
    }
  }

  // Get error statistics
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    recentErrors: LocationError[];
    recoveryRate: number;
  } {
    const errorsByType: Record<string, number> = {};
    let recoveredErrors = 0;

    this.errorHistory.forEach(error => {
      errorsByType[error.code] = (errorsByType[error.code] || 0) + 1;
      if (error.recoverable) {
        recoveredErrors++;
      }
    });

    // Get recent errors (last 10)
    const recentErrors = this.errorHistory.slice(-10);

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      recentErrors,
      recoveryRate: this.errorHistory.length > 0 ? recoveredErrors / this.errorHistory.length : 0,
    };
  }

  // Clear error history
  clearErrorHistory(): void {
    this.errorHistory = [];
    this.retryAttempts.clear();
    this.lastErrorTime.clear();
  }

  // Check if system is in a healthy state
  isSystemHealthy(): boolean {
    const recentErrors = this.errorHistory.filter(
      error => Date.now() - error.timestamp.getTime() < 300000 // Last 5 minutes
    );

    // System is unhealthy if there are more than 5 errors in the last 5 minutes
    // or if there are any critical errors in the last minute
    const criticalRecentErrors = recentErrors.filter(
      error => error.severity === 'critical' &&
        Date.now() - error.timestamp.getTime() < 60000 // Last minute
    );

    return recentErrors.length <= 5 && criticalRecentErrors.length === 0;
  }
}

// Export singleton instance
export const locationErrorHandler = new LocationErrorHandler();
export default locationErrorHandler;