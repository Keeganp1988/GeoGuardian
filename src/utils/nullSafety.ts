// Null safety utility functions to handle forEach operations safely and prevent null reference errors

import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';

/**
 * Null safety utilities for array operations and general null checking
 */
export class NullSafety {
  /**
   * Safely execute forEach on an array, handling null/undefined arrays
   * @param array - The array to iterate over (can be null/undefined)
   * @param callback - The callback function to execute for each item
   * @param context - Optional context for error logging
   */
  static safeForEach<T>(
    array: T[] | null | undefined,
    callback: (item: T, index: number, array: T[]) => void,
    context?: string
  ): void {
    try {
      if (!array || !Array.isArray(array)) {
        console.warn(`NullSafety.safeForEach: Array is null/undefined${context ? ` in ${context}` : ''}`);
        return;
      }

      if (typeof callback !== 'function') {
        console.warn(`NullSafety.safeForEach: Callback is not a function${context ? ` in ${context}` : ''}`);
        return;
      }

      array.forEach((item, index, arr) => {
        try {
          callback(item, index, arr);
        } catch (error) {
          ErrorHandler.logError(
            error,
            ErrorCategory.UNKNOWN,
            ErrorSeverity.LOW,
            `NullSafety.safeForEach callback${context ? ` in ${context}` : ''}`
          );
        }
      });
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        `NullSafety.safeForEach${context ? ` in ${context}` : ''}`
      );
    }
  }

  /**
   * Safely execute map on an array, handling null/undefined arrays
   * @param array - The array to map over (can be null/undefined)
   * @param callback - The callback function to execute for each item
   * @param context - Optional context for error logging
   * @returns Mapped array or empty array if input is null/undefined
   */
  static safeMap<T, R>(
    array: T[] | null | undefined,
    callback: (item: T, index: number, array: T[]) => R,
    context?: string
  ): R[] {
    try {
      if (!array || !Array.isArray(array)) {
        console.warn(`NullSafety.safeMap: Array is null/undefined${context ? ` in ${context}` : ''}`);
        return [];
      }

      if (typeof callback !== 'function') {
        console.warn(`NullSafety.safeMap: Callback is not a function${context ? ` in ${context}` : ''}`);
        return [];
      }

      return array.map((item, index, arr) => {
        try {
          return callback(item, index, arr);
        } catch (error) {
          ErrorHandler.logError(
            error,
            ErrorCategory.UNKNOWN,
            ErrorSeverity.LOW,
            `NullSafety.safeMap callback${context ? ` in ${context}` : ''}`
          );
          // Return a safe default value - this might need to be adjusted based on use case
          return null as unknown as R;
        }
      }).filter(item => item !== null) as R[];
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        `NullSafety.safeMap${context ? ` in ${context}` : ''}`
      );
      return [];
    }
  }

  /**
   * Safely execute filter on an array, handling null/undefined arrays
   * @param array - The array to filter (can be null/undefined)
   * @param predicate - The predicate function to test each item
   * @param context - Optional context for error logging
   * @returns Filtered array or empty array if input is null/undefined
   */
  static safeFilter<T>(
    array: T[] | null | undefined,
    predicate: (item: T, index: number, array: T[]) => boolean,
    context?: string
  ): T[] {
    try {
      if (!array || !Array.isArray(array)) {
        console.warn(`NullSafety.safeFilter: Array is null/undefined${context ? ` in ${context}` : ''}`);
        return [];
      }

      if (typeof predicate !== 'function') {
        console.warn(`NullSafety.safeFilter: Predicate is not a function${context ? ` in ${context}` : ''}`);
        return [];
      }

      return array.filter((item, index, arr) => {
        try {
          return predicate(item, index, arr);
        } catch (error) {
          ErrorHandler.logError(
            error,
            ErrorCategory.UNKNOWN,
            ErrorSeverity.LOW,
            `NullSafety.safeFilter predicate${context ? ` in ${context}` : ''}`
          );
          return false; // Exclude items that cause errors
        }
      });
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        `NullSafety.safeFilter${context ? ` in ${context}` : ''}`
      );
      return [];
    }
  }

  /**
   * Safely execute find on an array, handling null/undefined arrays
   * @param array - The array to search (can be null/undefined)
   * @param predicate - The predicate function to test each item
   * @param context - Optional context for error logging
   * @returns Found item or undefined
   */
  static safeFind<T>(
    array: T[] | null | undefined,
    predicate: (item: T, index: number, array: T[]) => boolean,
    context?: string
  ): T | undefined {
    try {
      if (!array || !Array.isArray(array)) {
        console.warn(`NullSafety.safeFind: Array is null/undefined${context ? ` in ${context}` : ''}`);
        return undefined;
      }

      if (typeof predicate !== 'function') {
        console.warn(`NullSafety.safeFind: Predicate is not a function${context ? ` in ${context}` : ''}`);
        return undefined;
      }

      return array.find((item, index, arr) => {
        try {
          return predicate(item, index, arr);
        } catch (error) {
          ErrorHandler.logError(
            error,
            ErrorCategory.UNKNOWN,
            ErrorSeverity.LOW,
            `NullSafety.safeFind predicate${context ? ` in ${context}` : ''}`
          );
          return false;
        }
      });
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        `NullSafety.safeFind${context ? ` in ${context}` : ''}`
      );
      return undefined;
    }
  }

  /**
   * Safely execute reduce on an array, handling null/undefined arrays
   * @param array - The array to reduce (can be null/undefined)
   * @param callback - The reducer function
   * @param initialValue - The initial value for the accumulator
   * @param context - Optional context for error logging
   * @returns Reduced value or initial value if array is null/undefined
   */
  static safeReduce<T, R>(
    array: T[] | null | undefined,
    callback: (accumulator: R, currentValue: T, currentIndex: number, array: T[]) => R,
    initialValue: R,
    context?: string
  ): R {
    try {
      if (!array || !Array.isArray(array)) {
        console.warn(`NullSafety.safeReduce: Array is null/undefined${context ? ` in ${context}` : ''}`);
        return initialValue;
      }

      if (typeof callback !== 'function') {
        console.warn(`NullSafety.safeReduce: Callback is not a function${context ? ` in ${context}` : ''}`);
        return initialValue;
      }

      return array.reduce((acc, current, index, arr) => {
        try {
          return callback(acc, current, index, arr);
        } catch (error) {
          ErrorHandler.logError(
            error,
            ErrorCategory.UNKNOWN,
            ErrorSeverity.LOW,
            `NullSafety.safeReduce callback${context ? ` in ${context}` : ''}`
          );
          return acc; // Return accumulator unchanged on error
        }
      }, initialValue);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        `NullSafety.safeReduce${context ? ` in ${context}` : ''}`
      );
      return initialValue;
    }
  }

  /**
   * Check if a value is null or undefined
   * @param value - The value to check
   * @returns true if value is null or undefined
   */
  static isNullOrUndefined(value: any): value is null | undefined {
    return value === null || value === undefined;
  }

  /**
   * Check if a value is null, undefined, or empty string
   * @param value - The value to check
   * @returns true if value is null, undefined, or empty string
   */
  static isNullOrEmpty(value: any): value is null | undefined | '' {
    return this.isNullOrUndefined(value) || value === '';
  }

  /**
   * Check if a value is null, undefined, empty string, or whitespace-only string
   * @param value - The value to check
   * @returns true if value is null, undefined, empty, or whitespace-only
   */
  static isNullOrWhitespace(value: any): value is null | undefined | string {
    return this.isNullOrUndefined(value) || (typeof value === 'string' && value.trim() === '');
  }

  /**
   * Get a safe value with fallback
   * @param value - The value to check
   * @param fallback - The fallback value to use if value is null/undefined
   * @returns The value if not null/undefined, otherwise the fallback
   */
  static safeValue<T>(value: T | null | undefined, fallback: T): T {
    return this.isNullOrUndefined(value) ? fallback : value!;
  }

  /**
   * Safely access nested object properties
   * @param obj - The object to access
   * @param path - The property path (e.g., 'user.profile.name')
   * @param fallback - The fallback value if path doesn't exist
   * @returns The value at the path or fallback
   */
  static safeGet<T>(obj: any, path: string, fallback?: T): T | undefined {
    try {
      if (this.isNullOrUndefined(obj) || this.isNullOrEmpty(path)) {
        return fallback;
      }

      const keys = path.split('.');
      let current = obj;

      for (const key of keys) {
        if (this.isNullOrUndefined(current) || !(key in current)) {
          return fallback;
        }
        current = current[key];
      }

      return current;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        `NullSafety.safeGet for path: ${path}`
      );
      return fallback;
    }
  }

  /**
   * Safely execute a function with error handling
   * @param fn - The function to execute
   * @param context - Optional context for error logging
   * @param fallback - Optional fallback value to return on error
   * @returns The function result or fallback on error
   */
  static safeExecute<T>(
    fn: () => T,
    context?: string,
    fallback?: T
  ): T | undefined {
    try {
      if (typeof fn !== 'function') {
        console.warn(`NullSafety.safeExecute: Function is not a function${context ? ` in ${context}` : ''}`);
        return fallback;
      }

      return fn();
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        `NullSafety.safeExecute${context ? ` in ${context}` : ''}`
      );
      return fallback;
    }
  }

  /**
   * Safely execute an async function with error handling
   * @param fn - The async function to execute
   * @param context - Optional context for error logging
   * @param fallback - Optional fallback value to return on error
   * @returns Promise resolving to the function result or fallback on error
   */
  static async safeExecuteAsync<T>(
    fn: () => Promise<T>,
    context?: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      if (typeof fn !== 'function') {
        console.warn(`NullSafety.safeExecuteAsync: Function is not a function${context ? ` in ${context}` : ''}`);
        return fallback;
      }

      return await fn();
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        `NullSafety.safeExecuteAsync${context ? ` in ${context}` : ''}`
      );
      return fallback;
    }
  }

  /**
   * Create a null-safe wrapper for array operations
   * @param array - The array to wrap
   * @param context - Optional context for error logging
   * @returns Object with null-safe array methods
   */
  static wrapArray<T>(array: T[] | null | undefined, context?: string) {
    return {
      forEach: (callback: (item: T, index: number, array: T[]) => void) =>
        this.safeForEach(array, callback, context),

      map: <R>(callback: (item: T, index: number, array: T[]) => R) =>
        this.safeMap(array, callback, context),

      filter: (predicate: (item: T, index: number, array: T[]) => boolean) =>
        this.safeFilter(array, predicate, context),

      find: (predicate: (item: T, index: number, array: T[]) => boolean) =>
        this.safeFind(array, predicate, context),

      reduce: <R>(callback: (acc: R, current: T, index: number, array: T[]) => R, initialValue: R) =>
        this.safeReduce(array, callback, initialValue, context),

      length: array?.length || 0,

      isEmpty: () => !array || array.length === 0,

      isValid: () => Array.isArray(array)
    };
  }
}

// Export convenience functions for common use cases
export const {
  safeForEach,
  safeMap,
  safeFilter,
  safeFind,
  safeReduce,
  isNullOrUndefined,
  isNullOrEmpty,
  isNullOrWhitespace,
  safeValue,
  safeGet,
  safeExecute,
  safeExecuteAsync,
  wrapArray
} = NullSafety;