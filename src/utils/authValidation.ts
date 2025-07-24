// Enhanced authentication validation utilities

import { Validator, validationRules } from './validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Authentication validation constants
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 100;

// Password strength requirements
export interface PasswordStrength {
  score: number; // 0-4 (weak to very strong)
  feedback: string[];
  isValid: boolean;
}

// Enhanced validation rules for authentication
export const authValidationRules = {
  email: [
    validationRules.required('Email'),
    validationRules.string('Email'),
    validationRules.email('Email'),
    validationRules.maxLength(EMAIL_MAX_LENGTH, 'Email'),
  ],

  password: [
    validationRules.required('Password'),
    validationRules.string('Password'),
    validationRules.minLength(PASSWORD_MIN_LENGTH, 'Password'),
    validationRules.maxLength(PASSWORD_MAX_LENGTH, 'Password'),
  ],

  name: [
    validationRules.required('Name'),
    validationRules.string('Name'),
    validationRules.minLength(2, 'Name'),
    validationRules.maxLength(NAME_MAX_LENGTH, 'Name'),
  ],
};

// Email validation with enhanced security checks
export class AuthValidator {
  // Validate email with additional security checks
  static validateEmail(email: string): { isValid: boolean; errors: string[]; sanitized: string } {
    const sanitized = email.trim().toLowerCase();
    const validation = Validator.validate(sanitized, authValidationRules.email);
    
    const errors = [...validation.errors];
    
    // Additional security checks
    if (validation.isValid) {
      // Check for suspicious patterns
      if (this.containsSuspiciousPatterns(sanitized)) {
        errors.push('Email contains suspicious characters');
      }
      
      // Check for common disposable email domains (basic check)
      if (this.isDisposableEmail(sanitized)) {
        errors.push('Disposable email addresses are not allowed');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized,
    };
  }

  // Validate password with strength checking
  static validatePassword(password: string): { isValid: boolean; errors: string[]; strength: PasswordStrength } {
    const validation = Validator.validate(password, authValidationRules.password);
    const strength = this.checkPasswordStrength(password);
    
    const errors = [...validation.errors];
    
    // Add strength-based errors
    if (validation.isValid && !strength.isValid) {
      errors.push(...strength.feedback);
    }
    
    return {
      isValid: validation.isValid && strength.isValid,
      errors,
      strength,
    };
  }

  // Validate name with sanitization
  static validateName(name: string): { isValid: boolean; errors: string[]; sanitized: string } {
    const sanitized = name.trim().replace(/\s+/g, ' '); // Normalize whitespace
    const validation = Validator.validate(sanitized, authValidationRules.name);
    
    const errors = [...validation.errors];
    
    // Additional checks
    if (validation.isValid) {
      // Check for suspicious patterns
      if (this.containsSuspiciousPatterns(sanitized)) {
        errors.push('Name contains invalid characters');
      }
      
      // Check for script injection attempts
      if (this.containsScriptPatterns(sanitized)) {
        errors.push('Name contains prohibited content');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitized,
    };
  }

  // Check password strength
  private static checkPasswordStrength(password: string): PasswordStrength {
    let score = 0;
    const feedback: string[] = [];
    
    // Length check
    if (password.length >= 12) {
      score += 1;
    } else if (password.length >= 8) {
      score += 0.5;
    } else {
      feedback.push('Password should be at least 8 characters long');
    }
    
    // Character variety checks
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    let varietyScore = 0;
    if (hasLowercase) varietyScore++;
    if (hasUppercase) varietyScore++;
    if (hasNumbers) varietyScore++;
    if (hasSpecialChars) varietyScore++;
    
    score += varietyScore * 0.5;
    
    // Feedback for missing character types
    if (!hasLowercase) feedback.push('Add lowercase letters');
    if (!hasUppercase) feedback.push('Add uppercase letters');
    if (!hasNumbers) feedback.push('Add numbers');
    if (!hasSpecialChars) feedback.push('Add special characters');
    
    // Common pattern checks
    if (this.hasCommonPatterns(password)) {
      score -= 1;
      feedback.push('Avoid common patterns like "123" or "abc"');
    }
    
    // Repetition check
    if (this.hasExcessiveRepetition(password)) {
      score -= 0.5;
      feedback.push('Avoid repeating characters');
    }
    
    // Ensure score is within bounds
    score = Math.max(0, Math.min(4, score));
    
    // Determine if password is valid (minimum score of 2)
    const isValid = score >= 2 && feedback.length === 0;
    
    return {
      score: Math.round(score),
      feedback,
      isValid,
    };
  }

  // Check for suspicious patterns in input
  private static containsSuspiciousPatterns(input: string): boolean {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /vbscript:/i,
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(input));
  }

  // Check for script injection patterns
  private static containsScriptPatterns(input: string): boolean {
    const scriptPatterns = [
      /<[^>]*>/,  // HTML tags
      /[<>]/,     // Angle brackets
      /[{}]/,     // Curly braces
      /[\[\]]/,   // Square brackets
    ];
    
    return scriptPatterns.some(pattern => pattern.test(input));
  }

  // Basic check for disposable email domains
  private static isDisposableEmail(email: string): boolean {
    const disposableDomains = [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'throwaway.email',
      // Add more as needed
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  // Check for common password patterns
  private static hasCommonPatterns(password: string): boolean {
    const commonPatterns = [
      /123/,
      /abc/i,
      /qwerty/i,
      /password/i,
      /admin/i,
      /login/i,
    ];
    
    return commonPatterns.some(pattern => pattern.test(password));
  }

  // Check for excessive character repetition
  private static hasExcessiveRepetition(password: string): boolean {
    // Check for 3 or more consecutive identical characters
    return /(.)\1{2,}/.test(password);
  }

  // Comprehensive authentication data validation
  static validateAuthData(data: {
    email?: string;
    password?: string;
    name?: string;
  }): {
    isValid: boolean;
    errors: Record<string, string[]>;
    sanitized: Record<string, string>;
    passwordStrength?: PasswordStrength;
  } {
    const errors: Record<string, string[]> = {};
    const sanitized: Record<string, string> = {};
    let passwordStrength: PasswordStrength | undefined;

    try {
      // Validate email
      if (data.email !== undefined) {
        const emailValidation = this.validateEmail(data.email);
        if (!emailValidation.isValid) {
          errors.email = emailValidation.errors;
        }
        sanitized.email = emailValidation.sanitized;
      }

      // Validate password
      if (data.password !== undefined) {
        const passwordValidation = this.validatePassword(data.password);
        if (!passwordValidation.isValid) {
          errors.password = passwordValidation.errors;
        }
        sanitized.password = data.password; // Don't sanitize password
        passwordStrength = passwordValidation.strength;
      }

      // Validate name
      if (data.name !== undefined) {
        const nameValidation = this.validateName(data.name);
        if (!nameValidation.isValid) {
          errors.name = nameValidation.errors;
        }
        sanitized.name = nameValidation.sanitized;
      }

      const isValid = Object.keys(errors).length === 0;

      return {
        isValid,
        errors,
        sanitized,
        passwordStrength,
      };
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'AuthValidator.validateAuthData'
      );

      return {
        isValid: false,
        errors: { general: ['Validation error occurred'] },
        sanitized: {},
      };
    }
  }

  // Rate limiting check (basic implementation) - now async for React Native
  static async checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): Promise<boolean> {
    try {
      const key = `rate_limit_${identifier}`;
      const now = Date.now();
      
      // This is a basic implementation - in production, you'd use a proper rate limiting service
      const stored = await AsyncStorage.getItem(key);
      if (!stored) {
        await AsyncStorage.setItem(key, JSON.stringify({ count: 1, firstAttempt: now }));
        return true;
      }

      const data = JSON.parse(stored);
      
      // Reset if window has passed
      if (now - data.firstAttempt > windowMs) {
        await AsyncStorage.setItem(key, JSON.stringify({ count: 1, firstAttempt: now }));
        return true;
      }

      // Check if limit exceeded
      if (data.count >= maxAttempts) {
        return false;
      }

      // Increment count
      data.count++;
      await AsyncStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.VALIDATION,
        ErrorSeverity.LOW,
        'AuthValidator.checkRateLimit'
      );
      return true; // Allow on error to avoid blocking legitimate users
    }
  }
}

// Password strength indicator helper
export const getPasswordStrengthColor = (score: number): string => {
  switch (score) {
    case 0:
    case 1:
      return '#EF4444'; // Red
    case 2:
      return '#F59E0B'; // Orange
    case 3:
      return '#10B981'; // Green
    case 4:
      return '#059669'; // Dark green
    default:
      return '#6B7280'; // Gray
  }
};

export const getPasswordStrengthText = (score: number): string => {
  switch (score) {
    case 0:
      return 'Very Weak';
    case 1:
      return 'Weak';
    case 2:
      return 'Fair';
    case 3:
      return 'Good';
    case 4:
      return 'Strong';
    default:
      return 'Unknown';
  }
};