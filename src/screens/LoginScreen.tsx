import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Alert, ImageBackground, Dimensions, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../contexts/AppContext";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { RootStackNavigationProp } from '../types/navigation';
import { AuthValidator, getPasswordStrengthColor, getPasswordStrengthText } from '../utils/authValidation';
import { NullSafety } from '../utils/nullSafety';
import authService from '../services/authService';
import PasswordInput from '../components/PasswordInput';

// Enhanced form state interface for better state management
interface FormState {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  mode: "login" | "signup";
}

// Enhanced loading state interface for better user feedback
interface LoadingState {
  isLoading: boolean;
  phase: 'idle' | 'validating' | 'authenticating' | 'initializing' | 'complete';
  message: string;
}

// Memoized LoginScreen component to prevent unnecessary re-renders
const LoginScreen = React.memo(() => {
  const { signIn, batchedSignIn, signUp, isAuthTransitioning, authLoadingState } = useApp();
  const navigation = useNavigation<RootStackNavigationProp>();

  // Enhanced form state management to prevent input field jittering
  const [formState, setFormState] = useState<FormState>({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    mode: "login"
  });

  // Enhanced loading state with detailed phases for better user feedback
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    phase: 'idle',
    message: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [passwordStrength, setPasswordStrength] = useState<any>(null);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [stableFormState, setStableFormState] = useState(true);
  const [preventRerender, setPreventRerender] = useState(false);

  // Refs for stable component behavior and navigation coordination
  const formContainerRef = useRef<View>(null);
  const screenDimensions = useRef(Dimensions.get('window'));
  const isNavigationTransitioning = useRef(false);
  const authTransitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const formStabilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('🟢 LoginScreen: Mounted');
    checkSecurityState();
    
    // Check for valid stored authentication on mount
    checkStoredAuthentication();

    // Listen for screen dimension changes to maintain stability
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      screenDimensions.current = window;
    });

    return () => {
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, []);

  // Enhanced navigation focus effect with reduced logging and better coordination
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 LoginScreen: Screen focused');
      isNavigationTransitioning.current = false;

      // Clear any pending navigation timeouts
      if (authTransitionTimeoutRef.current) {
        clearTimeout(authTransitionTimeoutRef.current);
        authTransitionTimeoutRef.current = null;
      }

      // Only reset form state if we're not in the middle of authentication
      if (authLoadingState === 'ready' && !isAuthTransitioning) {
        setLoadingState({
          isLoading: false,
          phase: 'idle',
          message: ''
        });
        setStableFormState(true);
        setPreventRerender(false);
      }

      return () => {
        console.log('🔄 LoginScreen: Screen unfocused');

        // Only set navigation transition flag if we're not actively authenticating
        if (!isAuthTransitioning && authLoadingState !== 'signing-in') {
          isNavigationTransitioning.current = true;

          // Set timeout to prevent jarring screen changes during navigation
          authTransitionTimeoutRef.current = setTimeout(() => {
            if (isNavigationTransitioning.current) {
              console.log('🔄 LoginScreen: Navigation transition completed');
              isNavigationTransitioning.current = false;
            }
          }, 300); // Reduced timeout for faster transitions
        }
      };
    }, [authLoadingState, isAuthTransitioning])
  );

  // Enhanced auth transition monitoring with reduced state updates and better coordination
  useEffect(() => {
    if (isAuthTransitioning) {
      console.log('🔄 LoginScreen: Auth transition in progress');

      // Clear any pending validation timeouts when form becomes unstable
      if (validationTimeout) {
        clearTimeout(validationTimeout);
        setValidationTimeout(null);
      }

      // Only update state if not already in the correct state to prevent unnecessary re-renders
      if (stableFormState || loadingState.phase !== 'authenticating') {
        setStableFormState(false);
        setLoadingState(prev => ({
          ...prev,
          phase: 'authenticating',
          message: 'Authenticating...'
        }));
      }

      // Set timeout to prevent infinite loading states (2 seconds max as per requirements)
      if (!authTransitionTimeoutRef.current) {
        authTransitionTimeoutRef.current = setTimeout(() => {
          if (isAuthTransitioning) {
            console.warn('🔄 LoginScreen: Auth transition timeout, attempting recovery');

            // Attempt error recovery with minimal state changes
            setLoadingState({
              isLoading: false,
              phase: 'idle',
              message: ''
            });
            setStableFormState(true);
            setPreventRerender(false);
            setError('Authentication timeout. Please try again.');
          }
        }, 2000);
      }
    } else {
      console.log('🔄 LoginScreen: Auth transition completed');

      // Clear timeout when transition completes normally
      if (authTransitionTimeoutRef.current) {
        clearTimeout(authTransitionTimeoutRef.current);
        authTransitionTimeoutRef.current = null;
      }

      // Only restore stability if not navigating away and not already stable
      if (!isNavigationTransitioning.current && (!stableFormState || preventRerender)) {
        // Use a small delay to ensure smooth transition
        formStabilityTimeoutRef.current = setTimeout(() => {
          setStableFormState(true);
          setPreventRerender(false);

          // Only update loading state if it's still in authenticating phase
          if (loadingState.phase === 'authenticating') {
            setLoadingState(prev => ({
              ...prev,
              phase: 'complete',
              message: 'Authentication complete'
            }));
          }
        }, 50); // Reduced delay for faster response
      }
    }

    return () => {
      if (authTransitionTimeoutRef.current) {
        clearTimeout(authTransitionTimeoutRef.current);
        authTransitionTimeoutRef.current = null;
      }
      if (formStabilityTimeoutRef.current) {
        clearTimeout(formStabilityTimeoutRef.current);
        formStabilityTimeoutRef.current = null;
      }
    };
  }, [isAuthTransitioning, stableFormState, preventRerender, loadingState.phase]);

  // Enhanced auth loading state monitoring with reduced updates and better coordination
  useEffect(() => {
    console.log('🔄 LoginScreen: Auth loading state changed:', authLoadingState);

    // Prevent state updates during navigation transitions to avoid jarring changes
    if (isNavigationTransitioning.current) {
      console.log('🔄 LoginScreen: Skipping state update during navigation transition');
      return;
    }

    // Only update if the state actually needs to change to prevent unnecessary re-renders
    switch (authLoadingState) {
      case 'signing-in':
        if (!preventRerender || stableFormState || loadingState.phase !== 'authenticating') {
          setPreventRerender(true);
          setStableFormState(false);
          setLoadingState({
            isLoading: true,
            phase: 'authenticating',
            message: 'Signing in...'
          });
        }
        break;
      case 'initializing':
        if (loadingState.phase !== 'initializing') {
          setLoadingState({
            isLoading: true,
            phase: 'initializing',
            message: 'Initializing...'
          });
        }
        break;
      case 'ready':
        // Smooth transition to ready state with minimal updates
        if (loadingState.phase !== 'complete' && loadingState.phase !== 'idle') {
          formStabilityTimeoutRef.current = setTimeout(() => {
            if (!isNavigationTransitioning.current) {
              setStableFormState(true);
              setPreventRerender(false);
              setLoadingState({
                isLoading: false,
                phase: 'complete',
                message: 'Ready'
              });

              // Clear complete state after a brief moment for smooth UX
              setTimeout(() => {
                if (!isNavigationTransitioning.current && loadingState.phase === 'complete') {
                  setLoadingState({
                    isLoading: false,
                    phase: 'idle',
                    message: ''
                  });
                }
              }, 200); // Reduced delay
            }
          }, 50); // Reduced delay
        }
        break;
      case 'idle':
        if (loadingState.phase !== 'idle' || loadingState.isLoading) {
          setLoadingState({
            isLoading: false,
            phase: 'idle',
            message: ''
          });

          // Restore form stability after a brief delay only if needed
          if (!stableFormState || preventRerender) {
            setTimeout(() => {
              if (!isNavigationTransitioning.current) {
                setStableFormState(true);
                setPreventRerender(false);
              }
            }, 25); // Reduced delay
          }
        }
        break;
    }
  }, [authLoadingState, preventRerender, stableFormState, loadingState.phase, loadingState.isLoading]);

  // Check if account is locked on component mount
  const checkSecurityState = async () => {
    try {
      const securityState = await authService.getSecurityState();
      setIsAccountLocked(securityState.isLockedOut);
    } catch (error) {
      console.error('Error checking security state:', error);
    }
  };

  // Check for stored authentication and attempt auto-login
  const checkStoredAuthentication = useCallback(async () => {
    try {
      console.log('🔑 LoginScreen: Checking for stored authentication');
      
      // Only check if we're not already loading and form is stable
      if (loadingState.isLoading || !stableFormState) {
        return;
      }

      const isWithinValidPeriod = await authService.isWithinValidPeriod();
      if (isWithinValidPeriod) {
        console.log('🔑 LoginScreen: Valid stored authentication found, attempting auto-login');
        
        setLoadingState({
          isLoading: true,
          phase: 'authenticating',
          message: 'Signing in with saved credentials...'
        });
        
        const autoLoginResult = await authService.attemptAutoLogin();
        
        if (autoLoginResult.success) {
          console.log('🔑 LoginScreen: Auto-login successful');
          // Navigation will happen automatically when user state updates
        } else {
          console.log('🔑 LoginScreen: Auto-login failed:', autoLoginResult.error);
          setLoadingState({
            isLoading: false,
            phase: 'idle',
            message: ''
          });
          
          // Clear invalid stored auth
          await NullSafety.safeExecuteAsync(
            () => authService.clearStoredAuth(),
            'LoginScreen checkStoredAuthentication cleanup'
          );
        }
      }
    } catch (error) {
      console.error('🔑 LoginScreen: Error checking stored authentication:', error);
      setLoadingState({
        isLoading: false,
        phase: 'idle',
        message: ''
      });
    }
  }, [loadingState.isLoading, stableFormState]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
    };
  }, [validationTimeout]);

  // Clear validation timeouts when form becomes unstable to prevent jitter
  useEffect(() => {
    if (!stableFormState && validationTimeout) {
      console.log('🔄 LoginScreen: Clearing validation timeout due to unstable form state');
      clearTimeout(validationTimeout);
      setValidationTimeout(null);
    }
  }, [stableFormState, validationTimeout]);

  // Debounced validation function with form stability check
  const debouncedValidation = useCallback((email: string, password: string, name: string, currentMode: string) => {
    // Don't run validation if form is not stable to prevent jitter
    if (!stableFormState || preventRerender) {
      return;
    }

    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    const timeout = setTimeout(() => {
      // Double-check form stability before running validation
      if (!stableFormState || preventRerender) {
        return;
      }

      const data: any = { email, password };
      if (currentMode === 'signup') {
        data.name = name;
      }

      const validation = AuthValidator.validateAuthData(data);
      setFieldErrors(validation.errors);

      if (currentMode === 'signup' && password) {
        setPasswordStrength(validation.passwordStrength);
      }
    }, 300); // 300ms debounce

    setValidationTimeout(timeout);
  }, [validationTimeout, stableFormState, preventRerender]);

  // Validate password matching for confirm password field
  const validatePasswordMatch = useCallback((password: string, confirmPassword: string) => {
    if (confirmPassword && password !== confirmPassword) {
      setFieldErrors(prev => ({
        ...prev,
        confirmPassword: ['Passwords do not match']
      }));
    } else {
      setFieldErrors(prev => ({
        ...prev,
        confirmPassword: []
      }));
    }
  }, []);

  // Enhanced field validation with form state
  const validateFields = useCallback(() => {
    const data: any = {
      email: formState.email,
      password: formState.password
    };

    if (formState.mode === 'signup') {
      data.name = formState.name;
    }

    const validation = AuthValidator.validateAuthData(data);
    let errors = { ...validation.errors };

    // Add password matching validation for signup mode
    if (formState.mode === 'signup' && formState.password !== formState.confirmPassword) {
      errors.confirmPassword = ['Passwords do not match'];
    }

    setFieldErrors(errors);

    if (formState.mode === 'signup' && formState.password) {
      setPasswordStrength(validation.passwordStrength);
    }

    // Check if validation is valid and passwords match (for signup)
    const isPasswordMatch = formState.mode === 'login' || formState.password === formState.confirmPassword;
    return validation.isValid && isPasswordMatch;
  }, [formState]);

  // Enhanced mode change handler with stable form state management
  const handleModeChange = useCallback(() => {
    const newMode = formState.mode === "login" ? "signup" : "login";

    setFormState(prev => ({
      ...prev,
      mode: newMode,
      confirmPassword: "" // Clear confirm password when switching modes
    }));

    setError(null);
    setFieldErrors({});
    setPasswordStrength(null);

    // Clear validation timeout when switching modes
    if (validationTimeout) {
      clearTimeout(validationTimeout);
      setValidationTimeout(null);
    }

    // Reset loading state
    setLoadingState({
      isLoading: false,
      phase: 'idle',
      message: ''
    });
  }, [formState.mode, validationTimeout]);

  // Enhanced input change handlers with stable form state management and optimized memoization
  const handleEmailChange = useCallback((value: string) => {
    // Prevent updates during unstable form state to avoid jittering
    if (!stableFormState && preventRerender) {
      console.log('🔄 LoginScreen: Skipping email update during unstable form state');
      return;
    }

    setFormState(prev => ({ ...prev, email: value }));
    setError(null);

    // Clear field errors immediately when user starts typing (only when form is stable)
    if (stableFormState) {
      setFieldErrors(prev => {
        if (prev.email && prev.email.length > 0) {
          return { ...prev, email: [] };
        }
        return prev;
      });
    }
  }, [stableFormState, preventRerender]);

  const handlePasswordChange = useCallback((value: string) => {
    // Prevent updates during unstable form state to avoid jittering
    if (!stableFormState && preventRerender) {
      console.log('🔄 LoginScreen: Skipping password update during unstable form state');
      return;
    }

    setFormState(prev => ({ ...prev, password: value }));
    setError(null);

    // Clear field errors immediately when user starts typing (only when form is stable)
    if (stableFormState) {
      setFieldErrors(prev => {
        if (prev.password && prev.password.length > 0) {
          return { ...prev, password: [] };
        }
        return prev;
      });
    }

    // Only show password strength for signup mode and substantial input
    if (formState.mode === 'signup' && value.length >= 6 && stableFormState) {
      // Debounced password strength calculation only when form is stable
      if (validationTimeout) {
        clearTimeout(validationTimeout);
      }
      const timeout = setTimeout(() => {
        // Double-check form stability before updating state
        if (stableFormState && !preventRerender) {
          const validation = AuthValidator.validateAuthData({ password: value });
          setPasswordStrength(validation.passwordStrength);
        }
      }, 500);
      setValidationTimeout(timeout);
    } else if (formState.mode === 'signup' && value.length < 6) {
      // Clear password strength for short passwords only when form is stable
      if (passwordStrength && stableFormState) {
        setPasswordStrength(null);
      }
    }
  }, [stableFormState, preventRerender, formState.mode, passwordStrength, validationTimeout]);

  const handleNameChange = useCallback((value: string) => {
    // Prevent updates during unstable form state to avoid jittering
    if (!stableFormState && preventRerender) {
      console.log('🔄 LoginScreen: Skipping name update during unstable form state');
      return;
    }

    setFormState(prev => ({ ...prev, name: value }));
    setError(null);

    // Clear field errors immediately when user starts typing (only when form is stable)
    if (fieldErrors.name && fieldErrors.name.length > 0 && stableFormState) {
      setFieldErrors(prev => ({ ...prev, name: [] }));
    }
  }, [fieldErrors.name, stableFormState, preventRerender]);

  const handleConfirmPasswordChange = useCallback((value: string) => {
    // Prevent updates during unstable form state to avoid jittering
    if (!stableFormState && preventRerender) {
      console.log('🔄 LoginScreen: Skipping confirm password update during unstable form state');
      return;
    }

    setFormState(prev => ({ ...prev, confirmPassword: value }));
    setError(null);

    // Clear field errors immediately when user starts typing (only when form is stable)
    if (fieldErrors.confirmPassword && fieldErrors.confirmPassword.length > 0 && stableFormState) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: [] }));
    }

    // Validate password matching in real-time only when form is stable
    if (stableFormState) {
      validatePasswordMatch(formState.password, value);
    }
  }, [fieldErrors.confirmPassword, formState.password, validatePasswordMatch, stableFormState, preventRerender]);

  // Enhanced login handler with improved error handling and recovery
  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    setError(null);
    setFieldErrors({});

    // Enhanced loading state management
    setLoadingState({
      isLoading: true,
      phase: 'validating',
      message: 'Validating credentials...'
    });

    // Stabilize form state during authentication to prevent jittering
    setStableFormState(false);
    setPreventRerender(true);

    try {
      // Check if account is locked
      if (isAccountLocked) {
        const securityState = await authService.getSecurityState();
        const lockoutTimeRemaining = Math.ceil((securityState.lockoutExpiresAt - Date.now()) / 60000);
        throw new Error(`Account is temporarily locked. Please try again in ${lockoutTimeRemaining} minutes.`);
      }

      // Validate input fields
      const validation = AuthValidator.validateAuthData({
        email: formState.email,
        password: formState.password
      });

      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        throw new Error("Please correct the errors above.");
      }

      // Check rate limiting
      const rateLimitOk = await AuthValidator.checkRateLimit(validation.sanitized.email || formState.email);
      if (!rateLimitOk) {
        throw new Error("Too many login attempts. Please try again later.");
      }

      // Update loading state for authentication phase
      setLoadingState({
        isLoading: true,
        phase: 'authenticating',
        message: 'Signing in...'
      });

      // Use batched sign-in to prevent UI jitter during authentication
      await batchedSignIn(
        validation.sanitized.email || formState.email.trim(),
        formState.password
      );

      // Navigation will happen automatically when user state updates
    } catch (err) {
      // Update security state on error
      await checkSecurityState();

      const errorMessage = err instanceof Error
        ? err.message.replace(/Firebase: |\(.*\)/g, "").trim()
        : "An unexpected error occurred. Please try again.";

      setError(errorMessage);

      // Enhanced error recovery - reset form state on authentication failure
      setLoadingState({
        isLoading: false,
        phase: 'idle',
        message: ''
      });

      setStableFormState(true);
      setPreventRerender(false);
    }
  }, [formState.email, formState.password, isAccountLocked, batchedSignIn]);

  // Enhanced signup handler with improved error handling
  const handleSignUp = useCallback(async () => {
    Keyboard.dismiss();
    setError(null);
    setFieldErrors({});

    // Enhanced loading state management
    setLoadingState({
      isLoading: true,
      phase: 'validating',
      message: 'Validating information...'
    });

    try {
      // Validate input fields
      const validation = AuthValidator.validateAuthData({
        email: formState.email,
        password: formState.password,
        name: formState.name
      });

      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        throw new Error("Please correct the errors above.");
      }

      // Check rate limiting
      const rateLimitOk = await AuthValidator.checkRateLimit(validation.sanitized.email || formState.email);
      if (!rateLimitOk) {
        throw new Error("Too many signup attempts. Please try again later.");
      }

      // Update loading state for signup phase
      setLoadingState({
        isLoading: true,
        phase: 'authenticating',
        message: 'Creating account...'
      });

      await signUp(
        validation.sanitized.email || formState.email.trim(),
        formState.password,
        validation.sanitized.name || formState.name.trim()
      );

      // Navigation will happen automatically when user state updates
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message.replace(/Firebase: |\(.*\)/g, "").trim()
        : "An unexpected error occurred. Please try again.";

      setError(errorMessage);

      // Enhanced error recovery
      setLoadingState({
        isLoading: false,
        phase: 'idle',
        message: ''
      });
    }
  }, [formState.email, formState.password, formState.name, signUp]);

  return (
    <ImageBackground
      source={require('../../assets/GeoGardianDoodle.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
              paddingBottom: 150 // Even more padding to ensure button is always visible
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={{
              width: '100%',
              maxWidth: 400,
              padding: 24,
              backgroundColor: 'rgba(249, 250, 251, 0)',
              borderRadius: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 8,
              // Add stable positioning to prevent jitter
              transform: preventRerender ? [{ translateY: 0 }] : undefined,
              opacity: preventRerender ? 0.95 : 1.0
            }}>
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View style={{ width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 16, backgroundColor: 'rgba(243, 244, 246, 0.8)' }}>
                  <Image
                    source={require('../../assets/GeoGuardianLogo.png')}
                    style={{ width: 100, height: 100 }}
                    resizeMode="contain"
                  />
                </View>
                <Text style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', color: '#FFFFFF' }}>
                  {formState.mode === "login" ? "GeoGuardian" : "Create an Account"}
                </Text>
                <Text style={{ fontSize: 20, textAlign: 'center', color: '#FFFFFF' }}>
                  {loadingState.phase === 'authenticating' && loadingState.message.includes('saved credentials')
                    ? "Welcome back! Signing you in..."
                    : formState.mode === "login"
                    ? "Sign in to continue to GeoGuardian."
                    : "Sign up to start sharing your location safely!"}
                </Text>
                

              </View>

              <View ref={formContainerRef} style={{ gap: 16 }}>
                {formState.mode === "signup" && (
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#FFFFFF' }}>Name</Text>
                    <TextInput
                      style={{
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 16,
                        backgroundColor: (loadingState.isLoading || isAuthTransitioning) ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                        color: (loadingState.isLoading || isAuthTransitioning) ? '#9CA3AF' : '#111827',
                        borderWidth: 1,
                        borderColor: fieldErrors.name ? '#EF4444' : '#E5E7EB'
                      }}
                      value={formState.name}
                      onChangeText={handleNameChange}
                      placeholder="Enter your name"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="words"
                      editable={!loadingState.isLoading && !isAuthTransitioning && stableFormState}
                    />
                    {fieldErrors.name && (
                      <View style={{ marginTop: 4 }}>
                        {(fieldErrors.name ?? []).map((error, index) => (
                          <Text key={index} style={{ fontSize: 12, color: '#EF4444' }}>• {error}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#FFFFFF' }}>Email</Text>
                  <TextInput
                    style={{
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 16,
                      backgroundColor: (loadingState.isLoading || isAuthTransitioning) ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                      color: (loadingState.isLoading || isAuthTransitioning) ? '#9CA3AF' : '#111827',
                      borderWidth: 1,
                      borderColor: fieldErrors.email ? '#EF4444' : '#E5E7EB'
                    }}
                    value={formState.email}
                    onChangeText={handleEmailChange}
                    placeholder="Enter your email"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loadingState.isLoading && !isAuthTransitioning && stableFormState}
                  />
                  {fieldErrors.email && (
                    <View style={{ marginTop: 4 }}>
                      {(fieldErrors.email ?? []).map((error, index) => (
                        <Text key={index} style={{ fontSize: 12, color: '#EF4444' }}>• {error}</Text>
                      ))}
                    </View>
                  )}
                </View>
                <View>
                  <PasswordInput
                    value={formState.password}
                    onChangeText={handlePasswordChange}
                    placeholder="Enter your password"
                    label="Password"
                    error={fieldErrors.password}
                    editable={!loadingState.isLoading && !isAuthTransitioning && stableFormState}
                    disabled={loadingState.isLoading || isAuthTransitioning}
                  />
                  
                  {/* Forgot Password Link - Only show in login mode */}
                  {formState.mode === "login" && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate('ForgotPassword')}
                      style={{
                        alignSelf: 'flex-end',
                        marginTop: 8,
                        paddingVertical: 4,
                        paddingHorizontal: 8
                      }}
                      disabled={loadingState.isLoading || isAuthTransitioning}
                    >
                      <Text style={{
                        color: '#FFFFFF',
                        fontSize: 14,
                        textDecorationLine: 'underline',
                        opacity: (loadingState.isLoading || isAuthTransitioning) ? 0.5 : 1
                      }}>
                        Forgot Password?
                      </Text>
                    </TouchableOpacity>
                  )}
                  
                  {formState.mode === "signup" && passwordStrength && formState.password && (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#6B7280', marginRight: 8 }}>Password Strength:</Text>
                        <Text style={{
                          fontSize: 12,
                          fontWeight: '500',
                          color: getPasswordStrengthColor(passwordStrength.score)
                        }}>
                          {getPasswordStrengthText(passwordStrength.score)}
                        </Text>
                      </View>
                      <View style={{
                        height: 4,
                        backgroundColor: '#E5E7EB',
                        borderRadius: 2,
                        overflow: 'hidden'
                      }}>
                        <View style={{
                          height: '100%',
                          width: `${(passwordStrength.score / 4) * 100}%`,
                          backgroundColor: getPasswordStrengthColor(passwordStrength.score),
                          borderRadius: 2
                        }} />
                      </View>
                      {passwordStrength.feedback && passwordStrength.feedback.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                          {(passwordStrength.feedback ?? []).map((feedback: string, index: number) => (
                            <Text key={index} style={{ fontSize: 11, color: '#6B7280' }}>• {feedback}</Text>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {formState.mode === "signup" && (
                  <PasswordInput
                    value={formState.confirmPassword}
                    onChangeText={handleConfirmPasswordChange}
                    placeholder="Confirm your password"
                    label="Confirm Password"
                    error={fieldErrors.confirmPassword}
                    editable={!loadingState.isLoading && !isAuthTransitioning && stableFormState}
                    disabled={loadingState.isLoading || isAuthTransitioning}
                  />
                )}

                {error && <Text style={{ fontSize: 14, textAlign: 'center', color: '#EF4444' }}>{error}</Text>}

                {/* Enhanced loading progress indicator for better user feedback */}
                {(loadingState.isLoading || isAuthTransitioning) && (
                  <View style={{ marginTop: 8, marginBottom: 8 }}>
                    <View style={{
                      height: 4,
                      backgroundColor: '#E5E7EB',
                      borderRadius: 2,
                      overflow: 'hidden'
                    }}>
                      <View style={{
                        height: '100%',
                        width: loadingState.phase === 'validating' ? '25%' :
                          loadingState.phase === 'authenticating' ? '50%' :
                            loadingState.phase === 'initializing' ? '75%' :
                              loadingState.phase === 'complete' ? '100%' : '10%',
                        backgroundColor: '#2563EB',
                        borderRadius: 2
                      }} />
                    </View>
                    <Text style={{
                      fontSize: 12,
                      textAlign: 'center',
                      color: '#6B7280',
                      marginTop: 4
                    }}>
                      {loadingState.phase === 'validating' ? 'Validating credentials...' :
                        loadingState.phase === 'authenticating' ? 'Authenticating with server...' :
                          loadingState.phase === 'initializing' ? 'Setting up your account...' :
                            loadingState.phase === 'complete' ? 'Authentication complete!' :
                              'Processing...'}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={{
                    backgroundColor: (loadingState.isLoading || isAuthTransitioning) ? '#9CA3AF' : '#2563EB',
                    padding: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    marginTop: 16
                  }}
                  onPress={formState.mode === "login" ? handleLogin : handleSignUp}
                  disabled={loadingState.isLoading || isAuthTransitioning}
                >
                  {(loadingState.isLoading || isAuthTransitioning) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginLeft: 8 }}>
                        {loadingState.message ||
                          (authLoadingState === 'signing-in' ? 'Signing In...' :
                            authLoadingState === 'initializing' ? 'Initializing...' :
                              loadingState.phase === 'validating' ? 'Validating...' :
                                loadingState.phase === 'authenticating' ? 'Authenticating...' :
                                  loadingState.phase === 'complete' ? 'Complete!' :
                                    'Processing...')}
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' }}>
                      {formState.mode === "login" ? "Sign In" : "Create Account"}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                  onPress={handleModeChange}
                  disabled={loadingState.isLoading || isAuthTransitioning}
                >
                  <Text style={{
                    fontSize: 18,
                    fontWeight: '600',
                    color: (loadingState.isLoading || isAuthTransitioning) ? '#9CA3AF' : '#FFFFFF'
                  }}>
                    {formState.mode === "login"
                      ? "Don't have an account? Sign up"
                      : "Already have an account? Sign in"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
});

LoginScreen.displayName = 'LoginScreen';

export default LoginScreen;
