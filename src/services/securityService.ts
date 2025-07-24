// Security service for managing data security across the application

import { DataSecurityManager, DataEncryption } from '../utils/dataSecurity';
import { AuthSecurity } from '../utils/authSecurity';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import authService from './authService';

// Security service interface
export interface SecurityServiceInterface {
  initialize(): Promise<void>;
  validateUserSession(): Promise<boolean>;
  cleanupSecureData(): Promise<void>;
  encryptSensitiveData(key: string, data: any): Promise<void>;
  retrieveSensitiveData(key: string): Promise<any>;
  sanitizeUserInput(input: any): Promise<any>;
  validateFirebaseOperation(operation: string, data: any): Promise<boolean>;
}

// Security service implementation
class SecurityService implements SecurityServiceInterface {
  private isInitialized = false;
  private securityCheckInterval: NodeJS.Timeout | null = null;

  // Initialize security service
  async initialize(): Promise<void> {
    try {
      console.log('SecurityService: Initializing...');

      // Initialize data security manager
      await DataSecurityManager.initialize();

      // Start periodic security checks
      this.startSecurityChecks();

      this.isInitialized = true;
      console.log('SecurityService: Initialized successfully');
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        'SecurityService.initialize'
      );
      throw new Error('Failed to initialize security service');
    }
  }

  // Validate current user session
  async validateUserSession(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const validation = await authService.ensureValidAuthentication();
      return validation.isAuthenticated;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'SecurityService.validateUserSession'
      );
      return false;
    }
  }

  // Clean up expired secure data
  async cleanupSecureData(): Promise<void> {
    try {
      await DataEncryption.cleanupExpiredData();
      console.log('SecurityService: Secure data cleanup completed');
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'SecurityService.cleanupSecureData'
      );
    }
  }

  // Encrypt and store sensitive data
  async encryptSensitiveData(key: string, data: any): Promise<void> {
    try {
      await DataEncryption.storeSecureData(key, data);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        'SecurityService.encryptSensitiveData'
      );
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  // Retrieve and decrypt sensitive data
  async retrieveSensitiveData(key: string): Promise<any> {
    try {
      return await DataEncryption.retrieveSecureData(key);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        'SecurityService.retrieveSensitiveData'
      );
      return null;
    }
  }

  // Sanitize user input
  async sanitizeUserInput(input: any): Promise<any> {
    try {
      if (typeof input === 'string') {
        return await DataSecurityManager.processSecureData(input, { sanitize: true });
      } else if (typeof input === 'object' && input !== null) {
        return await DataSecurityManager.processSecureData(input, { sanitize: true });
      }
      return input;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.LOW,
        'SecurityService.sanitizeUserInput'
      );
      return input;
    }
  }

  // Validate Firebase operation
  async validateFirebaseOperation(operation: string, data: any): Promise<boolean> {
    try {
      // Check if user is authenticated
      const isAuthenticated = await this.validateUserSession();
      if (!isAuthenticated) {
        return false;
      }

      // Check rate limiting for the operation
      const userId = authService.getCurrentUserId();
      if (!userId) {
        return false;
      }

      // Basic rate limiting check (can be enhanced)
      const rateLimitKey = `${userId}_${operation}`;
      const now = Date.now();
      const stored = localStorage.getItem(`rate_limit_${rateLimitKey}`);

      if (stored) {
        const { count, windowStart } = JSON.parse(stored);
        const windowMs = 60000; // 1 minute
        const maxOperations = 100;

        if (now - windowStart < windowMs && count >= maxOperations) {
          ErrorHandler.logError(
            new Error(`Rate limit exceeded for operation: ${operation}`),
            ErrorCategory.VALIDATION,
            ErrorSeverity.MEDIUM,
            'SecurityService.validateFirebaseOperation'
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'SecurityService.validateFirebaseOperation'
      );
      return false;
    }
  }

  // Start periodic security checks
  private startSecurityChecks(): void {
    // Run security checks every 5 minutes
    this.securityCheckInterval = setInterval(async () => {
      try {
        // Clean up expired data
        await this.cleanupSecureData();

        // Validate current session
        await this.validateUserSession();
      } catch (error) {
        ErrorHandler.logError(
          error,
          ErrorCategory.UNKNOWN,
          ErrorSeverity.LOW,
          'SecurityService.periodicSecurityCheck'
        );
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Stop security checks
  stopSecurityChecks(): void {
    if (this.securityCheckInterval) {
      clearInterval(this.securityCheckInterval);
      this.securityCheckInterval = null;
    }
  }

  // Get security status
  getSecurityStatus(): {
    isInitialized: boolean;
    hasActiveChecks: boolean;
  } {
    return {
      isInitialized: this.isInitialized,
      hasActiveChecks: this.securityCheckInterval !== null,
    };
  }

  // Handle security incident
  async handleSecurityIncident(
    incident: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details?: any
  ): Promise<void> {
    try {
      const errorSeverity = {
        low: ErrorSeverity.LOW,
        medium: ErrorSeverity.MEDIUM,
        high: ErrorSeverity.HIGH,
        critical: ErrorSeverity.CRITICAL,
      }[severity];

      ErrorHandler.logError(
        new Error(`Security incident: ${incident}`),
        ErrorCategory.UNKNOWN,
        errorSeverity,
        'SecurityService.handleSecurityIncident'
      );

      // For critical incidents, clear user session
      if (severity === 'critical') {
        await authService.clearAuthState();
        await AuthSecurity.clearSession();
      }

      console.warn(`SecurityService: Security incident reported - ${incident}`, details);
    } catch (error) {
      console.error('SecurityService: Failed to handle security incident:', error);
    }
  }

  // Validate environment security
  validateEnvironmentSecurity(): {
    isSecure: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    try {
      // Check if running in development mode
      if (__DEV__) {
        warnings.push('Application is running in development mode');
      }

      // Check for debug mode (only in development)
      if (process.env.NODE_ENV === 'development' && typeof console !== 'undefined') {
        // In production, console methods might be disabled
        warnings.push('Console logging is enabled');
      }

      // Check for secure storage availability
      try {
        if (typeof localStorage === 'undefined') {
          warnings.push('Local storage is not available');
        }
      } catch {
        warnings.push('Local storage access is restricted');
      }

      return {
        isSecure: warnings.length === 0,
        warnings,
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'SecurityService.validateEnvironmentSecurity'
      );

      return {
        isSecure: false,
        warnings: ['Failed to validate environment security'],
      };
    }
  }
}

// Export singleton instance
const securityService = new SecurityService();
export default securityService;