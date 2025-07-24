import { DeviceMotion } from 'expo-sensors';
import { PedometerService, pedometerService } from '../pedometerService';
import { eventBus, EVENT_NAMES } from '../eventBusService';

// Mock dependencies
jest.mock('expo-sensors');
jest.mock('../eventBusService', () => ({
  eventBus: {
    emit: jest.fn(),
  },
  EVENT_NAMES: {
    PEDOMETER_INITIALIZED: 'pedometer:initialized',
    PEDOMETER_TRACKING_STARTED: 'pedometer:tracking-started',
    PEDOMETER_TRACKING_STOPPED: 'pedometer:tracking-stopped',
    STEP_COUNT_UPDATED: 'pedometer:step-count-updated',
    STEP_COUNT_RESET: 'pedometer:step-count-reset',
    PEDOMETER_CONFIG_UPDATED: 'pedometer:config-updated',
  },
}));

const mockDeviceMotion = DeviceMotion as jest.Mocked<typeof DeviceMotion>;
const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;

describe('PedometerService', () => {
  let service: PedometerService;
  let mockSubscription: { remove: jest.Mock };

  beforeEach(() => {
    service = new (PedometerService as any)(); // Access private constructor for testing
    mockSubscription = { remove: jest.fn() };
    jest.clearAllMocks();
    
    // Setup default mocks
    mockDeviceMotion.isAvailableAsync.mockResolvedValue(true);
    mockDeviceMotion.setUpdateInterval.mockImplementation(() => {});
    mockDeviceMotion.addListener.mockReturnValue(mockSubscription);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PedometerService.getInstance();
      const instance2 = PedometerService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should export a singleton instance', () => {
      expect(pedometerService).toBeInstanceOf(PedometerService);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully when device motion is available', async () => {
      const result = await service.initialize();
      
      expect(result).toBe(true);
      expect(mockDeviceMotion.isAvailableAsync).toHaveBeenCalled();
      expect(mockDeviceMotion.setUpdateInterval).toHaveBeenCalledWith(1000);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PEDOMETER_INITIALIZED,
        expect.objectContaining({
          isAvailable: true,
          config: expect.any(Object),
        })
      );
    });

    it('should initialize gracefully when device motion is not available', async () => {
      mockDeviceMotion.isAvailableAsync.mockResolvedValue(false);
      
      const result = await service.initialize();
      
      expect(result).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PEDOMETER_INITIALIZED,
        expect.objectContaining({
          isAvailable: false,
        })
      );
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      await service.initialize();
      
      expect(mockDeviceMotion.isAvailableAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      mockDeviceMotion.isAvailableAsync.mockRejectedValue(new Error('Device motion error'));
      
      const result = await service.initialize();
      
      expect(result).toBe(false);
    });

    it('should accept custom configuration', async () => {
      const customConfig = {
        updateInterval: 500,
        enableRealTimeUpdates: false,
        sensitivityThreshold: 1.5,
      };
      
      await service.initialize(customConfig);
      
      expect(mockDeviceMotion.setUpdateInterval).toHaveBeenCalledWith(500);
      
      const config = service.getConfig();
      expect(config.updateInterval).toBe(500);
      expect(config.enableRealTimeUpdates).toBe(false);
      expect(config.sensitivityThreshold).toBe(1.5);
    });
  });

  describe('Step Tracking', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should start tracking successfully', async () => {
      const result = await service.startTracking();
      
      expect(result).toBe(true);
      expect(mockDeviceMotion.addListener).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PEDOMETER_TRACKING_STARTED,
        expect.objectContaining({
          timestamp: expect.any(Date),
          config: expect.any(Object),
        })
      );
    });

    it('should not start tracking if not initialized', async () => {
      const uninitializedService = new (PedometerService as any)();
      
      const result = await uninitializedService.startTracking();
      
      expect(result).toBe(false);
      expect(mockDeviceMotion.addListener).not.toHaveBeenCalled();
    });

    it('should not start tracking if device motion is unavailable', async () => {
      mockDeviceMotion.isAvailableAsync.mockResolvedValue(false);
      
      const result = await service.startTracking();
      
      expect(result).toBe(false);
    });

    it('should return true if already tracking', async () => {
      await service.startTracking();
      
      const result = await service.startTracking();
      
      expect(result).toBe(true);
      expect(mockDeviceMotion.addListener).toHaveBeenCalledTimes(1);
    });

    it('should stop tracking successfully', async () => {
      await service.startTracking();
      
      service.stopTracking();
      
      expect(mockSubscription.remove).toHaveBeenCalled();
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PEDOMETER_TRACKING_STOPPED,
        expect.objectContaining({
          timestamp: expect.any(Date),
          finalStepCount: expect.any(Number),
        })
      );
    });

    it('should handle stop tracking when not tracking', () => {
      service.stopTracking();
      
      expect(mockSubscription.remove).not.toHaveBeenCalled();
    });

    it('should handle tracking start errors', async () => {
      mockDeviceMotion.addListener.mockImplementation(() => {
        throw new Error('Listener error');
      });
      
      const result = await service.startTracking();
      
      expect(result).toBe(false);
    });
  });

  describe('Step Detection', () => {
    beforeEach(async () => {
      await service.initialize();
      await service.startTracking();
    });

    it('should detect steps from motion data', () => {
      const motionListener = mockDeviceMotion.addListener.mock.calls[0][0];
      
      // Simulate motion data that should trigger step detection
      const motionData = {
        acceleration: { x: 0, y: 0, z: 2.0 }, // Above threshold
      };
      
      // Call the motion listener multiple times to build history
      motionListener(motionData);
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener(motionData); // This should trigger step detection
      
      const stepData = service.getCurrentStepData();
      expect(stepData.stepCount).toBeGreaterThan(0);
    });

    it('should emit step count updates when real-time updates are enabled', () => {
      const motionListener = mockDeviceMotion.addListener.mock.calls[0][0];
      
      // Simulate step-triggering motion
      const motionData = {
        acceleration: { x: 0, y: 0, z: 2.0 },
      };
      
      motionListener(motionData);
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener(motionData);
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.STEP_COUNT_UPDATED,
        expect.objectContaining({
          stepCount: expect.any(Number),
          timestamp: expect.any(Date),
          isAvailable: true,
        })
      );
    });

    it('should not emit step updates when real-time updates are disabled', async () => {
      await service.initialize({
        enableRealTimeUpdates: false,
      });
      await service.startTracking();
      
      const motionListener = mockDeviceMotion.addListener.mock.calls[0][0];
      
      mockEventBus.emit.mockClear();
      
      const motionData = {
        acceleration: { x: 0, y: 0, z: 2.0 },
      };
      
      motionListener(motionData);
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener(motionData);
      
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(
        EVENT_NAMES.STEP_COUNT_UPDATED,
        expect.any(Object)
      );
    });

    it('should handle invalid motion data gracefully', () => {
      const motionListener = mockDeviceMotion.addListener.mock.calls[0][0];
      
      // Test with null data
      motionListener(null);
      
      // Test with missing acceleration
      motionListener({});
      
      // Test with invalid acceleration
      motionListener({ acceleration: null });
      
      const stepData = service.getCurrentStepData();
      expect(stepData.stepCount).toBe(0);
    });

    it('should prevent double counting with minimum step interval', () => {
      const motionListener = mockDeviceMotion.addListener.mock.calls[0][0];
      
      const motionData = {
        acceleration: { x: 0, y: 0, z: 2.0 },
      };
      
      // Simulate rapid motion that should only count as one step
      motionListener(motionData);
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener({ acceleration: { x: 0, y: 0, z: 0.5 } });
      motionListener(motionData); // Should count as step
      motionListener(motionData); // Should not count (too soon)
      
      const stepData = service.getCurrentStepData();
      expect(stepData.stepCount).toBe(1);
    });
  });

  describe('Step Count Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return current step data', () => {
      const stepData = service.getCurrentStepData();
      
      expect(stepData).toEqual({
        stepCount: 0,
        timestamp: expect.any(Date),
        isAvailable: false, // Not tracking yet
      });
    });

    it('should reset step count', () => {
      // First, simulate some steps
      service['stepCount'] = 10; // Access private property for testing
      
      service.resetStepCount();
      
      const stepData = service.getCurrentStepData();
      expect(stepData.stepCount).toBe(0);
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.STEP_COUNT_RESET,
        expect.objectContaining({
          previousCount: 10,
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should update configuration', () => {
      const newConfig = {
        updateInterval: 2000,
        sensitivityThreshold: 1.8,
      };
      
      service.updateConfig(newConfig);
      
      const config = service.getConfig();
      expect(config.updateInterval).toBe(2000);
      expect(config.sensitivityThreshold).toBe(1.8);
      expect(config.enableRealTimeUpdates).toBe(true); // Should keep existing value
      
      expect(mockDeviceMotion.setUpdateInterval).toHaveBeenCalledWith(2000);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PEDOMETER_CONFIG_UPDATED,
        expect.objectContaining({
          oldConfig: expect.any(Object),
          newConfig: expect.any(Object),
        })
      );
    });

    it('should return current configuration', () => {
      const config = service.getConfig();
      
      expect(config).toEqual({
        updateInterval: 1000,
        enableRealTimeUpdates: true,
        sensitivityThreshold: 1.2,
      });
    });
  });

  describe('Status and State', () => {
    it('should return correct status when not initialized', () => {
      const status = service.getStatus();
      
      expect(status).toEqual({
        isInitialized: false,
        isTracking: false,
        isAvailable: false,
        stepCount: 0,
        lastStepTime: null,
      });
    });

    it('should return correct status when initialized and tracking', async () => {
      await service.initialize();
      await service.startTracking();
      
      const status = service.getStatus();
      
      expect(status.isInitialized).toBe(true);
      expect(status.isTracking).toBe(true);
      expect(status.isAvailable).toBe(true);
    });
  });

  describe('App State Handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should resume tracking when app becomes active', () => {
      const startTrackingSpy = jest.spyOn(service, 'startTracking');
      
      service.onAppStateChange('active');
      
      expect(startTrackingSpy).toHaveBeenCalled();
    });

    it('should handle background state', () => {
      service.onAppStateChange('background');
      
      // Should not affect tracking state
      const status = service.getStatus();
      expect(status.isTracking).toBe(false); // Not started yet
    });

    it('should handle inactive state', () => {
      service.onAppStateChange('inactive');
      
      // Should not affect tracking state
      const status = service.getStatus();
      expect(status.isTracking).toBe(false); // Not started yet
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      await service.initialize();
      await service.startTracking();
    });

    it('should cleanup resources properly', () => {
      service.cleanup();
      
      expect(mockSubscription.remove).toHaveBeenCalled();
      
      const status = service.getStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.isTracking).toBe(false);
      expect(status.stepCount).toBe(0);
      expect(status.lastStepTime).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle motion listener errors gracefully', async () => {
      await service.initialize();
      await service.startTracking();
      
      const motionListener = mockDeviceMotion.addListener.mock.calls[0][0];
      
      // Should not throw when processing invalid data
      expect(() => {
        motionListener({ acceleration: { x: NaN, y: NaN, z: NaN } });
      }).not.toThrow();
    });

    it('should handle stop tracking errors gracefully', async () => {
      await service.initialize();
      await service.startTracking();
      
      mockSubscription.remove.mockImplementation(() => {
        throw new Error('Remove error');
      });
      
      expect(() => {
        service.stopTracking();
      }).not.toThrow();
    });
  });
});