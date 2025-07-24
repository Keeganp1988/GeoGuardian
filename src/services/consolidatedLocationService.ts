/**
 * ConsolidatedLocationService - SIMPLIFIED VERSION
 * 
 * This service is now a simple "sensor reader" that collects device state data
 * and passes it to the LocalDBController, which is the single source of truth.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { Platform, AppState } from 'react-native';
import authService from './authService';
import localDBController, { DeviceState } from './localDBController';
import { permissionManager } from './permissionManager';
import { pedometerService } from './pedometerService';
import { eventBus } from './eventBusService';
import { EVENT_NAMES } from '../types/events';

// Constants
const BACKGROUND_LOCATION_TASK = 'background-location-task';
const LOCATION_TRACKING_INTERVAL = 10000; // 10 seconds
const WALKING_SPEED_THRESHOLD = 1.4; // m/s (5 km/h)
const RUNNING_SPEED_THRESHOLD = 3.0; // m/s (10.8 km/h)
const DRIVING_SPEED_THRESHOLD = 8.0; // m/s (28.8 km/h)

// Types
export type MovementType = 'stationary' | 'walking' | 'running' | 'driving' | 'unknown';

export interface LocationServiceConfig {
  userId: string;
  circleMembers: string[];
  enableBackgroundUpdates?: boolean;
  trackingInterval?: number;
}

class ConsolidatedLocationService {
  // Core tracking state
  private isInitialized = false;
  private isTracking = false;
  private config: LocationServiceConfig | null = null;
  private batteryMonitoringInterval: NodeJS.Timeout | null = null;
  private lastBatteryLevel = 100;
  private lastChargingState = false;

  /**
   * Initialize the consolidated location service
   */
  async initialize(config: LocationServiceConfig): Promise<void> {
    if (this.isInitialized) return;

    this.config = config;

    // Initialize PermissionManager first
    await permissionManager.initialize();

    // Initialize PedometerService for enhanced movement detection
    await pedometerService.initialize({
      updateInterval: 1000,
      enableRealTimeUpdates: true,
      sensitivityThreshold: 1.2,
    });

    // Initialize LocalDBController - IT CONTROLS EVERYTHING NOW
    await localDBController.initialize(config.userId);

    // Register background task if needed
    if (config.enableBackgroundUpdates) {
      await this.registerBackgroundTask();
    }

    // Check permissions using PermissionManager
    const permissions = await permissionManager.checkAllPermissions();

    if (!permissions.location.foreground.granted) {
      console.warn('ConsolidatedLocationService: Foreground location permission not granted');
      // Request foreground permission if not granted
      try {
        const requestResult = await permissionManager.requestInitialPermissions();
        if (!requestResult.location.foreground.granted) {
          console.warn('ConsolidatedLocationService: User denied foreground location permission');
        }
      } catch (error) {
        console.error('ConsolidatedLocationService: Failed to request permissions:', error);
      }
    }

    if (config.enableBackgroundUpdates && !permissions.location.background.granted) {
      console.warn('ConsolidatedLocationService: Background location permission not granted');
      // Don't automatically request background permission - let user do it manually
    }

    // Listen for permission changes
    eventBus.on(EVENT_NAMES.PERMISSION_CHANGED, this.handlePermissionChange.bind(this));

    this.isInitialized = true;
    console.log('Consolidated location service initialized with PermissionManager integration');
  }

  /**
   * Handle permission changes
   */
  private handlePermissionChange(data: any): void {
    console.log('ConsolidatedLocationService: Permission change detected', data);

    const { previous, current } = data;

    // Handle location permission changes
    if (previous.location.foreground.granted !== current.location.foreground.granted) {
      if (current.location.foreground.granted) {
        console.log('ConsolidatedLocationService: Foreground location permission granted, restarting tracking');
        if (this.isTracking) {
          this.startLocationTracking().catch(error => {
            console.error('ConsolidatedLocationService: Failed to restart tracking after permission grant:', error);
          });
        }
      } else {
        console.log('ConsolidatedLocationService: Foreground location permission revoked, stopping tracking');
        this.stopLocationTracking();
      }
    }

    if (previous.location.background.granted !== current.location.background.granted) {
      if (current.location.background.granted) {
        console.log('ConsolidatedLocationService: Background location permission granted');
        // Re-register background task if needed
        if (this.config?.enableBackgroundUpdates) {
          this.registerBackgroundTask().catch(error => {
            console.error('ConsolidatedLocationService: Failed to register background task:', error);
          });
        }
      } else {
        console.log('ConsolidatedLocationService: Background location permission revoked');
        // Background functionality will be limited
      }
    }

    // Handle motion permission changes for pedometer
    if (previous.motion.granted !== current.motion.granted) {
      if (current.motion.granted) {
        console.log('ConsolidatedLocationService: Motion permission granted, starting pedometer');
        if (this.isTracking) {
          pedometerService.startTracking().catch(error => {
            console.error('ConsolidatedLocationService: Failed to start pedometer after permission grant:', error);
          });
        }
      } else {
        console.log('ConsolidatedLocationService: Motion permission revoked, stopping pedometer');
        pedometerService.stopTracking();
      }
    }
  }

  /**
   * Start tracking location
   */
  async startLocationTracking(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ConsolidatedLocationService not initialized');
    }

    if (this.isTracking) {
      console.log('Location tracking already active');
      return;
    }

    try {
      // Check permissions before starting
      const permissions = permissionManager.getCurrentPermissions();
      if (!permissions?.location.foreground.granted) {
        console.warn('ConsolidatedLocationService: Cannot start tracking - foreground location permission not granted');
        // Don't throw error, just log warning and continue with limited functionality
        this.isTracking = false;
        return;
      }

      this.isTracking = true;

      // Start foreground tracking only if we have permission
      const locationOptions: Location.LocationOptions = {
        accuracy: Location.LocationAccuracy.Balanced,
        timeInterval: this.config?.trackingInterval || LOCATION_TRACKING_INTERVAL,
        distanceInterval: 10, // meters
      };

      // Only start background location updates if we have background permission
      if (permissions?.location.background.granted) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, locationOptions);
        console.log('ConsolidatedLocationService: Background location tracking started');
      } else {
        console.log('ConsolidatedLocationService: Background location permission not granted, using foreground only');
        // Start foreground location tracking instead
        // This will be handled by the app when it's active
      }

      // Start dedicated battery monitoring for more frequent battery state detection
      await this.startBatteryMonitoring();

      // Start pedometer tracking for enhanced movement detection
      if (permissions?.motion.granted) {
        const pedometerStarted = await pedometerService.startTracking();
        console.log('ConsolidatedLocationService: Pedometer tracking started:', pedometerStarted);
      } else {
        console.log('ConsolidatedLocationService: Motion permission not granted, skipping pedometer');
      }

      console.log('Location tracking, battery monitoring, and pedometer started');
    } catch (error) {
      this.isTracking = false;
      console.error('Failed to start location tracking:', error);
      
      // Don't throw error for permission issues - just log and continue
      if (error instanceof Error && error.message.includes('Not authorized')) {
        console.warn('ConsolidatedLocationService: Location permission denied, continuing with limited functionality');
        return;
      }
      
      throw error;
    }
  }

  /**
   * Force a battery and location update (useful for testing or manual refresh)
   */
  async forceUpdate(): Promise<void> {
    console.log('[ConsolidatedLocationService] Forcing battery and location update');

    if (!this.isTracking) {
      console.warn('[ConsolidatedLocationService] Cannot force update - tracking not active');
      return;
    }

    try {
      // Force immediate battery check
      await this.checkBatteryChanges();

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.LocationAccuracy.Balanced,
      });

      // Process the location update (this will also get fresh battery data)
      await this.handleLocationUpdate(location);
    } catch (error) {
      console.error('[ConsolidatedLocationService] Failed to force update:', error);
    }
  }

  /**
   * Force immediate battery check (useful for testing charging detection)
   */
  async forceBatteryCheck(): Promise<void> {
    console.log('[ConsolidatedLocationService] Forcing immediate battery check');
    await this.checkBatteryChanges();
  }

  /**
   * Start dedicated battery monitoring (every 5 seconds)
   */
  private async startBatteryMonitoring(): Promise<void> {
    if (this.batteryMonitoringInterval) {
      clearInterval(this.batteryMonitoringInterval);
    }

    // Initialize current battery state
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      this.lastBatteryLevel = Math.round(batteryLevel * 100);
      this.lastChargingState = batteryState === Battery.BatteryState.CHARGING;

      console.log('[ConsolidatedLocationService] Battery monitoring initialized:', {
        initialLevel: this.lastBatteryLevel,
        initialChargingState: this.lastChargingState,
        batteryState: batteryState
      });
    } catch (error) {
      console.error('[ConsolidatedLocationService] Failed to initialize battery state:', error);
    }

    console.log('[ConsolidatedLocationService] Starting battery monitoring (5-second intervals)');

    this.batteryMonitoringInterval = setInterval(async () => {
      await this.checkBatteryChanges();
    }, 5000); // Check every 5 seconds for faster charging detection
  }

  /**
   * Check for battery changes and trigger updates if needed
   */
  private async checkBatteryChanges(): Promise<void> {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const isCharging = batteryState === Battery.BatteryState.CHARGING;
      const currentBatteryLevel = Math.round(batteryLevel * 100);

      // Check if battery level changed by 2% or charging state changed
      const batteryLevelChanged = Math.abs(currentBatteryLevel - this.lastBatteryLevel) >= 2;
      const chargingStateChanged = isCharging !== this.lastChargingState;

      if (batteryLevelChanged || chargingStateChanged) {
        console.log('[ConsolidatedLocationService] Battery change detected:', {
          levelChange: currentBatteryLevel - this.lastBatteryLevel,
          chargingStateChanged: chargingStateChanged,
          newLevel: currentBatteryLevel,
          newChargingState: isCharging,
          batteryState: batteryState,
          timestamp: new Date().toISOString()
        });

        // Update last known values
        this.lastBatteryLevel = currentBatteryLevel;
        this.lastChargingState = isCharging;

        // Trigger a location update with new battery data
        await this.triggerBatteryUpdate(currentBatteryLevel, isCharging);
      }
    } catch (error) {
      console.error('[ConsolidatedLocationService] Error checking battery changes:', error);
    }
  }

  /**
   * Trigger a battery-only update to the system
   */
  private async triggerBatteryUpdate(batteryLevel: number, isCharging: boolean): Promise<void> {
    try {
      const userId = authService.getCurrentUserId();
      if (!userId) return;

      // Get last known location from LocalDBController
      const lastState = localDBController.getState();
      const lastLocation = lastState.lastKnownLocation;

      if (!lastLocation) {
        console.log('[ConsolidatedLocationService] No last location available for battery update');
        return;
      }

      // Create device state with updated battery info but same location
      const deviceState: DeviceState = {
        userId,
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        address: lastLocation.address,
        accuracy: lastLocation.accuracy,
        speed: lastLocation.speed,
        batteryLevel: batteryLevel,
        isCharging: isCharging,
        movementType: lastLocation.movement_type as any || 'unknown',
        timestamp: new Date(),
        locationServicesEnabled: lastLocation.locationServicesEnabled ?? true
      };

      console.log('[ConsolidatedLocationService] Triggering battery update:', {
        batteryLevel,
        isCharging,
        userId
      });

      // Send to LocalDBController for processing
      await localDBController.processDeviceStateUpdate(deviceState);

    } catch (error) {
      console.error('[ConsolidatedLocationService] Error triggering battery update:', error);
    }
  }

  /**
   * Stop tracking location
   */
  async stopLocationTracking(): Promise<void> {
    console.log('Stopping location tracking');
    this.isTracking = false;

    // Stop battery monitoring
    if (this.batteryMonitoringInterval) {
      clearInterval(this.batteryMonitoringInterval);
      this.batteryMonitoringInterval = null;
    }

    // Stop background task if running
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    // Stop pedometer tracking
    pedometerService.stopTracking();

    console.log('Location tracking, battery monitoring, and pedometer stopped');
  }

  /**
   * Register background location task
   */
  private async registerBackgroundTask(): Promise<void> {
    if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
      TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
        if (error) {
          console.error('Background location task error:', error);
          return;
        }

        if (!data) {
          console.warn('No data received in background location task');
          return;
        }

        // Process location updates
        const { locations } = data as { locations: Location.LocationObject[] };
        if (locations && locations.length > 0) {
          await this.handleLocationUpdate(locations[locations.length - 1]);
        }
      });

      console.log('Background location task registered');
    }
  }

  /**
   * Request location permissions
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== 'granted') {
        console.warn('Foreground location permission denied');
        return false;
      }

      if (this.config?.enableBackgroundUpdates) {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

        if (backgroundStatus !== 'granted') {
          console.warn('Background location permission denied');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  /**
   * Main location update handler - NOW SIMPLIFIED TO SENSOR READER ONLY
   * Made public so it can be called from background tasks
   */
  async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    try {
      // Check if user is authenticated and local DB is ready
      if (!authService.isReadyForOperations()) {
        console.log('ConsolidatedLocationService: User not authenticated or local DB not ready, skipping location update');
        return;
      }

      const userId = authService.getCurrentUserId();
      if (!userId) return;

      // Get battery information
      let batteryLevel = 100;
      let isCharging = false;
      try {
        batteryLevel = await Battery.getBatteryLevelAsync();
        const batteryState = await Battery.getBatteryStateAsync();
        isCharging = batteryState === Battery.BatteryState.CHARGING;

        console.log('[ConsolidatedLocationService] Battery info detected:', {
          level: Math.round(batteryLevel * 100),
          rawLevel: batteryLevel,
          state: batteryState,
          isCharging,
          timestamp: new Date().toISOString(),
          stateNames: {
            [Battery.BatteryState.UNKNOWN]: 'UNKNOWN',
            [Battery.BatteryState.UNPLUGGED]: 'UNPLUGGED',
            [Battery.BatteryState.CHARGING]: 'CHARGING',
            [Battery.BatteryState.FULL]: 'FULL'
          },
          currentStateName: batteryState === Battery.BatteryState.UNKNOWN ? 'UNKNOWN' :
            batteryState === Battery.BatteryState.UNPLUGGED ? 'UNPLUGGED' :
              batteryState === Battery.BatteryState.CHARGING ? 'CHARGING' :
                batteryState === Battery.BatteryState.FULL ? 'FULL' : 'UNDEFINED'
        });
      } catch (error) {
        console.warn('Failed to get battery info:', error);
      }

      // Get address if accuracy is reasonable (relaxed from 100m to 500m)
      let address: string | undefined;
      if (location.coords.accuracy && location.coords.accuracy < 500) {
        console.log(`[ConsolidatedLocationService] Getting address for coordinates with accuracy: ${location.coords.accuracy}m`);
        address = await this.getAddressFromCoordinates(
          location.coords.latitude,
          location.coords.longitude
        );
        console.log(`[ConsolidatedLocationService] Reverse geocoded address: ${address}`);
      } else {
        console.log(`[ConsolidatedLocationService] Skipping address lookup - accuracy too poor: ${location.coords.accuracy}m`);
      }

      // Determine movement type based on speed and pedometer data
      const movementType = this.detectMovementType(location.coords.speed || 0);

      // Log movement detection details for debugging
      const stepData = pedometerService.getCurrentStepData();
      console.log('ConsolidatedLocationService: Movement detection:', {
        gpsSpeed: location.coords.speed || 0,
        detectedMovement: movementType,
        pedometerAvailable: stepData.isAvailable,
        stepCount: stepData.stepCount,
        lastStepTime: stepData.timestamp,
      });

      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();

      // Create device state for LocalDBController
      const deviceState: DeviceState = {
        userId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address,
        accuracy: location.coords.accuracy ?? undefined,
        speed: location.coords.speed ?? undefined,
        batteryLevel: Math.round(batteryLevel * 100),
        isCharging,
        movementType,
        timestamp: new Date(),
        locationServicesEnabled: servicesEnabled // NEW FIELD
      };

      // Send to LocalDBController - IT MAKES ALL THE DECISIONS
      await localDBController.processDeviceStateUpdate(deviceState);

    } catch (error) {
      console.error('Error handling location update:', error);
    }
  }

  /**
   * Get address from coordinates
   */
  private async getAddressFromCoordinates(latitude: number, longitude: number): Promise<string | undefined> {
    try {
      const geocodeResult = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (geocodeResult && geocodeResult.length > 0) {
        const location = geocodeResult[0];
        const addressParts = [];

        // Build street address (avoid duplication between name and street+streetNumber)
        if (location.street) {
          if (location.streetNumber) {
            addressParts.push(`${location.streetNumber} ${location.street}`);
          } else {
            addressParts.push(location.street);
          }
        } else if (location.name) {
          // Only use name if no street info available
          addressParts.push(location.name);
        }

        if (location.city) addressParts.push(location.city);
        if (location.region) addressParts.push(location.region);

        return addressParts.join(', ');
      }
    } catch (error) {
      console.warn('Error getting address from coordinates:', error);
    }

    return undefined;
  }

  /**
   * Enhanced movement type detection using both GPS speed and pedometer data
   */
  private detectMovementType(speed: number): MovementType {
    // Get current step data from pedometer
    const stepData = pedometerService.getCurrentStepData();
    const isStepTrackingActive = stepData.isAvailable && pedometerService.getStatus().isTracking;

    // If pedometer is available and tracking, use hybrid detection
    if (isStepTrackingActive) {
      return this.detectMovementTypeWithPedometer(speed, stepData);
    }

    // Fallback to GPS-only detection
    return this.detectMovementTypeGPSOnly(speed);
  }

  /**
   * Hybrid movement detection using both GPS and pedometer data
   */
  private detectMovementTypeWithPedometer(speed: number, stepData: any): MovementType {
    const now = new Date();
    const timeSinceLastStep = stepData.timestamp ? now.getTime() - new Date(stepData.timestamp).getTime() : Infinity;
    const recentStepActivity = timeSinceLastStep < 10000; // Steps within last 10 seconds

    // High speed indicates driving regardless of steps
    if (speed >= DRIVING_SPEED_THRESHOLD) {
      return 'driving';
    }

    // Medium-high speed with no recent steps likely indicates driving
    if (speed >= RUNNING_SPEED_THRESHOLD && !recentStepActivity) {
      return 'driving';
    }

    // Medium speed with recent steps indicates running
    if (speed >= RUNNING_SPEED_THRESHOLD && recentStepActivity) {
      return 'running';
    }

    // Low-medium speed with recent steps indicates walking
    if (speed >= WALKING_SPEED_THRESHOLD && recentStepActivity) {
      return 'walking';
    }

    // Low speed with recent steps still indicates walking (GPS might be inaccurate)
    if (speed < WALKING_SPEED_THRESHOLD && recentStepActivity) {
      return 'walking';
    }

    // No recent steps and low speed indicates stationary
    return 'stationary';
  }

  /**
   * GPS-only movement detection (fallback when pedometer unavailable)
   */
  private detectMovementTypeGPSOnly(speed: number): MovementType {
    if (speed < WALKING_SPEED_THRESHOLD) {
      return 'stationary';
    } else if (speed < RUNNING_SPEED_THRESHOLD) {
      return 'walking';
    } else if (speed < DRIVING_SPEED_THRESHOLD) {
      return 'running';
    } else {
      return 'driving';
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    if (this.isTracking) {
      await this.stopLocationTracking();
    }

    // Stop battery monitoring
    if (this.batteryMonitoringInterval) {
      clearInterval(this.batteryMonitoringInterval);
      this.batteryMonitoringInterval = null;
    }

    this.isInitialized = false;
    this.config = null;

    console.log('ConsolidatedLocationService cleaned up');
  }
}

// On app foreground, check and update location services state
AppState.addEventListener('change', async (state) => {
  if (state === 'active') {
    const userId = authService.getCurrentUserId();
    if (!userId) return;
    const servicesEnabled = await Location.hasServicesEnabledAsync();

    // Only update location services state, don't send fake location data
    const lastLocation = localDBController.getState().lastKnownLocation;

    // Only process device state update if we have valid location data or location services are enabled
    if (servicesEnabled || (lastLocation && lastLocation.latitude !== 0 && lastLocation.longitude !== 0)) {
      await localDBController.processDeviceStateUpdate({
        userId,
        latitude: lastLocation?.latitude || 0,
        longitude: lastLocation?.longitude || 0,
        address: lastLocation?.address,
        accuracy: lastLocation?.accuracy,
        speed: lastLocation?.speed,
        batteryLevel: lastLocation?.battery_level || 100,
        isCharging: lastLocation?.is_charging || false,
        movementType: lastLocation?.movement_type as any || 'unknown',
        timestamp: new Date(),
        locationServicesEnabled: servicesEnabled
      });
    } else {
      // Just update the location services state without sending location data
      console.log('[ConsolidatedLocationService] Location services disabled, not sending location update');
    }
  }
});

// Export singleton instance
const consolidatedLocationService = new ConsolidatedLocationService();
export default consolidatedLocationService;