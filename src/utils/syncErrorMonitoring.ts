/**
 * Sync Error Monitoring and Debugging Utilities
 * Provides comprehensive error monitoring, debugging information, and health checks
 */

import syncErrorHandler, { SyncError, ErrorStats } from '../services/syncErrorHandlingService';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './errorHandling';

// Health check result interface
export interface SyncHealthCheck {
  isHealthy: boolean;
  score: number; // 0-100
  issues: HealthIssue[];
  recommendations: string[];
  lastCheckTime: Date;
}

// Health issue interface
export interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  impact: string;
  recommendation: string;
}

// Debug information interface
export interface SyncDebugInfo {
  errorStats: ErrorStats;
  recentErrors: readonly SyncError[];
  healthCheck: SyncHealthCheck;
  systemInfo: SystemInfo;
  performanceMetrics: PerformanceMetrics;
}

// System information interface
export interface SystemInfo {
  timestamp: Date;
  platform: string;
  networkStatus: 'online' | 'offline' | 'unknown';
  memoryUsage?: number;
  activeServices: string[];
}

// Performance metrics interface
export interface PerformanceMetrics {
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  retryRate: number;
  lastSyncTime?: Date;
}

class SyncErrorMonitoringService {
  private healthCheckInterval?: NodeJS.Timeout;
  private performanceMetrics: PerformanceMetrics = {
    averageResponseTime: 0,
    successRate: 100,
    errorRate: 0,
    retryRate: 0,
  };

  private operationTimes: number[] = [];
  private maxOperationTimeHistory = 100;

  /**
   * Initialize error monitoring
   */
  initialize(): void {
    console.log('[SyncErrorMonitoring] Initializing error monitoring service');
    this.startHealthCheckMonitoring();
  }

  /**
   * Perform comprehensive sync health check
   */
  performHealthCheck(): SyncHealthCheck {
    const issues: HealthIssue[] = [];
    const recommendations: string[] = [];
    let score = 100;

    const errorStats = syncErrorHandler.getErrorStats();
    const recentErrors = syncErrorHandler.getErrorHistory(10);

    // Check error rate
    if (errorStats.totalErrors > 0) {
      const errorRate = this.calculateErrorRate(errorStats);

      if (errorRate > 50) {
        issues.push({
          severity: 'critical',
          category: 'Error Rate',
          description: `High error rate: ${errorRate.toFixed(1)}%`,
          impact: 'Sync functionality severely impacted',
          recommendation: 'Check network connectivity and service status',
        });
        score -= 30;
        recommendations.push('Investigate network connectivity issues');
      } else if (errorRate > 20) {
        issues.push({
          severity: 'high',
          category: 'Error Rate',
          description: `Elevated error rate: ${errorRate.toFixed(1)}%`,
          impact: 'Sync reliability reduced',
          recommendation: 'Monitor error patterns and consider retry configuration',
        });
        score -= 15;
        recommendations.push('Review error patterns and adjust retry settings');
      } else if (errorRate > 5) {
        issues.push({
          severity: 'medium',
          category: 'Error Rate',
          description: `Moderate error rate: ${errorRate.toFixed(1)}%`,
          impact: 'Occasional sync delays',
          recommendation: 'Monitor for trending issues',
        });
        score -= 5;
      }
    }

    // Check recent error patterns
    const recentErrorTypes = this.analyzeRecentErrorPatterns(recentErrors);
    if (recentErrorTypes.length > 0) {
      const dominantErrorType = recentErrorTypes[0];

      if (dominantErrorType.count >= 3) {
        issues.push({
          severity: 'high',
          category: 'Error Pattern',
          description: `Recurring ${dominantErrorType.type} errors (${dominantErrorType.count} recent)`,
          impact: 'Specific sync functionality affected',
          recommendation: this.getErrorTypeRecommendation(dominantErrorType.type),
        });
        score -= 20;
        recommendations.push(this.getErrorTypeRecommendation(dominantErrorType.type));
      }
    }

    // Check retry success rate
    const retrySuccessRate = this.calculateRetrySuccessRate(errorStats);
    if (retrySuccessRate < 50 && errorStats.successfulRetries + errorStats.failedRetries > 0) {
      issues.push({
        severity: 'medium',
        category: 'Retry Performance',
        description: `Low retry success rate: ${retrySuccessRate.toFixed(1)}%`,
        impact: 'Failed operations not recovering effectively',
        recommendation: 'Review retry configuration and error handling',
      });
      score -= 10;
      recommendations.push('Optimize retry configuration for better recovery');
    }

    // Check if sync is currently healthy
    if (!syncErrorHandler.isSyncHealthy()) {
      issues.push({
        severity: 'medium',
        category: 'Sync Status',
        description: 'Sync service not in healthy state',
        impact: 'Current sync operations may be unreliable',
        recommendation: 'Trigger manual sync refresh',
      });
      score -= 15;
      recommendations.push('Perform manual sync refresh');
    }

    // Check performance metrics
    if (this.performanceMetrics.averageResponseTime > 5000) {
      issues.push({
        severity: 'medium',
        category: 'Performance',
        description: `Slow response times: ${this.performanceMetrics.averageResponseTime.toFixed(0)}ms average`,
        impact: 'User experience degraded',
        recommendation: 'Check network conditions and service performance',
      });
      score -= 10;
    }

    const isHealthy = score >= 80 && issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

    return {
      isHealthy,
      score: Math.max(0, score),
      issues,
      recommendations: Array.from(new Set(recommendations)), // Remove duplicates
      lastCheckTime: new Date(),
    };
  }

  /**
   * Get comprehensive debug information
   */
  getDebugInfo(): SyncDebugInfo {
    return {
      errorStats: syncErrorHandler.getErrorStats(),
      recentErrors: syncErrorHandler.getErrorHistory(20),
      healthCheck: this.performHealthCheck(),
      systemInfo: this.getSystemInfo(),
      performanceMetrics: this.performanceMetrics,
    };
  }

  /**
   * Record operation performance
   */
  recordOperationTime(operationName: string, startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;

    // Update operation times for average calculation
    this.operationTimes.push(duration);
    if (this.operationTimes.length > this.maxOperationTimeHistory) {
      this.operationTimes = this.operationTimes.slice(-this.maxOperationTimeHistory);
    }

    // Update performance metrics
    this.updatePerformanceMetrics(duration, success);

    // Log slow operations
    if (duration > 10000) { // 10 seconds
      console.warn(`[SyncErrorMonitoring] Slow operation detected: ${operationName} took ${duration}ms`);

      ErrorHandler.logError(
        new Error(`Slow sync operation: ${operationName}`),
        ErrorCategory.UNKNOWN,
        ErrorSeverity.LOW,
        `Performance monitoring - ${operationName}`
      );
    }
  }

  /**
   * Generate error report for debugging
   */
  generateErrorReport(): string {
    const debugInfo = this.getDebugInfo();
    const healthCheck = debugInfo.healthCheck;

    let report = '=== SYNC ERROR MONITORING REPORT ===\n\n';

    // Health summary
    report += `Health Status: ${healthCheck.isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}\n`;
    report += `Health Score: ${healthCheck.score}/100\n`;
    report += `Last Check: ${healthCheck.lastCheckTime.toISOString()}\n\n`;

    // Issues
    if (healthCheck.issues.length > 0) {
      report += '🚨 ISSUES DETECTED:\n';
      healthCheck.issues.forEach((issue, index) => {
        const severityIcon = this.getSeverityIcon(issue.severity);
        report += `${index + 1}. ${severityIcon} ${issue.category}: ${issue.description}\n`;
        report += `   Impact: ${issue.impact}\n`;
        report += `   Recommendation: ${issue.recommendation}\n\n`;
      });
    }

    // Recommendations
    if (healthCheck.recommendations.length > 0) {
      report += '💡 RECOMMENDATIONS:\n';
      healthCheck.recommendations.forEach((rec, index) => {
        report += `${index + 1}. ${rec}\n`;
      });
      report += '\n';
    }

    // Error statistics
    const stats = debugInfo.errorStats;
    report += '📊 ERROR STATISTICS:\n';
    report += `Total Errors: ${stats.totalErrors}\n`;
    report += `Successful Retries: ${stats.successfulRetries}\n`;
    report += `Failed Retries: ${stats.failedRetries}\n`;
    report += `Average Retry Count: ${stats.averageRetryCount.toFixed(2)}\n`;

    if (stats.lastErrorTime) {
      report += `Last Error: ${stats.lastErrorTime.toISOString()}\n`;
    }
    report += '\n';

    // Error breakdown by type
    if (Object.keys(stats.errorsByType).length > 0) {
      report += '🔍 ERRORS BY TYPE:\n';
      Object.entries(stats.errorsByType)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
          report += `${type}: ${count}\n`;
        });
      report += '\n';
    }

    // Error breakdown by operation
    if (Object.keys(stats.errorsByOperation).length > 0) {
      report += '⚙️ ERRORS BY OPERATION:\n';
      Object.entries(stats.errorsByOperation)
        .sort(([, a], [, b]) => b - a)
        .forEach(([operation, count]) => {
          report += `${operation}: ${count}\n`;
        });
      report += '\n';
    }

    // Performance metrics
    const perf = debugInfo.performanceMetrics;
    report += '⚡ PERFORMANCE METRICS:\n';
    report += `Average Response Time: ${perf.averageResponseTime.toFixed(0)}ms\n`;
    report += `Success Rate: ${perf.successRate.toFixed(1)}%\n`;
    report += `Error Rate: ${perf.errorRate.toFixed(1)}%\n`;
    report += `Retry Rate: ${perf.retryRate.toFixed(1)}%\n`;

    if (perf.lastSyncTime) {
      report += `Last Sync: ${perf.lastSyncTime.toISOString()}\n`;
    }
    report += '\n';

    // Recent errors
    if (debugInfo.recentErrors.length > 0) {
      report += '🕒 RECENT ERRORS (Last 10):\n';
      debugInfo.recentErrors.slice(-10).forEach((error, index) => {
        report += `${index + 1}. [${error.timestamp.toISOString()}] ${error.type}: ${error.operation}\n`;
        report += `   Message: ${error.userFriendlyMessage}\n`;
        if (error.context) {
          report += `   Context: ${JSON.stringify(error.context, null, 2)}\n`;
        }
        report += '\n';
      });
    }

    report += '=== END REPORT ===';

    return report;
  }

  /**
   * Export debug information as JSON
   */
  exportDebugData(): string {
    return JSON.stringify(this.getDebugInfo(), null, 2);
  }

  /**
   * Clear monitoring data
   */
  clearMonitoringData(): void {
    this.operationTimes = [];
    this.performanceMetrics = {
      averageResponseTime: 0,
      successRate: 100,
      errorRate: 0,
      retryRate: 0,
    };

    console.log('[SyncErrorMonitoring] Monitoring data cleared');
  }

  /**
   * Stop monitoring
   */
  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    console.log('[SyncErrorMonitoring] Error monitoring stopped');
  }

  /**
   * Start periodic health check monitoring
   */
  private startHealthCheckMonitoring(): void {
    // Perform health check every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      const healthCheck = this.performHealthCheck();

      // Log critical issues
      const criticalIssues = healthCheck.issues.filter(i => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        console.error('[SyncErrorMonitoring] Critical sync health issues detected:', criticalIssues);

        // Log to error handler for tracking
        ErrorHandler.logError(
          new Error(`Critical sync health issues: ${criticalIssues.map(i => i.description).join(', ')}`),
          ErrorCategory.UNKNOWN,
          ErrorSeverity.CRITICAL,
          'Sync Health Monitoring'
        );
      }

      // Log health score if below threshold
      if (healthCheck.score < 70) {
        console.warn(`[SyncErrorMonitoring] Sync health score below threshold: ${healthCheck.score}/100`);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Calculate error rate percentage
   */
  private calculateErrorRate(errorStats: ErrorStats): number {
    const totalOperations = errorStats.totalErrors + errorStats.successfulRetries + 100; // Assume some successful operations
    return (errorStats.totalErrors / totalOperations) * 100;
  }

  /**
   * Calculate retry success rate
   */
  private calculateRetrySuccessRate(errorStats: ErrorStats): number {
    const totalRetries = errorStats.successfulRetries + errorStats.failedRetries;
    if (totalRetries === 0) return 100;
    return (errorStats.successfulRetries / totalRetries) * 100;
  }

  /**
   * Analyze recent error patterns
   */
  private analyzeRecentErrorPatterns(recentErrors: readonly SyncError[]): Array<{ type: string; count: number }> {
    const errorCounts = new Map<string, number>();

    recentErrors.forEach(error => {
      const count = errorCounts.get(error.type) || 0;
      errorCounts.set(error.type, count + 1);
    });

    return Array.from(errorCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get recommendation for specific error type
   */
  private getErrorTypeRecommendation(errorType: string): string {
    switch (errorType) {
      case 'NETWORK_UNAVAILABLE':
        return 'Check internet connectivity and network stability';
      case 'PERMISSION_DENIED':
        return 'Verify app permissions and user authentication';
      case 'RATE_LIMITED':
        return 'Reduce request frequency and implement better rate limiting';
      case 'SERVICE_UNAVAILABLE':
        return 'Check service status and consider fallback mechanisms';
      case 'TIMEOUT':
        return 'Increase timeout values and check network latency';
      case 'SUBSCRIPTION_FAILED':
        return 'Review real-time listener configuration and Firebase rules';
      default:
        return 'Review error logs and implement specific error handling';
    }
  }

  /**
   * Get system information
   */
  private getSystemInfo(): SystemInfo {
    return {
      timestamp: new Date(),
      platform: process.env.NODE_ENV || 'unknown',
      networkStatus: 'unknown', // Would be implemented with actual network detection
      activeServices: ['RealTimeSyncManager', 'SubscriptionManager', 'SyncErrorHandler'],
    };
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(duration: number, success: boolean): void {
    // Update average response time
    if (this.operationTimes.length > 0) {
      this.performanceMetrics.averageResponseTime =
        this.operationTimes.reduce((sum, time) => sum + time, 0) / this.operationTimes.length;
    }

    // Update success/error rates (simplified calculation)
    const errorStats = syncErrorHandler.getErrorStats();
    const totalOperations = errorStats.totalErrors + errorStats.successfulRetries + 100; // Estimate

    this.performanceMetrics.errorRate = (errorStats.totalErrors / totalOperations) * 100;
    this.performanceMetrics.successRate = 100 - this.performanceMetrics.errorRate;

    const totalRetries = errorStats.successfulRetries + errorStats.failedRetries;
    this.performanceMetrics.retryRate = totalOperations > 0 ? (totalRetries / totalOperations) * 100 : 0;

    if (success) {
      this.performanceMetrics.lastSyncTime = new Date();
    }
  }

  /**
   * Get severity icon for display
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }
}

// Create and export singleton instance
export const syncErrorMonitoring = new SyncErrorMonitoringService();
export default syncErrorMonitoring;