import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../contexts/AppContext";
import { changeUserPassword } from '../firebase/services';
import { useThemeMode } from '../contexts/ThemeContext';
import CustomHeader from '../components/CustomHeader';
import PasswordInput from '../components/PasswordInput';
import { RootStackNavigationProp } from '../types/navigation';

const UserProfileScreen = React.memo(() => {
  const { user, logOut } = useApp();
  const { theme } = useThemeMode();
  const navigation = useNavigation<RootStackNavigationProp>();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutAttempted, setLogoutAttempted] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [error, setError] = useState("");

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    // Prevent multiple logout attempts
    if (logoutAttempted) {
      console.log('[UserProfileScreen] Logout already in progress, ignoring...');
      return;
    }

    console.log('[UserProfileScreen] Logout confirmed, attempting logout...');
    setLogoutAttempted(true);

    // Close modal immediately to prevent multiple clicks
    setShowLogoutModal(false);
    setLogoutLoading(true);

    try {
      console.log('[UserProfileScreen] Calling logOut function...');
      await logOut();
      console.log('[UserProfileScreen] Logout successful');

      // Reset states after successful logout
      setLogoutLoading(false);
      setLogoutAttempted(false);
      
      // Force a small delay to ensure state propagation
      setTimeout(() => {
        console.log('[UserProfileScreen] Logout state reset completed');
      }, 100);

    } catch (error) {
      console.error('[UserProfileScreen] Logout failed:', error);

      // Reset states
      setLogoutLoading(false);
      setLogoutAttempted(false);

      // Show error alert
      Alert.alert(
        'Logout Error',
        'There was an issue logging out. The app will attempt to clear your session anyway.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Force logout by calling it again
              console.log('[UserProfileScreen] Forcing logout after error...');
              logOut().catch(e => console.error('[UserProfileScreen] Force logout also failed:', e));
            }
          }
        ]
      );
    }
  };

  const handleChangePassword = () => {
    setShowPasswordModal(true);
    setError("");
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSavePassword = async () => {
    setError("");
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await changeUserPassword(oldPassword, newPassword);
      setShowPasswordModal(false);
      setSuccessModalVisible(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name || typeof name !== "string") {
      return "??";
    }
    return (name ?? "")
      .split(" ")
      .map((n) => n[0] || "")
      .join("")
      .toUpperCase() || "??";
  };

  // Render Password Change Modal
  const renderPasswordModal = () => {
    return (
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          activeOpacity={1}
          onPress={() => setShowPasswordModal(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '90%',
              maxWidth: 400,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8
            }}
            activeOpacity={1}
            onPress={() => { }}
          >
            <Text style={{
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 16,
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center'
            }}>
              Change Password
            </Text>

            <View style={{ gap: 16 }}>
              <PasswordInput
                value={oldPassword}
                onChangeText={setOldPassword}
                placeholder="Current password"
                label="Current Password"
              />

              {/* Forgot Password Link */}
              <TouchableOpacity
                onPress={() => {
                  setShowPasswordModal(false);
                  // Navigate to forgot password and logout after reset
                  Alert.alert(
                    'Reset Password',
                    'You will be logged out and redirected to reset your password via email.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Continue',
                        onPress: async () => {
                          try {
                            // Store a flag to navigate to forgot password after logout
                            await logOut();
                            // Navigation to ForgotPassword will happen automatically when user becomes null
                            // The navigation system will handle this transition
                          } catch (error) {
                            console.error('Error during logout for password reset:', error);
                            Alert.alert('Error', 'Failed to logout. Please try again.');
                          }
                        }
                      }
                    ]
                  );
                }}
                style={{
                  alignSelf: 'flex-end',
                  marginTop: -8,
                  marginBottom: 8,
                  paddingVertical: 4,
                  paddingHorizontal: 8
                }}
              >
                <Text style={{
                  color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                  fontSize: 12,
                  textDecorationLine: 'underline'
                }}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>

              <PasswordInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                label="New Password"
              />

              <PasswordInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                label="Confirm New Password"
              />

              {error ? (
                <Text style={{
                  fontSize: 14,
                  color: '#EF4444',
                  textAlign: 'center',
                  marginTop: 8
                }}>
                  {error}
                </Text>
              ) : null}

              <TouchableOpacity
                style={{
                  backgroundColor: '#2563EB',
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center',
                  marginTop: 8
                }}
                onPress={handleSavePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: 16
                  }}>
                    Update Password
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render Logout Confirmation Modal
  const renderLogoutModal = () => {
    return (
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          activeOpacity={1}
          onPress={() => setShowLogoutModal(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '85%',
              maxWidth: 350,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8
            }}
            activeOpacity={1}
            onPress={() => { }}
          >
            <Text style={{
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 16,
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center'
            }}>
              Confirm Logout
            </Text>

            <Text style={{
              fontSize: 16,
              marginBottom: 24,
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
              textAlign: 'center',
              lineHeight: 22
            }}>
              Are you sure you want to logout?
            </Text>

            <View style={{
              flexDirection: 'row',
              gap: 12,
              justifyContent: 'space-between'
            }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#EF4444',
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center',
                  opacity: logoutLoading ? 0.7 : 1
                }}
                onPress={confirmLogout}
                disabled={logoutLoading}
              >
                {logoutLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    fontSize: 16
                  }}>
                    Logout
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#2563EB',
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center'
                }}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={{
                  color: '#FFFFFF',
                  fontWeight: 'bold',
                  fontSize: 16
                }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Render Success Modal
  const renderSuccessModal = () => {
    return (
      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          activeOpacity={1}
          onPress={() => setSuccessModalVisible(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '85%',
              maxWidth: 350,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8,
              alignItems: 'center'
            }}
            activeOpacity={1}
            onPress={() => { }}
          >
            <View style={{
              backgroundColor: '#10B981',
              width: 64,
              height: 64,
              borderRadius: 32,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </View>

            <Text style={{
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 8,
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center'
            }}>
              Password Updated
            </Text>

            <Text style={{
              fontSize: 16,
              marginBottom: 24,
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
              textAlign: 'center'
            }}>
              Your password has been successfully updated.
            </Text>

            <TouchableOpacity
              style={{
                backgroundColor: '#2563EB',
                borderRadius: 8,
                padding: 14,
                alignItems: 'center',
                minWidth: 120
              }}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={{
                color: '#FFFFFF',
                fontWeight: 'bold',
                fontSize: 16
              }}>
                Done
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Apply theme immediately to prevent white flash
  const backgroundColor = theme === 'dark' ? '#111827' : '#FFFFFF';

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <CustomHeader title="User Profile" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={{
          backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
          alignItems: 'center'
        }}>
          {/* Profile Image */}
          <View style={{ marginBottom: 16 }}>
            {user?.photoURL ? (
              <Image
                source={{ uri: user.photoURL }}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  borderWidth: 3,
                  borderColor: '#2563EB'
                }}
              />
            ) : (
              <View style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: '#2563EB',
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 3,
                borderColor: theme === 'dark' ? '#374151' : '#E5E7EB'
              }}>
                <Text style={{
                  fontSize: 36,
                  fontWeight: 'bold',
                  color: '#FFFFFF'
                }}>
                  {getInitials(user?.displayName || "User")}
                </Text>
              </View>
            )}
          </View>

          {/* User Info */}
          <Text style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            marginBottom: 4,
            textAlign: 'center'
          }}>
            {user?.displayName || "User"}
          </Text>

          <Text style={{
            fontSize: 16,
            color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
            textAlign: 'center'
          }}>
            {user?.email || "user@example.com"}
          </Text>
        </View>

        {/* Settings Card */}
        <View style={{
          backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
          borderRadius: 16,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
          overflow: 'hidden'
        }}>
          {/* Change Password */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme === 'dark' ? '#374151' : '#E5E7EB'
            }}
            onPress={handleChangePassword}
          >
            <View style={{
              backgroundColor: '#2563EB20',
              width: 40,
              height: 40,
              borderRadius: 20,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 16
            }}>
              <Ionicons name="lock-closed" size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme === 'dark' ? '#F9FAFB' : '#111827'
              }}>
                Change Password
              </Text>
              <Text style={{
                fontSize: 13,
                color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                marginTop: 2
              }}>
                Update your account password
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>

          {/* Account Settings */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme === 'dark' ? '#374151' : '#E5E7EB'
            }}
          >
            <View style={{
              backgroundColor: '#10B98120',
              width: 40,
              height: 40,
              borderRadius: 20,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 16
            }}>
              <Ionicons name="settings" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme === 'dark' ? '#F9FAFB' : '#111827'
              }}>
                Account Settings
              </Text>
              <Text style={{
                fontSize: 13,
                color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                marginTop: 2
              }}>
                Manage your account preferences
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>

          {/* Help & Support */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme === 'dark' ? '#374151' : '#E5E7EB'
            }}
          >
            <View style={{
              backgroundColor: '#F59E0B20',
              width: 40,
              height: 40,
              borderRadius: 20,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 16
            }}>
              <Ionicons name="help-circle" size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme === 'dark' ? '#F9FAFB' : '#111827'
              }}>
                Help & Support
              </Text>
              <Text style={{
                fontSize: 13,
                color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                marginTop: 2
              }}>
                Get help and contact support
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16
            }}
            onPress={handleLogout}
          >
            <View style={{
              backgroundColor: '#EF444420',
              width: 40,
              height: 40,
              borderRadius: 20,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 16
            }}>
              <Ionicons name="log-out" size={20} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#EF4444'
              }}>
                Logout
              </Text>
              <Text style={{
                fontSize: 13,
                color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                marginTop: 2
              }}>
                Sign out of your account
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderPasswordModal()}
      {renderLogoutModal()}
      {renderSuccessModal()}

      {/* Logout Loading Overlay */}
      {logoutLoading && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <View style={{
            backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
            padding: 24,
            borderRadius: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
            elevation: 8
          }}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={{
              marginTop: 16,
              fontSize: 16,
              fontWeight: '500',
              color: theme === 'dark' ? '#F9FAFB' : '#111827'
            }}>
              Logging out...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

export default UserProfileScreen; 