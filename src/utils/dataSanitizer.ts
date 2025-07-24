import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';
import { NullSafety } from './nullSafety';

/**
 * Data sanitization utilities for safe array and object handling
 */
export class DataSanitizer {
  /**
   * Get a safe array from potentially null/undefined input
   * @param input - The input that might be an array, null, or undefined
   * @param context - Optional context for error logging
   * @returns Safe array (empty array if input is invalid)
   */
  static getSafeArray<T>(input: T[] | null | undefined, context?: string): T[] {
    try {
      if (Array.isArray(input)) {
        return input;
      }

      if (input === null || input === undefined) {
        console.warn(`DataSanitizer.getSafeArray: Input is ${input}${context ? ` in ${context}` : ''}`);
        return [];
      }

      // Try to convert single item to array
      if (typeof input === 'object' && input !== null) {
        console.warn(`DataSanitizer.getSafeArray: Converting non-array object to array${context ? ` in ${context}` : ''}`);
        return [input as unknown as T];
      }

      console.warn(`DataSanitizer.getSafeArray: Invalid input type${context ? ` in ${context}` : ''}`);
      return [];
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        `DataSanitizer.getSafeArray${context ? ` in ${context}` : ''}`
      );
      return [];
    }
  }

  /**
   * Sanitize Firebase document data by removing undefined values and ensuring safe structure
   * @param document - The Firebase document data
   * @param context - Optional context for error logging
   * @returns Sanitized document data
   */
  static sanitizeFirebaseDocument<T extends Record<string, any>>(
    document: T | null | undefined,
    context?: string
  ): Partial<T> {
    try {
      if (!document || typeof document !== 'object') {
        console.warn(`DataSanitizer.sanitizeFirebaseDocument: Invalid document${context ? ` in ${context}` : ''}`);
        return {};
      }

      const sanitized: Partial<T> = {};

      for (const [key, value] of Object.entries(document)) {
        // Skip undefined values (Firebase doesn't like them)
        if (value === undefined) {
          continue;
        }

        // Handle null values (Firebase accepts these)
        if (value === null) {
          sanitized[key as keyof T] = value;
          continue;
        }

        // Handle arrays
        if (Array.isArray(value)) {
          sanitized[key as keyof T] = this.getSafeArray(value, `${context}.${key}`) as T[keyof T];
          continue;
        }

        // Handle nested objects
        if (typeof value === 'object' && value.constructor === Object) {
          sanitized[key as keyof T] = this.sanitizeFirebaseDocument(value, `${context}.${key}`) as T[keyof T];
          continue;
        }

        // Handle primitive values
        sanitized[key as keyof T] = value;
      }

      return sanitized;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `DataSanitizer.sanitizeFirebaseDocument${context ? ` in ${context}` : ''}`
      );
      return {};
    }
  }

  /**
   * Safe forEach implementation with additional error handling and validation
   * @param array - The array to iterate over
   * @param callback - The callback function
   * @param context - Optional context for error logging
   */
  static safeForEach<T>(
    array: T[] | null | undefined,
    callback: (item: T, index: number, array: T[]) => void,
    context?: string
  ): void {
    const safeArray = this.getSafeArray(array, context);
    NullSafety.safeForEach(safeArray, callback, context);
  }

  /**
   * Sanitize user input data to prevent injection and ensure data integrity
   * @param input - The input data to sanitize
   * @param allowedFields - Optional array of allowed field names
   * @param context - Optional context for error logging
   * @returns Sanitized input data
   */
  static sanitizeUserInput<T extends Record<string, any>>(
    input: T | null | undefined,
    allowedFields?: string[],
    context?: string
  ): Partial<T> {
    try {
      if (!input || typeof input !== 'object') {
        return {};
      }

      const sanitized: Partial<T> = {};

      for (const [key, value] of Object.entries(input)) {
        // Check if field is allowed (if allowedFields is specified)
        if (allowedFields && !allowedFields.includes(key)) {
          console.warn(`DataSanitizer.sanitizeUserInput: Field '${key}' not allowed${context ? ` in ${context}` : ''}`);
          continue;
        }

        // Skip functions and symbols
        if (typeof value === 'function' || typeof value === 'symbol') {
          console.warn(`DataSanitizer.sanitizeUserInput: Skipping ${typeof value} field '${key}'${context ? ` in ${context}` : ''}`);
          continue;
        }

        // Handle strings - basic XSS prevention
        if (typeof value === 'string') {
          sanitized[key as keyof T] = this.sanitizeString(value) as T[keyof T];
          continue;
        }

        // Handle arrays
        if (Array.isArray(value)) {
          sanitized[key as keyof T] = this.getSafeArray(value, `${context}.${key}`) as T[keyof T];
          continue;
        }

        // Handle nested objects
        if (typeof value === 'object' && value !== null) {
          sanitized[key as keyof T] = this.sanitizeUserInput(value, undefined, `${context}.${key}`) as T[keyof T];
          continue;
        }

        // Handle primitive values
        sanitized[key as keyof T] = value;
      }

      return sanitized;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `DataSanitizer.sanitizeUserInput${context ? ` in ${context}` : ''}`
      );
      return {};
    }
  }

  /**
   * Basic string sanitization to prevent XSS
   * @param input - The string to sanitize
   * @returns Sanitized string
   */
  private static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    // Basic HTML entity encoding for common XSS vectors
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Validate and sanitize location data
   * @param locationData - The location data to sanitize
   * @param context - Optional context for error logging
   * @returns Sanitized location data or null if invalid
   */
  static sanitizeLocationData(locationData: any, context?: string): any | null {
    try {
      if (!locationData || typeof locationData !== 'object') {
        return null;
      }

      const sanitized: any = {};

      // Required fields validation
      if (typeof locationData.latitude === 'number' &&
        typeof locationData.longitude === 'number' &&
        !isNaN(locationData.latitude) &&
        !isNaN(locationData.longitude)) {
        sanitized.latitude = locationData.latitude;
        sanitized.longitude = locationData.longitude;
      } else {
        console.warn(`DataSanitizer.sanitizeLocationData: Invalid coordinates${context ? ` in ${context}` : ''}`);
        return null;
      }

      // Optional fields
      if (typeof locationData.address === 'string') {
        sanitized.address = this.sanitizeString(locationData.address);
      }

      if (typeof locationData.accuracy === 'number' && !isNaN(locationData.accuracy)) {
        sanitized.accuracy = locationData.accuracy;
      }

      if (typeof locationData.speed === 'number' && !isNaN(locationData.speed)) {
        sanitized.speed = Math.max(0, locationData.speed); // Ensure non-negative
      }

      if (typeof locationData.batteryLevel === 'number' && !isNaN(locationData.batteryLevel)) {
        sanitized.batteryLevel = Math.max(0, Math.min(100, locationData.batteryLevel)); // Clamp to 0-100
      }

      if (typeof locationData.isCharging === 'boolean') {
        sanitized.isCharging = locationData.isCharging;
      }

      // Handle timestamps
      if (locationData.timestamp) {
        if (locationData.timestamp instanceof Date) {
          sanitized.timestamp = locationData.timestamp;
        } else if (typeof locationData.timestamp === 'string' || typeof locationData.timestamp === 'number') {
          const date = new Date(locationData.timestamp);
          if (!isNaN(date.getTime())) {
            sanitized.timestamp = date;
          }
        }
      }

      // Handle circle members array
      if (locationData.circleMembers) {
        sanitized.circleMembers = this.getSafeArray(locationData.circleMembers, `${context}.circleMembers`);
      }

      return sanitized;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `DataSanitizer.sanitizeLocationData${context ? ` in ${context}` : ''}`
      );
      return null;
    }
  }

  /**
   * Create a safe object with default values for missing properties
   * @param input - The input object
   * @param defaults - Default values for properties
   * @param context - Optional context for error logging
   * @returns Object with safe defaults
   */
  static withDefaults<T extends Record<string, any>>(
    input: Partial<T> | null | undefined,
    defaults: T,
    context?: string
  ): T {
    try {
      if (!input || typeof input !== 'object') {
        return { ...defaults };
      }

      const result = { ...defaults };

      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined && key in defaults) {
          result[key as keyof T] = value;
        }
      }

      return result;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        `DataSanitizer.withDefaults${context ? ` in ${context}` : ''}`
      );
      return { ...defaults };
    }
  }
}

// Export convenience functions
export const {
  getSafeArray,
  sanitizeFirebaseDocument,
  safeForEach,
  sanitizeUserInput,
  sanitizeLocationData,
  withDefaults
} = DataSanitizer;