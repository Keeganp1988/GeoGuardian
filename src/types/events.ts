/**
 * Event types for the Event Bus system
 */

// Base event interface
export interface BaseEvent {
  timestamp: Date;
  source?: string;
}

// Connection-related events
export interface ConnectionChangeEvent extends BaseEvent {
  connectionId: string;
  changeType: 'added' | 'removed' | 'updated';
  userId: string;
  otherUserId: string;
}

// Sync-related events
export interface SyncRefreshEvent extends BaseEvent {
  reason: 'connection_change' | 'cache_invalidation' | 'manual' | 'network_recovery';
  affectedUserIds?: string[];
}

// Cache-related events
export interface CacheInvalidationEvent extends BaseEvent {
  cacheKey: string;
  reason: 'data_change' | 'expiration' | 'manual';
}

// Network-related events
export interface NetworkChangeEvent extends BaseEvent {
  isConnected: boolean;
  connectionType?: 'wifi' | 'cellular' | 'none';
}

// App state events
export interface AppStateChangeEvent extends BaseEvent {
  state: 'active' | 'background' | 'inactive';
}

// Loading state events
export interface LoadingStateEvent extends BaseEvent {
  isLoading: boolean;
  operation: 'sync' | 'connection_create' | 'connection_join' | 'connection_update';
  message?: string;
}

// Success events
export interface SuccessEvent extends BaseEvent {
  operation: 'connection_added' | 'connection_updated' | 'sync_completed';
  message?: string;
  contactName?: string;
}

// Error events
export interface ErrorEvent extends BaseEvent {
  operation: 'sync' | 'connection_create' | 'connection_join' | 'connection_update';
  error: string;
  retryable: boolean;
  errorType?: string;
  context?: Record<string, any>;
  userFriendlyMessage?: string;
  recoveryActions?: Array<{ label: string; actionType: string }>;
}

// Performance metric events
export interface PerformanceMetricEvent extends BaseEvent {
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
}

// Permission-related events
export interface PermissionStatusChangedEvent extends BaseEvent {
  location: {
    foreground: { granted: boolean; status: string };
    background: { granted: boolean; status: string };
  };
  motion: { granted: boolean; status: string };
  notifications: { granted: boolean; status: string };
}

export interface PermissionChangedEvent extends BaseEvent {
  previous: PermissionStatusChangedEvent;
  current: PermissionStatusChangedEvent;
}

// Pedometer-related events
export interface PedometerInitializedEvent extends BaseEvent {
  isAvailable: boolean;
  config: {
    updateInterval: number;
    enableRealTimeUpdates: boolean;
    sensitivityThreshold: number;
  };
}

export interface PedometerTrackingEvent extends BaseEvent {
  config?: {
    updateInterval: number;
    enableRealTimeUpdates: boolean;
    sensitivityThreshold: number;
  };
  finalStepCount?: number;
}

export interface StepCountUpdatedEvent extends BaseEvent {
  stepCount: number;
  isAvailable: boolean;
}

export interface StepCountResetEvent extends BaseEvent {
  previousCount: number;
}

export interface PedometerConfigUpdatedEvent extends BaseEvent {
  oldConfig: {
    updateInterval: number;
    enableRealTimeUpdates: boolean;
    sensitivityThreshold: number;
  };
  newConfig: {
    updateInterval: number;
    enableRealTimeUpdates: boolean;
    sensitivityThreshold: number;
  };
}

// Union type for all possible event payloads
export type EventPayload = 
  | ConnectionChangeEvent
  | SyncRefreshEvent
  | CacheInvalidationEvent
  | NetworkChangeEvent
  | AppStateChangeEvent
  | LoadingStateEvent
  | SuccessEvent
  | ErrorEvent
  | PerformanceMetricEvent
  | PermissionStatusChangedEvent
  | PermissionChangedEvent
  | PedometerInitializedEvent
  | PedometerTrackingEvent
  | StepCountUpdatedEvent
  | StepCountResetEvent
  | PedometerConfigUpdatedEvent;

// Event names as constants
export const EVENT_NAMES = {
  CONNECTION_ADDED: 'connection:added',
  CONNECTION_REMOVED: 'connection:removed',
  CONNECTION_UPDATED: 'connection:updated',
  SYNC_REFRESH_REQUIRED: 'sync:refresh-required',
  CACHE_INVALIDATED: 'cache:invalidated',
  NETWORK_CHANGED: 'network:changed',
  APP_STATE_CHANGED: 'app:state-changed',
  LOADING_STATE_CHANGED: 'loading:state-changed',
  SUCCESS_EVENT: 'success:event',
  ERROR_EVENT: 'error:event',
  PERFORMANCE_METRIC: 'performance:metric',
  // Permission-related events
  PERMISSION_STATUS_CHANGED: 'permission:status-changed',
  PERMISSION_CHANGED: 'permission:changed',
  // Pedometer-related events
  PEDOMETER_INITIALIZED: 'pedometer:initialized',
  PEDOMETER_TRACKING_STARTED: 'pedometer:tracking-started',
  PEDOMETER_TRACKING_STOPPED: 'pedometer:tracking-stopped',
  STEP_COUNT_UPDATED: 'pedometer:step-count-updated',
  STEP_COUNT_RESET: 'pedometer:step-count-reset',
  PEDOMETER_CONFIG_UPDATED: 'pedometer:config-updated',
} as const;

export type EventName = typeof EVENT_NAMES[keyof typeof EVENT_NAMES];

// Event listener callback type
export type EventCallback<T = any> = (data: T) => void;

// Event subscription interface
export interface EventSubscription {
  unsubscribe: () => void;
}