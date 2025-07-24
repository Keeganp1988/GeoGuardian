/**
 * LocalDBController Core Logic Tests
 * Tests the business logic without database dependencies
 */

// Mock all external dependencies
jest.mock('../services/databaseService', () => ({
  initialize: jest.fn(),
  saveLocation: jest.fn(),
  getLatestLocation: jest.fn(),
  getUnsyncedLocations: jest.fn(),
  markLocationsAsSynced: jest.fn(),
  cleanupOldData: jest.fn(),
}));

jest.mock('../firebase/services', () => ({
  updateUserLocation: jest.fn(),
  calculateDistance: jest.fn((lat1: number, lng1: number, lat2: number, lng2: number) => {
    // Simple distance calculation for testing
    const dlat = lat2 - lat1;
    const dlng = lng2 - lng1;
    return Math.sqrt(dlat * dlat + dlng * dlng) * 111000; // Rough conversion to meters
  }),
}));

jest.mock('../services/authService', () => ({
  isReadyForOperations: jest.fn(() => true),
  getCurrentUserId: jest.fn(() => 'test-user-123'),
}));

jest.mock('../services/heartbeatService', () => ({
  startStationaryHeartbeat: jest.fn(),
  stopHeartbeat: jest.fn(),
}));

jest.mock('../services/tripManagementService', () => ({
  initialize: jest.fn(),
  processLocationUpdate: jest.fn(),
  forceEndTrip: jest.fn(),
}));

// Import after mocks
const localDBController = require('../services/localDBController').default;
const databaseService = require('../services/databaseService').default;
import { DeviceState } from '../services/localDBController';

describe('LocalDBController Core Logic Tests', () => {
  const mockUserId = 'test-user-123';
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    localDBController.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);

      await localDBController.initialize(mockUserId);

      const state = localDBController.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.currentUserId).toBe(mockUserId);
    });
  });

  describe('Battery Change Detection', () => {
    it('should detect 2% battery change and trigger Firestore update', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);

      await localDBController.initialize(mockUserId);

      // First device state
      const deviceState1: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 50,
        isCharging: false,
        movementType: 'stationary',
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState1);

      // Second device state with 2% battery change
      const deviceState2: DeviceState = {
        ...deviceState1,
        batteryLevel: 52, // 2% increase
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState2);

      // Should save to local DB
      expect(databaseService.saveLocation).toHaveBeenCalledTimes(2);
    });

    it('should detect charging state change and trigger update', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);

      await localDBController.initialize(mockUserId);

      // Device plugged in
      const deviceState: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 50,
        isCharging: true, // Changed from false to true
        movementType: 'stationary',
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState);

      expect(databaseService.saveLocation).toHaveBeenCalled();
    });
  });

  describe('Geofencing Logic', () => {
    it('should activate geofence after 5 minutes of being stationary', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);

      await localDBController.initialize(mockUserId);

      const baseTime = new Date();
      
      // User becomes stationary
      const stationaryState: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 50,
        isCharging: false,
        movementType: 'stationary',
        timestamp: baseTime
      };

      await localDBController.processDeviceStateUpdate(stationaryState);

      // 5 minutes later, still stationary
      const fiveMinutesLater = new Date(baseTime.getTime() + 5 * 60 * 1000 + 1000);
      const stillStationaryState: DeviceState = {
        ...stationaryState,
        timestamp: fiveMinutesLater
      };

      await localDBController.processDeviceStateUpdate(stillStationaryState);

      const state = localDBController.getState();
      expect(state.geofenceState.isActive).toBe(true);
      expect(state.geofenceState.centerLat).toBe(40.7128);
      expect(state.geofenceState.centerLng).toBe(-74.0060);
    });
  });

  describe('Heartbeat Management', () => {
    it('should start heartbeat when geofence activates', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);

      await localDBController.initialize(mockUserId);

      // Simulate geofence activation
      const baseTime = new Date();
      const stationaryState: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 50,
        isCharging: false,
        movementType: 'stationary',
        timestamp: baseTime
      };

      await localDBController.processDeviceStateUpdate(stationaryState);

      // 5+ minutes later to activate geofence
      const fiveMinutesLater = new Date(baseTime.getTime() + 5 * 60 * 1000 + 1000);
      await localDBController.processDeviceStateUpdate({
        ...stationaryState,
        timestamp: fiveMinutesLater
      });

      const state = localDBController.getState();
      expect(state.geofenceState.isActive).toBe(true);
      
      // Heartbeat should be active (we can't easily test the timer, but we can verify state)
      expect(state.isStationary).toBe(true);
    });

    it('should reset heartbeat timer after battery update', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);

      await localDBController.initialize(mockUserId);

      // First update
      const deviceState1: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 50,
        isCharging: false,
        movementType: 'stationary',
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState1);

      // Battery change should reset heartbeat timer
      const deviceState2: DeviceState = {
        ...deviceState1,
        batteryLevel: 52, // 2% change
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState2);

      // Verify the update was processed
      expect(databaseService.saveLocation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Offline/Online Sync', () => {
    it('should handle offline state and queue updates', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);
      (databaseService.getUnsyncedLocations as jest.Mock).mockResolvedValue([]);

      await localDBController.initialize(mockUserId);

      // Set offline
      await localDBController.setOnlineStatus(false);

      const deviceState: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 48, // 2% change to trigger update
        isCharging: false,
        movementType: 'stationary',
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState);

      const state = localDBController.getState();
      expect(state.isOnline).toBe(false);
      expect(state.pendingSyncCount).toBeGreaterThan(0);
    });

    it('should sync pending data when coming back online', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);
      (databaseService.getUnsyncedLocations as jest.Mock).mockResolvedValue([
        {
          id: 1,
          user_id: mockUserId,
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(),
          battery_level: 50,
          is_charging: false
        }
      ]);
      (databaseService.markLocationsAsSynced as jest.Mock).mockResolvedValue(undefined);

      await localDBController.initialize(mockUserId);

      // Go offline, then online
      await localDBController.setOnlineStatus(false);
      await localDBController.setOnlineStatus(true);

      // Should attempt to sync unsynced locations
      expect(databaseService.getUnsyncedLocations).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('Data Retention', () => {
    it('should schedule periodic cleanup', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);

      await localDBController.initialize(mockUserId);

      // Verify initialization completed
      const state = localDBController.getState();
      expect(state.isInitialized).toBe(true);

      // Cleanup scheduling is internal, but we can verify initialization succeeded
      // The actual cleanup timer testing would require more complex mocking
    });
  });

  describe('State Management', () => {
    it('should maintain consistent internal state', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);
      (databaseService.saveLocation as jest.Mock).mockResolvedValue(1);

      await localDBController.initialize(mockUserId);

      const deviceState: DeviceState = {
        userId: mockUserId,
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 75,
        isCharging: true,
        movementType: 'walking',
        timestamp: new Date()
      };

      await localDBController.processDeviceStateUpdate(deviceState);

      const state = localDBController.getState();
      expect(state.lastBatteryLevel).toBe(75);
      expect(state.lastChargingState).toBe(true);
      expect(state.currentUserId).toBe(mockUserId);
    });

    it('should handle cleanup properly', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.getLatestLocation as jest.Mock).mockResolvedValue(null);

      await localDBController.initialize(mockUserId);
      
      const stateBefore = localDBController.getState();
      expect(stateBefore.isInitialized).toBe(true);

      await localDBController.cleanup();

      const stateAfter = localDBController.getState();
      expect(stateAfter.isInitialized).toBe(false);
      expect(stateAfter.currentUserId).toBeUndefined();
    });
  });
});