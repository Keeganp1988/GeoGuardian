import React, { useState, useCallback } from 'react';
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
  Image,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { RootStackNavigationProp } from '../types/navigation';
import { useThemeMode } from '../contexts/ThemeContext';
import authService from '../services/authService';
import { AuthValidator } from '../utils/authValidation';

interface ForgotPasswordState {
  email: string;
  isLoading: boolean;
  emailSent: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
}

const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp>();
  const { theme } = useThemeMode();

  const [state, setState] = useState<ForgotPasswordState>({
    email: '',
    isLoading: false,
    emailSent: false,
    error: null,
    fieldErrors: {}
  });

  const handleEmailChange = useCallback((value: string) => {
    setState(prev => ({
      ...prev,
      email: value,
      error: null,
      fieldErrors: prev.fieldErrors.email ? { ...prev.fieldErrors, email: [] } : prev.fieldErrors
    }));
  }, []);

  const validateEmail = useCallback((email: string): boolean => {
    const validation = AuthValidator.validateAuthData({ email });
    setState(prev => ({
      ...prev,
      fieldErrors: validation.errors
    }));
    return validation.isValid;
  }, []);

  const handleSendResetEmail = useCallback(async () => {
    if (state.isLoading) return;

    const trimmedEmail = state.email.trim();

    // Validate email
    if (!validateEmail(trimmedEmail)) {
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await authService.sendPasswordResetEmail(trimmedEmail);

      setState(prev => ({
        ...prev,
        isLoading: false,
        emailSent: true,
        error: null
      }));
    } catch (error) {
      console.error('ForgotPasswordScreen: Error sending reset email:', error);

      const errorMessage = error instanceof Error
        ? error.message
        : 'Failed to send password reset email. Please try again.';

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
    }
  }, [state.email, state.isLoading, validateEmail]);

  const handleBackToLogin = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleTryAgain = useCallback(() => {
    setState(prev => ({
      ...prev,
      emailSent: false,
      error: null,
      fieldErrors: {}
    }));
  }, []);

  if (state.emailSent) {
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
                borderRadius: 16,
                alignItems: 'center'
              }}>
                {/* Success Icon */}
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
                  Check Your Email
                </Text>

                <Text style={{
                  fontSize: 16,
                  color: '#FFFFFF',
                  textAlign: 'center',
                  marginBottom: 8,
                  lineHeight: 24
                }}>
                  We've sent a password reset link to:
                </Text>

                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  textAlign: 'center',
                  marginBottom: 24
                }}>
                  {state.email}
                </Text>

                <Text style={{
                  fontSize: 14,
                  color: 'rgba(255, 255, 255, 0.8)',
                  textAlign: 'center',
                  marginBottom: 32,
                  lineHeight: 20
                }}>
                  Click the link in the email to reset your password. If you don't see it, check your spam folder.
                </Text>

                {/* Action Buttons */}
                <View style={{ width: '100%', gap: 12 }}>
                  <TouchableOpacity
                    onPress={handleBackToLogin}
                    style={{
                      backgroundColor: '#2563EB',
                      paddingVertical: 16,
                      paddingHorizontal: 24,
                      borderRadius: 8,
                      alignItems: 'center'
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

                  <TouchableOpacity
                    onPress={handleTryAgain}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      paddingVertical: 16,
                      paddingHorizontal: 24,
                      borderRadius: 8,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <Text style={{
                      color: '#FFFFFF',
                      fontSize: 16,
                      fontWeight: '500'
                    }}>
                      Send Another Email
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </ImageBackground>
    );
  }

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
                <TouchableOpacity
                  onPress={handleBackToLogin}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    padding: 8,
                    zIndex: 1
                  }}
                >
                  <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: 'rgba(243, 244, 246, 0.8)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 16
                }}>
                  <Ionicons name="key" size={40} color="#2563EB" />
                </View>

                <Text style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: '#FFFFFF',
                  textAlign: 'center',
                  marginBottom: 8
                }}>
                  Forgot Password?
                </Text>

                <Text style={{
                  fontSize: 16,
                  color: '#FFFFFF',
                  textAlign: 'center',
                  lineHeight: 24
                }}>
                  Enter your email address and we'll send you a link to reset your password.
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

              {/* Email Input */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: '#FFFFFF',
                  marginBottom: 8
                }}>
                  Email Address
                </Text>

                <TextInput
                  style={{
                    backgroundColor: state.isLoading ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.9)',
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 16,
                    color: state.isLoading ? '#9CA3AF' : '#111827',
                    borderWidth: 1,
                    borderColor: state.fieldErrors.email ? '#EF4444' : '#E5E7EB'
                  }}
                  value={state.email}
                  onChangeText={handleEmailChange}
                  placeholder="Enter your email address"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!state.isLoading}
                />

                {/* Field Errors */}
                {state.fieldErrors.email && state.fieldErrors.email.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    {(state.fieldErrors.email ?? []).map((error, index) => (
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

              {/* Send Reset Email Button */}
              <TouchableOpacity
                onPress={handleSendResetEmail}
                disabled={state.isLoading || !state.email.trim()}
                style={{
                  backgroundColor: (state.isLoading || !state.email.trim()) ? '#9CA3AF' : '#2563EB',
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
                      Sending...
                    </Text>
                  </View>
                ) : (
                  <Text style={{
                    color: '#FFFFFF',
                    fontSize: 16,
                    fontWeight: '600'
                  }}>
                    Send Reset Email
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

export default ForgotPasswordScreen;