import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';

/**
 * Runtime type checking and validation utilities
 */
export class TypeValidator {
  /**
   * Check if value is a string
   * @param value - Value to check
   * @returns Type guard for string
   */
  static isString(value: unknown): value is string {
    return typeof value === 'string';
  }

  /**
   * Check if value is a number
   * @param value - Value to check
   * @returns Type guard for number
   */
  static isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value);
  }

  /**
   * Check if value is a boolean
   * @param value - Value to check
   * @returns Type guard for boolean
   */
  static isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
  }

  /**
   * Check if value is an array
   * @param value - Value to check
   * @returns Type guard for array
   */
  static isArray<T = unknown>(value: unknown): value is T[] {
    return Array.isArray(value);
  }

  /**
   * Check if value is a plain object (not array, null, or other object types)
   * @param value - Value to check
   * @returns Type guard for plain object
   */
  static isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && 
           typeof value === 'object' && 
           !Array.isArray(value) && 
           value.constructor === Object;
  }

  /**
   * Check if value is a Date object
   * @param value - Value to check
   * @returns Type guard for Date
   */
  static isDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
  }

  /**
   * Check if value is null or undefined
   * @param value - Value to check
   * @returns Type guard for null or undefined
   */
  static isNullOrUndefined(value: unknown): value is null | undefined {
    return value === null || value === undefined;
  }

  /**
   * Validate Firebase document structure
   * @param document - Document to validate
   * @param requiredFields - Array of required field names
   * @param context - Optional context for error logging
   * @returns Validation result with errors
   */
  static validateFirebaseDocument(
    document: unknown,
    requiredFields: string[] = [],
    context?: string
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      if (!this.isPlainObject(document)) {
        errors.push('Document must be a plain object');
        return { isValid: false, errors };
      }

      // Check required fields
      for (const field of requiredFields) {
        if (!(field in document) || this.isNullOrUndefined(document[field])) {
          errors.push(`Required field '${field}' is missing or null`);
        }
      }

      // Check for undefined values (Firebase doesn't accept these)
      for (const [key, value] of Object.entries(document)) {
        if (value === undefined) {
          errors.push(`Field '${key}' has undefined value (not allowed in Firebase)`);
        }
      }

      return { isValid: errors.length === 0, errors };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `TypeValidator.validateFirebaseDocument${context ? ` in ${context}` : ''}`
      );
      errors.push('Validation failed due to unexpected error');
      return { isValid: false, errors };
    }
  }

  /**
   * Safe type guard for User objects
   * @param value - Value to check
   * @returns Type guard for User
   */
  static isUser(value: unknown): value is {
    uid: string;
    name: string;
    email: string;
    phone?: string;
    profileImage?: string;
    createdAt: Date;
    lastSeen: Date;
    isOnline: boolean;
  } {
    if (!this.isPlainObject(value)) return false;

    return this.isString(value.uid) &&
           this.isString(value.name) &&
           this.isString(value.email) &&
           this.isDate(value.createdAt) &&
           this.isDate(value.lastSeen) &&
           this.isBoolean(value.isOnline) &&
           (value.phone === undefined || this.isString(value.phone)) &&
           (value.profileImage === undefined || this.isString(value.profileImage));
  }

  /**
   * Safe type guard for Circle objects
   * @param value - Value to check
   * @returns Type guard for Circle
   */
  static isCircle(value: unknown): value is {
    id: string;
    name: string;
    description?: string;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
    memberCount: number;
  } {
    if (!this.isPlainObject(value)) return false;

    return this.isString(value.id) &&
           this.isString(value.name) &&
           this.isString(value.ownerId) &&
           this.isDate(value.createdAt) &&
           this.isDate(value.updatedAt) &&
           this.isNumber(value.memberCount) &&
           (value.description === undefined || this.isString(value.description));
  }

  /**
   * Safe type guard for LocationData objects
   * @param value - Value to check
   * @returns Type guard for LocationData
   */
  static isLocationData(value: unknown): value is {
    userId: string;
    latitude: number;
    longitude: number;
    address?: string;
    timestamp: Date;
    accuracy?: number;
    speed?: number;
    batteryLevel?: number;
    isCharging?: boolean;
    circleMembers: string[];
  } {
    if (!this.isPlainObject(value)) return false;

    return this.isString(value.userId) &&
           this.isNumber(value.latitude) &&
           this.isNumber(value.longitude) &&
           this.isDate(value.timestamp) &&
           this.isArray(value.circleMembers) &&
           (value.address === undefined || this.isString(value.address)) &&
           (value.accuracy === undefined || this.isNumber(value.accuracy)) &&
           (value.speed === undefined || this.isNumber(value.speed)) &&
           (value.batteryLevel === undefined || this.isNumber(value.batteryLevel)) &&
           (value.isCharging === undefined || this.isBoolean(value.isCharging));
  }

  /**
   * Validate array of specific type
   * @param value - Value to check
   * @param itemValidator - Function to validate each item
   * @param context - Optional context for error logging
   * @returns Validation result
   */
  static validateArray<T>(
    value: unknown,
    itemValidator: (item: unknown) => item is T,
    context?: string
  ): { isValid: boolean; validItems: T[]; errors: string[] } {
    const errors: string[] = [];
    const validItems: T[] = [];

    try {
      if (!this.isArray(value)) {
        errors.push('Value is not an array');
        return { isValid: false, validItems, errors };
      }

      value.forEach((item, index) => {
        if (itemValidator(item)) {
          validItems.push(item);
        } else {
          errors.push(`Item at index ${index} failed validation`);
        }
      });

      return { 
        isValid: errors.length === 0, 
        validItems, 
        errors 
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        `TypeValidator.validateArray${context ? ` in ${context}` : ''}`
      );
      errors.push('Array validation failed due to unexpected error');
      return { isValid: false, validItems, errors };
    }
  }

  /**
   * Create a safe validator that returns a default value on validation failure
   * @param validator - The validation function
   * @param defaultValue - Default value to return on failure
   * @param context - Optional context for error logging
   * @returns Safe validator function
   */
  static createSafeValidator<T>(
    validator: (value: unknown) => value is T,
    defaultValue: T,
    context?: string
  ): (value: unknown) => T {
    return (value: unknown): T => {
      try {
        if (validator(value)) {
          return value;
        }
        
        console.warn(`TypeValidator.createSafeValidator: Validation failed, using default${context ? ` in ${context}` : ''}`);
        return defaultValue;
      } catch (error) {
        ErrorHandler.logError(
          error,
          ErrorCategory.VALIDATION,
          ErrorSeverity.LOW,
          `TypeValidator.createSafeValidator${context ? ` in ${context}` : ''}`
        );
        return defaultValue;
      }
    };
  }

  /**
   * Validate coordinate values
   * @param latitude - Latitude value
   * @param longitude - Longitude value
   * @returns Validation result
   */
  static validateCoordinates(
    latitude: unknown, 
    longitude: unknown
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.isNumber(latitude)) {
      errors.push('Latitude must be a valid number');
    } else if (latitude < -90 || latitude > 90) {
      errors.push('Latitude must be between -90 and 90');
    }

    if (!this.isNumber(longitude)) {
      errors.push('Longitude must be a valid number');
    } else if (longitude < -180 || longitude > 180) {
      errors.push('Longitude must be between -180 and 180');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate email format
   * @param email - Email string to validate
   * @returns Whether email is valid
   */
  static isValidEmail(email: unknown): email is string {
    if (!this.isString(email)) return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number format (basic validation)
   * @param phone - Phone string to validate
   * @returns Whether phone is valid
   */
  static isValidPhone(phone: unknown): phone is string {
    if (!this.isString(phone)) return false;
    
    // Basic phone validation - at least 10 digits
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate that a string is not empty or just whitespace
   * @param value - String to validate
   * @returns Whether string is non-empty
   */
  static isNonEmptyString(value: unknown): value is string {
    return this.isString(value) && value.trim().length > 0;
  }
}

// Export convenience functions
export const {
  isString,
  isNumber,
  isBoolean,
  isArray,
  isPlainObject,
  isDate,
  isNullOrUndefined,
  validateFirebaseDocument,
  isUser,
  isCircle,
  isLocationData,
  validateArray,
  createSafeValidator,
  validateCoordinates,
  isValidEmail,
  isValidPhone,
  isNonEmptyString
} = TypeValidator;