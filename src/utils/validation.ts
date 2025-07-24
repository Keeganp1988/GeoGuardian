// Input validation utilities for service methods

import { ErrorHandler, ErrorCategory } from './errorHandling';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Validation rule interface
export interface ValidationRule<T = any> {
  name: string;
  validator: (value: T) => boolean | string;
  message?: string;
}

// Common validation rules
export const validationRules = {
  required: <T>(fieldName: string): ValidationRule<T> => ({
    name: 'required',
    validator: (value: T) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    },
    message: `${fieldName} is required`,
  }),

  string: (fieldName: string): ValidationRule<unknown> => ({
    name: 'string',
    validator: (value: unknown) => typeof value === 'string',
    message: `${fieldName} must be a string`,
  }),

  number: (fieldName: string): ValidationRule<unknown> => ({
    name: 'number',
    validator: (value: unknown) => typeof value === 'number' && !isNaN(value),
    message: `${fieldName} must be a valid number`,
  }),

  email: (fieldName: string): ValidationRule<string> => ({
    name: 'email',
    validator: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: `${fieldName} must be a valid email address`,
  }),

  minLength: (min: number, fieldName: string): ValidationRule<string> => ({
    name: 'minLength',
    validator: (value: string) => value && value.length >= min,
    message: `${fieldName} must be at least ${min} characters long`,
  }),

  maxLength: (max: number, fieldName: string): ValidationRule<string> => ({
    name: 'maxLength',
    validator: (value: string) => !value || value.length <= max,
    message: `${fieldName} must be no more than ${max} characters long`,
  }),

  coordinates: (fieldName: string): ValidationRule<{ latitude: number; longitude: number }> => ({
    name: 'coordinates',
    validator: (value: { latitude: number; longitude: number }) => {
      return (
        value &&
        typeof value.latitude === 'number' &&
        typeof value.longitude === 'number' &&
        value.latitude >= -90 &&
        value.latitude <= 90 &&
        value.longitude >= -180 &&
        value.longitude <= 180
      );
    },
    message: `${fieldName} must contain valid latitude and longitude coordinates`,
  }),

  userId: (fieldName: string): ValidationRule<string> => ({
    name: 'userId',
    validator: (value: string) => typeof value === 'string' && value.trim().length > 0,
    message: `${fieldName} must be a valid user ID`,
  }),

  timestamp: (fieldName: string): ValidationRule<number> => ({
    name: 'timestamp',
    validator: (value: number) => typeof value === 'number' && value > 0,
    message: `${fieldName} must be a valid timestamp`,
  }),

  array: (fieldName: string): ValidationRule<unknown[]> => ({
    name: 'array',
    validator: (value: unknown[]) => Array.isArray(value),
    message: `${fieldName} must be an array`,
  }),

  object: (fieldName: string): ValidationRule<Record<string, any>> => ({
    name: 'object',
    validator: (value: Record<string, any>) => 
      value !== null && typeof value === 'object' && !Array.isArray(value),
    message: `${fieldName} must be an object`,
  }),
};

// Validator class
export class Validator {
  // Validate a single value against multiple rules
  static validate<T>(value: T, rules: ValidationRule<T>[]): ValidationResult {
    const errors: string[] = [];

    for (const rule of rules) {
      const result = rule.validator(value);
      if (result === false) {
        errors.push(rule.message || `Validation failed for rule: ${rule.name}`);
      } else if (typeof result === 'string') {
        errors.push(result);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Validate multiple fields
  static validateFields(
    data: Record<string, any>,
    fieldRules: Record<string, ValidationRule<any>[]>
  ): ValidationResult {
    const allErrors: string[] = [];

    for (const [fieldName, rules] of Object.entries(fieldRules)) {
      const fieldValue = data[fieldName];
      const result = this.validate(fieldValue, rules);
      
      if (!result.isValid) {
        allErrors.push(...result.errors);
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
    };
  }

  // Validate and throw error if invalid
  static validateOrThrow<T>(value: T, rules: ValidationRule<T>[], context?: string): void {
    const result = this.validate(value, rules);
    
    if (!result.isValid) {
      const error = new Error(`Validation failed: ${result.errors.join(', ')}`);
      ErrorHandler.logError(error, ErrorCategory.VALIDATION, undefined, context);
      throw error;
    }
  }

  // Validate fields and throw error if invalid
  static validateFieldsOrThrow(
    data: Record<string, any>,
    fieldRules: Record<string, ValidationRule<any>[]>,
    context?: string
  ): void {
    const result = this.validateFields(data, fieldRules);
    
    if (!result.isValid) {
      const error = new Error(`Field validation failed: ${result.errors.join(', ')}`);
      ErrorHandler.logError(error, ErrorCategory.VALIDATION, undefined, context);
      throw error;
    }
  }
}

// Service method validation decorator
export function validateInput<T extends (...args: any[]) => any>(
  validationRules: Record<number, ValidationRule<any>[]>
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = function (...args: Parameters<T>) {
      // Validate each argument according to its rules
      for (const [argIndex, rules] of Object.entries(validationRules)) {
        const index = parseInt(argIndex);
        if (index < args.length) {
          Validator.validateOrThrow(
            args[index],
            rules,
            `${target.constructor.name}.${propertyName} argument ${index}`
          );
        }
      }

      // Call the original method
      return method.apply(this, args);
    };

    return descriptor;
  };
}

// Common validation patterns for services
export const serviceValidations = {
  // Location update validation
  locationUpdate: {
    userId: [validationRules.required('userId'), validationRules.userId('userId')],
    coordinates: [validationRules.required('coordinates'), validationRules.coordinates('coordinates')],
    timestamp: [validationRules.required('timestamp'), validationRules.timestamp('timestamp')],
  },

  // User data validation
  userData: {
    uid: [validationRules.required('uid'), validationRules.string('uid')],
    email: [validationRules.required('email'), validationRules.email('email')],
    displayName: [validationRules.string('displayName'), validationRules.maxLength(100, 'displayName')],
  },

  // Circle data validation
  circleData: {
    name: [validationRules.required('name'), validationRules.string('name'), validationRules.maxLength(50, 'name')],
    members: [validationRules.array('members')],
  },

  // Cache operations validation
  cacheOperation: {
    key: [validationRules.required('key'), validationRules.string('key')],
    value: [validationRules.required('value')],
  },
};

// Async validation support
export class AsyncValidator {
  // Validate with async rules
  static async validateAsync<T>(
    value: T,
    rules: Array<ValidationRule<T> | ((value: T) => Promise<boolean | string>)>
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    for (const rule of rules) {
      if (typeof rule === 'function') {
        // Async validation function
        try {
          const result = await rule(value);
          if (result === false) {
            errors.push('Async validation failed');
          } else if (typeof result === 'string') {
            errors.push(result);
          }
        } catch (error) {
          errors.push(`Async validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Regular validation rule
        const result = rule.validator(value);
        if (result === false) {
          errors.push(rule.message || `Validation failed for rule: ${rule.name}`);
        } else if (typeof result === 'string') {
          errors.push(result);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}