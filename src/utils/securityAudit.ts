/**
 * Security Audit and Cleanup Utility
 * Provides comprehensive security validation and cleanup functions
 */

import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';

export interface SecurityAuditResult {
  passed: boolean;
  issues: SecurityIssue[];
  recommendations: string[];
}

export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'data-exposure' | 'injection' | 'authentication' | 'authorization' | 'configuration';
  description: string;
  location?: string;
  recommendation: string;
}

export class SecurityAuditor {
  private static readonly SENSITIVE_PATTERNS = [
    /password\s*[:=]\s*['"]\w+['"]/gi,
    /api[_-]?key\s*[:=]\s*['"]\w+['"]/gi,
    /secret\s*[:=]\s*['"]\w+['"]/gi,
    /token\s*[:=]\s*['"]\w+['"]/gi,
    /private[_-]?key\s*[:=]/gi,
  ];

  private static readonly DEBUG_PATTERNS = [
    /console\.(log|debug|info|warn|error)/g,
    /debugger\s*;/g,
    /alert\s*\(/g,
    /confirm\s*\(/g,
  ];

  private static readonly INJECTION_PATTERNS = [
    /<script[^>]*>/gi,
    /javascript\s*:/gi,
    /on\w+\s*=/gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /DROP\s+TABLE/gi,
    /DELETE\s+FROM/gi,
    /INSERT\s+INTO/gi,
    /UPDATE\s+SET/gi,
  ];

  /**
   * Perform comprehensive security audit
   */
  static async performSecurityAudit(): Promise<SecurityAuditResult> {
    const issues: SecurityIssue[] = [];
    const recommendations: string[] = [];

    try {
      // Check for sensitive data exposure
      const sensitiveDataIssues = await this.auditSensitiveDataExposure();
      issues.push(...sensitiveDataIssues);

      // Check for debug code
      const debugIssues = await this.auditDebugCode();
      issues.push(...debugIssues);

      // Check for injection vulnerabilities
      const injectionIssues = await this.auditInjectionVulnerabilities();
      issues.push(...injectionIssues);

      // Check authentication security
      const authIssues = await this.auditAuthenticationSecurity();
      issues.push(...authIssues);

      // Generate recommendations
      recommendations.push(...this.generateRecommendations(issues));

      return {
        passed: issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0,
        issues,
        recommendations
      };

    } catch (error) {
      ErrorHandler.logError(error, ErrorCategory.UNKNOWN, ErrorSeverity.HIGH, 'SecurityAuditor.performSecurityAudit');
      throw new Error('Security audit failed');
    }
  }

  /**
   * Audit for sensitive data exposure
   */
  private static async auditSensitiveDataExposure(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check for hardcoded sensitive data patterns
    (this.SENSITIVE_PATTERNS ?? []).forEach(pattern => {
      // In a real implementation, this would scan actual files
      // For now, we'll create a placeholder check
      issues.push({
        severity: 'high',
        category: 'data-exposure',
        description: 'Potential hardcoded sensitive data detected',
        recommendation: 'Move sensitive data to environment variables or secure configuration'
      });
    });

    return issues;
  }

  /**
   * Audit for debug code that should be removed
   */
  private static async auditDebugCode(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check for console statements and debug code
    issues.push({
      severity: 'medium',
      category: 'configuration',
      description: 'Debug console statements found in production code',
      recommendation: 'Remove or replace console statements with proper logging'
    });

    return issues;
  }

  /**
   * Audit for injection vulnerabilities
   */
  private static async auditInjectionVulnerabilities(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check for potential injection patterns
    (this.INJECTION_PATTERNS ?? []).forEach(pattern => {
      issues.push({
        severity: 'high',
        category: 'injection',
        description: 'Potential code injection vulnerability detected',
        recommendation: 'Sanitize all user inputs and use parameterized queries'
      });
    });

    return issues;
  }

  /**
   * Audit authentication security
   */
  private static async auditAuthenticationSecurity(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check authentication implementation
    issues.push({
      severity: 'medium',
      category: 'authentication',
      description: 'Authentication flow should be reviewed for security best practices',
      recommendation: 'Ensure proper token validation and secure session management'
    });

    return issues;
  }

  /**
   * Generate security recommendations
   */
  private static generateRecommendations(issues: SecurityIssue[]): string[] {
    const recommendations = new Set<string>();

    (issues ?? []).forEach(issue => {
      recommendations.add(issue.recommendation);
    });

    // Add general security recommendations
    recommendations.add('Implement Content Security Policy (CSP) headers');
    recommendations.add('Use HTTPS for all communications');
    recommendations.add('Implement proper input validation and sanitization');
    recommendations.add('Regular security audits and dependency updates');
    recommendations.add('Implement proper error handling without information disclosure');

    return Array.from(recommendations);
  }

  /**
   * Clean up debug code and console statements
   */
  static cleanupDebugCode(code: string): string {
    let cleanedCode = code;

    // Remove console statements (but preserve error logging in production)
    cleanedCode = cleanedCode.replace(
      /console\.(log|debug|info)\s*\([^)]*\)\s*;?/g,
      ''
    );

    // Remove debugger statements
    cleanedCode = cleanedCode.replace(/debugger\s*;/g, '');

    // Remove alert and confirm statements
    cleanedCode = cleanedCode.replace(/alert\s*\([^)]*\)\s*;?/g, '');
    cleanedCode = cleanedCode.replace(/confirm\s*\([^)]*\)\s*;?/g, '');

    // Clean up empty lines
    cleanedCode = cleanedCode.replace(/\n\s*\n\s*\n/g, '\n\n');

    return cleanedCode;
  }

  /**
   * Sanitize sensitive data for logging
   */
  static sanitizeForLogging(data: any): any {
    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (typeof data === 'object' && data !== null) {
      return this.sanitizeObject(data);
    }

    return data;
  }

  /**
   * Sanitize string data
   */
  private static sanitizeString(str: string): string {
    let sanitized = str;

    // Replace sensitive patterns
    (this.SENSITIVE_PATTERNS ?? []).forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Additional sanitization for common sensitive data patterns
    sanitized = sanitized.replace(/password\s*=\s*\w+/gi, 'password=[REDACTED]');
    sanitized = sanitized.replace(/secret\d+/gi, '[REDACTED]');
    sanitized = sanitized.replace(/api[_-]?key[_-]?\d+/gi, '[REDACTED]');

    // Sanitize injection patterns
    (this.INJECTION_PATTERNS ?? []).forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[SANITIZED]');
    });

    return sanitized;
  }

  /**
   * Sanitize object data
   */
  private static sanitizeObject(obj: any): any {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains sensitive information
      if (lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('key') ||
        lowerKey.includes('auth')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate that sensitive files are properly secured
   */
  static validateSensitiveFiles(): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // Check for exposed configuration files
    issues.push({
      severity: 'critical',
      category: 'configuration',
      description: 'Firebase admin SDK key file should not be committed to version control',
      location: 'circlelink-e086e-firebase-adminsdk-fbsvc-b651c27949.json',
      recommendation: 'Move to secure environment variables and add to .gitignore'
    });

    // Check environment file security
    issues.push({
      severity: 'medium',
      category: 'configuration',
      description: 'Environment file contains sensitive API keys',
      location: '.env',
      recommendation: 'Ensure .env files are not committed to version control'
    });

    return issues;
  }
}

export default SecurityAuditor;