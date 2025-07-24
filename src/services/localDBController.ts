/**
 * LocalDBController Service
 * 
 * Master controller service that manages all data flow and enforces business logic.
 * This is the single source of truth that controls when and how data is updated in Firestore.
 * 
 * Core Responsibilities:
 * - Monitor all device state changes (GPS, battery, charging, movement)
 * - Enforce 10m geofencing logic
 * - Manage heartbeat timing (30-minute intervals)
 * - Control all Firestore updates
 * - Handle offline/online sync
 * - Manage trip lifecycle
 * - Separate location timestamps from heartbeat timestamps
 */

import databaseService, { LocationCache, TripHistory, TripWaypoint } from './databaseService';
import { updateUserLocation, LocationData } from '../firebase/services';
import authService from './authService';
import heartbeatService from './heartbeatService';
import tripManagementService from './tripManagementService';
import { calculateDistance } from '../firebase/services';
// REMOVE: import { EventEmitter } from 'events';

// Constants
const GEOFENCE_RADIUS_METERS = 10;
const STATIONARY_THRESHOLD_MINUTES = 5;
const BATTERY_CHANGE_THRESHOLD = 2; // 2% change as per requirements
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DATA_RETENTION_DAYS = 20;

// Interfaces
export interface DeviceState {
  userId: string;
  latitude: number;
  longitude: number;
  address?: string;
  accuracy?: number;
  speed?: number;
  batteryLevel: number;
  isCharging: boolean;
  movementType: 'stationary' | 'walking' | 'running' | 'driving' | 'unknown';
  timestamp: Date;
  locationServicesEnabled: boolean; // NEW FIELD
}

export interface GeofenceState {
  isActive: boolean;
  centerLat?: number;
  centerLng?: number;
  radius: number;
  entryTime?: Date;
}

export interface LocalDBControllerState {
  isInitialized: boolean;
  currentUserId?: string;
  lastKnownLocation?: LocationCache;
  geofenceState: GeofenceState;
  isStationary: boolean;
  stationaryStartTime?: Date;
  lastBatteryLevel: number;
  lastChargingState: boolean;
  lastHeartbeatTime?: Date;
  isOnline: boolean;
  pendingSyncCount: number;
  locationServicesEnabled?: boolean; // NEW FIELD
}

// Minimal event emitter for React Native
class SimpleEventEmitter {
  private listeners: { [event: string]: Array<(...args: any[]) => void> } = {};
  on(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }
  off(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
  }
  emit(event: string, ...args: any[]) {
    if (!this.listeners[event] || !Array.isArray(this.listeners[event])) return;
    this.listeners[event].forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error('[LocalDBController] Error in event listener:', error);
      }
    });
  }
}

class LocalDBControllerService {
  private state: LocalDBControllerState = {
    isInitialized: false,
    geofenceState: {
      isActive: false,
      radius: GEOFENCE_RADIUS_METERS
    },
    isStationary: false,
    lastBatteryLevel: 100,
    lastChargingState: false,
    isOnline: true,
    pendingSyncCount: 0,
    locationServicesEnabled: true // default to true
  };

  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private eventEmitter = new SimpleEventEmitter(); // For subscriptions

  /**
   * Initialize the LocalDBController
   */
  async initialize(userId: string): Promise<void> {
    if (this.state.isInitialized && this.state.currentUserId === userId) {
      console.log('[LocalDBController] Already initialized for user:', userId);
      return;
    }

    try {
      console.log('[LocalDBController] Initializing for user:', userId);

      // Initialize database
      await databaseService.initialize();

      // Set current user
      this.state.currentUserId = userId;

      // Load last known state from database
      await this.loadLastKnownState(userId);

      // Start periodic cleanup (daily)
      this.startPeriodicCleanup();

      // Initialize trip management
      await tripManagementService.initialize(userId);

      this.state.isInitialized = true;
      console.log('[LocalDBController] Initialized successfully');

    } catch (error) {
      console.error('[LocalDBController] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Process device state update - MAIN ENTRY POINT
   * This is called by ConsolidatedLocationService with raw sensor data
   */
  async processDeviceStateUpdate(deviceState: DeviceState): Promise<void> {
    if (!this.state.isInitialized || !this.state.currentUserId) {
      console.warn('[LocalDBController] Not initialized, ignoring state update');
      return;
    }

    try {
      console.log('[LocalDBController] Processing device state update');

      // 1. Check for battery changes (immediate update trigger)
      const batteryChanged = await this.checkBatteryChange(deviceState);

      // 2. Check for location changes (geofence logic)
      const locationChanged = await this.checkLocationChange(deviceState);

      // 3. Check for stationary state changes
      const stationaryChanged = await this.checkStationaryStateChange(deviceState);

      // 4. Always save to local DB first
      await this.saveToLocalDB(deviceState);

      // 5. Determine if Firestore update is needed and what type
      let updateType: 'location' | 'heartbeat' | 'battery' | null = null;
      
      if (locationChanged || stationaryChanged) {
        updateType = 'location';
      } else if (batteryChanged) {
        updateType = 'battery';
      }

      if (updateType) {
        await this.updateFirestore(deviceState, updateType);
        
        // Reset heartbeat timer since we just updated
        this.resetHeartbeatTimer();
      }

      // 6. Update internal state
      this.updateInternalState(deviceState);

      // 7. Emit event if locationServicesEnabled changed
      if (this.state.locationServicesEnabled !== deviceState.locationServicesEnabled) {
        this.state.locationServicesEnabled = deviceState.locationServicesEnabled;
        this.eventEmitter.emit('locationServicesChanged', deviceState.locationServicesEnabled);
      }

      console.log('[LocalDBController] Device state processed successfully');

    } catch (error) {
      console.error('[LocalDBController] Error processing device state:', error);
    }
  }

  /**
   * Check if battery level has changed by 2% or charging state changed
   */
  private async checkBatteryChange(deviceState: DeviceState): Promise<boolean> {
    const batteryLevelChanged = Math.abs(deviceState.batteryLevel - this.state.lastBatteryLevel) >= BATTERY_CHANGE_THRESHOLD;
    const chargingStateChanged = deviceState.isCharging !== this.state.lastChargingState;

    if (batteryLevelChanged || chargingStateChanged) {
      console.log('[LocalDBController] Battery change detected in LocalDB:', {
        levelChange: deviceState.batteryLevel - this.state.lastBatteryLevel,
        chargingStateChanged,
        newLevel: deviceState.batteryLevel,
        newChargingState: deviceState.isCharging,
        previousLevel: this.state.lastBatteryLevel,
        previousChargingState: this.state.lastChargingState,
        timestamp: deviceState.timestamp.toISOString()
      });
      return true;
    }

    return false;
  }

  /**
   * Check if user has moved outside the 10m geofence
   */
  private async checkLocationChange(deviceState: DeviceState): Promise<boolean> {
    // If no geofence is active, any location change should be recorded
    if (!this.state.geofenceState.isActive) {
      console.log('[LocalDBController] No active geofence, location change detected');
      return true;
    }

    // Calculate distance from geofence center
    if (this.state.geofenceState.centerLat && this.state.geofenceState.centerLng) {
      const distance = calculateDistance(
        deviceState.latitude,
        deviceState.longitude,
        this.state.geofenceState.centerLat,
        this.state.geofenceState.centerLng
      );

      if (distance > this.state.geofenceState.radius) {
        console.log('[LocalDBController] User moved outside geofence:', {
          distance: distance.toFixed(2),
          radius: this.state.geofenceState.radius
        });

        // Deactivate geofence and start trip
        this.state.geofenceState.isActive = false;
        await this.handleGeofenceExit(deviceState);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if stationary state has changed (5+ minutes)
   */
  private async checkStationaryStateChange(deviceState: DeviceState): Promise<boolean> {
    const isCurrentlyStationary = deviceState.movementType === 'stationary';

    // User just became stationary
    if (isCurrentlyStationary && !this.state.isStationary) {
      this.state.stationaryStartTime = deviceState.timestamp;
      console.log('[LocalDBController] User became stationary at:', deviceState.timestamp);
      return false; // Don't update Firestore yet, wait for 5 minutes
    }

    // User was stationary and still is - check if 5+ minutes have passed
    if (isCurrentlyStationary && this.state.isStationary && this.state.stationaryStartTime) {
      const stationaryDuration = deviceState.timestamp.getTime() - this.state.stationaryStartTime.getTime();
      const fiveMinutesMs = STATIONARY_THRESHOLD_MINUTES * 60 * 1000;

      if (stationaryDuration >= fiveMinutesMs && !this.state.geofenceState.isActive) {
        console.log('[LocalDBController] User stationary for 5+ minutes, activating geofence');
        console.log('[LocalDBController] Arrival time will be set to:', this.state.stationaryStartTime);
        await this.activateGeofence(deviceState);
        return true; // This will trigger a location update with arrival timestamp
      }
    }

    // User was stationary but started moving
    if (!isCurrentlyStationary && this.state.isStationary) {
      console.log('[LocalDBController] User started moving from stationary position');
      this.state.isStationary = false;
      this.state.stationaryStartTime = undefined;
      
      // If geofence was active, this will be handled by checkLocationChange
      return false;
    }

    return false;
  }

  /**
   * Save device state to local database
   */
  private async saveToLocalDB(deviceState: DeviceState): Promise<void> {
    const arrivalTimestamp = this.getArrivalTimestamp(deviceState);
    
    const locationData: Omit<LocationCache, 'id' | 'created_at'> = {
      user_id: deviceState.userId,
      latitude: deviceState.latitude,
      longitude: deviceState.longitude,
      address: deviceState.address,
      timestamp: deviceState.timestamp,
      arrival_timestamp: arrivalTimestamp,
      heartbeat_timestamp: undefined, // Will be set separately for heartbeats
      accuracy: deviceState.accuracy,
      speed: deviceState.speed,
      battery_level: deviceState.batteryLevel,
      is_charging: deviceState.isCharging,
      movement_type: deviceState.movementType,
      zone_center_lat: this.state.geofenceState.centerLat,
      zone_center_lng: this.state.geofenceState.centerLng,
      zone_entry_time: this.state.geofenceState.entryTime,
      zone_radius: this.state.geofenceState.radius,
      is_stationary: this.state.isStationary,
      is_synced: false, // Will be marked as synced after Firestore update
      locationServicesEnabled: deviceState.locationServicesEnabled // NEW FIELD
    };

    await databaseService.saveLocation(locationData);
    console.log('[LocalDBController] Saved to local DB with arrival timestamp:', arrivalTimestamp);
  }

  /**
   * Get the arrival timestamp to use for this location
   * Returns the time when user first became stationary at this location
   */
  private getArrivalTimestamp(deviceState: DeviceState): Date | undefined {
    // If no previous location, this is the first arrival
    if (!this.state.lastKnownLocation) {
      console.log('[LocalDBController] First location - using current timestamp as arrival');
      return deviceState.timestamp;
    }

    // If geofence was just activated, use the entry time (when user first became stationary)
    if (this.state.geofenceState.isActive && this.state.geofenceState.entryTime) {
      const timeDiff = Math.abs(deviceState.timestamp.getTime() - this.state.geofenceState.entryTime.getTime());
      // Only set new arrival timestamp when geofence is first activated
      if (timeDiff < 60000 && !this.state.lastKnownLocation.arrival_timestamp) {
        console.log('[LocalDBController] Setting arrival timestamp to geofence entry time:', this.state.geofenceState.entryTime);
        return this.state.geofenceState.entryTime;
      }
    }

    // Otherwise, preserve existing arrival timestamp
    return this.state.lastKnownLocation.arrival_timestamp;
  }

  /**
   * Update Firestore with current device state
   */
  private async updateFirestore(deviceState: DeviceState, updateType: 'location' | 'heartbeat' | 'battery' = 'location'): Promise<void> {
    if (!this.state.isOnline) {
      console.log('[LocalDBController] Offline, skipping Firestore update');
      this.state.pendingSyncCount++;
      return;
    }

    try {
      const locationData: LocationData = {
        userId: deviceState.userId,
        latitude: deviceState.latitude,
        longitude: deviceState.longitude,
        address: deviceState.address,
        timestamp: deviceState.timestamp,
        accuracy: deviceState.accuracy,
        speed: deviceState.speed,
        batteryLevel: deviceState.batteryLevel,
        isCharging: deviceState.isCharging,
        circleMembers: [], // Will be populated by the calling service
        arrivalTimestamp: this.getArrivalTimestamp(deviceState),
        heartbeatTimestamp: updateType === 'heartbeat' || updateType === 'battery' ? deviceState.timestamp : undefined
      };

      await updateUserLocation(locationData, updateType);

      // Mark local DB records as synced
      const unsyncedLocations = await databaseService.getUnsyncedLocations(deviceState.userId);
      if (unsyncedLocations.length > 0) {
        const ids = unsyncedLocations.map(loc => loc.id!);
        await databaseService.markLocationsAsSynced(ids);
      }

      console.log(`[LocalDBController] Updated Firestore successfully - Type: ${updateType}`);

    } catch (error) {
      console.error('[LocalDBController] Failed to update Firestore:', error);
      this.state.pendingSyncCount++;
    }
  }

  /**
   * Activate 10m geofence around current location
   */
  private async activateGeofence(deviceState: DeviceState): Promise<void> {
    // Set the arrival time to when user became stationary (5 minutes ago)
    const arrivalTime = this.state.stationaryStartTime || deviceState.timestamp;
    
    this.state.geofenceState = {
      isActive: true,
      centerLat: deviceState.latitude,
      centerLng: deviceState.longitude,
      radius: GEOFENCE_RADIUS_METERS,
      entryTime: arrivalTime // Use when user first became stationary
    };

    this.state.isStationary = true;

    // Start heartbeat for stationary user
    this.startHeartbeat();

    // End any active trip and set arrival timestamp
    await tripManagementService.forceEndTrip();

    console.log('[LocalDBController] Geofence activated at:', {
      lat: deviceState.latitude,
      lng: deviceState.longitude,
      radius: GEOFENCE_RADIUS_METERS,
      arrivalTime: arrivalTime,
      stationaryDuration: deviceState.timestamp.getTime() - arrivalTime.getTime()
    });
  }

  /**
   * Handle user exiting geofence (start trip)
   */
  private async handleGeofenceExit(deviceState: DeviceState): Promise<void> {
    // Stop heartbeat
    this.stopHeartbeat();

    // Start trip
    const locationData: LocationData = {
      userId: deviceState.userId,
      latitude: deviceState.latitude,
      longitude: deviceState.longitude,
      address: deviceState.address,
      timestamp: deviceState.timestamp,
      accuracy: deviceState.accuracy,
      speed: deviceState.speed,
      batteryLevel: deviceState.batteryLevel,
      isCharging: deviceState.isCharging,
      circleMembers: []
    };

    await tripManagementService.processLocationUpdate(locationData, false);

    console.log('[LocalDBController] Geofence exit handled, trip started');
  }

  /**
   * Start 30-minute heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing timer

    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    console.log('[LocalDBController] Heartbeat started (30-minute intervals)');
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
      console.log('[LocalDBController] Heartbeat stopped');
    }
  }

  /**
   * Reset heartbeat timer (called after battery/location updates)
   */
  private resetHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      this.startHeartbeat(); // This will clear existing and start new timer
      console.log('[LocalDBController] Heartbeat timer reset');
    }
  }

  /**
   * Send heartbeat to maintain online status (preserves location timestamp)
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.state.currentUserId || !this.state.lastKnownLocation) {
      return;
    }

    try {
      // Update heartbeat timestamp in local DB (preserve arrival timestamp)
      const heartbeatTime = new Date();
      
      const locationData: Omit<LocationCache, 'id' | 'created_at'> = {
        ...this.state.lastKnownLocation,
        heartbeat_timestamp: heartbeatTime,
        is_synced: false
        // Keep arrival_timestamp unchanged
      };

      await databaseService.saveLocation(locationData);

      // Update Firestore with heartbeat only (preserve location data)
      if (this.state.isOnline) {
        const firestoreData: LocationData = {
          userId: this.state.currentUserId,
          latitude: this.state.lastKnownLocation.latitude,
          longitude: this.state.lastKnownLocation.longitude,
          address: this.state.lastKnownLocation.address,
          timestamp: this.state.lastKnownLocation.timestamp, // Keep original location timestamp
          arrivalTimestamp: this.state.lastKnownLocation.arrival_timestamp, // Keep arrival timestamp
          heartbeatTimestamp: heartbeatTime, // Update heartbeat timestamp
          accuracy: this.state.lastKnownLocation.accuracy,
          speed: this.state.lastKnownLocation.speed,
          batteryLevel: this.state.lastKnownLocation.battery_level || 0,
          isCharging: this.state.lastKnownLocation.is_charging || false,
          circleMembers: []
        };

        await updateUserLocation(firestoreData, 'heartbeat');
      }

      this.state.lastHeartbeatTime = heartbeatTime;
      console.log('[LocalDBController] Heartbeat sent - preserved location timestamp');

    } catch (error) {
      console.error('[LocalDBController] Failed to send heartbeat:', error);
    }
  }

  /**
   * Handle network state changes
   */
  async setOnlineStatus(isOnline: boolean): Promise<void> {
    if (this.state.isOnline === isOnline) {
      return;
    }

    this.state.isOnline = isOnline;
    console.log('[LocalDBController] Network status changed:', isOnline ? 'ONLINE' : 'OFFLINE');

    if (isOnline && this.state.pendingSyncCount > 0) {
      await this.syncPendingData();
    }
  }

  /**
   * Sync all pending data when coming back online
   */
  private async syncPendingData(): Promise<void> {
    if (!this.state.currentUserId) {
      return;
    }

    try {
      console.log('[LocalDBController] Syncing pending data...');

      // Sync unsynced locations
      const unsyncedLocations = await databaseService.getUnsyncedLocations(this.state.currentUserId);
      
      for (const location of unsyncedLocations) {
        const locationData: LocationData = {
          userId: location.user_id,
          latitude: location.latitude,
          longitude: location.longitude,
          address: location.address,
          timestamp: location.timestamp,
          accuracy: location.accuracy,
          speed: location.speed,
          batteryLevel: location.battery_level || 0,
          isCharging: location.is_charging || false,
          circleMembers: []
        };

        await updateUserLocation(locationData);
      }

      // Mark as synced
      if (unsyncedLocations.length > 0) {
        const ids = unsyncedLocations.map(loc => loc.id!);
        await databaseService.markLocationsAsSynced(ids);
      }

      // Sync unsynced trips
      const unsyncedTrips = await databaseService.getUnsyncedTrips(this.state.currentUserId);
      // TODO: Implement trip sync to Firestore

      this.state.pendingSyncCount = 0;
      console.log('[LocalDBController] Pending data synced successfully');

    } catch (error) {
      console.error('[LocalDBController] Failed to sync pending data:', error);
    }
  }

  /**
   * Load last known state from database
   */
  private async loadLastKnownState(userId: string): Promise<void> {
    try {
      const lastLocation = await databaseService.getLatestLocation(userId);
      
      if (lastLocation) {
        this.state.lastKnownLocation = lastLocation;
        this.state.lastBatteryLevel = lastLocation.battery_level || 100;
        this.state.lastChargingState = lastLocation.is_charging || false;
        this.state.isStationary = lastLocation.is_stationary || false;
        this.state.locationServicesEnabled = lastLocation.locationServicesEnabled || true; // Load from DB

        // Restore geofence state if it was active
        if (lastLocation.zone_center_lat && lastLocation.zone_center_lng && lastLocation.zone_entry_time) {
          this.state.geofenceState = {
            isActive: true,
            centerLat: lastLocation.zone_center_lat,
            centerLng: lastLocation.zone_center_lng,
            radius: lastLocation.zone_radius || GEOFENCE_RADIUS_METERS,
            entryTime: lastLocation.zone_entry_time
          };

          // Restart heartbeat if user was stationary
          if (this.state.isStationary) {
            this.startHeartbeat();
          }
        }

        console.log('[LocalDBController] Loaded last known state');
      }

      // Check pending sync count
      const unsyncedLocations = await databaseService.getUnsyncedLocations(userId);
      this.state.pendingSyncCount = unsyncedLocations.length;

    } catch (error) {
      console.error('[LocalDBController] Failed to load last known state:', error);
    }
  }

  /**
   * Update internal state after processing
   */
  private updateInternalState(deviceState: DeviceState): void {
    this.state.lastBatteryLevel = deviceState.batteryLevel;
    this.state.lastChargingState = deviceState.isCharging;
    
    // Update last known location (will be set after saving to DB)
    // This will be updated by the next database query
  }

  /**
   * Start periodic cleanup (daily)
   */
  private startPeriodicCleanup(): void {
    // Run cleanup daily at 2 AM
    const now = new Date();
    const tomorrow2AM = new Date(now);
    tomorrow2AM.setDate(tomorrow2AM.getDate() + 1);
    tomorrow2AM.setHours(2, 0, 0, 0);

    const msUntil2AM = tomorrow2AM.getTime() - now.getTime();

    setTimeout(() => {
      this.runCleanup();
      
      // Then run every 24 hours
      this.cleanupTimer = setInterval(() => {
        this.runCleanup();
      }, 24 * 60 * 60 * 1000);
      
    }, msUntil2AM);

    console.log('[LocalDBController] Periodic cleanup scheduled');
  }

  /**
   * Run data cleanup (20-day retention)
   */
  private async runCleanup(): Promise<void> {
    try {
      console.log('[LocalDBController] Running data cleanup...');
      await databaseService.cleanupOldData(DATA_RETENTION_DAYS);
      console.log('[LocalDBController] Data cleanup completed');
    } catch (error) {
      console.error('[LocalDBController] Data cleanup failed:', error);
    }
  }

  /**
   * Get current state (for debugging/monitoring)
   */
  getState(): Readonly<LocalDBControllerState> {
    return { ...this.state };
  }

  /**
   * Get the latest value of locationServicesEnabled
   */
  getLocationServicesEnabled(): boolean {
    return this.state.locationServicesEnabled ?? true;
  }

  /**
   * Subscribe to changes in locationServicesEnabled
   */
  onLocationServicesChanged(listener: (enabled: boolean) => void) {
    this.eventEmitter.on('locationServicesChanged', listener);
  }

  /**
   * Unsubscribe from changes in locationServicesEnabled
   */
  offLocationServicesChanged(listener: (enabled: boolean) => void) {
    this.eventEmitter.off('locationServicesChanged', listener);
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    console.log('[LocalDBController] Cleaning up...');

    this.stopHeartbeat();

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.state = {
      isInitialized: false,
      geofenceState: {
        isActive: false,
        radius: GEOFENCE_RADIUS_METERS
      },
      isStationary: false,
      lastBatteryLevel: 100,
      lastChargingState: false,
      isOnline: true,
      pendingSyncCount: 0,
      locationServicesEnabled: true
    };

    console.log('[LocalDBController] Cleanup completed');
  }
}

// Export singleton instance
export const localDBController = new LocalDBControllerService();
export default localDBController;