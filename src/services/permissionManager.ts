import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { eventBus } from './eventBusService';
import { EVENT_NAMES } from '../types/events';

export interface PermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

export interface AppPermissions {
  location: {
    foreground: PermissionStatus;
    background: PermissionStatus;
  };
  motion: PermissionStatus;
  notifications: PermissionStatus;
}

export interface PermissionRequestOptions {
  showRationale?: boolean;
  rationaleTitle?: string;
  rationaleMessage?: string;
}

export class PermissionManager {
  private static instance: PermissionManager;
  private currentPermissions: AppPermissions | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Initialize the permission manager and check current permissions
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.checkAllPermissions();
      this.isInitialized = true;
      console.log('PermissionManager: Initialized successfully');
    } catch (error) {
      console.error('PermissionManager: Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Check all app permissions and update internal state
   */
  async checkAllPermissions(): Promise<AppPermissions> {
    try {
      const [foregroundLocation, backgroundLocation, motion, notifications] = await Promise.all([
        this.checkLocationPermission('foreground'),
        this.checkLocationPermission('background'),
        this.checkMotionPermission(),
        this.checkNotificationPermission(),
      ]);

      this.currentPermissions = {
        location: {
          foreground: foregroundLocation,
          background: backgroundLocation,
        },
        motion,
        notifications,
      };

      // Emit permission status change event
      eventBus.emit(EVENT_NAMES.PERMISSION_STATUS_CHANGED, this.currentPermissions);

      return this.currentPermissions;
    } catch (error) {
      console.error('PermissionManager: Failed to check permissions:', error);
      throw error;
    }
  }

  /**
   * Request all necessary permissions for first launch
   */
  async requestInitialPermissions(): Promise<AppPermissions> {
    console.log('PermissionManager: Requesting initial permissions');

    try {
      // Request foreground location first
      const foregroundLocation = await this.requestLocationPermission('foreground', {
        showRationale: true,
        rationaleTitle: 'Location Access Required',
        rationaleMessage: 'This app needs location access to provide location-based features and track your activity.',
      });

      // Request background location if foreground was granted
      let backgroundLocation: PermissionStatus;
      if (foregroundLocation.granted) {
        backgroundLocation = await this.requestLocationPermission('background', {
          showRationale: true,
          rationaleTitle: 'Background Location Access',
          rationaleMessage: 'Background location access allows the app to continue tracking your location and activity when not actively in use.',
        });
      } else {
        backgroundLocation = await this.checkLocationPermission('background');
      }

      // Request motion permissions
      const motion = await this.requestMotionPermission({
        showRationale: true,
        rationaleTitle: 'Motion & Fitness Access',
        rationaleMessage: 'Motion access is needed to count your steps and provide activity tracking features.',
      });

      // Request notification permissions
      const notifications = await this.requestNotificationPermission({
        showRationale: true,
        rationaleTitle: 'Notification Access',
        rationaleMessage: 'Notifications help keep you informed about important location and activity updates.',
      });

      this.currentPermissions = {
        location: {
          foreground: foregroundLocation,
          background: backgroundLocation,
        },
        motion,
        notifications,
      };

      // Emit permission status change event
      eventBus.emit(EVENT_NAMES.PERMISSION_STATUS_CHANGED, this.currentPermissions);

      console.log('PermissionManager: Initial permissions requested', this.currentPermissions);
      return this.currentPermissions;
    } catch (error) {
      console.error('PermissionManager: Failed to request initial permissions:', error);
      throw error;
    }
  }

  /**
   * Check location permission status
   */
  private async checkLocationPermission(type: 'foreground' | 'background'): Promise<PermissionStatus> {
    try {
      const permission = type === 'foreground' 
        ? await Location.getForegroundPermissionsAsync()
        : await Location.getBackgroundPermissionsAsync();

      return {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      };
    } catch (error) {
      console.error(`PermissionManager: Failed to check ${type} location permission:`, error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }
  }

  /**
   * Request location permission
   */
  private async requestLocationPermission(
    type: 'foreground' | 'background',
    options: PermissionRequestOptions = {}
  ): Promise<PermissionStatus> {
    try {
      console.log(`PermissionManager: Requesting ${type} location permission`);

      const permission = type === 'foreground'
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.requestBackgroundPermissionsAsync();

      const result: PermissionStatus = {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      };

      console.log(`PermissionManager: ${type} location permission result:`, result);
      return result;
    } catch (error) {
      console.error(`PermissionManager: Failed to request ${type} location permission:`, error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }
  }

  /**
   * Check motion permission status
   */
  private async checkMotionPermission(): Promise<PermissionStatus> {
    try {
      // Motion permissions are handled differently on different platforms
      if (Platform.OS === 'ios') {
        // On iOS, we need to check if motion is available
        // This is a simplified check - in a real app you might use expo-sensors
        return {
          granted: true, // Assume granted for now - will be updated when we implement pedometer
          canAskAgain: true,
          status: 'granted',
        };
      } else {
        // On Android, motion permissions are usually granted by default
        return {
          granted: true,
          canAskAgain: true,
          status: 'granted',
        };
      }
    } catch (error) {
      console.error('PermissionManager: Failed to check motion permission:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }
  }

  /**
   * Request motion permission
   */
  private async requestMotionPermission(options: PermissionRequestOptions = {}): Promise<PermissionStatus> {
    try {
      console.log('PermissionManager: Requesting motion permission');

      // For now, return the check result - will be updated when we implement pedometer
      return await this.checkMotionPermission();
    } catch (error) {
      console.error('PermissionManager: Failed to request motion permission:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }
  }

  /**
   * Check notification permission status
   */
  private async checkNotificationPermission(): Promise<PermissionStatus> {
    try {
      const permission = await Notifications.getPermissionsAsync();

      return {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      };
    } catch (error) {
      console.error('PermissionManager: Failed to check notification permission:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }
  }

  /**
   * Request notification permission
   */
  private async requestNotificationPermission(options: PermissionRequestOptions = {}): Promise<PermissionStatus> {
    try {
      console.log('PermissionManager: Requesting notification permission');

      const permission = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      const result: PermissionStatus = {
        granted: permission.granted,
        canAskAgain: permission.canAskAgain,
        status: permission.status,
      };

      console.log('PermissionManager: Notification permission result:', result);
      return result;
    } catch (error) {
      console.error('PermissionManager: Failed to request notification permission:', error);
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }
  }

  /**
   * Get current permissions
   */
  getCurrentPermissions(): AppPermissions | null {
    return this.currentPermissions;
  }

  /**
   * Check if location services are enabled
   */
  async isLocationServicesEnabled(): Promise<boolean> {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error('PermissionManager: Failed to check location services:', error);
      return false;
    }
  }

  /**
   * Monitor permission changes when app becomes active
   */
  async onAppBecomeActive(): Promise<void> {
    try {
      console.log('PermissionManager: App became active, checking permissions');
      const previousPermissions = this.currentPermissions;
      const currentPermissions = await this.checkAllPermissions();

      // Check if permissions have changed
      if (previousPermissions && this.hasPermissionsChanged(previousPermissions, currentPermissions)) {
        console.log('PermissionManager: Permissions changed, emitting event');
        eventBus.emit(EVENT_NAMES.PERMISSION_CHANGED, {
          previous: previousPermissions,
          current: currentPermissions,
        });
      }
    } catch (error) {
      console.error('PermissionManager: Failed to check permissions on app active:', error);
    }
  }

  /**
   * Check if permissions have changed
   */
  private hasPermissionsChanged(previous: AppPermissions, current: AppPermissions): boolean {
    return (
      previous.location.foreground.granted !== current.location.foreground.granted ||
      previous.location.background.granted !== current.location.background.granted ||
      previous.motion.granted !== current.motion.granted ||
      previous.notifications.granted !== current.notifications.granted
    );
  }

  /**
   * Get permission guidance message for denied permissions
   */
  getPermissionGuidance(permissionType: 'location' | 'motion' | 'notifications'): string {
    switch (permissionType) {
      case 'location':
        return 'Location access is required for core app functionality. Please enable location permissions in your device settings.';
      case 'motion':
        return 'Motion access is needed for step counting and activity tracking. You can enable this in your device settings.';
      case 'notifications':
        return 'Notifications help keep you informed about important updates. You can enable notifications in your device settings.';
      default:
        return 'This permission is needed for the app to function properly. Please enable it in your device settings.';
    }
  }
}

// Export singleton instance
export const permissionManager = PermissionManager.getInstance();