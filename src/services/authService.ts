import { User as FirebaseUser, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import databaseService from './databaseService';
import { getFirebaseAuth } from '../firebase/firebase';
import { AuthSecurity, TokenValidationResult, AuthSecurityState } from '../utils/authSecurity';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';
import { NullSafety } from '../utils/nullSafety';
import authStateManager, { AuthStateUpdate } from './AuthStateManager';
import authPersistenceService, { AuthValidationResult, AutoLoginResult } from './AuthPersistenceService';
import SecurityEnhancementService from './SecurityEnhancementService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthState {
  user: FirebaseUser | null;
  isAuthenticated: boolean;
  isLocalDBReady: boolean;
  isInitializing: boolean;
}

export interface AuthPersistence {
  token: string;
  expiresAt: number; // 7 days from login
  userId: string;
  refreshToken?: string;
}

export interface SetUserOptions {
  skipDatabaseInit?: boolean;
  batchUpdates?: boolean;
  transitionDelay?: number;
}

export interface AuthServiceInterface {
  // State management
  getAuthState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;

  // User management
  getCurrentUser(): FirebaseUser | null;
  getCurrentUserId(): string | null;
  setUser(user: FirebaseUser | null, options?: SetUserOptions): Promise<void>;
  setBatchedUser(user: FirebaseUser | null, options?: SetUserOptions): Promise<void>;

  // Readiness checks
  isReadyForOperations(): boolean;
  isLocalDBReadyForOperations(): boolean;
  validateFirebaseAuth(): Promise<boolean>;

  // Security enhancements
  validateUserToken(): Promise<TokenValidationResult>;
  ensureValidAuthentication(): Promise<{ isAuthenticated: boolean; user: FirebaseUser | null; token: string | null; }>;
  trackFailedAttempt(): Promise<AuthSecurityState>;
  resetSecurityState(): Promise<AuthSecurityState>;
  getSecurityState(): Promise<AuthSecurityState>;

  // State transition management
  beginStateTransition(): void;
  completeStateTransition(finalState: AuthState): void;

  // Auth persistence (7-day login)
  storeAuthToken(user: FirebaseUser): Promise<void>;
  validateStoredAuth(): Promise<AuthValidationResult>;
  clearStoredAuth(): Promise<void>;
  attemptAutoLogin(): Promise<AutoLoginResult>;
  isWithinValidPeriod(): Promise<boolean>;

  // Password reset functionality
  sendPasswordResetEmail(email: string): Promise<void>;
  confirmPasswordReset(code: string, newPassword: string): Promise<void>;
  verifyPasswordResetCode(code: string): Promise<string>;

  // Cleanup
  clearAuthState(): Promise<void>;

  // Firebase Auth access
  getAuth(): ReturnType<typeof getFirebaseAuth>;
}

class AuthService implements AuthServiceInterface {
  private currentUser: FirebaseUser | null = null;
  private isLocalDBReady = false;
  private isInitializing = false;
  private listeners: ((state: AuthState) => void)[] = [];
  private isInStateTransition = false;
  private static readonly AUTH_PERSISTENCE_KEY = '@auth_persistence';

  // Get current auth state
  getAuthState(): AuthState {
    return {
      user: this.currentUser,
      isAuthenticated: !!this.currentUser,
      isLocalDBReady: this.isLocalDBReady,
      isInitializing: this.isInitializing,
    };
  }

  // Subscribe to auth state changes
  subscribe(listener: (state: AuthState) => void): () => void {
    // Ensure listeners array is properly initialized
    if (!this.listeners || !Array.isArray(this.listeners)) {
      this.listeners = [];
    }

    // Validate listener function
    if (typeof listener !== 'function') {
      console.warn('AuthService.subscribe: Invalid listener provided');
      return () => {}; // Return empty unsubscribe function
    }

    this.listeners.push(listener);
    
    // Safely call with current state
    try {
      listener(this.getAuthState());
    } catch (error) {
      console.error('AuthService.subscribe: Error calling initial listener:', error);
    }

    // Return unsubscribe function
    return () => {
      try {
        if (this.listeners && Array.isArray(this.listeners)) {
          const index = this.listeners.indexOf(listener);
          if (index > -1) {
            this.listeners.splice(index, 1);
          }
        }
      } catch (error) {
        console.error('AuthService.unsubscribe: Error removing listener:', error);
      }
    };
  }

  // Notify all listeners of state change with debouncing
  private notifyListeners() {
    // Use debouncing to prevent rapid UI updates during auth state changes
    authStateManager.debounceAuthStateChange(() => {
      const state = this.getAuthState();
      if (this.listeners && Array.isArray(this.listeners) && this.listeners.length > 0) {
        // Use null-safe forEach to prevent errors
        NullSafety.safeForEach(this.listeners, (listener) => {
          if (typeof listener === 'function') {
            listener(state);
          }
        }, 'AuthService.notifyListeners');
      }
    });
  }

  // Get current user from Firebase Auth
  getCurrentUser(): FirebaseUser | null {
    const auth = getFirebaseAuth();
    const firebaseUser = auth?.currentUser || null;

    // Sync with internal state if different
    if (firebaseUser !== this.currentUser) {
      console.log('AuthService: Syncing current user from Firebase Auth');
      this.currentUser = firebaseUser;
    }

    return this.currentUser;
  }

  // Get current user ID
  getCurrentUserId(): string | null {
    const user = this.getCurrentUser();
    return user?.uid || null;
  }

  // Set user and initialize local DB with improved state management
  async setUser(user: FirebaseUser | null, options?: SetUserOptions): Promise<void> {
    console.log('AuthService: Setting user:', user ? user.uid : 'null');

    // Check if user actually changed to avoid unnecessary updates
    if (this.currentUser?.uid === user?.uid && this.isLocalDBReady) {
      console.log('AuthService: User unchanged, skipping update');
      return;
    }

    // Use batched updates if specified
    if (options?.batchUpdates) {
      return this.setBatchedUser(user, options);
    }

    // Prevent multiple simultaneous initializations
    if (this.isInitializing) {
      console.log('AuthService: Already initializing, skipping duplicate request');
      return;
    }

    this.isInitializing = true;
    // Only notify if there are listeners to avoid unnecessary renders
    if (this.listeners.length > 0) {
      this.notifyListeners();
    }

    try {
      if (user) {
        // User is authenticated - initialize local DB only if needed
        if (!options?.skipDatabaseInit && !this.isLocalDBReady) {
          console.log('AuthService: Initializing database for user:', user.uid);
          await this.initializeLocalDB(user.uid);
          console.log('AuthService: Database initialized successfully');
        }

        // Store auth token for 7-day persistence
        await this.storeAuthToken(user);

        this.currentUser = user;
        this.isLocalDBReady = !options?.skipDatabaseInit || this.isLocalDBReady;
      } else {
        // User is not authenticated - clear local DB state
        console.log('AuthService: Clearing local DB state');
        this.currentUser = null;
        this.isLocalDBReady = false;
      }
    } catch (error) {
      console.error('AuthService: Error setting user:', error);
      this.currentUser = user;
      this.isLocalDBReady = false;
    } finally {
      this.isInitializing = false;
      // Always notify at the end to ensure final state is communicated
      this.notifyListeners();
    }
  }

  // Set user with batched updates to prevent cascading re-renders
  async setBatchedUser(user: FirebaseUser | null, options?: SetUserOptions): Promise<void> {
    console.log('AuthService: Setting user with batched updates:', user ? user.uid : 'null');

    // Check if user actually changed to avoid unnecessary updates
    if (this.currentUser?.uid === user?.uid && this.isLocalDBReady) {
      console.log('AuthService: User unchanged, skipping batched update');
      return;
    }

    // Prevent multiple simultaneous batched operations
    if (this.isInStateTransition) {
      console.log('AuthService: Already in state transition, skipping duplicate batched request');
      return;
    }

    // Check for corrupted state and recover if needed
    if (authStateManager.detectCorruptedState()) {
      console.warn('AuthService: Detected corrupted auth state, attempting recovery');
      authStateManager.recoverAuthState();
    }

    // Begin state transition
    this.beginStateTransition();

    try {
      // Prepare state updates
      const updates: AuthStateUpdate[] = [];

      // Add initializing state update
      updates.push({
        type: 'isInitializing',
        value: true,
        timestamp: Date.now()
      });

      if (user) {
        // User is authenticated - initialize local DB only if needed
        if (!options?.skipDatabaseInit && !this.isLocalDBReady) {
          console.log('AuthService: Initializing database for user:', user.uid);
          await this.initializeLocalDB(user.uid);
          console.log('AuthService: Database initialized successfully');
        }

        // Store auth token for 7-day persistence
        await this.storeAuthToken(user);

        this.currentUser = user;
        this.isLocalDBReady = !options?.skipDatabaseInit || this.isLocalDBReady;

        // Add user state updates
        updates.push({
          type: 'user',
          value: user,
          timestamp: Date.now()
        });

        updates.push({
          type: 'isAuthenticated',
          value: true,
          timestamp: Date.now()
        });

        updates.push({
          type: 'isLocalDBReady',
          value: this.isLocalDBReady,
          timestamp: Date.now()
        });
      } else {
        // User is not authenticated - clear local DB state
        console.log('AuthService: Clearing local DB state');
        this.currentUser = null;
        this.isLocalDBReady = false;

        // Add cleared state updates
        updates.push({
          type: 'user',
          value: null,
          timestamp: Date.now()
        });

        updates.push({
          type: 'isAuthenticated',
          value: false,
          timestamp: Date.now()
        });

        updates.push({
          type: 'isLocalDBReady',
          value: false,
          timestamp: Date.now()
        });
      }

      // Add final initializing state update
      updates.push({
        type: 'isInitializing',
        value: false,
        timestamp: Date.now()
      });

      // Apply transition delay if specified
      if (options?.transitionDelay) {
        await new Promise(resolve => setTimeout(resolve, options.transitionDelay));
      }

      // Batch the state updates with error handling
      try {
        authStateManager.batchStateUpdates(updates);
      } catch (batchError) {
        console.error('AuthService: Error in batching updates, falling back to direct updates:', batchError);
        authStateManager.fallbackToDirectUpdates();
        // Notify listeners directly as fallback
        this.notifyListeners();
      }

      // Complete state transition after a short delay to allow batching
      setTimeout(() => {
        this.completeStateTransition(this.getAuthState());
      }, 50);

    } catch (error) {
      console.error('AuthService: Error in batched user setting:', error);

      // Attempt recovery on error
      try {
        authStateManager.recoverAuthState();
      } catch (recoveryError) {
        console.error('AuthService: Error in state recovery:', recoveryError);
        authStateManager.resetAuthFlow();
      }

      this.currentUser = user;
      this.isLocalDBReady = false;
      this.isInitializing = false;

      // Complete transition even on error
      this.completeStateTransition(this.getAuthState());
      throw error;
    }
  }

  // Initialize local database for authenticated user
  private async initializeLocalDB(userId: string): Promise<void> {
    try {
      console.log('AuthService: Initializing database for user:', userId);
      await databaseService.initialize();
      console.log('AuthService: Database initialized successfully');
    } catch (error) {
      console.error('AuthService: Failed to initialize database:', error);
      throw error;
    }
  }

  // Check if user is authenticated and local DB is ready for operations
  isReadyForOperations(): boolean {
    return this.isLocalDBReadyForOperations();
  }

  // Check if local DB is ready for operations
  isLocalDBReadyForOperations(): boolean {
    return this.isLocalDBReady && !!this.currentUser;
  }

  // Validate Firebase Auth is ready
  async validateFirebaseAuth(): Promise<boolean> {
    try {
      const auth = getFirebaseAuth();
      return !!auth;
    } catch (error) {
      console.error('AuthService: Firebase Auth validation failed:', error);
      return false;
    }
  }

  // Security enhancements - Validate current user's token
  async validateUserToken(): Promise<TokenValidationResult> {
    try {
      const user = this.getCurrentUser();
      return await AuthSecurity.validateIdToken(user);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.validateUserToken'
      );

      return {
        isValid: false,
        needsRefresh: false,
        error: error instanceof Error ? error.message : 'Token validation failed',
      };
    }
  }

  // Ensure valid authentication with automatic token refresh
  async ensureValidAuthentication(): Promise<{ isAuthenticated: boolean; user: FirebaseUser | null; token: string | null; }> {
    try {
      const result = await AuthSecurity.ensureValidAuthentication();

      // Update internal state if user changed
      if (result.user !== this.currentUser) {
        await this.setUser(result.user);
      }

      return result;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'AuthService.ensureValidAuthentication'
      );

      return {
        isAuthenticated: false,
        user: null,
        token: null,
      };
    }
  }

  // Track failed authentication attempt
  async trackFailedAttempt(): Promise<AuthSecurityState> {
    try {
      return await AuthSecurity.trackFailedAttempt();
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.trackFailedAttempt'
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
  async resetSecurityState(): Promise<AuthSecurityState> {
    try {
      return await AuthSecurity.resetSecurityState();
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthService.resetSecurityState'
      );

      return {
        failedAttempts: 0,
        lastFailedAttempt: 0,
        isLockedOut: false,
        lockoutExpiresAt: 0,
      };
    }
  }

  // Get current security state
  async getSecurityState(): Promise<AuthSecurityState> {
    try {
      return await AuthSecurity.getSecurityState();
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthService.getSecurityState'
      );

      return {
        failedAttempts: 0,
        lastFailedAttempt: 0,
        isLockedOut: false,
        lockoutExpiresAt: 0,
      };
    }
  }

  // Begin state transition
  beginStateTransition(): void {
    console.log('AuthService: Beginning state transition');
    this.isInStateTransition = true;
    authStateManager.beginAuthTransition();
  }

  // Complete state transition with final state
  completeStateTransition(finalState: AuthState): void {
    console.log('AuthService: Completing state transition with final state:', finalState);
    this.isInStateTransition = false;
    authStateManager.completeAuthTransition();

    // Ensure final state is communicated to listeners
    this.notifyListeners();
  }

  // Get Firebase Auth instance (for direct Firebase operations)
  getAuth(): ReturnType<typeof getFirebaseAuth> {
    return getFirebaseAuth();
  }

  // Store auth token for 7-day persistence using secure keychain
  async storeAuthToken(user: FirebaseUser): Promise<void> {
    try {
      await authPersistenceService.storeAuthToken(user);
      console.log('AuthService: Auth token stored securely for 7-day persistence');
    } catch (error) {
      console.error('AuthService: Failed to store auth token:', error);
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.storeAuthToken'
      );
    }
  }

  // Validate stored auth token (7-day check) with enhanced validation
  async validateStoredAuth(): Promise<AuthValidationResult> {
    try {
      // First, perform basic validation
      const basicValidation = await authPersistenceService.validateStoredAuth();

      if (!basicValidation.isValid) {
        return basicValidation;
      }

      // Perform enhanced security validation
      const securityValidation = await SecurityEnhancementService.validateTokenSecurity();
      await SecurityEnhancementService.saveValidationHistory(securityValidation);

      // Check for security breaches
      const breachDetection = await SecurityEnhancementService.detectSecurityBreaches();

      if (!breachDetection.isSecure) {
        console.warn('AuthService: Security threats detected:', breachDetection.threats);

        // Handle critical threats
        const criticalThreats = NullSafety.safeFilter(
          breachDetection.threats,
          threat => threat.severity === 'critical'
        );

        if (criticalThreats.length > 0) {
          // Handle the most severe threat
          await SecurityEnhancementService.handleSecurityBreach(criticalThreats[0]);

          return {
            isValid: false,
            user: null,
            expiresAt: basicValidation.expiresAt,
            needsRefresh: false,
            error: 'Security breach detected - authentication cleared for safety'
          };
        }
      }

      // If security validation failed but no critical threats, still allow but flag for refresh
      if (!securityValidation.isValid || securityValidation.hasBeenTampered) {
        return {
          ...basicValidation,
          needsRefresh: true,
          error: 'Token security validation failed - refresh recommended'
        };
      }

      return basicValidation;
    } catch (error) {
      console.error('AuthService: Failed to validate stored auth:', error);
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.validateStoredAuth'
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

  // Clear stored auth token using secure methods
  async clearStoredAuth(): Promise<void> {
    try {
      await authPersistenceService.clearStoredAuth();

      // Also clear legacy AsyncStorage keys for backward compatibility
      await NullSafety.safeExecuteAsync(async () => {
        await AsyncStorage.removeItem(AuthService.AUTH_PERSISTENCE_KEY);

        // Clear any other potential auth-related keys
        const allKeys = await AsyncStorage.getAllKeys();
        const authKeys = NullSafety.safeFilter([...allKeys], key =>
          key.includes('auth') ||
          key.includes('firebase') ||
          key.includes('user') ||
          key.includes('session')
        );

        if (authKeys.length > 0) {
          await AsyncStorage.multiRemove(authKeys);
          console.log('AuthService: Cleared additional auth keys:', authKeys);
        }
      }, 'AuthService.clearStoredAuth legacy cleanup');

      console.log('AuthService: Stored auth token cleared');
    } catch (error) {
      console.error('AuthService: Failed to clear stored auth:', error);
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.clearStoredAuth'
      );
    }
  }

  // Attempt automatic login using stored credentials
  async attemptAutoLogin(): Promise<AutoLoginResult> {
    try {
      return await authPersistenceService.attemptAutoLogin();
    } catch (error) {
      console.error('AuthService: Auto-login attempt failed:', error);
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.attemptAutoLogin'
      );

      return {
        success: false,
        user: null,
        error: 'Auto-login attempt failed'
      };
    }
  }

  // Check if current time is within valid 7-day period
  async isWithinValidPeriod(): Promise<boolean> {
    try {
      return await authPersistenceService.isWithinValidPeriod();
    } catch (error) {
      console.error('AuthService: Failed to check valid period:', error);
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.LOW,
        'AuthService.isWithinValidPeriod'
      );
      return false;
    }
  }

  // Password reset functionality
  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        throw new Error('Firebase Auth not ready');
      }

      console.log('AuthService: Sending password reset email to:', email);
      await sendPasswordResetEmail(auth, email);
      console.log('AuthService: Password reset email sent successfully');
    } catch (error) {
      console.error('AuthService: Failed to send password reset email:', error);

      // Log error for monitoring
      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.sendPasswordResetEmail'
      );

      // Transform Firebase errors to user-friendly messages
      if (error instanceof Error) {
        if (error.message.includes('user-not-found')) {
          // For security, don't reveal if email exists - show generic success message
          console.log('AuthService: Email not found, but showing generic success for security');
          return; // Don't throw error for non-existent emails
        } else if (error.message.includes('too-many-requests')) {
          throw new Error('Too many password reset attempts. Please try again later.');
        } else if (error.message.includes('invalid-email')) {
          throw new Error('Please enter a valid email address.');
        }
      }

      throw new Error('Failed to send password reset email. Please try again.');
    }
  }

  async verifyPasswordResetCode(code: string): Promise<string> {
    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        throw new Error('Firebase Auth not ready');
      }

      console.log('AuthService: Verifying password reset code');
      const email = await verifyPasswordResetCode(auth, code);
      console.log('AuthService: Password reset code verified successfully');
      return email;
    } catch (error) {
      console.error('AuthService: Failed to verify password reset code:', error);

      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        'AuthService.verifyPasswordResetCode'
      );

      // Transform Firebase errors to user-friendly messages
      if (error instanceof Error) {
        if (error.message.includes('invalid-action-code') || error.message.includes('expired-action-code')) {
          throw new Error('This password reset link is invalid or has expired. Please request a new one.');
        }
      }

      throw new Error('Failed to verify password reset code. Please try again.');
    }
  }

  async confirmPasswordReset(code: string, newPassword: string): Promise<void> {
    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        throw new Error('Firebase Auth not ready');
      }

      console.log('AuthService: Confirming password reset');
      await confirmPasswordReset(auth, code, newPassword);
      console.log('AuthService: Password reset confirmed successfully');
    } catch (error) {
      console.error('AuthService: Failed to confirm password reset:', error);

      ErrorHandler.logError(
        error,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.HIGH,
        'AuthService.confirmPasswordReset'
      );

      // Transform Firebase errors to user-friendly messages
      if (error instanceof Error) {
        if (error.message.includes('invalid-action-code') || error.message.includes('expired-action-code')) {
          throw new Error('This password reset link is invalid or has expired. Please request a new one.');
        } else if (error.message.includes('weak-password')) {
          throw new Error('Password is too weak. Please choose a stronger password.');
        }
      }

      throw new Error('Failed to reset password. Please try again.');
    }
  }

  // Enhanced clear auth state with security cleanup
  async clearAuthState(): Promise<void> {
    console.log('AuthService: Clearing auth state');

    // Always clear internal state first
    this.currentUser = null;
    this.isLocalDBReady = false;
    this.isInitializing = false;

    try {
      // Clear session data
      await AuthSecurity.clearSession();
      console.log('AuthService: Session cleared');
    } catch (sessionError) {
      console.warn('AuthService: Failed to clear session:', sessionError);
    }

    try {
      // Clear stored auth token
      await this.clearStoredAuth();
      console.log('AuthService: Stored auth cleared');
    } catch (tokenError) {
      console.warn('AuthService: Failed to clear stored auth:', tokenError);
    }

    try {
      // Clear security enhancement data
      await SecurityEnhancementService.clearSecurityData();
      console.log('AuthService: Security data cleared');
    } catch (securityError) {
      console.warn('AuthService: Failed to clear security data:', securityError);
    }

    // Always notify listeners regardless of cleanup success
    this.notifyListeners();
    console.log('AuthService: Auth state cleared successfully');
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;