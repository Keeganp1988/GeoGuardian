/**
 * Utility types for safe data handling and null safety
 */

/**
 * Make all properties of T optional and nullable
 */
export type Nullable<T> = {
  [P in keyof T]?: T[P] | null;
};

/**
 * Make specific properties of T optional and nullable
 */
export type PartialNullable<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P] | null;
};

/**
 * Make all properties of T required and non-nullable
 */
export type NonNullable<T> = {
  [P in keyof T]-?: NonNullable<T[P]>;
};

/**
 * Safe array type that is never null or undefined
 */
export type SafeArray<T> = T[];

/**
 * Safe string type that is never null or undefined
 */
export type SafeString = string;

/**
 * Safe number type that is never null or undefined and is not NaN
 */
export type SafeNumber = number;

/**
 * Safe boolean type that is never null or undefined
 */
export type SafeBoolean = boolean;

/**
 * Safe date type that is never null or undefined and is a valid date
 */
export type SafeDate = Date;

/**
 * Result type for operations that might fail
 */
export type SafeResult<T, E = Error> = 
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E };

/**
 * Validation result type
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Safe Firebase document type
 */
export type SafeFirebaseDocument<T> = {
  [P in keyof T]: T[P] extends undefined ? never : T[P];
};

/**
 * Safe user input type that excludes dangerous properties
 */
export type SafeUserInput<T> = Omit<T, 'constructor' | 'prototype' | '__proto__'>;

/**
 * Type for safe array operations
 */
export interface SafeArrayOperations<T> {
  forEach: (callback: (item: T, index: number, array: T[]) => void) => void;
  map: <R>(callback: (item: T, index: number, array: T[]) => R) => R[];
  filter: (predicate: (item: T, index: number, array: T[]) => boolean) => T[];
  find: (predicate: (item: T, index: number, array: T[]) => boolean) => T | undefined;
  reduce: <R>(callback: (acc: R, current: T, index: number, array: T[]) => R, initialValue: R) => R;
  length: number;
  isEmpty: () => boolean;
  isValid: () => boolean;
}

/**
 * Type guard function type
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Safe validator function type
 */
export type SafeValidator<T> = (value: unknown) => T;

/**
 * Error handler function type
 */
export type ErrorHandler = (error: Error, context?: string) => void;

/**
 * Safe component props that handle null/undefined gracefully
 */
export interface SafeComponentProps {
  fallback?: React.ReactNode;
  onError?: ErrorHandler;
  context?: string;
}

/**
 * Safe list rendering props
 */
export interface SafeListProps<T> extends SafeComponentProps {
  data: T[] | null | undefined;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  emptyComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
}

/**
 * Safe data fetching state
 */
export interface SafeDataState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
  isValid: boolean;
}

/**
 * Safe async operation result
 */
export type SafeAsync<T> = Promise<SafeResult<T>>;

/**
 * Safe object access type
 */
export type SafeAccess<T, K extends keyof T> = T[K] extends null | undefined 
  ? never 
  : T[K];

/**
 * Deep safe type that makes all nested properties safe
 */
export type DeepSafe<T> = T extends (infer U)[]
  ? SafeArray<DeepSafe<U>>
  : T extends object
  ? { [K in keyof T]: DeepSafe<T[K]> }
  : T extends null | undefined
  ? never
  : T;

/**
 * Safe Firebase user type
 */
export interface SafeFirebaseUser {
  uid: SafeString;
  name: SafeString;
  email: SafeString;
  phone?: SafeString;
  profileImage?: SafeString;
  createdAt: SafeDate;
  lastSeen: SafeDate;
  isOnline: SafeBoolean;
}

/**
 * Safe Firebase circle type
 */
export interface SafeFirebaseCircle {
  id: SafeString;
  name: SafeString;
  description?: SafeString;
  ownerId: SafeString;
  createdAt: SafeDate;
  updatedAt: SafeDate;
  memberCount: SafeNumber;
}

/**
 * Safe location data type
 */
export interface SafeLocationData {
  userId: SafeString;
  latitude: SafeNumber;
  longitude: SafeNumber;
  address?: SafeString;
  timestamp: SafeDate;
  arrivalTimestamp?: SafeDate;
  heartbeatTimestamp?: SafeDate;
  accuracy?: SafeNumber;
  speed?: SafeNumber;
  batteryLevel?: SafeNumber;
  isCharging?: SafeBoolean;
  circleMembers: SafeArray<SafeString>;
}

/**
 * Safe circle member type
 */
export interface SafeCircleMember {
  id: SafeString;
  circleId: SafeString;
  userId: SafeString;
  role: 'owner' | 'admin' | 'member';
  joinedAt: SafeDate;
  invitedBy?: SafeString;
  user?: SafeFirebaseUser;
}

/**
 * Utility type to extract safe properties from a type
 */
export type SafeProperties<T> = {
  [K in keyof T]: T[K] extends null | undefined ? never : K;
}[keyof T];

/**
 * Utility type to make only specific properties safe
 */
export type MakeSafe<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: NonNullable<T[P]>;
};

/**
 * Type for safe configuration objects
 */
export interface SafeConfig {
  enableStrictNullChecks: boolean;
  enableRuntimeValidation: boolean;
  enableErrorBoundaries: boolean;
  logValidationErrors: boolean;
  fallbackValues: Record<string, unknown>;
}

/**
 * Default safe values for common types
 */
export const SAFE_DEFAULTS = {
  string: '',
  number: 0,
  boolean: false,
  array: [] as unknown[],
  object: {} as Record<string, unknown>,
  date: new Date(),
} as const;

/**
 * Type for safe default values
 */
export type SafeDefaults = typeof SAFE_DEFAULTS;