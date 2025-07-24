import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, User as FirebaseUser } from "firebase/auth";
import { getFirebaseAuth, isFirebaseReady } from "../firebase/firebase";
import { createUser } from "../firebase/services";
import authService, { AuthState } from "../services/authService";
import authStateManager from "../services/AuthStateManager";
import securityService from "../services/securityService";
import ErrorRecoveryService from "../services/ErrorRecoveryService";
import { NullSafety } from "../utils/nullSafety";
import * as Notifications from 'expo-notifications';

interface AppContextType {
  user: FirebaseUser | null;
  isFirebaseReady: boolean;
  isLocalDBReady: boolean;
  isDevelopmentMode: boolean;
  isAuthTransitioning: boolean;
  authLoadingState: 'idle' | 'signing-in' | 'initializing' | 'ready';
  signIn: (email: string, pass: string) => Promise<void>;
  batchedSignIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, name: string) => Promise<void>;
  logOut: () => Promise<void>;
  initializeLocalDB: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

console.log('🟢 AppContext.tsx: File loaded');

// Add singleton pattern to prevent multiple initializations
let isAppProviderInitialized = false;

export function AppProvider({ children }: { children: ReactNode }) {
  if (!isAppProviderInitialized) {
    console.log('🏗️ AppProvider: Initializing...');
    isAppProviderInitialized = true;
  }
  
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLocalDBReady: false,
    isInitializing: false,
  });
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [isDevelopmentMode, setIsDevelopmentMode] = useState(__DEV__);
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const [authLoadingState, setAuthLoadingState] = useState<'idle' | 'signing-in' | 'initializing' | 'ready'>('idle');

  console.log('📊 AppProvider: Initial state:', {
    firebaseReady,
    isDevelopmentMode,
    authState
  });

  // Check Firebase readiness periodically with timeout
  useEffect(() => {
    console.log('🔥 AppProvider: Setting up Firebase readiness check...');
    
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;
    
    const checkFirebaseReady = () => {
      try {
        const ready = isFirebaseReady();
        console.log('🔍 AppProvider: Firebase ready check:', ready);
        
        if (ready && !firebaseReady) {
          console.log('✅ AppProvider: Firebase is now ready!');
          setFirebaseReady(true);
          clearInterval(intervalId);
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.log('🔍 AppProvider: Firebase ready check failed:', error);
      }
    };

    // Check immediately
    checkFirebaseReady();

    // Check periodically until ready (reduced frequency for better performance)
    intervalId = setInterval(() => {
      if (!firebaseReady) {
        checkFirebaseReady();
      } else {
        clearInterval(intervalId);
      }
    }, 1000); // Further reduced to 1 second for less frequent checks

    // Set timeout for Firebase initialization (10 seconds - reduced for faster startup)
    timeoutId = setTimeout(() => {
      if (!firebaseReady) {
        console.error('⏰ AppProvider: Firebase initialization timeout - service may be unavailable');
        clearInterval(intervalId);
        // Set firebaseReady to true to allow app to continue (offline mode)
        setFirebaseReady(true);
      }
    }, 10000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [firebaseReady]);

  // Initialize Firebase Auth and subscribe to auth state changes ONLY when Firebase is ready
  useEffect(() => {
    if (!firebaseReady) {
      console.log('⏳ AppProvider: Firebase not ready yet, skipping Auth setup...');
      return;
    }

    console.log('🔥 AppProvider: Firebase ready, setting up Auth listener...');
    
    const auth = getFirebaseAuth();
    if (!auth) {
      console.error('❌ AppProvider: Could not get Firebase Auth instance');
      return;
    }

    // Temporarily disable auto-login to prevent fingerprint prompts
    // TODO: Re-enable after fixing biometric authentication issues
    console.log('🔑 AppProvider: Auto-login temporarily disabled to prevent fingerprint prompts');

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('👤 AppProvider: Auth state changed - user:', firebaseUser ? 'logged in' : 'not logged in');
      
      // Use debounced auth state change to prevent rapid UI updates
      authStateManager.debounceAuthStateChange(async () => {
        // Use batched updates if we're in transition mode
        const options = authStateManager.isInTransition() ? { batchUpdates: true } : {};
        await authService.setUser(firebaseUser, options);
        console.log('✅ AppProvider: Auth state updated');
      }, 50); // 50ms delay as specified in requirements
    }, (error) => {
      console.error('❌ AppProvider: Auth state change error:', error);
    });

    return unsubscribe;
  }, [firebaseReady]);

  // Initialize security service when Firebase is ready
  useEffect(() => {
    if (firebaseReady) {
      console.log('🔒 AppProvider: Initializing security service...');
      securityService.initialize().catch((error) => {
        console.error('❌ AppProvider: Security service initialization failed:', error);
      });
    }
  }, [firebaseReady]);

  // Subscribe to auth state service changes with improved batching
  useEffect(() => {
    console.log('🔄 AppProvider: Setting up auth state service subscription...');
    
    const unsubscribe = authService.subscribe((state) => {
      console.log('📊 AppProvider: Auth state service updated:', state);
      
      // Batch state updates to prevent rapid re-renders during authentication
      const updates = [];
      
      // Only update if state actually changed
      if (JSON.stringify(authState) !== JSON.stringify(state)) {
        setAuthState(state);
        updates.push('authState');
      }

      // Update auth loading state based on auth state with debouncing
      let newLoadingState = authLoadingState;
      if (state.isInitializing && authLoadingState !== 'initializing') {
        newLoadingState = 'initializing';
      } else if (state.isAuthenticated && state.isLocalDBReady && authLoadingState !== 'ready') {
        newLoadingState = 'ready';
      } else if (!state.isInitializing && !state.isAuthenticated && authLoadingState !== 'idle') {
        newLoadingState = 'idle';
      }
      
      if (newLoadingState !== authLoadingState) {
        setAuthLoadingState(newLoadingState);
        updates.push('loadingState');
      }

      // Only process push token registration once per authentication session
      if (state.user && state.isAuthenticated && state.isLocalDBReady && !authState.isAuthenticated) {
        // Use null-safe execution for push token registration
        NullSafety.safeExecuteAsync(async () => {
          // Request permissions if not already granted
          const { status: existingStatus } = await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;
          if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }
          if (finalStatus !== 'granted') {
            console.warn('Push notification permissions not granted');
            return;
          }
          // Get Expo push token
          const tokenData = await Notifications.getExpoPushTokenAsync();
          const expoPushToken = tokenData.data;
          // Save token to Firestore
          if (expoPushToken && state.user?.uid) {
            const { getUserDoc } = await import('../firebase/firebase');
            const { setDoc, getDoc } = await import('firebase/firestore');
            const userDocRef = getUserDoc(state.user.uid);
            
            // Check if user document exists, create if it doesn't
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
              // Create user document with basic info
              await setDoc(userDocRef, {
                uid: state.user.uid,
                name: state.user.displayName || 'User',
                email: state.user.email,
                expoPushToken,
                createdAt: new Date(),
                lastSeen: new Date()
              });
              console.log('✅ Created user document and saved Expo push token:', expoPushToken);
            } else {
              // Update existing document with push token
              await setDoc(userDocRef, { expoPushToken }, { merge: true });
              console.log('✅ Expo push token saved to existing Firestore document:', expoPushToken);
            }
          }
        }, 'AppProvider push token registration').catch(err => {
          console.error('Error registering/saving Expo push token:', err);
        });
      }
    });

    return unsubscribe;
  }, []);

  // Monitor auth state manager transitions with improved coordination
  useEffect(() => {
    console.log('🔄 AppProvider: Setting up auth transition monitoring...');
    
    let transitionCheckInterval: NodeJS.Timeout | null = null;
    let transitionTimeoutId: NodeJS.Timeout | null = null;
    
    const checkTransitionState = () => {
      const inTransition = authStateManager.isInTransition();
      if (inTransition !== isAuthTransitioning) {
        console.log('🔄 AppProvider: Auth transition state changed:', inTransition);
        setIsAuthTransitioning(inTransition);
        
        // Coordinate loading state changes with transition state
        if (!inTransition) {
          // Transition completed - update loading state based on auth state
          if (authState.isAuthenticated && authState.isLocalDBReady) {
            setAuthLoadingState('ready');
          } else {
            setAuthLoadingState('idle');
          }
        }
      }
    };

    // Check immediately
    checkTransitionState();

    // Only start monitoring if we're in transition to reduce unnecessary checks
    if (isAuthTransitioning) {
      transitionCheckInterval = setInterval(checkTransitionState, 200); // Reduced frequency
      
      // Set timeout to prevent infinite loading states (2 seconds max as per requirements)
      transitionTimeoutId = setTimeout(() => {
        console.warn('🔄 AppProvider: Auth transition timeout at context level after 2 seconds, attempting recovery');
        
        // Clear the interval first
        if (transitionCheckInterval) {
          clearInterval(transitionCheckInterval);
          transitionCheckInterval = null;
        }
        
        // Attempt graceful recovery using error recovery service
        NullSafety.safeExecuteAsync(async () => {
          console.log('🔄 AppProvider: Auth transition timeout, attempting recovery');
          
          // Perform system health check first
          const healthCheck = await ErrorRecoveryService.performHealthCheck();
          console.log('🔄 AppProvider: System health check:', healthCheck);
          
          if (!healthCheck.authServiceHealthy || !healthCheck.stateManagerHealthy) {
            // Perform comprehensive recovery
            const recoveryResult = await ErrorRecoveryService.recoverAuthState();
            console.log('🔄 AppProvider: Recovery result:', recoveryResult);
            
            if (!recoveryResult.success) {
              console.warn('🔄 AppProvider: Recovery failed, performing emergency reset');
              await ErrorRecoveryService.performEmergencyReset();
            }
          } else {
            // Simple state manager recovery
            if (authStateManager.detectCorruptedState()) {
              authStateManager.recoverAuthState();
            } else {
              authStateManager.resetAuthFlow();
            }
          }
        }, 'AppProvider auth transition timeout recovery').catch(error => {
          console.error('🔄 AppProvider: Error in recovery process:', error);
          // Fallback to simple reset
          authStateManager.resetAuthFlow();
        });
        
        // Reset states
        setIsAuthTransitioning(false);
        setAuthLoadingState('idle');
      }, 2000); // 2 seconds as per requirements
    }

    return () => {
      if (transitionCheckInterval) {
        clearInterval(transitionCheckInterval);
      }
      if (transitionTimeoutId) {
        clearTimeout(transitionTimeoutId);
      }
    };
  }, [isAuthTransitioning, authState.isAuthenticated, authState.isLocalDBReady]);

  const signIn = async (email: string, password: string): Promise<void> => {
    console.log('🔐 AppProvider: Attempting sign in for:', email);
    
    if (!firebaseReady) {
      console.error('❌ AppProvider: Cannot sign in - Firebase not ready');
      throw new Error('Firebase not ready');
    }

    // Check security state before attempting sign in
    const securityState = await authService.getSecurityState();
    if (securityState.isLockedOut) {
      const lockoutTimeRemaining = Math.ceil((securityState.lockoutExpiresAt - Date.now()) / 60000);
      throw new Error(`Account is temporarily locked. Please try again in ${lockoutTimeRemaining} minutes.`);
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      console.error('❌ AppProvider: Could not get Firebase Auth instance for sign in');
      throw new Error('Firebase Auth not available');
    }

    try {
      setAuthLoadingState('signing-in');
      await signInWithEmailAndPassword(auth, email, password);
      
      // Reset security state on successful sign in
      await authService.resetSecurityState();
      console.log('✅ AppProvider: Sign in successful');
    } catch (error) {
      console.error('❌ AppProvider: Sign in failed:', error);
      setAuthLoadingState('idle');
      
      // Track failed attempt
      await authService.trackFailedAttempt();
      throw error;
    }
  };

  const batchedSignIn = async (email: string, password: string): Promise<void> => {
    console.log('🔐 AppProvider: Attempting batched sign in for:', email);
    
    if (!firebaseReady) {
      console.error('❌ AppProvider: Cannot sign in - Firebase not ready');
      throw new Error('Firebase not ready');
    }

    // Check security state before attempting sign in
    const securityState = await authService.getSecurityState();
    if (securityState.isLockedOut) {
      const lockoutTimeRemaining = Math.ceil((securityState.lockoutExpiresAt - Date.now()) / 60000);
      throw new Error(`Account is temporarily locked. Please try again in ${lockoutTimeRemaining} minutes.`);
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      console.error('❌ AppProvider: Could not get Firebase Auth instance for sign in');
      throw new Error('Firebase Auth not available');
    }

    try {
      setAuthLoadingState('signing-in');
      setIsAuthTransitioning(true);
      
      // Begin auth transition to enable batching
      authStateManager.beginAuthTransition();
      
      await signInWithEmailAndPassword(auth, email, password);
      
      // Reset security state on successful sign in
      await authService.resetSecurityState();
      console.log('✅ AppProvider: Batched sign in successful');
    } catch (error) {
      console.error('❌ AppProvider: Batched sign in failed:', error);
      setAuthLoadingState('idle');
      setIsAuthTransitioning(false);
      
      // Complete transition on error
      authStateManager.completeAuthTransition();
      
      // Track failed attempt
      await authService.trackFailedAttempt();
      throw error;
    }
  };

  const signUp = async (email: string, password: string, name: string): Promise<void> => {
    console.log('📝 AppProvider: Attempting sign up for:', email);
    
    if (!firebaseReady) {
      console.error('❌ AppProvider: Cannot sign up - Firebase not ready');
      throw new Error('Firebase not ready');
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      console.error('❌ AppProvider: Could not get Firebase Auth instance for sign up');
      throw new Error('Firebase Auth not available');
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
        await createUser({ name, email });
      }
      console.log('✅ AppProvider: Sign up successful');
    } catch (error) {
      console.error('❌ AppProvider: Sign up failed:', error);
      throw error;
    }
  };

  const logOut = async (): Promise<void> => {
    console.log('🚪 AppProvider: Attempting log out');
    
    try {
      // Immediately set states to logged out to prevent UI delays
      setAuthLoadingState('idle');
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLocalDBReady: false,
        isInitializing: false,
      });
      
      // Clear local auth state first (this is most important)
      console.log('🚪 AppProvider: Clearing local auth state...');
      await authService.clearAuthState();
      
      // Force user state to null immediately
      console.log('🚪 AppProvider: Setting user to null...');
      await authService.setUser(null, { skipDatabaseInit: true });
      
      // Try Firebase signOut if available (but don't block on it)
      if (firebaseReady) {
        try {
          const auth = getFirebaseAuth();
          if (auth) {
            console.log('🚪 AppProvider: Signing out from Firebase...');
            await signOut(auth);
            console.log('✅ AppProvider: Firebase signOut successful');
          }
        } catch (firebaseError) {
          console.warn('⚠️ AppProvider: Firebase signOut failed, but local state cleared:', firebaseError);
        }
      }
      
      console.log('✅ AppProvider: Log out completed');
      
    } catch (error) {
      console.error('❌ AppProvider: Log out failed:', error);
      
      // Force clear everything as absolute fallback
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLocalDBReady: false,
        isInitializing: false,
      });
      setAuthLoadingState('idle');
      
      // Try to clear auth service state
      try {
        await authService.clearAuthState();
      } catch (clearError) {
        console.error('❌ AppProvider: Failed to clear auth service state:', clearError);
      }
    }
  };

  const value = useMemo(() => ({
    user: authState.user,
    isFirebaseReady: firebaseReady,
    isLocalDBReady: authState.isLocalDBReady,
    isDevelopmentMode,
    isAuthTransitioning,
    authLoadingState,
    signIn,
    batchedSignIn,
    signUp,
    logOut,
    initializeLocalDB: () => authService.setUser(authState.user),
  }), [authState.user, firebaseReady, authState.isLocalDBReady, isDevelopmentMode, isAuthTransitioning, authLoadingState]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
