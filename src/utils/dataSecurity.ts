// Data security utilities for sanitization and encryption

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';
import * as CryptoJS from 'crypto-js';

// Security constants
const ENCRYPTION_KEY_PREFIX = 'geoguardian_secure_';
const SENSITIVE_DATA_PREFIX = 'secure_';
const DATA_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Sensitive data types
export interface EncryptedData {
  data: string;
  timestamp: number;
  expiresAt: number;
}

export interface SanitizationOptions {
  allowHtml?: boolean;
  allowScripts?: boolean;
  maxLength?: number;
  trimWhitespace?: boolean;
}

// Data sanitization class
export class DataSanitizer {
  // Sanitize user input to prevent XSS and injection attacks
  static sanitizeInput(
    input: string,
    options: SanitizationOptions = {}
  ): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Trim whitespace by default
    if (options.trimWhitespace !== false) {
      sanitized = sanitized.trim();
    }

    // Remove or escape HTML tags unless explicitly allowed
    if (!options.allowHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Remove script tags and javascript: protocols
    if (!options.allowScripts) {
      sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
      sanitized = sanitized.replace(/javascript:/gi, '');
      sanitized = sanitized.replace(/on\w+\s*=/gi, '');
      sanitized = sanitized.replace(/data:text\/html/gi, '');
      sanitized = sanitized.replace(/vbscript:/gi, '');
    }

    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Limit length if specified
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
  }

  // Sanitize object properties recursively
  static sanitizeObject<T extends Record<string, any>>(
    obj: T,
    options: SanitizationOptions = {}
  ): T {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const sanitized = { ...obj } as any;

    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeInput(value, options);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, options);
      }
    }

    return sanitized as T;
  }

  // Remove sensitive information from logs
  static sanitizeForLogging(data: any): any {
    if (!data) return data;

    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'key',
      'auth',
      'credential',
      'email', // Partially mask email
      'phone', // Partially mask phone
      'address', // Partially mask address
    ];

    const sanitizeValue = (value: any, key: string): any => {
      if (typeof value === 'string') {
        const lowerKey = key.toLowerCase();

        if (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token')) {
          return '[REDACTED]';
        }

        if (lowerKey.includes('email') && value.includes('@')) {
          const [local, domain] = value.split('@');
          return `${local.substring(0, 2)}***@${domain}`;
        }

        if (lowerKey.includes('phone') && value.length > 4) {
          return `***${value.slice(-4)}`;
        }

        if (lowerKey.includes('address') && value.length > 10) {
          return `${value.substring(0, 10)}...`;
        }
      }

      return value;
    };

    const sanitizeRecursive = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeRecursive(item));
      }

      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeRecursive(value);
          } else {
            sanitized[key] = sanitizeValue(value, key);
          }
        }
        return sanitized;
      }

      return obj;
    };

    return sanitizeRecursive(data);
  }

  // Validate and sanitize location data
  static sanitizeLocationData(locationData: any): any {
    if (!locationData || typeof locationData !== 'object') {
      return null;
    }

    const sanitized: any = {};

    // Validate and sanitize coordinates
    if (typeof locationData.latitude === 'number' &&
      typeof locationData.longitude === 'number' &&
      locationData.latitude >= -90 && locationData.latitude <= 90 &&
      locationData.longitude >= -180 && locationData.longitude <= 180) {
      sanitized.latitude = locationData.latitude;
      sanitized.longitude = locationData.longitude;
    } else {
      return null; // Invalid coordinates
    }

    // Sanitize optional fields
    if (locationData.address && typeof locationData.address === 'string') {
      sanitized.address = this.sanitizeInput(locationData.address, { maxLength: 200 });
    }

    if (typeof locationData.accuracy === 'number' && locationData.accuracy >= 0) {
      sanitized.accuracy = locationData.accuracy;
    }

    if (typeof locationData.speed === 'number' && locationData.speed >= 0) {
      sanitized.speed = locationData.speed;
    }

    if (typeof locationData.batteryLevel === 'number' &&
      locationData.batteryLevel >= 0 && locationData.batteryLevel <= 100) {
      sanitized.batteryLevel = locationData.batteryLevel;
    }

    if (typeof locationData.isCharging === 'boolean') {
      sanitized.isCharging = locationData.isCharging;
    }

    if (locationData.timestamp) {
      sanitized.timestamp = locationData.timestamp;
    }

    if (Array.isArray(locationData.circleMembers)) {
      sanitized.circleMembers = locationData.circleMembers.filter(
        (member: any) => typeof member === 'string' && member.trim().length > 0
      );
    }

    return sanitized;
  }
}

// Data encryption class for sensitive local storage
export class DataEncryption {
  private static getEncryptionKey(): string {
    // In a production app, this should be derived from device-specific data
    // and potentially user authentication state
    return ENCRYPTION_KEY_PREFIX + 'default_key_v1';
  }

  // Encrypt sensitive data before storing
  static encrypt(data: any): string {
    try {
      const jsonString = JSON.stringify(data);
      const key = this.getEncryptionKey();
      const encrypted = CryptoJS.AES.encrypt(jsonString, key).toString();
      return encrypted;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        'DataEncryption.encrypt'
      );
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt sensitive data after retrieval
  static decrypt(encryptedData: string): any {
    try {
      const key = this.getEncryptionKey();
      const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, key);
      const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decryptedString);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        'DataEncryption.decrypt'
      );
      throw new Error('Failed to decrypt data');
    }
  }

  // Store encrypted data with expiration
  static async storeSecureData(key: string, data: any, expiryMs?: number): Promise<void> {
    try {
      const now = Date.now();
      const expiresAt = now + (expiryMs || DATA_EXPIRY_MS);

      const encryptedData: EncryptedData = {
        data: this.encrypt(data),
        timestamp: now,
        expiresAt,
      };

      const storageKey = SENSITIVE_DATA_PREFIX + key;
      await AsyncStorage.setItem(storageKey, JSON.stringify(encryptedData));
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        'DataEncryption.storeSecureData'
      );
      throw new Error('Failed to store secure data');
    }
  }

  // Retrieve and decrypt data with expiration check
  static async retrieveSecureData(key: string): Promise<any | null> {
    try {
      const storageKey = SENSITIVE_DATA_PREFIX + key;
      const storedData = await AsyncStorage.getItem(storageKey);

      if (!storedData) {
        return null;
      }

      const encryptedData: EncryptedData = JSON.parse(storedData);
      const now = Date.now();

      // Check if data has expired
      if (now > encryptedData.expiresAt) {
        await this.removeSecureData(key);
        return null;
      }

      return this.decrypt(encryptedData.data);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        'DataEncryption.retrieveSecureData'
      );
      return null;
    }
  }

  // Remove encrypted data
  static async removeSecureData(key: string): Promise<void> {
    try {
      const storageKey = SENSITIVE_DATA_PREFIX + key;
      await AsyncStorage.removeItem(storageKey);
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'DataEncryption.removeSecureData'
      );
    }
  }

  // Clean up expired secure data
  static async cleanupExpiredData(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const secureKeys = allKeys.filter(key => key.startsWith(SENSITIVE_DATA_PREFIX));
      const now = Date.now();

      for (const key of secureKeys) {
        try {
          const storedData = await AsyncStorage.getItem(key);
          if (storedData) {
            const encryptedData: EncryptedData = JSON.parse(storedData);
            if (now > encryptedData.expiresAt) {
              await AsyncStorage.removeItem(key);
            }
          }
        } catch (error) {
          // Remove corrupted data
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        'DataEncryption.cleanupExpiredData'
      );
    }
  }
}

// Firebase security rules validation
export class FirebaseSecurityValidator {
  // Validate user permissions for Firestore operations
  static validateUserPermissions(
    userId: string,
    operation: 'read' | 'write' | 'delete',
    resourceType: 'user' | 'circle' | 'location' | 'emergency',
    resourceId?: string
  ): boolean {
    if (!userId || typeof userId !== 'string') {
      return false;
    }

    switch (resourceType) {
      case 'user':
        // Users can only access their own data
        return resourceId === userId;

      case 'location':
        // Users can only write their own location data
        return operation === 'write' ? resourceId === userId : true;

      case 'emergency':
        // Users can create emergency alerts and read their own
        return operation === 'delete' ? false : true;

      case 'circle':
        // Circle permissions are more complex and handled by Firestore rules
        return true;

      default:
        return false;
    }
  }

  // Validate data before Firestore operations
  static validateFirestoreData(
    collection: string,
    data: any,
    userId: string
  ): { isValid: boolean; sanitizedData?: any; errors: string[] } {
    const errors: string[] = [];
    let sanitizedData = { ...data };

    try {
      switch (collection) {
        case 'users':
          sanitizedData = this.validateUserData(data, userId, errors);
          break;

        case 'locations':
          sanitizedData = this.validateLocationData(data, userId, errors);
          break;

        case 'circles':
          sanitizedData = this.validateCircleData(data, userId, errors);
          break;

        case 'emergencyAlerts':
          sanitizedData = this.validateEmergencyData(data, userId, errors);
          break;

        default:
          errors.push('Unknown collection type');
      }

      return {
        isValid: errors.length === 0,
        sanitizedData: errors.length === 0 ? sanitizedData : undefined,
        errors,
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'FirebaseSecurityValidator.validateFirestoreData'
      );

      return {
        isValid: false,
        errors: ['Data validation failed'],
      };
    }
  }

  private static validateUserData(data: any, userId: string, errors: string[]): any {
    const sanitized: any = {};

    // Ensure user can only update their own data
    if (data.uid && data.uid !== userId) {
      errors.push('Cannot modify other user data');
      return sanitized;
    }

    // Sanitize user fields
    if (data.name) {
      sanitized.name = DataSanitizer.sanitizeInput(data.name, { maxLength: 100 });
    }

    if (data.email) {
      sanitized.email = DataSanitizer.sanitizeInput(data.email, { maxLength: 254 });
    }

    if (data.phone) {
      sanitized.phone = DataSanitizer.sanitizeInput(data.phone, { maxLength: 20 });
    }

    // Preserve system fields
    if (data.createdAt) sanitized.createdAt = data.createdAt;
    if (data.lastSeen) sanitized.lastSeen = data.lastSeen;
    if (typeof data.isOnline === 'boolean') sanitized.isOnline = data.isOnline;

    return sanitized;
  }

  private static validateLocationData(data: any, userId: string, errors: string[]): any {
    // Ensure user can only update their own location
    if (data.userId && data.userId !== userId) {
      errors.push('Cannot modify other user location');
      return {};
    }

    const sanitized = DataSanitizer.sanitizeLocationData(data);
    if (!sanitized) {
      errors.push('Invalid location data');
      return {};
    }

    return sanitized;
  }

  private static validateCircleData(data: any, userId: string, errors: string[]): any {
    const sanitized: any = {};

    if (data.name) {
      sanitized.name = DataSanitizer.sanitizeInput(data.name, { maxLength: 50 });
    }

    if (data.description) {
      sanitized.description = DataSanitizer.sanitizeInput(data.description, { maxLength: 200 });
    }

    // Preserve system fields
    if (data.ownerId) sanitized.ownerId = data.ownerId;
    if (data.createdAt) sanitized.createdAt = data.createdAt;
    if (data.updatedAt) sanitized.updatedAt = data.updatedAt;
    if (typeof data.memberCount === 'number') sanitized.memberCount = data.memberCount;

    return sanitized;
  }

  private static validateEmergencyData(data: any, userId: string, errors: string[]): any {
    const sanitized: any = {};

    // Ensure user can only create alerts for themselves
    if (data.userId && data.userId !== userId) {
      errors.push('Cannot create emergency alert for other users');
      return sanitized;
    }

    if (data.location) {
      const locationData = DataSanitizer.sanitizeLocationData(data.location);
      if (locationData) {
        sanitized.location = locationData;
      } else {
        errors.push('Invalid emergency location data');
      }
    }

    if (data.message) {
      sanitized.message = DataSanitizer.sanitizeInput(data.message, { maxLength: 500 });
    }

    // Preserve system fields
    if (data.circleId) sanitized.circleId = data.circleId;
    if (data.timestamp) sanitized.timestamp = data.timestamp;
    if (data.status) sanitized.status = data.status;

    return sanitized;
  }
}

// Comprehensive data security manager
export class DataSecurityManager {
  // Initialize security cleanup
  static async initialize(): Promise<void> {
    try {
      // Clean up expired encrypted data
      await DataEncryption.cleanupExpiredData();
      // DataSecurityManager initialized successfully
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        'DataSecurityManager.initialize'
      );
    }
  }

  // Secure data processing pipeline
  static async processSecureData<T>(
    data: T,
    options: {
      sanitize?: boolean;
      encrypt?: boolean;
      validate?: boolean;
      storageKey?: string;
    } = {}
  ): Promise<T> {
    let processedData = data;

    try {
      // Sanitize data if requested
      if (options.sanitize && typeof data === 'object' && data !== null) {
        processedData = DataSanitizer.sanitizeObject(data as any);
      }

      // Store encrypted if requested
      if (options.encrypt && options.storageKey) {
        await DataEncryption.storeSecureData(options.storageKey, processedData);
      }

      return processedData;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        'DataSecurityManager.processSecureData'
      );
      return data; // Return original data on error
    }
  }
}