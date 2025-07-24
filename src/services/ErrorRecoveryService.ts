// Error recovery service for handling authentication state corruption and system errors

import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import { NullSafety } from '../utils/nullSafety';
import authService from './authService';
import authStateManager from './AuthStateManager';
import authPersistenceService from './AuthPersistenceService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecoveryResult {
  success: boolean;
  actionsPerformed: string[];
  errors: string[];
}

export interface SystemHealthCheck {
  authServiceHealthy: boolean;
  persistenceServiceHealthy: boolean;
  stateManagerHealthy: boolean;
  storageAccessible: boolean;
  errors: string[];
}

/**
 * Error recovery service for handling various system failures and corruption
 */
export class ErrorRecoveryService {
  private static readonly RECOVERY_LOG_KEY = '@recovery_log';
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;
  private static readonly RECOVERY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Perform comprehensive system health check
   */
  static async performHealthCheck(): Promise<SystemHealthCheck> {
    const errors: string[] = [];
    let authServiceHealthy = false;
    let persistenceServiceHealthy = false;
    let stateManagerHealthy = false;
    let storageAccessible = false;

    try {
      // Check auth service health
      try {
        const authState = authService.getAuthState();
        authServiceHealthy = authState !== null && typeof authState === 'object';
      } catch (error) {
        errors.push('Auth service health check failed');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.performHealthCheck authService'
        );
      }

      // Check persistence service health
      try {
        const isKeychainAvailable = await authPersistenceService.isKeychainAvailable();
        persistenceServiceHealthy = isKeychainAvailable;
      } catch (error) {
        errors.push('Persistence service health check failed');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.performHealthCheck persistenceService'
        );
      }

      // Check state manager health
      try {
        const isInTransition = authStateManager.isInTransition();
        const config = authStateManager.getConfig();
        stateManagerHealthy = typeof isInTransition === 'boolean' && config !== null;
      } catch (error) {
        errors.push('State manager health check failed');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.performHealthCheck stateManager'
        );
      }

      // Check storage accessibility
      try {
        const testKey = '@health_check_test';
        const testValue = Date.now().toString();
        await AsyncStorage.setItem(testKey, testValue);
        const retrieved = await AsyncStorage.getItem(testKey);
        await AsyncStorage.removeItem(testKey);
        storageAccessible = retrieved === testValue;
      } catch (error) {
        errors.push('Storage accessibility check failed');
        ErrorHandler.logError(
          error,
          ErrorCategory.UNKNOWN,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.performHealthCheck storage'
        );
      }

      return {
        authServiceHealthy,
        persistenceServiceHealthy,
        stateManagerHealthy,
        storageAccessible,
        errors
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        'ErrorRecoveryService.performHealthCheck'
      );

      return {
        authServiceHealthy: false,
        persistenceServiceHealthy: false,
        stateManagerHealthy: false,
        storageAccessible: false,
        errors: ['Health check failed completely']
      };
    }
  }

  /**
   * Recover from authentication state corruption
   */
  static async recoverAuthState(): Promise<RecoveryResult> {
    const actionsPerformed: string[] = [];
    const errors: string[] = [];

    try {
      console.log('🔧 ErrorRecoveryService: Starting auth state recovery');

      // Check if we're in recovery cooldown
      const canRecover = await this.canAttemptRecovery();
      if (!canRecover) {
        return {
          success: false,
          actionsPerformed,
          errors: ['Recovery is in cooldown period']
        };
      }

      // Log recovery attempt
      await this.logRecoveryAttempt('auth_state_recovery');

      // Step 1: Clear corrupted state manager state
      try {
        if (authStateManager.detectCorruptedState()) {
          authStateManager.recoverAuthState();
          actionsPerformed.push('Recovered corrupted state manager state');
        }
      } catch (error) {
        errors.push('Failed to recover state manager');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.recoverAuthState stateManager'
        );
      }

      // Step 2: Validate and potentially refresh stored authentication
      try {
        const validation = await authService.validateStoredAuth();
        if (!validation.isValid) {
          await authService.clearStoredAuth();
          actionsPerformed.push('Cleared invalid stored authentication');
        } else if (validation.needsRefresh) {
          const refreshResult = await authPersistenceService.refreshTokenIfNeeded();
          if (refreshResult.success) {
            actionsPerformed.push('Refreshed authentication token');
          } else {
            await authService.clearStoredAuth();
            actionsPerformed.push('Cleared unrefreshable authentication');
          }
        }
      } catch (error) {
        errors.push('Failed to validate/refresh stored auth');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.recoverAuthState validation'
        );
      }

      // Step 3: Reset auth service to known good state
      try {
        const currentState = authService.getAuthState();
        if (currentState.isInitializing) {
          // Force complete any stuck initialization
          authStateManager.completeAuthTransition();
          actionsPerformed.push('Completed stuck auth transition');
        }
      } catch (error) {
        errors.push('Failed to reset auth service state');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.recoverAuthState authService'
        );
      }

      // Step 4: Clean up any orphaned storage keys
      try {
        await this.cleanupOrphanedStorageKeys();
        actionsPerformed.push('Cleaned up orphaned storage keys');
      } catch (error) {
        errors.push('Failed to cleanup orphaned storage');
        ErrorHandler.logError(
          error,
          ErrorCategory.UNKNOWN,
          ErrorSeverity.LOW,
          'ErrorRecoveryService.recoverAuthState cleanup'
        );
      }

      const success = errors.length === 0 || actionsPerformed.length > 0;
      
      console.log(`🔧 ErrorRecoveryService: Auth state recovery ${success ? 'completed' : 'failed'}`);
      console.log('Actions performed:', actionsPerformed);
      if (errors.length > 0) {
        console.log('Errors encountered:', errors);
      }

      return {
        success,
        actionsPerformed,
        errors
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'ErrorRecoveryService.recoverAuthState'
      );

      return {
        success: false,
        actionsPerformed,
        errors: ['Recovery process failed completely']
      };
    }
  }

  /**
   * Recover from forEach and array operation errors
   */
  static async recoverFromArrayErrors(): Promise<RecoveryResult> {
    const actionsPerformed: string[] = [];
    const errors: string[] = [];

    try {
      console.log('🔧 ErrorRecoveryService: Starting array error recovery');

      // This is more of a preventive measure - ensure all array operations use null safety
      // Check auth service listeners array
      try {
        const authState = authService.getAuthState();
        if (authState) {
          actionsPerformed.push('Verified auth service state structure');
        }
      } catch (error) {
        errors.push('Auth service state verification failed');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.recoverFromArrayErrors authService'
        );
      }

      // Verify state manager arrays
      try {
        const config = authStateManager.getConfig();
        if (config) {
          actionsPerformed.push('Verified state manager configuration');
        }
      } catch (error) {
        errors.push('State manager verification failed');
        ErrorHandler.logError(
          error,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'ErrorRecoveryService.recoverFromArrayErrors stateManager'
        );
      }

      return {
        success: errors.length === 0,
        actionsPerformed,
        errors
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        'ErrorRecoveryService.recoverFromArrayErrors'
      );

      return {
        success: false,
        actionsPerformed,
        errors: ['Array error recovery failed']
      };
    }
  }

  /**
   * Perform emergency reset of all authentication systems
   */
  static async performEmergencyReset(): Promise<RecoveryResult> {
    const actionsPerformed: string[] = [];
    const errors: string[] = [];

    try {
      console.warn('🚨 ErrorRecoveryService: Performing emergency reset');

      // Log emergency reset
      await this.logRecoveryAttempt('emergency_reset');

      // Step 1: Clear all stored authentication data
      try {
        await authService.clearAuthState();
        actionsPerformed.push('Cleared auth service state');
      } catch (error) {
        errors.push('Failed to clear auth service state');
      }

      // Step 2: Clear persistence service data
      try {
        await authPersistenceService.clearStoredAuth();
        actionsPerformed.push('Cleared persistence service data');
      } catch (error) {
        errors.push('Failed to clear persistence data');
      }

      // Step 3: Reset state manager
      try {
        authStateManager.resetAuthFlow();
        actionsPerformed.push('Reset state manager');
      } catch (error) {
        errors.push('Failed to reset state manager');
      }

      // Step 4: Clear all auth-related storage
      try {
        await this.clearAllAuthStorage();
        actionsPerformed.push('Cleared all auth-related storage');
      } catch (error) {
        errors.push('Failed to clear auth storage');
      }

      // Step 5: Force garbage collection if available
      try {
        if (global.gc) {
          global.gc();
          actionsPerformed.push('Forced garbage collection');
        }
      } catch (error) {
        // Ignore - gc might not be available
      }

      console.warn('🚨 ErrorRecoveryService: Emergency reset completed');
      console.log('Actions performed:', actionsPerformed);
      if (errors.length > 0) {
        console.log('Errors encountered:', errors);
      }

      return {
        success: actionsPerformed.length > 0,
        actionsPerformed,
        errors
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.CRITICAL,
        'ErrorRecoveryService.performEmergencyReset'
      );

      return {
        success: false,
        actionsPerformed,
        errors: ['Emergency reset failed completely']
      };
    }
  }

  /**
   * Check if recovery can be attempted (not in cooldown)
   */
  private static async canAttemptRecovery(): Promise<boolean> {
    try {
      const recoveryLog = await this.getRecoveryLog();
      const now = Date.now();
      
      // Check recent attempts
      const recentAttempts = NullSafety.safeFilter(
        recoveryLog,
        attempt => (now - attempt.timestamp) < this.RECOVERY_COOLDOWN_MS
      );

      return recentAttempts.length < this.MAX_RECOVERY_ATTEMPTS;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'ErrorRecoveryService.canAttemptRecovery'
      );
      return true; // Allow recovery on error to avoid blocking legitimate recovery
    }
  }

  /**
   * Log recovery attempt
   */
  private static async logRecoveryAttempt(type: string): Promise<void> {
    try {
      const recoveryLog = await this.getRecoveryLog();
      const newAttempt = {
        type,
        timestamp: Date.now(),
        id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      recoveryLog.push(newAttempt);

      // Keep only recent attempts (last 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const filteredLog = NullSafety.safeFilter(
        recoveryLog,
        attempt => attempt.timestamp > oneDayAgo
      );

      await AsyncStorage.setItem(
        this.RECOVERY_LOG_KEY,
        JSON.stringify(filteredLog)
      );
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'ErrorRecoveryService.logRecoveryAttempt'
      );
    }
  }

  /**
   * Get recovery log
   */
  private static async getRecoveryLog(): Promise<Array<{ type: string; timestamp: number; id: string }>> {
    try {
      const stored = await AsyncStorage.getItem(this.RECOVERY_LOG_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'ErrorRecoveryService.getRecoveryLog'
      );
      return [];
    }
  }

  /**
   * Clean up orphaned storage keys
   */
  private static async cleanupOrphanedStorageKeys(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Find potentially orphaned auth keys
      const suspiciousKeys = NullSafety.safeFilter([...allKeys], key => {
        return (
          key.includes('auth') ||
          key.includes('firebase') ||
          key.includes('token') ||
          key.includes('session')
        ) && !key.startsWith('@'); // Keep keys that start with @ as they're likely legitimate
      });

      if (suspiciousKeys.length > 0) {
        console.log('🔧 ErrorRecoveryService: Found suspicious keys:', suspiciousKeys);
        
        // Remove suspicious keys (be conservative)
        const keysToRemove = NullSafety.safeFilter(suspiciousKeys, key => {
          // Only remove keys that are clearly temporary or corrupted
          return key.includes('temp') || key.includes('corrupt') || key.includes('invalid');
        });

        if (keysToRemove.length > 0) {
          await AsyncStorage.multiRemove(keysToRemove);
          console.log('🔧 ErrorRecoveryService: Removed orphaned keys:', keysToRemove);
        }
      }
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'ErrorRecoveryService.cleanupOrphanedStorageKeys'
      );
    }
  }

  /**
   * Clear all auth-related storage
   */
  private static async clearAllAuthStorage(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      
      const authKeys = NullSafety.safeFilter([...allKeys], key => 
        key.includes('auth') || 
        key.includes('firebase') || 
        key.includes('user') ||
        key.includes('session') ||
        key.includes('token') ||
        key.includes('login')
      );

      if (authKeys.length > 0) {
        await AsyncStorage.multiRemove(authKeys);
        console.log('🔧 ErrorRecoveryService: Cleared auth storage keys:', authKeys);
      }
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        'ErrorRecoveryService.clearAllAuthStorage'
      );
    }
  }

  /**
   * Get recovery statistics
   */
  static async getRecoveryStats(): Promise<{
    totalAttempts: number;
    recentAttempts: number;
    lastRecovery: number | null;
    recoveryTypes: Record<string, number>;
  }> {
    try {
      const recoveryLog = await this.getRecoveryLog();
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);

      const recentAttempts = NullSafety.safeFilter(
        recoveryLog,
        attempt => attempt.timestamp > oneDayAgo
      );

      const recoveryTypes: Record<string, number> = {};
      NullSafety.safeForEach(recoveryLog, attempt => {
        recoveryTypes[attempt.type] = (recoveryTypes[attempt.type] || 0) + 1;
      });

      const lastRecovery = recoveryLog.length > 0 
        ? Math.max(...NullSafety.safeMap(recoveryLog, attempt => attempt.timestamp))
        : null;

      return {
        totalAttempts: recoveryLog.length,
        recentAttempts: recentAttempts.length,
        lastRecovery,
        recoveryTypes
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'ErrorRecoveryService.getRecoveryStats'
      );

      return {
        totalAttempts: 0,
        recentAttempts: 0,
        lastRecovery: null,
        recoveryTypes: {}
      };
    }
  }
}

export default ErrorRecoveryService;