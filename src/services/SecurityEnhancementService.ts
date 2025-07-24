// Security enhancement service for authentication breach detection and token validation

import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import { NullSafety } from '../utils/nullSafety';
import authPersistenceService from './AuthPersistenceService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth } from '../firebase/firebase';

export interface SecurityThreat {
  type: 'device_change' | 'token_tampering' | 'unusual_activity' | 'multiple_devices';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface SecurityValidationResult {
  isSecure: boolean;
  threats: SecurityThreat[];
  recommendations: string[];
}

export interface TokenValidationEnhanced {
  isValid: boolean;
  isGenuine: boolean;
  hasBeenTampered: boolean;
  deviceFingerprint: string;
  lastValidationTime: number;
}

/**
 * Enhanced security service for authentication protection
 */
export class SecurityEnhancementService {
  private static readonly SECURITY_LOG_KEY = '@security_log';
  private static readonly DEVICE_FINGERPRINT_KEY = '@device_fingerprint';
  private static readonly VALIDATION_HISTORY_KEY = '@validation_history';
  private static readonly MAX_SECURITY_LOGS = 100;
  private static readonly THREAT_DETECTION_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Validate authentication token with enhanced security checks
   */
  static async validateTokenSecurity(): Promise<TokenValidationEnhanced> {
    try {
      const deviceFingerprint = await this.generateDeviceFingerprint();
      const storedToken = await authPersistenceService.getStoredTokenInfo();
      
      if (!storedToken) {
        return {
          isValid: false,
          isGenuine: false,
          hasBeenTampered: false,
          deviceFingerprint,
          lastValidationTime: Date.now()
        };
      }

      // Check for token tampering
      const hasBeenTampered = await this.detectTokenTampering(storedToken);
      
      // Validate device consistency
      const isGenuine = await this.validateDeviceConsistency(storedToken.deviceId, deviceFingerprint);
      
      // Check Firebase auth state consistency
      const auth = getFirebaseAuth();
      const firebaseUser = auth?.currentUser;
      const isValid = !!(firebaseUser && firebaseUser.uid === storedToken.userId && !hasBeenTampered);

      const result: TokenValidationEnhanced = {
        isValid,
        isGenuine,
        hasBeenTampered,
        deviceFingerprint,
        lastValidationTime: Date.now()
      };

      // Log validation result
      await this.logSecurityEvent({
        type: hasBeenTampered ? 'token_tampering' : 'unusual_activity',
        severity: hasBeenTampered ? 'critical' : 'low',
        description: `Token validation: ${isValid ? 'valid' : 'invalid'}, genuine: ${isGenuine}, tampered: ${hasBeenTampered}`,
        timestamp: Date.now(),
        metadata: { result }
      });

      return result;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'SecurityEnhancementService.validateTokenSecurity'
      );

      return {
        isValid: false,
        isGenuine: false,
        hasBeenTampered: true,
        deviceFingerprint: 'unknown',
        lastValidationTime: Date.now()
      };
    }
  }

  /**
   * Detect potential security breaches
   */
  static async detectSecurityBreaches(): Promise<SecurityValidationResult> {
    try {
      const threats: SecurityThreat[] = [];
      const recommendations: string[] = [];

      // Check for device changes
      const deviceThreat = await this.checkDeviceChanges();
      if (deviceThreat) {
        threats.push(deviceThreat);
        recommendations.push('Re-authenticate on this device for security');
      }

      // Check for unusual authentication patterns
      const activityThreat = await this.checkUnusualActivity();
      if (activityThreat) {
        threats.push(activityThreat);
        recommendations.push('Review recent login activity');
      }

      // Check for multiple device usage
      const multiDeviceThreat = await this.checkMultipleDevices();
      if (multiDeviceThreat) {
        threats.push(multiDeviceThreat);
        recommendations.push('Verify all device logins are authorized');
      }

      // Check token integrity
      const tokenValidation = await this.validateTokenSecurity();
      if (tokenValidation.hasBeenTampered) {
        threats.push({
          type: 'token_tampering',
          severity: 'critical',
          description: 'Authentication token shows signs of tampering',
          timestamp: Date.now(),
          metadata: { tokenValidation }
        });
        recommendations.push('Immediate re-authentication required');
      }

      const isSecure = threats.length === 0 || threats.every(t => t.severity === 'low');

      return {
        isSecure,
        threats,
        recommendations
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'SecurityEnhancementService.detectSecurityBreaches'
      );

      return {
        isSecure: false,
        threats: [{
          type: 'unusual_activity',
          severity: 'medium',
          description: 'Unable to complete security validation',
          timestamp: Date.now()
        }],
        recommendations: ['Re-authenticate for security verification']
      };
    }
  }

  /**
   * Handle detected security breach
   */
  static async handleSecurityBreach(threat: SecurityThreat): Promise<void> {
    try {
      console.warn('🚨 SecurityEnhancementService: Handling security breach:', threat);

      // Log the security incident
      await this.logSecurityEvent(threat);

      // Take action based on threat severity
      switch (threat.severity) {
        case 'critical':
          // Immediate logout and clear all data
          await authPersistenceService.handleSecurityBreach();
          break;
          
        case 'high':
          // Clear stored auth but allow re-login
          await authPersistenceService.clearStoredAuth();
          break;
          
        case 'medium':
          // Force token refresh
          await authPersistenceService.refreshTokenIfNeeded();
          break;
          
        case 'low':
          // Just log for monitoring
          console.log('🔍 SecurityEnhancementService: Low severity threat logged');
          break;
      }

      // Notify error handler
      ErrorHandler.logError(
        new Error(`Security breach detected: ${threat.description}`),
        ErrorCategory.AUTHENTICATION,
        threat.severity === 'critical' ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH,
        'SecurityEnhancementService.handleSecurityBreach'
      );
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.CRITICAL,
        'SecurityEnhancementService.handleSecurityBreach'
      );
    }
  }

  /**
   * Generate device fingerprint for consistency checking
   */
  private static async generateDeviceFingerprint(): Promise<string> {
    try {
      let fingerprint = await AsyncStorage.getItem(this.DEVICE_FINGERPRINT_KEY);
      
      if (!fingerprint) {
        // Generate new fingerprint based on available device info
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
        const platform = typeof navigator !== 'undefined' ? navigator.platform : 'unknown';
        
        fingerprint = `fp_${timestamp}_${random}_${btoa(userAgent + platform).substring(0, 10)}`;
        await AsyncStorage.setItem(this.DEVICE_FINGERPRINT_KEY, fingerprint);
      }
      
      return fingerprint;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'SecurityEnhancementService.generateDeviceFingerprint'
      );
      return `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }

  /**
   * Detect token tampering
   */
  private static async detectTokenTampering(tokenInfo: any): Promise<boolean> {
    try {
      // Check token structure integrity
      const requiredFields = ['token', 'userId', 'expiresAt', 'issuedAt', 'deviceId'];
      const hasAllFields = NullSafety.safeReduce(
        requiredFields,
        (acc, field) => acc && tokenInfo[field] !== undefined,
        true
      );

      if (!hasAllFields) {
        return true; // Missing fields indicate tampering
      }

      // Check timestamp consistency
      const now = Date.now();
      const issuedAt = tokenInfo.issuedAt;
      const expiresAt = tokenInfo.expiresAt;

      if (issuedAt > now || expiresAt <= issuedAt) {
        return true; // Invalid timestamps
      }

      // Check token format (basic validation)
      if (typeof tokenInfo.token !== 'string' || tokenInfo.token.length < 10) {
        return true; // Invalid token format
      }

      return false;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'SecurityEnhancementService.detectTokenTampering'
      );
      return true; // Assume tampering on error
    }
  }

  /**
   * Validate device consistency
   */
  private static async validateDeviceConsistency(storedDeviceId: string, currentFingerprint: string): Promise<boolean> {
    try {
      // For now, we'll use a simple check
      // In a more sophisticated implementation, you'd compare device characteristics
      return typeof storedDeviceId === 'string' && storedDeviceId.length > 0;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.validateDeviceConsistency'
      );
      return false;
    }
  }

  /**
   * Check for device changes
   */
  private static async checkDeviceChanges(): Promise<SecurityThreat | null> {
    try {
      const currentFingerprint = await this.generateDeviceFingerprint();
      const validationHistory = await this.getValidationHistory();
      
      if (validationHistory.length === 0) {
        return null; // No history to compare
      }

      const lastValidation = validationHistory[validationHistory.length - 1];
      if (lastValidation.deviceFingerprint !== currentFingerprint) {
        return {
          type: 'device_change',
          severity: 'medium',
          description: 'Device fingerprint has changed since last validation',
          timestamp: Date.now(),
          metadata: {
            previousFingerprint: lastValidation.deviceFingerprint,
            currentFingerprint
          }
        };
      }

      return null;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.checkDeviceChanges'
      );
      return null;
    }
  }

  /**
   * Check for unusual activity patterns
   */
  private static async checkUnusualActivity(): Promise<SecurityThreat | null> {
    try {
      const securityLog = await this.getSecurityLog();
      const recentEvents = NullSafety.safeFilter(
        securityLog,
        event => (Date.now() - event.timestamp) < this.THREAT_DETECTION_WINDOW
      );

      // Check for rapid authentication attempts
      const authEvents = NullSafety.safeFilter(
        recentEvents,
        event => event.type === 'token_tampering' || event.type === 'device_change'
      );

      if (authEvents.length > 5) {
        return {
          type: 'unusual_activity',
          severity: 'high',
          description: `Unusual number of authentication events: ${authEvents.length} in 24 hours`,
          timestamp: Date.now(),
          metadata: { eventCount: authEvents.length }
        };
      }

      return null;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.checkUnusualActivity'
      );
      return null;
    }
  }

  /**
   * Check for multiple device usage
   */
  private static async checkMultipleDevices(): Promise<SecurityThreat | null> {
    try {
      const validationHistory = await this.getValidationHistory();
      const recentValidations = NullSafety.safeFilter(
        validationHistory,
        validation => (Date.now() - validation.lastValidationTime) < this.THREAT_DETECTION_WINDOW
      );

      const uniqueDevices = new Set(
        NullSafety.safeMap(recentValidations, v => v.deviceFingerprint)
      );

      if (uniqueDevices.size > 2) {
        return {
          type: 'multiple_devices',
          severity: 'medium',
          description: `Authentication from ${uniqueDevices.size} different devices in 24 hours`,
          timestamp: Date.now(),
          metadata: { deviceCount: uniqueDevices.size }
        };
      }

      return null;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.checkMultipleDevices'
      );
      return null;
    }
  }

  /**
   * Log security event
   */
  private static async logSecurityEvent(event: SecurityThreat): Promise<void> {
    try {
      const securityLog = await this.getSecurityLog();
      securityLog.push(event);

      // Keep only recent events
      const filteredLog = NullSafety.safeFilter(
        securityLog,
        logEvent => (Date.now() - logEvent.timestamp) < (7 * 24 * 60 * 60 * 1000) // 7 days
      ).slice(-this.MAX_SECURITY_LOGS);

      await AsyncStorage.setItem(this.SECURITY_LOG_KEY, JSON.stringify(filteredLog));
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.logSecurityEvent'
      );
    }
  }

  /**
   * Get security log
   */
  private static async getSecurityLog(): Promise<SecurityThreat[]> {
    try {
      const stored = await AsyncStorage.getItem(this.SECURITY_LOG_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.getSecurityLog'
      );
      return [];
    }
  }

  /**
   * Get validation history
   */
  private static async getValidationHistory(): Promise<TokenValidationEnhanced[]> {
    try {
      const stored = await AsyncStorage.getItem(this.VALIDATION_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.getValidationHistory'
      );
      return [];
    }
  }

  /**
   * Save validation to history
   */
  static async saveValidationHistory(validation: TokenValidationEnhanced): Promise<void> {
    try {
      const history = await this.getValidationHistory();
      history.push(validation);

      // Keep only recent validations
      const filteredHistory = NullSafety.safeFilter(
        history,
        v => (Date.now() - v.lastValidationTime) < (7 * 24 * 60 * 60 * 1000) // 7 days
      ).slice(-50); // Keep last 50 validations

      await AsyncStorage.setItem(this.VALIDATION_HISTORY_KEY, JSON.stringify(filteredHistory));
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'SecurityEnhancementService.saveValidationHistory'
      );
    }
  }

  /**
   * Clear all security data
   */
  static async clearSecurityData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(this.SECURITY_LOG_KEY),
        AsyncStorage.removeItem(this.DEVICE_FINGERPRINT_KEY),
        AsyncStorage.removeItem(this.VALIDATION_HISTORY_KEY)
      ]);
      console.log('🔒 SecurityEnhancementService: Security data cleared');
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'SecurityEnhancementService.clearSecurityData'
      );
    }
  }
}

export default SecurityEnhancementService;