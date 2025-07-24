// Enhanced authentication persistence service with 7-day token storage using React Native Keychain

import { User as FirebaseUser } from 'firebase/auth';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import { NullSafety } from '../utils/nullSafety';
import { getFirebaseAuth } from '../firebase/firebase';

// Constants
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const TOKEN_REFRESH_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours before expiry
const MAX_RETRY_ATTEMPTS = 3;

// Interfaces
export interface AuthToken {
  token: string;
  refreshToken?: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  lastValidated: number;
  deviceId: string;
}

export interface AuthValidationResult {
  isValid: boolean;
  user: FirebaseUser | null;
  expiresAt: number;
  needsRefresh: boolean;
  error?: string;
}

export interface AutoLoginResult {
  success: boolean;
  user: FirebaseUser | null;
  error?: string;
  wasTokenRefreshed?: boolean;
}

export interface TokenRefreshResult {
  success: boolean;
  newToken?: string;
  error?: string;
}

export interface AuthPersistenceServiceInterface {
  // Token management
  storeAuthToken(user: FirebaseUser, expirationDays?: number): Promise<void>;
  validateStoredAuth(): Promise<AuthValidationResult>;
  clearStoredAuth(): Promise<void>;

  // Auto-login flow
  attemptAutoLogin(): Promise<AutoLoginResult>;
  isWithinValidPeriod(): Promise<boolean>;

  // Security
  refreshTokenIfNeeded(): Promise<TokenRefreshResult>;
  handleSecurityBreach(): Promise<void>;

  // Utility
  getStoredTokenInfo(): Promise<AuthToken | null>;
  isTokenExpiringSoon(): Promise<boolean>;
}

/**
 * Enhanced authentication persistence service with secure 7-day token storage
 */
export class AuthPersistenceService implements AuthPersistenceServiceInterface {
  private static readonly KEYCHAIN_SERVICE = 'GeoGuardianAuth';
  private static readonly KEYCHAIN_KEY = 'auth_token';
  private static readonly DEVICE_ID_KEY = '@device_id';
  private static readonly LAST_LOGIN_KEY = '@last_login_timestamp';

  private deviceId: string | null = null;

  constructor() {
    this.initializeDeviceId();
  }

  /**
   * Initialize or retrieve device ID for token validation
   */
  private async initializeDeviceId(): Promise<void> {
    try {
      let storedDeviceId = await AsyncStorage.getItem(AuthPersistenceService.DEVICE_ID_KEY);

      if (!storedDeviceId) {
        // Generate a new device ID
        storedDeviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        await AsyncStorage.setItem(AuthPersistenceService.DEVICE_ID_KEY, storedDeviceId);
      }

      this.deviceId = storedDeviceId;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.initializeDeviceId'
      );
      // Fallback device ID
      this.deviceId = `fallback_${Date.now()}`;
    }
  }

  /**
   * Store authentication token securely with 7-day expiration
   */
  async storeAuthToken(user: FirebaseUser, expirationDays: number = 7): Promise<void> {
    try {
      if (!user) {
        throw new Error('User is required to store auth token');
      }

      // Ensure device ID is initialized
      if (!this.deviceId) {
        await this.initializeDeviceId();
      }

      // Get fresh ID token
      const token = await user.getIdToken(true);
      const refreshToken = user.refreshToken;

      const authToken: AuthToken = {
        token,
        refreshToken: refreshToken || undefined,
        userId: user.uid,
        issuedAt: Date.now(),
        expiresAt: Date.now() + (expirationDays * 24 * 60 * 60 * 1000),
        lastValidated: Date.now(),
        deviceId: this.deviceId!
      };

      // Try to store in secure keychain first
      const isKeychainAvailable = await this.isKeychainAvailable();

      if (isKeychainAvailable) {
        try {
          const options = {
            accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
            accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            authenticationPrompt: {
              title: 'Authenticate to access your saved login',
              subtitle: 'Use your device passcode'
            }
          };

          // Validate parameters before calling keychain method
          const params = [
            AuthPersistenceService.KEYCHAIN_SERVICE,
            AuthPersistenceService.KEYCHAIN_KEY,
            JSON.stringify(authToken),
            options
          ];
          
          if (!this.validateKeychainParameters('setInternetCredentials', params)) {
            throw new Error('Invalid parameters for setInternetCredentials');
          }

          await Keychain.setInternetCredentials(
            AuthPersistenceService.KEYCHAIN_SERVICE,
            AuthPersistenceService.KEYCHAIN_KEY,
            JSON.stringify(authToken),
            options
          );
          console.log('AuthPersistenceService: Token stored in keychain');
        } catch (keychainError) {
          console.warn('AuthPersistenceService: Keychain storage failed, falling back to AsyncStorage');
          await this.storeTokenInAsyncStorage(authToken);
        }
      } else {
        console.log('AuthPersistenceService: Keychain not available, using AsyncStorage');
        await this.storeTokenInAsyncStorage(authToken);
      }

      // Store last login timestamp
      await AsyncStorage.setItem(
        AuthPersistenceService.LAST_LOGIN_KEY,
        Date.now().toString()
      );

      console.log('AuthPersistenceService: Auth token stored securely for 7 days');
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'AuthPersistenceService.storeAuthToken'
      );
      throw new Error('Failed to store authentication token securely');
    }
  }

  /**
   * Validate stored authentication token
   */
  async validateStoredAuth(): Promise<AuthValidationResult> {
    try {
      const storedToken = await this.getStoredTokenInfo();

      if (!storedToken) {
        return {
          isValid: false,
          user: null,
          expiresAt: 0,
          needsRefresh: false,
          error: 'No stored authentication token found'
        };
      }

      const now = Date.now();

      // Check if token has expired
      if (now >= storedToken.expiresAt) {
        console.log('AuthPersistenceService: Stored token has expired');
        await this.clearStoredAuth();
        return {
          isValid: false,
          user: null,
          expiresAt: storedToken.expiresAt,
          needsRefresh: false,
          error: 'Stored authentication token has expired'
        };
      }

      // Check device ID for security
      if (storedToken.deviceId !== this.deviceId) {
        console.warn('AuthPersistenceService: Device ID mismatch, potential security issue');
        await this.handleSecurityBreach();
        return {
          isValid: false,
          user: null,
          expiresAt: storedToken.expiresAt,
          needsRefresh: false,
          error: 'Device ID mismatch - security breach detected'
        };
      }

      // Get Firebase Auth instance and current user
      const auth = getFirebaseAuth();
      if (!auth) {
        return {
          isValid: false,
          user: null,
          expiresAt: storedToken.expiresAt,
          needsRefresh: false,
          error: 'Firebase Auth not available'
        };
      }

      // Check if we need to refresh the token soon
      const needsRefresh = (storedToken.expiresAt - now) < TOKEN_REFRESH_THRESHOLD;

      return {
        isValid: true,
        user: auth.currentUser,
        expiresAt: storedToken.expiresAt,
        needsRefresh,
        error: undefined
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.validateStoredAuth'
      );

      // Clear potentially corrupted data
      await NullSafety.safeExecuteAsync(
        () => this.clearStoredAuth(),
        'validateStoredAuth cleanup'
      );

      return {
        isValid: false,
        user: null,
        expiresAt: 0,
        needsRefresh: false,
        error: 'Failed to validate stored authentication'
      };
    }
  }

  /**
   * Clear stored authentication token
   */
  async clearStoredAuth(): Promise<void> {
    try {
      // Try to clear from keychain if available
      const isKeychainAvailable = await this.isKeychainAvailable();

      if (isKeychainAvailable) {
        await NullSafety.safeExecuteAsync(async () => {
          // Validate parameters before calling keychain method
          const params = [{ server: AuthPersistenceService.KEYCHAIN_SERVICE }];
          if (!this.validateKeychainParameters('resetInternetCredentials', params)) {
            throw new Error('Invalid parameters for resetInternetCredentials');
          }
          
          await Keychain.resetInternetCredentials({
            server: AuthPersistenceService.KEYCHAIN_SERVICE
          });
        }, 'clearStoredAuth keychain');
      }

      // Always clear from AsyncStorage fallback
      await NullSafety.safeExecuteAsync(async () => {
        await this.clearTokenFromAsyncStorage();
      }, 'clearStoredAuth AsyncStorage');

      // Clear last login timestamp
      await NullSafety.safeExecuteAsync(async () => {
        await AsyncStorage.removeItem(AuthPersistenceService.LAST_LOGIN_KEY);
      }, 'clearStoredAuth timestamp');

      console.log('AuthPersistenceService: Stored auth token cleared');
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.clearStoredAuth'
      );
      // Don't throw here as clearing should be resilient
    }
  }

  /**
   * Attempt automatic login using stored credentials
   */
  async attemptAutoLogin(): Promise<AutoLoginResult> {
    try {
      console.log('AuthPersistenceService: Attempting auto-login');

      const validation = await this.validateStoredAuth();

      if (!validation.isValid) {
        return {
          success: false,
          user: null,
          error: validation.error || 'Stored authentication is not valid'
        };
      }

      const auth = getFirebaseAuth();
      if (!auth) {
        return {
          success: false,
          user: null,
          error: 'Firebase Auth not available'
        };
      }

      // If we already have a current user and validation passed, we're good
      if (auth.currentUser && auth.currentUser.uid === (await this.getStoredTokenInfo())?.userId) {
        let wasTokenRefreshed = false;

        // Refresh token if needed
        if (validation.needsRefresh) {
          const refreshResult = await this.refreshTokenIfNeeded();
          wasTokenRefreshed = refreshResult.success;
        }

        return {
          success: true,
          user: auth.currentUser,
          wasTokenRefreshed
        };
      }

      // If no current user but we have valid stored auth, Firebase should handle this
      // through the auth state listener. We'll return success and let the auth flow continue.
      return {
        success: true,
        user: auth.currentUser,
        error: undefined
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.attemptAutoLogin'
      );

      return {
        success: false,
        user: null,
        error: 'Auto-login attempt failed'
      };
    }
  }

  /**
   * Check if current time is within valid 7-day period
   */
  async isWithinValidPeriod(): Promise<boolean> {
    try {
      const storedToken = await this.getStoredTokenInfo();

      if (!storedToken) {
        return false;
      }

      const now = Date.now();
      return now < storedToken.expiresAt;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthPersistenceService.isWithinValidPeriod'
      );
      return false;
    }
  }

  /**
   * Refresh token if needed
   */
  async refreshTokenIfNeeded(): Promise<TokenRefreshResult> {
    try {
      const auth = getFirebaseAuth();
      const user = auth?.currentUser;

      if (!user) {
        return {
          success: false,
          error: 'No authenticated user to refresh token for'
        };
      }

      const storedToken = await this.getStoredTokenInfo();
      if (!storedToken) {
        return {
          success: false,
          error: 'No stored token to refresh'
        };
      }

      // Check if refresh is actually needed
      const now = Date.now();
      const timeUntilExpiry = storedToken.expiresAt - now;

      if (timeUntilExpiry > TOKEN_REFRESH_THRESHOLD) {
        return {
          success: true,
          error: 'Token refresh not needed yet'
        };
      }

      // Attempt token refresh with retry logic
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          console.log(`AuthPersistenceService: Refreshing token (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`);

          const newToken = await user.getIdToken(true);

          // Update stored token with new values
          const updatedToken: AuthToken = {
            ...storedToken,
            token: newToken,
            lastValidated: now,
            // Extend expiration by 7 days from now
            expiresAt: now + SEVEN_DAYS_MS
          };

          // Store updated token using the same method as initial storage
          const isKeychainAvailable = await this.isKeychainAvailable();

          if (isKeychainAvailable) {
            try {
              const options = {
                accessControl: Keychain.ACCESS_CONTROL.DEVICE_PASSCODE,
                accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
                authenticationPrompt: {
                  title: 'Authenticate to refresh your login',
                  subtitle: 'Use your device passcode'
                }
              };

              // Validate parameters before calling keychain method
              const params = [
                AuthPersistenceService.KEYCHAIN_SERVICE,
                AuthPersistenceService.KEYCHAIN_KEY,
                JSON.stringify(updatedToken),
                options
              ];
              
              if (!this.validateKeychainParameters('setInternetCredentials', params)) {
                throw new Error('Invalid parameters for setInternetCredentials');
              }

              await Keychain.setInternetCredentials(
                AuthPersistenceService.KEYCHAIN_SERVICE,
                AuthPersistenceService.KEYCHAIN_KEY,
                JSON.stringify(updatedToken),
                options
              );
            } catch (keychainError) {
              console.warn('AuthPersistenceService: Keychain refresh failed, falling back to AsyncStorage');
              await this.storeTokenInAsyncStorage(updatedToken);
            }
          } else {
            await this.storeTokenInAsyncStorage(updatedToken);
          }

          console.log('AuthPersistenceService: Token refreshed successfully');

          return {
            success: true,
            newToken
          };
        } catch (error) {
          lastError = error as Error;
          console.warn(`AuthPersistenceService: Token refresh attempt ${attempt} failed:`, error);

          // Wait before retrying (exponential backoff)
          if (attempt < MAX_RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }

      // All attempts failed
      ErrorHandler.logError(
        lastError || new Error('Token refresh failed after all attempts'),
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'AuthPersistenceService.refreshTokenIfNeeded'
      );

      return {
        success: false,
        error: `Token refresh failed after ${MAX_RETRY_ATTEMPTS} attempts`
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'AuthPersistenceService.refreshTokenIfNeeded'
      );

      return {
        success: false,
        error: 'Token refresh failed due to unexpected error'
      };
    }
  }

  /**
   * Handle security breach by clearing all stored data
   */
  async handleSecurityBreach(): Promise<void> {
    try {
      console.warn('AuthPersistenceService: Handling security breach - clearing all stored data');

      // Clear stored authentication
      await this.clearStoredAuth();

      // Clear device ID to force regeneration
      await NullSafety.safeExecuteAsync(async () => {
        await AsyncStorage.removeItem(AuthPersistenceService.DEVICE_ID_KEY);
      }, 'handleSecurityBreach device ID');

      // Reinitialize device ID
      this.deviceId = null;
      await this.initializeDeviceId();

      // Log security incident
      ErrorHandler.logError(
        new Error('Security breach detected and handled'),
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.CRITICAL,
        'AuthPersistenceService.handleSecurityBreach'
      );
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.CRITICAL,
        'AuthPersistenceService.handleSecurityBreach'
      );
    }
  }

  /**
   * Get stored token information
   */
  async getStoredTokenInfo(): Promise<AuthToken | null> {
    try {
      // Check if keychain is available first
      const isAvailable = await this.isKeychainAvailable();
      if (!isAvailable) {
        console.log('AuthPersistenceService: Keychain not available, falling back to AsyncStorage');
        return await this.getStoredTokenFromAsyncStorage();
      }

      // Validate parameters before calling keychain method
      const params = [AuthPersistenceService.KEYCHAIN_SERVICE];
      if (!this.validateKeychainParameters('getInternetCredentials', params)) {
        throw new Error('Invalid parameters for getInternetCredentials');
      }

      const credentials = await Keychain.getInternetCredentials(AuthPersistenceService.KEYCHAIN_SERVICE);

      if (!credentials || typeof credentials === 'boolean') {
        // Try fallback to AsyncStorage
        return await this.getStoredTokenFromAsyncStorage();
      }

      const tokenData = JSON.parse(credentials.password);

      // Validate token structure
      if (!tokenData.token || !tokenData.userId || !tokenData.expiresAt) {
        console.warn('AuthPersistenceService: Invalid token structure found');
        await this.clearStoredAuth();
        return null;
      }

      return tokenData as AuthToken;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.getStoredTokenInfo'
      );

      // Try fallback to AsyncStorage
      try {
        return await this.getStoredTokenFromAsyncStorage();
      } catch (fallbackError) {
        console.warn('AuthPersistenceService: Fallback to AsyncStorage also failed');
        return null;
      }
    }
  }

  /**
   * Check if token is expiring soon
   */
  async isTokenExpiringSoon(): Promise<boolean> {
    try {
      const storedToken = await this.getStoredTokenInfo();

      if (!storedToken) {
        return false;
      }

      const now = Date.now();
      const timeUntilExpiry = storedToken.expiresAt - now;

      return timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthPersistenceService.isTokenExpiringSoon'
      );
      return false;
    }
  }

  /**
   * Get time remaining until token expires
   */
  async getTimeUntilExpiry(): Promise<number> {
    try {
      const storedToken = await this.getStoredTokenInfo();

      if (!storedToken) {
        return 0;
      }

      const now = Date.now();
      return Math.max(0, storedToken.expiresAt - now);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthPersistenceService.getTimeUntilExpiry'
      );
      return 0;
    }
  }

  /**
   * Check if keychain is available and accessible
   */
  async isKeychainAvailable(): Promise<boolean> {
    try {
      // Temporarily disable keychain to prevent fingerprint prompts
      // TODO: Re-enable after fixing biometric authentication issues
      console.log('AuthPersistenceService: Keychain temporarily disabled to prevent fingerprint prompts');
      return false;
      
      // Original code (commented out):
      // // Check if Keychain methods exist and are functions
      // if (!Keychain || typeof Keychain.getSupportedBiometryType !== 'function') {
      //   return false;
      // }
      // 
      // const result = await Keychain.getSupportedBiometryType();
      // return result !== null || await Keychain.canImplyAuthentication();
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthPersistenceService.isKeychainAvailable'
      );
      return false;
    }
  }

  /**
   * Validate keychain method parameters to prevent parameter format errors
   */
  private validateKeychainParameters(method: string, params: any[]): boolean {
    try {
      switch (method) {
        case 'setInternetCredentials':
          // Expects: service (string), key (string), password (string), options (object)
          if (params.length < 3) return false;
          if (typeof params[0] !== 'string' || typeof params[1] !== 'string' || typeof params[2] !== 'string') {
            return false;
          }
          if (params.length > 3 && params[3] !== null && typeof params[3] !== 'object') {
            return false;
          }
          break;

        case 'getInternetCredentials':
          // Expects: service (string)
          if (params.length !== 1 || typeof params[0] !== 'string') {
            return false;
          }
          break;

        case 'resetInternetCredentials':
          // Expects: options object with server property
          if (params.length !== 1 || typeof params[0] !== 'object' || !params[0] || typeof params[0].server !== 'string') {
            return false;
          }
          break;

        default:
          console.warn(`AuthPersistenceService: Unknown keychain method ${method}`);
          return false;
      }

      return true;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.validateKeychainParameters'
      );
      return false;
    }
  }

  /**
   * Fallback method to store token in AsyncStorage when keychain is unavailable
   */
  private async storeTokenInAsyncStorage(authToken: AuthToken): Promise<void> {
    try {
      const tokenKey = `${AuthPersistenceService.KEYCHAIN_SERVICE}_${AuthPersistenceService.KEYCHAIN_KEY}`;
      await AsyncStorage.setItem(tokenKey, JSON.stringify(authToken));
      console.log('AuthPersistenceService: Token stored in AsyncStorage as fallback');
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'AuthPersistenceService.storeTokenInAsyncStorage'
      );
      throw error;
    }
  }

  /**
   * Fallback method to get token from AsyncStorage when keychain is unavailable
   */
  private async getStoredTokenFromAsyncStorage(): Promise<AuthToken | null> {
    try {
      const tokenKey = `${AuthPersistenceService.KEYCHAIN_SERVICE}_${AuthPersistenceService.KEYCHAIN_KEY}`;
      const stored = await AsyncStorage.getItem(tokenKey);

      if (!stored) {
        return null;
      }

      const tokenData = JSON.parse(stored);

      // Validate token structure
      if (!tokenData.token || !tokenData.userId || !tokenData.expiresAt) {
        console.warn('AuthPersistenceService: Invalid token structure in AsyncStorage');
        await AsyncStorage.removeItem(tokenKey);
        return null;
      }

      return tokenData as AuthToken;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthPersistenceService.getStoredTokenFromAsyncStorage'
      );
      return null;
    }
  }

  /**
   * Clear token from AsyncStorage fallback
   */
  private async clearTokenFromAsyncStorage(): Promise<void> {
    try {
      const tokenKey = `${AuthPersistenceService.KEYCHAIN_SERVICE}_${AuthPersistenceService.KEYCHAIN_KEY}`;
      await AsyncStorage.removeItem(tokenKey);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthPersistenceService.clearTokenFromAsyncStorage'
      );
    }
  }
}

// Export singleton instance
const authPersistenceService = new AuthPersistenceService();
export default authPersistenceService;