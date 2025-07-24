import { DeviceMotion } from 'expo-sensors';
import { Platform } from 'react-native';
import { eventBus } from './eventBusService';
import { EVENT_NAMES } from '../types/events';

export interface StepData {
  stepCount: number;
  timestamp: Date;
  isAvailable: boolean;
}

export interface PedometerConfig {
  updateInterval: number; // milliseconds
  enableRealTimeUpdates: boolean;
  sensitivityThreshold: number; // acceleration threshold for step detection
}

export class PedometerService {
  private static instance: PedometerService;
  private isInitialized = false;
  private isTracking = false;
  private stepCount = 0;
  private lastStepTime: Date | null = null;
  private motionSubscription: any = null;
  private config: PedometerConfig;
  private lastAcceleration = { x: 0, y: 0, z: 0 };
  private accelerationHistory: number[] = [];
  private readonly HISTORY_SIZE = 10;

  private constructor() {
    this.config = {
      updateInterval: 1000, // 1 second
      enableRealTimeUpdates: true,
      sensitivityThreshold: 1.2, // Acceleration threshold for step detection
    };
  }

  static getInstance(): PedometerService {
    if (!PedometerService.instance) {
      PedometerService.instance = new PedometerService();
    }
    return PedometerService.instance;
  }

  /**
   * Initialize the pedometer service
   */
  async initialize(config?: Partial<PedometerConfig>): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Update config if provided
      if (config) {
        this.config = { ...this.config, ...config };
      }

      // Check if device motion is available
      const isAvailable = await this.isDeviceMotionAvailable();

      if (!isAvailable) {
        console.warn('PedometerService: Device motion not available');
        this.isInitialized = true; // Still mark as initialized for graceful degradation
        return false;
      }

      // Set update interval
      DeviceMotion.setUpdateInterval(this.config.updateInterval);

      this.isInitialized = true;
      console.log('PedometerService: Initialized successfully');

      // Emit initialization event
      eventBus.emit(EVENT_NAMES.PEDOMETER_INITIALIZED, {
        isAvailable,
        config: this.config,
      });

      return true;
    } catch (error) {
      console.error('PedometerService: Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Start step tracking
   */
  async startTracking(): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('PedometerService: Not initialized, cannot start tracking');
      return false;
    }

    if (this.isTracking) {
      console.log('PedometerService: Already tracking');
      return true;
    }

    try {
      const isAvailable = await this.isDeviceMotionAvailable();

      if (!isAvailable) {
        console.warn('PedometerService: Device motion not available for tracking');
        return false;
      }

      // Subscribe to device motion updates
      this.motionSubscription = DeviceMotion.addListener((motionData) => {
        this.processMotionData(motionData);
      });

      this.isTracking = true;
      console.log('PedometerService: Started tracking');

      // Emit tracking started event
      eventBus.emit(EVENT_NAMES.PEDOMETER_TRACKING_STARTED, {
        timestamp: new Date(),
        config: this.config,
      });

      return true;
    } catch (error) {
      console.error('PedometerService: Failed to start tracking:', error);
      return false;
    }
  }

  /**
   * Stop step tracking
   */
  stopTracking(): void {
    if (!this.isTracking) {
      console.log('PedometerService: Not currently tracking');
      return;
    }

    try {
      if (this.motionSubscription) {
        this.motionSubscription.remove();
        this.motionSubscription = null;
      }

      this.isTracking = false;
      console.log('PedometerService: Stopped tracking');

      // Emit tracking stopped event
      eventBus.emit(EVENT_NAMES.PEDOMETER_TRACKING_STOPPED, {
        timestamp: new Date(),
        finalStepCount: this.stepCount,
      });
    } catch (error) {
      console.error('PedometerService: Failed to stop tracking:', error);
    }
  }

  /**
   * Process motion data for step detection
   */
  private processMotionData(motionData: any): void {
    if (!motionData || !motionData.acceleration) return;

    const { x, y, z } = motionData.acceleration;

    // Calculate total acceleration magnitude
    const totalAcceleration = Math.sqrt(x * x + y * y + z * z);

    // Add to history
    this.accelerationHistory.push(totalAcceleration);
    if (this.accelerationHistory.length > this.HISTORY_SIZE) {
      this.accelerationHistory.shift();
    }

    // Detect step using peak detection algorithm
    if (this.detectStep(totalAcceleration)) {
      this.recordStep();
    }

    // Update last acceleration
    this.lastAcceleration = { x, y, z };
  }

  /**
   * Detect step using simple peak detection
   */
  private detectStep(currentAcceleration: number): boolean {
    if (this.accelerationHistory.length < 3) return false;

    const threshold = this.config.sensitivityThreshold;
    const recentHistory = this.accelerationHistory.slice(-3);

    // Check if current acceleration is a peak above threshold
    const isPeak = currentAcceleration > threshold &&
      currentAcceleration > recentHistory[0] &&
      currentAcceleration > recentHistory[1];

    // Prevent double counting by checking time since last step
    const now = new Date();
    const timeSinceLastStep = this.lastStepTime ? now.getTime() - this.lastStepTime.getTime() : 1000;
    const minStepInterval = 300; // Minimum 300ms between steps

    return isPeak && timeSinceLastStep > minStepInterval;
  }

  /**
   * Record a detected step
   */
  private recordStep(): void {
    this.stepCount++;
    this.lastStepTime = new Date();

    const stepData: StepData = {
      stepCount: this.stepCount,
      timestamp: this.lastStepTime,
      isAvailable: true,
    };

    console.log(`PedometerService: Step detected, total: ${this.stepCount}`);

    // Emit step update event if real-time updates are enabled
    if (this.config.enableRealTimeUpdates) {
      eventBus.emit(EVENT_NAMES.STEP_COUNT_UPDATED, stepData);
    }
  }

  /**
   * Get current step data
   */
  getCurrentStepData(): StepData {
    return {
      stepCount: this.stepCount,
      timestamp: this.lastStepTime || new Date(),
      isAvailable: this.isInitialized && this.isTracking,
    };
  }

  /**
   * Reset step count
   */
  resetStepCount(): void {
    const previousCount = this.stepCount;
    this.stepCount = 0;
    this.lastStepTime = null;

    console.log(`PedometerService: Step count reset from ${previousCount} to 0`);

    // Emit reset event
    eventBus.emit(EVENT_NAMES.STEP_COUNT_RESET, {
      previousCount,
      timestamp: new Date(),
    });
  }

  /**
   * Check if device motion is available
   */
  private async isDeviceMotionAvailable(): Promise<boolean> {
    try {
      const isAvailable = await DeviceMotion.isAvailableAsync();
      return isAvailable;
    } catch (error) {
      console.error('PedometerService: Failed to check device motion availability:', error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PedometerConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Update device motion interval if changed
    if (newConfig.updateInterval && newConfig.updateInterval !== oldConfig.updateInterval) {
      DeviceMotion.setUpdateInterval(this.config.updateInterval);
    }

    console.log('PedometerService: Configuration updated', this.config);

    // Emit config update event
    eventBus.emit(EVENT_NAMES.PEDOMETER_CONFIG_UPDATED, {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): PedometerConfig {
    return { ...this.config };
  }

  /**
   * Get tracking status
   */
  getStatus(): {
    isInitialized: boolean;
    isTracking: boolean;
    isAvailable: boolean;
    stepCount: number;
    lastStepTime: Date | null;
  } {
    return {
      isInitialized: this.isInitialized,
      isTracking: this.isTracking,
      isAvailable: this.isInitialized,
      stepCount: this.stepCount,
      lastStepTime: this.lastStepTime,
    };
  }

  /**
   * Handle app state changes
   */
  onAppStateChange(nextAppState: string): void {
    if (nextAppState === 'active') {
      // App became active - resume tracking if it was previously active
      if (this.isInitialized && !this.isTracking) {
        console.log('PedometerService: App became active, resuming tracking');
        this.startTracking();
      }
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App went to background - keep tracking for background functionality
      console.log('PedometerService: App went to background, continuing tracking');
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopTracking();
    this.isInitialized = false;
    this.stepCount = 0;
    this.lastStepTime = null;
    this.accelerationHistory = [];

    console.log('PedometerService: Cleaned up');
  }
}

// Export singleton instance
export const pedometerService = PedometerService.getInstance();