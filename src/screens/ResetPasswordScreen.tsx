import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackNavigationProp } from '../types/navigation';
import { useThemeMode } from '../contexts/ThemeContext';
import authService from '../services/authService';
import { AuthValidator, getPasswordStrengthColor, getPasswordStrengthText } from '../utils/authValidation';
import PasswordInput from '../components/PasswordInput';

type ResetPasswordRouteProp = RouteProp<{ ResetPassword: { code: string } }, 'ResetPassword'>;

interface ResetPasswordState {
  newPassword: string;
  confirmPassword: string;
  isLoading: boolean;
  isValidatingToken: boolean;
  isValidToken: boolean;
  resetComplete: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  tokenCode: string;
  userEmail: string | null;
}

const ResetPasswordScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp>();
  const route = useRoute<ResetPasswordRouteProp>();
  const { theme } = useThemeMode();

  const [state, setState] = useState<ResetPasswordState>({
    newPassword: '',
    confirmPassword: '',
    isLoading: false,
    isValidatingToken: true,
    isValidToken: false,
    resetComplete: false,
    error: null,
    fieldErrors: {},
    tokenCode: route.params?.code || '',
    userEmail: null
  });

  const [passwordStrength, setPasswordStrength] = useState<any>(null);

  // Validate the reset token on component mount
  useEffect(() => {
    const validateToken = async () => {
      if (!state.tokenCode) {
        setState(prev => ({
          ...prev,
          isValidatingToken: false,
          isValidToken: false,
          error: 'Invalid password reset link. Please request a new one.'
        }));
        return;
      }

      try {
        const email = await authService.verifyPasswordResetCode(state.tokenCode);
        setState(prev => ({
          ...prev,
          isValidatingToken: false,
          isValidToken: true,
          userEmail: email,
          error: null
        }));
      } catch (error) {
        console.error('ResetPasswordScreen: Token validation failed:', error);
        const errorMessage = error instanceof Error 
          ? error.message 
          : 'This password reset link is invalid or has expired.';

        setState(prev => ({
          ...prev,
          isValidatingToken: false,
          isValidToken: false,
          error: errorMessage
        }));
      }
    };

    validateToken();
  }, [state.tokenCode]);

  const handlePasswordChange = useCallback((value: string) => {
    setState(prev => ({
      ...prev,
      newPassword: value,
      error: null,
      fieldErrors: prev.fieldErrors.password ? { ...prev.fieldErrors, password: [] } : prev.fieldErrors
    }));

    // Update password strength
    if (value.length >= 6) {
      const validation = AuthValidator.validateAuthData({ password: value });
      setPasswordStrength(validation.passwordStrength);
    } else {
      setPasswordStrength(null);
    }
  }, []);

  const handleConfirmPasswordChange = useCallback((value: string) => {
    setState(prev => ({
      ...prev,
      confirmPassword: value,
      error: null,
      fieldErrors: prev.fieldErrors.confirmPassword ? { ...prev.fieldErrors, confirmPassword: [] } : prev.fieldErrors
    }));
  }, []);

  const validatePasswords = useCallback((): boolean => {
    const validation = AuthValidator.validateAuthData({ password: state.newPassword });
    let errors = { ...validation.errors };

    // Check password confirmation
    if (state.newPassword !== state.confirmPassword) {
      errors.confirmPassword = ['Passwords do not match'];
    }

    setState(prev => ({
      ...prev,
      fieldErrors: errors
    }));

    return validation.isValid && state.newPassword === state.confirmPassword;
  }, [state.newPassword, state.confirmPassword]);

  const handleResetPassword = useCallback(async () => {
    if (state.isLoading || !state.isValidToken) return;

    // Validate passwords
    if (!validatePasswords()) {
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await authService.confirmPasswordReset(state.tokenCode, state.newPassword);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        resetComplete: true,
        error: null
      }));
    } catch (error) {
      console.error('ResetPasswordScreen: Password reset failed:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to reset password. Please try again.';

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
    }
  }, [state.isLoading, state.isValidToken, state.tokenCode, state.newPassword, validatePasswords]);

  const handleBackToLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  // Loading state while validating token
  if (state.isValidatingToken) {
    return (
      <ImageBackground
        source={require('../../assets/GeoGardianDoodle.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16
          }}>
            <View style={{
              alignItems: 'center',
              backgroundColor: 'rgba(249, 250, 251, 0)',
              padding: 32,
              borderRadius: 16
            }}>
              <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 16 }} />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#FFFFFF',
                textAlign: 'center'
              }}>
                Validating Reset Link...
              </Text>
            </View>
          </View>
        </View>
      </ImageBackground>
    );
  }

  // Invalid token state
  if (!state.isValidToken) {
    return (
      <ImageBackground
        source={require('../../assets/GeoGardianDoodle.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16
          }}>
            <View style={{
              width: '100%',
              maxWidth: 400,
              padding: 24,
              backgroundColor: 'rgba(249, 250, 251, 0)',
              borderRadius: 16,
              alignItems: 'center'
            }}>
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 24
              }}>
                <Ionicons name="close-circle" size={48} color="#EF4444" />
              </View>

              <Text style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: '#FFFFFF',
                textAlign: 'center',
                marginBottom: 16
              }}>
                Invalid Reset Link
              </Text>

              <Text style={{
                fontSize: 16,
                color: '#FFFFFF',
                textAlign: 'center',
                marginBottom: 32,
                lineHeight: 24
              }}>
                {state.error || 'This password reset link is invalid or has expired. Please request a new one.'}
              </Text>

              <TouchableOpacity
                onPress={handleBackToLogin}
                style={{
                  backgroundColor: '#2563EB',
                  paddingVertical: 16,
                  paddingHorizontal: 24,
                  borderRadius: 8,
                  alignItems: 'center',
                  width: '100%'
                }}
              >
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '600'
                }}>
                  Back to Login
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    );
  }

  // Success state
  if (state.resetComplete) {
    return (
      <ImageBackground
        source={require('../../assets/GeoGardianDoodle.png')}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16
          }}>
            <View style={{
              width: '100%',
              maxWidth: 400,
              padding: 24,
              backgroundColor: 'rgba(249, 250, 251, 0)',
              borderRadius: 16,
              alignItems: 'center'
            }}>
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 24
              }}>
                <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
              </View>

              <Text style={{
                fontSize: 28,
                fontWeight: 'bold',
                color: '#FFFFFF',
                textAlign: 'center',
                marginBottom: 16
              }}>
                Password Reset!
              </Text>

              <Text style={{
                fontSize: 16,
                color: '#FFFFFF',
                textAlign: 'center',
                marginBottom: 32,
                lineHeight: 24
              }}>
                Your password has been successfully reset. You can now sign in with your new password.
              </Text>

              <TouchableOpacity
                onPress={handleBackToLogin}
                style={{
                  backgroundColor: '#2563EB',
                  paddingVertical: 16,
                  paddingHorizontal: 24,
                  borderRadius: 8,
                  alignItems: 'center',
                  width: '100%'
                }}
              >
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: '600'
                }}>
                  Sign In Now
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    );
  }

  // Main reset password form
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
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{
              width: '100%',
              maxWidth: 400,
              padding: 24,
              backgroundColor: 'rgba(249, 250, 251, 0)',
              borderRadius: 16
            }}>
              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 32 }}>
                <View style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: 'rgba(243, 244, 246, 0.8)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 16
                }}>
                  <Ionicons name="lock-closed" size={40} color="#2563EB" />
                </View>

                <Text style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: '#FFFFFF',
                  textAlign: 'center',
                  marginBottom: 8
                }}>
                  Reset Password
                </Text>

                {state.userEmail && (
                  <Text style={{
                    fontSize: 14,
                    color: 'rgba(255, 255, 255, 0.8)',
                    textAlign: 'center',
                    marginBottom: 8
                  }}>
                    for {state.userEmail}
                  </Text>
                )}

                <Text style={{
                  fontSize: 16,
                  color: '#FFFFFF',
                  textAlign: 'center',
                  lineHeight: 24
                }}>
                  Enter your new password below.
                </Text>
              </View>

              {/* Error Message */}
              {state.error && (
                <View style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderWidth: 1,
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16
                }}>
                  <Text style={{
                    color: '#EF4444',
                    fontSize: 14,
                    textAlign: 'center'
                  }}>
                    {state.error}
                  </Text>
                </View>
              )}

              {/* New Password Input */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  marginBottom: 8
                }}>
                  New Password
                </Text>
                
                <PasswordInput
                  value={state.newPassword}
                  onChangeText={handlePasswordChange}
                  placeholder="Enter new password"
                  label=""
                  error={state.fieldErrors.password}
                  editable={!state.isLoading}
                />

                {/* Field Errors */}
                {state.fieldErrors.password && state.fieldErrors.password.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    {(state.fieldErrors.password ?? []).map((error, index) => (
                      <Text key={index} style={{
                        fontSize: 12,
                        color: '#EF4444',
                        marginBottom: 4
                      }}>
                        • {error}
                      </Text>
                    ))}
                  </View>
                )}

                {/* Password Strength Indicator */}
                {passwordStrength && (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#FFFFFF', marginRight: 8 }}>
                        Password strength:
                      </Text>
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: getPasswordStrengthColor(passwordStrength.score)
                      }}>
                        {getPasswordStrengthText(passwordStrength.score)}
                      </Text>
                    </View>
                    <View style={{
                      height: 4,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      borderRadius: 2,
                      overflow: 'hidden'
                    }}>
                      <View style={{
                        height: '100%',
                        width: `${(passwordStrength.score + 1) * 20}%`,
                        backgroundColor: getPasswordStrengthColor(passwordStrength.score),
                        borderRadius: 2
                      }} />
                    </View>
                  </View>
                )}
              </View>

              {/* Confirm Password Input */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  marginBottom: 8
                }}>
                  Confirm New Password
                </Text>
                
                <PasswordInput
                  value={state.confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  placeholder="Confirm new password"
                  label=""
                  error={state.fieldErrors.confirmPassword}
                  editable={!state.isLoading}
                />

                {/* Field Errors */}
                {state.fieldErrors.confirmPassword && state.fieldErrors.confirmPassword.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    {(state.fieldErrors.confirmPassword ?? []).map((error, index) => (
                      <Text key={index} style={{
                        fontSize: 12,
                        color: '#EF4444',
                        marginBottom: 4
                      }}>
                        • {error}
                      </Text>
                    ))}
                  </View>
                )}
              </View>

              {/* Reset Password Button */}
              <TouchableOpacity
                onPress={handleResetPassword}
                disabled={state.isLoading || !state.newPassword || !state.confirmPassword}
                style={{
                  backgroundColor: (state.isLoading || !state.newPassword || !state.confirmPassword) ? '#9CA3AF' : '#2563EB',
                  paddingVertical: 16,
                  paddingHorizontal: 24,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginBottom: 16
                }}
              >
                {state.isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: '600'
                    }}>
                      Resetting...
                    </Text>
                  </View>
                ) : (
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: '600'
                  }}>
                    Reset Password
                  </Text>
                )}
              </TouchableOpacity>

              {/* Back to Login Link */}
              <TouchableOpacity
                onPress={handleBackToLogin}
                style={{
                  alignItems: 'center',
                  paddingVertical: 12
                }}
              >
                <Text style={{
                  color: '#FFFFFF',
                  fontSize: 14,
                  textDecorationLine: 'underline'
                }}>
                  Back to Login
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
};

export default ResetPasswordScreen;