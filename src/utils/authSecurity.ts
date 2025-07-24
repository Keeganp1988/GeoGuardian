// Authentication security utilities and enhancements

import { User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '../firebase/firebase';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Security constants
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry
const MAX_TOKEN_RETRY_ATTEMPTS = 3;
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const FAILED_ATTEMPTS_LIMIT = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// Security interfaces
export interface TokenValidationResult {
  isValid: boolean;
  needsRefresh: boolean;
  expiresAt?: number;
  error?: string;
}

export interface SessionInfo {
  userId: string;
  lastActivity: number;
  tokenExpiresAt: number;
  isValid: boolean;
}

export interface AuthSecurityState {
  failedAttempts: number;
  lastFailedAttempt: number;
  isLockedOut: boolean;
  lockoutExpiresAt: number;
}

// Authentication security class
export class AuthSecurity {
  private static readonly STORAGE_KEYS = {
    FAILED_ATTEMPTS: 'auth_failed_attempts',
    LAST_FAILED_ATTEMPT: 'auth_last_failed_attempt',
    LOCKOUT_EXPIRES: 'auth_lockout_expires',
    SESSION_INFO: 'auth_session_info',
  };

  // Validate Firebase ID token
  static async validateIdToken(user: FirebaseUser | null): Promise<TokenValidationResult> {
    if (!user) {
      return {
        isValid: false,
        needsRefresh: false,
        error: 'No authenticated user',
      };
    }

    try {
      // Get the ID token result with claims
      const tokenResult = await user.getIdTokenResult();
      const now = Date.now();
      const expirationTime = new Date(tokenResult.expirationTime).getTime();
      const timeUntilExpiry = expirationTime - now;

      // Check if token is expired
      if (timeUntilExpiry <= 0) {
        ErrorHandler.logError(
          new Error('ID token has expired'),
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'Token validation'
        );
        
        return {
          isValid: false,
          needsRefresh: true,
          expiresAt: expirationTime,
          error: 'Token expired',
        };
      }

      // Check if token needs refresh soon
      const needsRefresh = timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD;

      return {
        isValid: true,
        needsRefresh,
        expiresAt: expirationTime,
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'Token validation failed'
      );

      return {
        isValid: false,
        needsRefresh: true,
        error: error instanceof Error ? error.message : 'Token validation failed',
      };
    }
  }

  // Refresh ID token with retry logic
  static async refreshIdToken(user: FirebaseUser, retryCount: number = 0): Promise<string | null> {
    if (retryCount >= MAX_TOKEN_RETRY_ATTEMPTS) {
      ErrorHandler.logError(
        new Error('Max token refresh attempts exceeded'),
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'Token refresh'
      );
      return null;
    }

    try {
      const token = await user.getIdToken(true); // Force refresh
      console.log('AuthSecurity: ID token refreshed successfully');
      return token;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        `Token refresh attempt ${retryCount + 1}`
      );

      // Retry with exponential backoff
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.refreshIdToken(user, retryCount + 1);
    }
  }

  // Validate session and check for timeout
  static async validateSession(user: FirebaseUser | null): Promise<boolean> {
    if (!user) return false;

    try {
      const sessionInfo = await this.getSessionInfo();
      const now = Date.now();

      // Check if session exists and is not expired
      if (!sessionInfo || sessionInfo.userId !== user.uid) {
        await this.createSession(user);
        return true;
      }

      // Check session timeout
      const timeSinceLastActivity = now - sessionInfo.lastActivity;
      if (timeSinceLastActivity > SESSION_TIMEOUT) {
        ErrorHandler.logError(
          new Error('Session timeout'),
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          'Session validation'
        );
        
        await this.clearSession();
        return false;
      }

      // Update last activity
      await this.updateSessionActivity(user);
      return true;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'Session validation'
      );
      return false;
    }
  }

  // Create new session
  private static async createSession(user: FirebaseUser): Promise<void> {
    try {
      const tokenResult = await user.getIdTokenResult();
      const sessionInfo: SessionInfo = {
        userId: user.uid,
        lastActivity: Date.now(),
        tokenExpiresAt: new Date(tokenResult.expirationTime).getTime(),
        isValid: true,
      };

      await AsyncStorage.setItem(
        this.STORAGE_KEYS.SESSION_INFO,
        JSON.stringify(sessionInfo)
      );
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'Session creation'
      );
    }
  }

  // Update session activity
  private static async updateSessionActivity(user: FirebaseUser): Promise<void> {
    try {
      const sessionInfo = await this.getSessionInfo();
      if (sessionInfo && sessionInfo.userId === user.uid) {
        sessionInfo.lastActivity = Date.now();
        await AsyncStorage.setItem(
          this.STORAGE_KEYS.SESSION_INFO,
          JSON.stringify(sessionInfo)
        );
      }
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'Session activity update'
      );
    }
  }

  // Get session info
  private static async getSessionInfo(): Promise<SessionInfo | null> {
    try {
      const sessionData = await AsyncStorage.getItem(this.STORAGE_KEYS.SESSION_INFO);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'Get session info'
      );
      return null;
    }
  }

  // Clear session
  static async clearSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEYS.SESSION_INFO);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'Clear session'
      );
    }
  }

  // Track failed authentication attempts
  static async trackFailedAttempt(): Promise<AuthSecurityState> {
    try {
      const state = await this.getSecurityState();
      const now = Date.now();

      // Reset failed attempts if lockout has expired
      if (state.isLockedOut && now > state.lockoutExpiresAt) {
        return await this.resetSecurityState();
      }

      // Increment failed attempts
      const newFailedAttempts = state.failedAttempts + 1;
      const newState: AuthSecurityState = {
        failedAttempts: newFailedAttempts,
        lastFailedAttempt: now,
        isLockedOut: newFailedAttempts >= FAILED_ATTEMPTS_LIMIT,
        lockoutExpiresAt: newFailedAttempts >= FAILED_ATTEMPTS_LIMIT 
          ? now + LOCKOUT_DURATION 
          : state.lockoutExpiresAt,
      };

      await this.saveSecurityState(newState);

      if (newState.isLockedOut) {
        ErrorHandler.logError(
          new Error(`Account locked due to ${newFailedAttempts} failed attempts`),
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.HIGH,
          'Authentication security'
        );
      }

      return newState;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'Track failed attempt'
      );
      
      // Return safe default state
      return {
        failedAttempts: 1,
        lastFailedAttempt: Date.now(),
        isLockedOut: false,
        lockoutExpiresAt: 0,
      };
    }
  }

  // Reset security state on successful authentication
  static async resetSecurityState(): Promise<AuthSecurityState> {
    const resetState: AuthSecurityState = {
      failedAttempts: 0,
      lastFailedAttempt: 0,
      isLockedOut: false,
      lockoutExpiresAt: 0,
    };

    await this.saveSecurityState(resetState);
    return resetState;
  }

  // Get current security state
  static async getSecurityState(): Promise<AuthSecurityState> {
    try {
      const [failedAttempts, lastFailedAttempt, lockoutExpires] = await Promise.all([
        AsyncStorage.getItem(this.STORAGE_KEYS.FAILED_ATTEMPTS),
        AsyncStorage.getItem(this.STORAGE_KEYS.LAST_FAILED_ATTEMPT),
        AsyncStorage.getItem(this.STORAGE_KEYS.LOCKOUT_EXPIRES),
      ]);

      const attempts = parseInt(failedAttempts || '0', 10);
      const lastAttempt = parseInt(lastFailedAttempt || '0', 10);
      const lockoutExpiresAt = parseInt(lockoutExpires || '0', 10);
      const now = Date.now();

      return {
        failedAttempts: attempts,
        lastFailedAttempt: lastAttempt,
        isLockedOut: attempts >= FAILED_ATTEMPTS_LIMIT && now < lockoutExpiresAt,
        lockoutExpiresAt,
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'Get security state'
      );
      
      return {
        failedAttempts: 0,
        lastFailedAttempt: 0,
        isLockedOut: false,
        lockoutExpiresAt: 0,
      };
    }
  }

  // Save security state
  private static async saveSecurityState(state: AuthSecurityState): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.setItem(this.STORAGE_KEYS.FAILED_ATTEMPTS, state.failedAttempts.toString()),
        AsyncStorage.setItem(this.STORAGE_KEYS.LAST_FAILED_ATTEMPT, state.lastFailedAttempt.toString()),
        AsyncStorage.setItem(this.STORAGE_KEYS.LOCKOUT_EXPIRES, state.lockoutExpiresAt.toString()),
      ]);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'Save security state'
      );
    }
  }

  // Validate authentication flow
  static async validateAuthFlow(user: FirebaseUser | null): Promise<{
    isValid: boolean;
    needsTokenRefresh: boolean;
    isSessionValid: boolean;
    securityState: AuthSecurityState;
    errors: string[];
  }> {
    const errors: string[] = [];
    let needsTokenRefresh = false;

    // Check security state first
    const securityState = await this.getSecurityState();
    if (securityState.isLockedOut) {
      errors.push('Account is temporarily locked due to failed attempts');
      return {
        isValid: false,
        needsTokenRefresh: false,
        isSessionValid: false,
        securityState,
        errors,
      };
    }

    // Validate token
    const tokenValidation = await this.validateIdToken(user);
    if (!tokenValidation.isValid) {
      errors.push(tokenValidation.error || 'Invalid token');
      needsTokenRefresh = tokenValidation.needsRefresh;
    }

    // Validate session
    const isSessionValid = await this.validateSession(user);
    if (!isSessionValid) {
      errors.push('Invalid or expired session');
    }

    return {
      isValid: tokenValidation.isValid && isSessionValid,
      needsTokenRefresh,
      isSessionValid,
      securityState,
      errors,
    };
  }

  // Enhanced authentication check with automatic token refresh
  static async ensureValidAuthentication(): Promise<{
    isAuthenticated: boolean;
    user: FirebaseUser | null;
    token: string | null;
  }> {
    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        throw new Error('Firebase Auth not available');
      }

      const user = auth.currentUser;
      if (!user) {
        return {
          isAuthenticated: false,
          user: null,
          token: null,
        };
      }

      // Validate authentication flow
      const validation = await this.validateAuthFlow(user);
      
      if (!validation.isValid) {
        if (validation.needsTokenRefresh) {
          // Attempt token refresh
          const newToken = await this.refreshIdToken(user);
          if (newToken) {
            return {
              isAuthenticated: true,
              user,
              token: newToken,
            };
          }
        }
        
        return {
          isAuthenticated: false,
          user: null,
          token: null,
        };
      }

      // Get current token
      const token = await user.getIdToken();
      return {
        isAuthenticated: true,
        user,
        token,
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'Ensure valid authentication'
      );

      return {
        isAuthenticated: false,
        user: null,
        token: null,
      };
    }
  }
}