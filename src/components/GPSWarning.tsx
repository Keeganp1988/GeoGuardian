import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle, AppState, AppStateStatus } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useThemeMode } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { locationSettingsHelper } from '../utils/locationSettingsHelper';

export interface GPSWarningProps {
  style?: ViewStyle;
  onPermissionChange?: (hasPermission: boolean) => void;
}

export interface GPSWarningState {
  showWarning: boolean;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
  servicesEnabled: boolean;
}

const GPSWarning: React.FC<GPSWarningProps> = ({ style, onPermissionChange }) => {
  const [warningState, setWarningState] = useState<GPSWarningState>({
    showWarning: false,
    permissionStatus: 'denied',
    servicesEnabled: false,
  });
  const [isSettingsNavigationInProgress, setIsSettingsNavigationInProgress] = useState(false);
  const { theme } = useThemeMode();
  const { state: { user } } = useApp();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkGPSStatus = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const shouldShow = status !== 'granted' || !servicesEnabled;
      
      const newState: GPSWarningState = {
        showWarning: shouldShow,
        permissionStatus: status,
        servicesEnabled,
      };
      
      setWarningState(prevState => {
        // Only update if state actually changed to prevent unnecessary re-renders
        if (
          prevState.showWarning !== newState.showWarning ||
          prevState.permissionStatus !== newState.permissionStatus ||
          prevState.servicesEnabled !== newState.servicesEnabled
        ) {
          // Notify parent component of permission changes
          if (onPermissionChange && prevState.showWarning !== newState.showWarning) {
            onPermissionChange(!newState.showWarning);
          }
          
          if (newState.showWarning) {
            console.log('GPSWarning: GPS disabled or permission not granted', {
              permissionStatus: status,
              servicesEnabled
            });
          }
          
          return newState;
        }
        return prevState;
      });
    } catch (error) {
      console.error('GPSWarning: Error checking GPS status:', error);
      setWarningState(prevState => ({
        ...prevState,
        showWarning: false,
      }));
    }
  }, [onPermissionChange]);

  // Handle app state changes for improved real-time monitoring
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground, check GPS status immediately
        if (user) {
          checkGPSStatus();
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [user, checkGPSStatus]);

  useEffect(() => {
    // Only check GPS status if user is authenticated
    if (!user) {
      setWarningState(prevState => ({
        ...prevState,
        showWarning: false,
      }));
      return;
    }

    // Check immediately
    checkGPSStatus();
    
    // Set up improved polling with shorter interval for better responsiveness
    intervalRef.current = setInterval(checkGPSStatus, 5000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user, checkGPSStatus]);

  // Don't show warning if user is not authenticated
  if (!user || !warningState.showWarning) return null;

  const handleOpenSettings = async () => {
    if (isSettingsNavigationInProgress) return;
    
    setIsSettingsNavigationInProgress(true);
    
    try {
      const success = await locationSettingsHelper.openLocationSettings();
      
      if (!success) {
        console.warn('GPSWarning: Failed to open location settings, trying app settings fallback');
        await locationSettingsHelper.openAppSettings();
      }
      
      // Check GPS status after a delay to allow user to change settings
      setTimeout(() => {
        checkGPSStatus();
      }, 2000);
      
    } catch (error) {
      console.error('GPSWarning: Failed to open settings:', error);
    } finally {
      setIsSettingsNavigationInProgress(false);
    }
  };

  const getWarningMessage = () => {
    if (warningState.permissionStatus !== 'granted' && !warningState.servicesEnabled) {
      return 'Location permission denied and GPS disabled. Enable both for full functionality.';
    } else if (warningState.permissionStatus !== 'granted') {
      return 'Location permission denied. Grant permission for full functionality.';
    } else if (!warningState.servicesEnabled) {
      return 'GPS is disabled. Enable location services for full functionality.';
    }
    return 'Location services unavailable. Enable location services for full functionality.';
  };

  return (
    <View 
      style={[
        styles.warningBanner, 
        { 
          backgroundColor: theme === 'dark' ? '#7F1D1D' : '#FEE2E2',
          borderBottomColor: theme === 'dark' ? '#991B1B' : '#FECACA'
        },
        style
      ]}
      testID="gps-warning-banner"
    >
      <View style={styles.warningContent}>
        <Ionicons 
          name="location-outline" 
          size={20} 
          color={theme === 'dark' ? '#FCA5A5' : '#EF4444'} 
          style={styles.warningIcon}
        />
        <Text 
          style={[
            styles.warningText,
            { color: theme === 'dark' ? '#FCA5A5' : '#DC2626' }
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit={false}
        >
          {getWarningMessage()}
        </Text>
        <TouchableOpacity 
          onPress={handleOpenSettings}
          style={[
            styles.settingsButton,
            { opacity: isSettingsNavigationInProgress ? 0.6 : 1 }
          ]}
          disabled={isSettingsNavigationInProgress}
          accessibilityLabel="Open location settings"
          accessibilityHint="Opens device location settings to enable GPS"
        >
          <Text style={[
            styles.settingsLink,
            { color: theme === 'dark' ? '#60A5FA' : '#2563EB' }
          ]}>
            {isSettingsNavigationInProgress ? 'Opening...' : 'Settings'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  warningBanner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    // Ensure proper positioning and prevent blur
    position: 'relative',
    zIndex: 1,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  warningIcon: {
    marginRight: 10,
    marginTop: 1, // Align with text baseline
    flexShrink: 0,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    // Fix text rendering issues
    textAlignVertical: 'top',
    includeFontPadding: false,
    marginRight: 8,
  },
  settingsButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    flexShrink: 0,
    minWidth: 60,
    alignItems: 'center',
  },
  settingsLink: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textAlign: 'center',
    // Ensure crisp text rendering
    includeFontPadding: false,
  },
});

export default GPSWarning;