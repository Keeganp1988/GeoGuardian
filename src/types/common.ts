// Common TypeScript types to improve type safety

import { Timestamp } from 'firebase/firestore';

// Generic API response type
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Generic error type
export interface AppError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
}

// Location related types
export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
}

export interface LocationUpdate {
  coordinates: Coordinates;
  timestamp: number;
  userId: string;
  batteryLevel?: number;
  isCharging?: boolean;
  movementType?: 'stationary' | 'walking' | 'running' | 'driving';
}

// Firebase Timestamp types
export interface FirebaseTimestamp {
  seconds: number;
  nanoseconds: number;
}

export type TimestampType = Timestamp | FirebaseTimestamp | Date | number;

// Service configuration types
export interface ServiceConfig {
  enabled: boolean;
  debug?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

export interface LocationServiceConfig extends ServiceConfig {
  updateInterval: number;
  distanceFilter: number;
  accuracy: 'high' | 'medium' | 'low';
  backgroundUpdates: boolean;
  circleMembers?: string[];
}

// Cache types
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  enabled?: boolean;
}

// Navigation types
export interface NavigationParams {
  [key: string]: any;
}

export interface ScreenProps<T = NavigationParams> {
  navigation: any; // Will be properly typed per screen
  route: {
    params?: T;
  };
}

// Form validation types
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

export interface FormField {
  value: any;
  error?: string;
  touched: boolean;
  rules?: ValidationRule[];
}

export interface FormState {
  [fieldName: string]: FormField;
}

// Component state types
export interface LoadingState {
  isLoading: boolean;
  error?: string | null;
}

export interface AsyncState<T = any> extends LoadingState {
  data?: T;
  lastUpdated?: number;
}

// Event types
export interface AppEvent {
  type: string;
  payload?: any;
  timestamp: number;
  userId?: string;
}

// Subscription types
export interface Subscription {
  unsubscribe: () => void;
  isActive: boolean;
}

export interface SubscriptionManager {
  add: (subscription: Subscription) => void;
  remove: (subscription: Subscription) => void;
  cleanup: () => void;
  count: () => number;
}

// Database operation types
export interface DatabaseOperation {
  type: 'create' | 'read' | 'update' | 'delete';
  collection: string;
  documentId?: string;
  data?: any;
  timestamp: number;
}

// Batch operation types
export interface BatchOperation {
  type: 'set' | 'update' | 'delete' | 'add';
  ref: any; // DocumentReference or collection path
  data?: Record<string, any>;
  options?: Record<string, any>;
  id?: string;
}

// Query types
export interface QueryOptions {
  limit?: number;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  where?: {
    field: string;
    operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains';
    value: any;
  }[];
}

// User preference types
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  locationSharing: boolean;
  language: string;
  units: 'metric' | 'imperial';
}

// Device info types
export interface DeviceInfo {
  platform: 'ios' | 'android' | 'web';
  version: string;
  model?: string;
  batteryLevel?: number;
  isCharging?: boolean;
  networkType?: 'wifi' | 'cellular' | 'none';
}

// Permission types
export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'restricted';

export interface PermissionState {
  location: PermissionStatus;
  notifications: PermissionStatus;
  camera?: PermissionStatus;
  contacts?: PermissionStatus;
}

// Generic utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Map and marker related types
export interface MarkerCoordinate {
  latitude: number;
  longitude: number;
}

export interface CollisionGroup {
  id: string;
  markers: string[]; // marker IDs
  centerCoordinate: MarkerCoordinate;
  radius: number;
}

// Function types
export type AsyncFunction<T = any, R = any> = (...args: T[]) => Promise<R>;
export type EventHandler<T = any> = (event: T) => void;
export type Callback<T = any> = (data: T) => void;
export type ErrorCallback = (error: Error) => void;