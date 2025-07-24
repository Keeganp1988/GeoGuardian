import { useState, useEffect } from 'react';
import { eventBus } from '../services/eventBusService';
import { EVENT_NAMES } from '../types/events';
import { pedometerService } from '../services/pedometerService';

export type MovementType = 'stationary' | 'walking' | 'running' | 'driving' | 'unknown';

export interface MovementStatus {
  currentMovement: MovementType;
  stepCount: number;
  isStepTrackingActive: boolean;
  lastStepTime: Date | null;
  lastLocationUpdate: Date | null;
}

export function useMovementStatus(): MovementStatus {
  const [movementStatus, setMovementStatus] = useState<MovementStatus>({
    currentMovement: 'unknown',
    stepCount: 0,
    isStepTrackingActive: false,
    lastStepTime: null,
    lastLocationUpdate: null,
  });

  useEffect(() => {
    // Get initial step data
    const updateStepData = () => {
      const stepData = pedometerService.getCurrentStepData();
      const pedometerStatus = pedometerService.getStatus();
      
      setMovementStatus(prevStatus => ({
        ...prevStatus,
        stepCount: stepData.stepCount,
        isStepTrackingActive: stepData.isAvailable && pedometerStatus.isTracking,
        lastStepTime: pedometerStatus.lastStepTime,
      }));
    };

    // Update initial data
    updateStepData();

    // Listen for step count updates
    const stepCountSubscription = eventBus.on(EVENT_NAMES.STEP_COUNT_UPDATED, (stepData: any) => {
      setMovementStatus(prevStatus => ({
        ...prevStatus,
        stepCount: stepData.stepCount,
        lastStepTime: new Date(stepData.timestamp),
      }));
    });

    // Listen for step count resets
    const stepResetSubscription = eventBus.on(EVENT_NAMES.STEP_COUNT_RESET, () => {
      setMovementStatus(prevStatus => ({
        ...prevStatus,
        stepCount: 0,
        lastStepTime: null,
      }));
    });

    // Listen for pedometer tracking changes
    const pedometerStartSubscription = eventBus.on(EVENT_NAMES.PEDOMETER_TRACKING_STARTED, () => {
      setMovementStatus(prevStatus => ({
        ...prevStatus,
        isStepTrackingActive: true,
      }));
    });

    const pedometerStopSubscription = eventBus.on(EVENT_NAMES.PEDOMETER_TRACKING_STOPPED, () => {
      setMovementStatus(prevStatus => ({
        ...prevStatus,
        isStepTrackingActive: false,
      }));
    });

    // Cleanup subscriptions
    return () => {
      stepCountSubscription.unsubscribe();
      stepResetSubscription.unsubscribe();
      pedometerStartSubscription.unsubscribe();
      pedometerStopSubscription.unsubscribe();
    };
  }, []);

  // Update movement status based on recent step activity
  useEffect(() => {
    const updateMovementFromSteps = () => {
      if (!movementStatus.isStepTrackingActive) {
        return;
      }

      const now = new Date();
      const timeSinceLastStep = movementStatus.lastStepTime 
        ? now.getTime() - movementStatus.lastStepTime.getTime() 
        : Infinity;

      let inferredMovement: MovementType = 'stationary';
      
      if (timeSinceLastStep < 5000) { // Steps within last 5 seconds
        inferredMovement = 'walking'; // Default to walking when steps detected
      } else if (timeSinceLastStep < 30000) { // Steps within last 30 seconds
        inferredMovement = 'stationary'; // Recently active but now stationary
      }

      setMovementStatus(prevStatus => ({
        ...prevStatus,
        currentMovement: inferredMovement,
        lastLocationUpdate: now,
      }));
    };

    // Update movement status every 2 seconds
    const interval = setInterval(updateMovementFromSteps, 2000);
    
    // Initial update
    updateMovementFromSteps();

    return () => clearInterval(interval);
  }, [movementStatus.lastStepTime, movementStatus.isStepTrackingActive]);

  return movementStatus;
}

export default useMovementStatus;