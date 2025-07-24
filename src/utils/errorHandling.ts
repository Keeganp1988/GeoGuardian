// Shared error handling utilities to standardize error management

import { Alert } from 'react-native';

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
}

// Error categories
export enum ErrorCategory {
  NETWORK = 'NETWORK',
  FIREBASE = 'FIREBASE',
  AUTHENTICATION = 'AUTHENTICATION',
  LOCATION = 'LOCATION',
  PERMISSION = 'PERMISSION',
  VALIDATION = 'VALIDATION',
  UNKNOWN = 'UNKNOWN',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Error handler class
export class ErrorHandler {
  private static errorLog: AppError[] = [];
  
  // Log error with categorization
  static logError(
    error: Error | any,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: string
  ): AppError {
    const appError: AppError = {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
      details: {
        category,
        severity,
        context,
        stack: error.stack,
        originalError: error,
      },
      timestamp: Date.now(),
    };
    
    // Add to error log
    this.errorLog.push(appError);
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog = this.errorLog.slice(-100);
    }
    
    // Console log based on severity (only in development)
    if (process.env.NODE_ENV === 'development') {
      if (severity === ErrorSeverity.CRITICAL || severity === ErrorSeverity.HIGH) {
        console.error(`[${category}] ${context || 'Error'}:`, error);
      } else {
        console.warn(`[${category}] ${context || 'Warning'}:`, error);
      }
    }
    
    return appError;
  }
  
  // Handle Firebase errors
  static handleFirebaseError(error: any, operation: string): AppError {
    let category = ErrorCategory.FIREBASE;
    let severity = ErrorSeverity.MEDIUM;
    
    // Categorize Firebase errors
    if (error.code?.includes('auth/')) {
      category = ErrorCategory.AUTHENTICATION;
    } else if (error.code === 'permission-denied') {
      category = ErrorCategory.PERMISSION;
      severity = ErrorSeverity.HIGH;
    } else if (error.code === 'unavailable') {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.HIGH;
    }
    
    return this.logError(error, category, severity, `Firebase ${operation}`);
  }
  
  // Handle network errors
  static handleNetworkError(error: any, endpoint?: string): AppError {
    return this.logError(
      error,
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      `Network request${endpoint ? ` to ${endpoint}` : ''}`
    );
  }
  
  // Handle location errors
  static handleLocationError(error: any, operation: string): AppError {
    let severity = ErrorSeverity.MEDIUM;
    
    if (error.code === 'PERMISSION_DENIED') {
      severity = ErrorSeverity.HIGH;
    }
    
    return this.logError(
      error,
      ErrorCategory.LOCATION,
      severity,
      `Location ${operation}`
    );
  }
  
  // Show user-friendly error message
  static showUserError(
    error: AppError | any,
    title: string = 'Error',
    customMessage?: string
  ): void {
    const message = customMessage || this.getUserFriendlyMessage(error);
    
    Alert.alert(title, message, [
      { text: 'OK', style: 'default' }
    ]);
  }
  
  // Convert technical errors to user-friendly messages
  static getUserFriendlyMessage(error: AppError | any): string {
    if (error.code) {
      switch (error.code) {
        case 'auth/user-not-found':
          return 'User account not found. Please check your email address.';
        case 'auth/wrong-password':
          return 'Incorrect password. Please try again.';
        case 'auth/too-many-requests':
          return 'Too many failed attempts. Please try again later.';
        case 'permission-denied':
          return 'You don\'t have permission to perform this action.';
        case 'unavailable':
          return 'Service is temporarily unavailable. Please try again later.';
        case 'network-request-failed':
          return 'Network connection failed. Please check your internet connection.';
        case 'PERMISSION_DENIED':
          return 'Location permission is required for this feature.';
        default:
          return error.message || 'An unexpected error occurred. Please try again.';
      }
    }
    
    return error.message || 'An unexpected error occurred. Please try again.';
  }
  
  // Get error log for analysis
  static getErrorLog(): AppError[] {
    return [...this.errorLog];
  }
  
  // Clear error log
  static clearErrorLog(): void {
    this.errorLog = [];
  }
  
  // Async operation wrapper with error handling
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    showUserError: boolean = false
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      const appError = this.logError(error, category, ErrorSeverity.MEDIUM, context);
      
      if (showUserError) {
        this.showUserError(appError, 'Operation Failed');
      }
      
      return null;
    }
  }
}

// Common error handling patterns
export const errorPatterns = {
  // Wrap async operations with consistent error handling
  wrapAsync: async <T>(
    fn: () => Promise<T>,
    errorMessage: string = 'Operation failed'
  ): Promise<T | null> => {
    try {
      return await fn();
    } catch (error) {
      ErrorHandler.logError(error, ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM, errorMessage);
      return null;
    }
  },
  
  // Handle form validation errors
  handleValidationError: (field: string, value: any): string | null => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${field} is required`;
    }
    return null;
  },
  
  // Handle API response errors
  handleApiError: (response: any): AppError | null => {
    if (!response.ok) {
      return ErrorHandler.logError(
        new Error(`API Error: ${response.status} ${response.statusText}`),
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        'API Request'
      );
    }
    return null;
  },
};