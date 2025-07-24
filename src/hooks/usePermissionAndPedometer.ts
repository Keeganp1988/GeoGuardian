import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { permissionManager, AppPermissions } from '../services/permissionManager';
import { pedometerService, StepData } from '../services/pedometerService';
import { eventBus } from '../services/eventBusService';
import { EVENT_NAMES } from '../types/events';

export interface PermissionAndPedometerState {
  permissions: AppPermissions | null;
  stepData: StepData;
  isPermissionManagerReady: boolean;
  isPedometerReady: boolean;
  isFirstLaunch: boolean;
}

export interface PermissionAndPedometerActions {
  requestInitialPermissions: () => Promise<AppPermissions>;
  checkPermissions: () => Promise<AppPermissions>;
  startStepTracking: () => Promise<boolean>;
  stopStepTracking: () => void;
  resetStepCount: () => void;
  getPermissionGuidance: (permissionType: 'location' | 'motion' | 'notifications') => string;
}

export function usePermissionAndPedometer(): PermissionAndPedometerState & PermissionAndPedometerActions {
  const [state, setState] = useState<PermissionAndPedometerState>({
    permissions: null,
    stepData: {
      stepCount: 0,
      timestamp: new Date(),
      isAvailable: false,
    },
    isPermissionManagerReady: false,
    isPedometerReady: false,
    isFirstLaunch: true,
  });

  /**
   * Initialize services
   */
  const initializeServices = useCallback(async () => {
    try {
      console.log('usePermissionAndPedometer: Initializing services');

      // Initialize PermissionManager
      await permissionManager.initialize();
      
      // Initialize PedometerService
      const pedometerInitialized = await pedometerService.initialize({
        updateInterval: 1000,
        enableRealTimeUpdates: true,
        sensitivityThreshold: 1.2,
      });

      // Get initial permissions
      const permissions = await permissionManager.checkAllPermissions();

      // Get initial step data
      const stepData = pedometerService.getCurrentStepData();

      setState(prevState => ({
        ...prevState,
        permissions,
        stepData,
        isPermissionManagerReady: true,
        isPedometerReady: pedometerInitialized,
        isFirstLaunch: false,
      }));

      console.log('usePermissionAndPedometer: Services initialized successfully');
    } catch (error) {
      console.error('usePermissionAndPedometer: Failed to initialize services:', error);
      setState(prevState => ({
        ...prevState,
        isPermissionManagerReady: false,
        isPedometerReady: false,
        isFirstLaunch: false,
      }));
    }
  }, []);

  /**
   * Request initial permissions for first launch
   */
  const requestInitialPermissions = useCallback(async (): Promise<AppPermissions> => {
    try {
      console.log('usePermissionAndPedometer: Requesting initial permissions');
      const permissions = await permissionManager.requestInitialPermissions();
      
      setState(prevState => ({
        ...prevState,
        permissions,
      }));

      // Start step tracking if motion permission is granted
      if (permissions.motion.granted) {
        await pedometerService.startTracking();
      }

      return permissions;
    } catch (error) {
      console.error('usePermissionAndPedometer: Failed to request initial permissions:', error);
      throw error;
    }
  }, []);

  /**
   * Check current permissions
   */
  const checkPermissions = useCallback(async (): Promise<AppPermissions> => {
    try {
      const permissions = await permissionManager.checkAllPermissions();
      
      setState(prevState => ({
        ...prevState,
        permissions,
      }));

      return permissions;
    } catch (error) {
      console.error('usePermissionAndPedometer: Failed to check permissions:', error);
      throw error;
    }
  }, []);

  /**
   * Start step tracking
   */
  const startStepTracking = useCallback(async (): Promise<boolean> => {
    try {
      const success = await pedometerService.startTracking();
      
      if (success) {
        const stepData = pedometerService.getCurrentStepData();
        setState(prevState => ({
          ...prevState,
          stepData,
        }));
      }

      return success;
    } catch (error) {
      console.error('usePermissionAndPedometer: Failed to start step tracking:', error);
      return false;
    }
  }, []);

  /**
   * Stop step tracking
   */
  const stopStepTracking = useCallback((): void => {
    try {
      pedometerService.stopTracking();
      
      const stepData = pedometerService.getCurrentStepData();
      setState(prevState => ({
        ...prevState,
        stepData,
      }));
    } catch (error) {
      console.error('usePermissionAndPedometer: Failed to stop step tracking:', error);
    }
  }, []);

  /**
   * Reset step count
   */
  const resetStepCount = useCallback((): void => {
    try {
      pedometerService.resetStepCount();
      
      const stepData = pedometerService.getCurrentStepData();
      setState(prevState => ({
        ...prevState,
        stepData,
      }));
    } catch (error) {
      console.error('usePermissionAndPedometer: Failed to reset step count:', error);
    }
  }, []);

  /**
   * Get permission guidance
   */
  const getPermissionGuidance = useCallback((permissionType: 'location' | 'motion' | 'notifications'): string => {
    return permissionManager.getPermissionGuidance(permissionType);
  }, []);

  /**
   * Handle app state changes
   */
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    console.log('usePermissionAndPedometer: App state changed to:', nextAppState);
    
    if (nextAppState === 'active') {
      // App became active - check for permission changes
      permissionManager.onAppBecomeActive();
      
      // Handle pedometer app state change
      pedometerService.onAppStateChange(nextAppState);
    } else {
      // Handle pedometer app state change
      pedometerService.onAppStateChange(nextAppState);
    }
  }, []);

  // Initialize services on mount
  useEffect(() => {
    initializeServices();
  }, [initializeServices]);

  // Set up app state listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [handleAppStateChange]);

  // Set up event listeners
  useEffect(() => {
    // Listen for permission status changes
    const permissionStatusSubscription = eventBus.on(EVENT_NAMES.PERMISSION_STATUS_CHANGED, (permissions: AppPermissions) => {
      console.log('usePermissionAndPedometer: Permission status changed:', permissions);
      setState(prevState => ({
        ...prevState,
        permissions,
      }));
    });

    // Listen for permission changes
    const permissionChangeSubscription = eventBus.on(EVENT_NAMES.PERMISSION_CHANGED, (data: any) => {
      console.log('usePermissionAndPedometer: Permission changed:', data);
      setState(prevState => ({
        ...prevState,
        permissions: data.current,
      }));

      // Handle motion permission changes for pedometer
      if (data.previous.motion.granted !== data.current.motion.granted) {
        if (data.current.motion.granted) {
          console.log('usePermissionAndPedometer: Motion permission granted, starting step tracking');
          pedometerService.startTracking();
        } else {
          console.log('usePermissionAndPedometer: Motion permission revoked, stopping step tracking');
          pedometerService.stopTracking();
        }
      }
    });

    // Listen for step count updates
    const stepCountSubscription = eventBus.on(EVENT_NAMES.STEP_COUNT_UPDATED, (stepData: StepData) => {
      setState(prevState => ({
        ...prevState,
        stepData,
      }));
    });

    // Listen for step count reset
    const stepResetSubscription = eventBus.on(EVENT_NAMES.STEP_COUNT_RESET, () => {
      const stepData = pedometerService.getCurrentStepData();
      setState(prevState => ({
        ...prevState,
        stepData,
      }));
    });

    // Cleanup subscriptions
    return () => {
      permissionStatusSubscription.unsubscribe();
      permissionChangeSubscription.unsubscribe();
      stepCountSubscription.unsubscribe();
      stepResetSubscription.unsubscribe();
    };
  }, []);

  return {
    ...state,
    requestInitialPermissions,
    checkPermissions,
    startStepTracking,
    stopStepTracking,
    resetStepCount,
    getPermissionGuidance,
  };
}

export default usePermissionAndPedometer;