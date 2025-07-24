const fs = require('fs');
const path = require('path');

class BuildHealthMonitor {
  constructor() {
    this.metricsPath = path.join(process.cwd(), '.kiro', 'build-manager', 'metrics.json');
    this.alertsPath = path.join(process.cwd(), '.kiro', 'build-manager', 'alerts.json');
    this.metrics = {
      builds: [],
      performance: {},
      errors: {},
      trends: {}
    };
    this.alerts = [];
  }

  async initialize() {
    console.log('📊 Initializing Build Health Monitor...');
    this.loadMetrics();
    this.loadAlerts();
  }

  loadMetrics() {
    try {
      if (fs.existsSync(this.metricsPath)) {
        this.metrics = JSON.parse(fs.readFileSync(this.metricsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load build metrics:', error.message);
      this.metrics = { builds: [], performance: {}, errors: {}, trends: {} };
    }
  }

  saveMetrics() {
    const metricsDir = path.dirname(this.metricsPath);
    if (!fs.existsSync(metricsDir)) {
      fs.mkdirSync(metricsDir, { recursive: true });
    }

    try {
      fs.writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2));
    } catch (error) {
      console.warn('Could not save build metrics:', error.message);
    }
  }

  loadAlerts() {
    try {
      if (fs.existsSync(this.alertsPath)) {
        this.alerts = JSON.parse(fs.readFileSync(this.alertsPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not load alerts:', error.message);
      this.alerts = [];
    }
  }

  saveAlerts() {
    const alertsDir = path.dirname(this.alertsPath);
    if (!fs.existsSync(alertsDir)) {
      fs.mkdirSync(alertsDir, { recursive: true });
    }

    try {
      fs.writeFileSync(this.alertsPath, JSON.stringify(this.alerts, null, 2));
    } catch (error) {
      console.warn('Could not save alerts:', error.message);
    }
  }

  async recordBuildSuccess(platform, environment, buildTime = null, apkSize = null) {
    const buildRecord = {
      id: this.generateBuildId(),
      timestamp: new Date().toISOString(),
      platform,
      environment,
      status: 'success',
      buildTime,
      apkSize,
      duration: buildTime
    };

    this.metrics.builds.push(buildRecord);
    this.updatePerformanceMetrics(buildRecord);
    this.checkForAlerts(buildRecord);
    this.saveMetrics();

    console.log(`✅ Build success recorded: ${platform} ${environment}`);
  }

  async recordBuildFailure(platform, environment, error, buildTime = null) {
    const buildRecord = {
      id: this.generateBuildId(),
      timestamp: new Date().toISOString(),
      platform,
      environment,
      status: 'failure',
      error,
      buildTime,
      duration: buildTime
    };

    this.metrics.builds.push(buildRecord);
    this.updateErrorMetrics(buildRecord);
    this.checkForAlerts(buildRecord);
    this.saveMetrics();

    console.log(`❌ Build failure recorded: ${platform} ${environment} - ${error}`);
  }

  updatePerformanceMetrics(buildRecord) {
    const key = `${buildRecord.platform}_${buildRecord.environment}`;
    
    if (!this.metrics.performance[key]) {
      this.metrics.performance[key] = {
        totalBuilds: 0,
        successfulBuilds: 0,
        averageBuildTime: 0,
        buildTimes: []
      };
    }

    const perf = this.metrics.performance[key];
    perf.totalBuilds++;
    
    if (buildRecord.status === 'success') {
      perf.successfulBuilds++;
    }

    if (buildRecord.buildTime) {
      perf.buildTimes.push(buildRecord.buildTime);
      // Keep only last 10 build times for average calculation
      if (perf.buildTimes.length > 10) {
        perf.buildTimes = perf.buildTimes.slice(-10);
      }
      perf.averageBuildTime = perf.buildTimes.reduce((a, b) => a + b, 0) / perf.buildTimes.length;
    }

    perf.successRate = (perf.successfulBuilds / perf.totalBuilds * 100).toFixed(1);
  }

  updateErrorMetrics(buildRecord) {
    const errorKey = this.categorizeError(buildRecord.error);
    
    if (!this.metrics.errors[errorKey]) {
      this.metrics.errors[errorKey] = {
        count: 0,
        lastOccurrence: null,
        examples: []
      };
    }

    this.metrics.errors[errorKey].count++;
    this.metrics.errors[errorKey].lastOccurrence = buildRecord.timestamp;
    
    // Keep last 3 examples
    this.metrics.errors[errorKey].examples.push({
      timestamp: buildRecord.timestamp,
      platform: buildRecord.platform,
      environment: buildRecord.environment,
      error: buildRecord.error
    });
    
    if (this.metrics.errors[errorKey].examples.length > 3) {
      this.metrics.errors[errorKey].examples = this.metrics.errors[errorKey].examples.slice(-3);
    }
  }

  categorizeError(errorMessage) {
    const errorMessage_lower = errorMessage.toLowerCase();
    
    if (errorMessage_lower.includes('signature') || errorMessage_lower.includes('install_failed_update_incompatible')) {
      return 'signature_conflicts';
    } else if (errorMessage_lower.includes('memory') || errorMessage_lower.includes('heap')) {
      return 'memory_issues';
    } else if (errorMessage_lower.includes('gradle') || errorMessage_lower.includes('build')) {
      return 'build_failures';
    } else if (errorMessage_lower.includes('dependency') || errorMessage_lower.includes('module')) {
      return 'dependency_issues';
    } else if (errorMessage_lower.includes('sdk') || errorMessage_lower.includes('android_home')) {
      return 'environment_issues';
    } else {
      return 'other_errors';
    }
  }

  checkForAlerts(buildRecord) {
    // Check for consecutive failures
    const recentBuilds = this.metrics.builds.slice(-5);
    const recentFailures = recentBuilds.filter(b => b.status === 'failure').length;
    
    if (recentFailures >= 3) {
      this.createAlert('high_failure_rate', `${recentFailures} failures in last 5 builds`, 'high');
    }

    // Check for build time degradation
    if (buildRecord.buildTime && buildRecord.status === 'success') {
      const key = `${buildRecord.platform}_${buildRecord.environment}`;
      const perf = this.metrics.performance[key];
      
      if (perf && perf.averageBuildTime > 0 && buildRecord.buildTime > perf.averageBuildTime * 1.5) {
        this.createAlert('slow_build', `Build time ${buildRecord.buildTime}s is 50% slower than average ${perf.averageBuildTime.toFixed(1)}s`, 'medium');
      }
    }

    // Check for recurring errors
    const errorKey = this.categorizeError(buildRecord.error || '');
    if (this.metrics.errors[errorKey] && this.metrics.errors[errorKey].count >= 3) {
      this.createAlert('recurring_error', `Error "${errorKey}" has occurred ${this.metrics.errors[errorKey].count} times`, 'medium');
    }
  }

  createAlert(type, message, severity) {
    const alert = {
      id: this.generateAlertId(),
      timestamp: new Date().toISOString(),
      type,
      message,
      severity,
      resolved: false
    };

    // Avoid duplicate alerts
    const existingAlert = this.alerts.find(a => 
      a.type === type && a.message === message && !a.resolved
    );

    if (!existingAlert) {
      this.alerts.push(alert);
      this.saveAlerts();
      console.log(`🚨 Alert created: ${severity.toUpperCase()} - ${message}`);
    }
  }

  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      this.saveAlerts();
      console.log(`✅ Alert resolved: ${alert.message}`);
    }
  }

  async generateReport() {
    console.log('📊 Generating comprehensive build health report...');
    
    const report = {
      summary: this.generateSummary(),
      performance: this.generatePerformanceReport(),
      errors: this.generateErrorReport(),
      trends: this.generateTrendsReport(),
      alerts: this.generateAlertsReport(),
      recommendations: this.generateRecommendations()
    };

    // Save report to file
    const reportPath = path.join(process.cwd(), '.kiro', 'build-manager', 'health-report.json');
    const reportDir = path.dirname(reportPath);
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    return report;
  }

  generateSummary() {
    const totalBuilds = this.metrics.builds.length;
    const successfulBuilds = this.metrics.builds.filter(b => b.status === 'success').length;
    const failedBuilds = totalBuilds - successfulBuilds;
    const successRate = totalBuilds > 0 ? (successfulBuilds / totalBuilds * 100).toFixed(1) : 0;

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentBuilds = this.metrics.builds.filter(b => new Date(b.timestamp) > last24Hours);

    return {
      totalBuilds,
      successfulBuilds,
      failedBuilds,
      successRate: `${successRate}%`,
      buildsLast24Hours: recentBuilds.length,
      lastBuildTime: totalBuilds > 0 ? this.metrics.builds[totalBuilds - 1].timestamp : null
    };
  }

  generatePerformanceReport() {
    const performanceData = {};
    
    for (const [key, perf] of Object.entries(this.metrics.performance)) {
      performanceData[key] = {
        totalBuilds: perf.totalBuilds,
        successRate: `${perf.successRate}%`,
        averageBuildTime: perf.averageBuildTime ? `${perf.averageBuildTime.toFixed(1)}s` : 'N/A',
        trend: this.calculateBuildTimeTrend(perf.buildTimes)
      };
    }

    return performanceData;
  }

  generateErrorReport() {
    const errorData = {};
    
    for (const [errorType, errorInfo] of Object.entries(this.metrics.errors)) {
      errorData[errorType] = {
        occurrences: errorInfo.count,
        lastSeen: errorInfo.lastOccurrence,
        frequency: this.calculateErrorFrequency(errorInfo),
        recentExamples: errorInfo.examples.slice(-2)
      };
    }

    return errorData;
  }

  generateTrendsReport() {
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const builds7Days = this.metrics.builds.filter(b => new Date(b.timestamp) > last7Days);
    const builds30Days = this.metrics.builds.filter(b => new Date(b.timestamp) > last30Days);

    return {
      last7Days: {
        totalBuilds: builds7Days.length,
        successRate: this.calculateSuccessRate(builds7Days),
        averageBuildsPerDay: (builds7Days.length / 7).toFixed(1)
      },
      last30Days: {
        totalBuilds: builds30Days.length,
        successRate: this.calculateSuccessRate(builds30Days),
        averageBuildsPerDay: (builds30Days.length / 30).toFixed(1)
      }
    };
  }

  generateAlertsReport() {
    const activeAlerts = this.alerts.filter(a => !a.resolved);
    const resolvedAlerts = this.alerts.filter(a => a.resolved);

    return {
      active: activeAlerts.length,
      resolved: resolvedAlerts.length,
      highSeverity: activeAlerts.filter(a => a.severity === 'high').length,
      mediumSeverity: activeAlerts.filter(a => a.severity === 'medium').length,
      recentAlerts: activeAlerts.slice(-5)
    };
  }

  generateRecommendations() {
    const recommendations = [];

    // Performance recommendations
    const avgBuildTimes = Object.values(this.metrics.performance)
      .map(p => p.averageBuildTime)
      .filter(t => t > 0);
    
    if (avgBuildTimes.length > 0) {
      const maxBuildTime = Math.max(...avgBuildTimes);
      if (maxBuildTime > 300) { // 5 minutes
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: 'Build times are high. Consider optimizing Gradle configuration or increasing build machine resources.'
        });
      }
    }

    // Error pattern recommendations
    const topErrors = Object.entries(this.metrics.errors)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 3);

    topErrors.forEach(([errorType, errorInfo]) => {
      if (errorInfo.count >= 3) {
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          message: `Recurring ${errorType.replace('_', ' ')} errors detected. Consider implementing automated resolution.`
        });
      }
    });

    // Success rate recommendations
    const overallSuccessRate = this.calculateSuccessRate(this.metrics.builds);
    if (overallSuccessRate < 80) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: `Build success rate is ${overallSuccessRate.toFixed(1)}%. Focus on resolving common build failures.`
      });
    }

    return recommendations;
  }

  calculateBuildTimeTrend(buildTimes) {
    if (buildTimes.length < 3) return 'insufficient_data';
    
    const recent = buildTimes.slice(-3);
    const older = buildTimes.slice(0, -3);
    
    if (older.length === 0) return 'insufficient_data';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  calculateErrorFrequency(errorInfo) {
    if (!errorInfo.lastOccurrence) return 'unknown';
    
    const daysSinceLastError = (Date.now() - new Date(errorInfo.lastOccurrence).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLastError < 1) return 'daily';
    if (daysSinceLastError < 7) return 'weekly';
    if (daysSinceLastError < 30) return 'monthly';
    return 'rare';
  }

  calculateSuccessRate(builds) {
    if (builds.length === 0) return 0;
    const successful = builds.filter(b => b.status === 'success').length;
    return (successful / builds.length) * 100;
  }

  generateBuildId() {
    return `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods for external monitoring
  getHealthScore() {
    const successRate = this.calculateSuccessRate(this.metrics.builds);
    const activeAlerts = this.alerts.filter(a => !a.resolved).length;
    const highSeverityAlerts = this.alerts.filter(a => !a.resolved && a.severity === 'high').length;
    
    let score = successRate;
    score -= (activeAlerts * 5); // Reduce score for each active alert
    score -= (highSeverityAlerts * 10); // Reduce more for high severity alerts
    
    return Math.max(0, Math.min(100, score));
  }

  getRecentBuildStatus() {
    if (this.metrics.builds.length === 0) return 'no_builds';
    
    const lastBuild = this.metrics.builds[this.metrics.builds.length - 1];
    return lastBuild.status;
  }
}

module.exports = BuildHealthMonitor;