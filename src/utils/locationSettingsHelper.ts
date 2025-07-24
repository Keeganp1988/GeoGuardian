import { Linking, Platform } from 'react-native';

export interface LocationSettingsHelper {
  openLocationSettings(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  canOpenLocationSettings(): boolean;
}

class LocationSettingsHelperImpl implements LocationSettingsHelper {
  /**
   * Opens platform-specific location settings
   * iOS: Opens Location Services in Settings
   * Android: Opens Location settings where GPS can be enabled
   */
  async openLocationSettings(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Use app-settings: URL scheme to open Location Services
        const url = 'app-settings:';
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return true;
        }
        // Fallback to general app settings
        return this.openAppSettings();
      } else if (Platform.OS === 'android') {
        // Android: Try to open location settings using deep link
        try {
          // Try location settings deep link
          const locationSettingsUrl = 'android-app://com.android.settings/.Settings$LocationSettingsActivity';
          const canOpenLocationSettings = await Linking.canOpenURL(locationSettingsUrl);
          
          if (canOpenLocationSettings) {
            await Linking.openURL(locationSettingsUrl);
            return true;
          }
          
          // Fallback to general settings with location intent
          const generalSettingsUrl = 'android.settings.LOCATION_SETTINGS';
          const canOpenGeneralSettings = await Linking.canOpenURL(generalSettingsUrl);
          
          if (canOpenGeneralSettings) {
            await Linking.openURL(generalSettingsUrl);
            return true;
          }
          
          // Final fallback to app settings
          return this.openAppSettings();
        } catch (error) {
          console.warn('LocationSettingsHelper: Android deep link failed:', error);
          return this.openAppSettings();
        }
      }
      
      // Unsupported platform fallback
      return this.openAppSettings();
    } catch (error) {
      console.error('LocationSettingsHelper: Failed to open location settings:', error);
      // Final fallback to app settings
      return this.openAppSettings();
    }
  }

  /**
   * Opens general app settings as a fallback
   */
  async openAppSettings(): Promise<boolean> {
    try {
      await Linking.openSettings();
      return true;
    } catch (error) {
      console.error('LocationSettingsHelper: Failed to open app settings:', error);
      return false;
    }
  }

  /**
   * Checks if platform-specific location settings can be opened
   */
  canOpenLocationSettings(): boolean {
    if (Platform.OS === 'ios') {
      // iOS supports app-settings: URL scheme
      return true;
    } else if (Platform.OS === 'android') {
      // Android supports location settings intents
      return true;
    }
    return false;
  }
}

// Export singleton instance
export const locationSettingsHelper = new LocationSettingsHelperImpl();

// Export class for testing
export { LocationSettingsHelperImpl };