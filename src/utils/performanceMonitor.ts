/**
 * Performance monitoring utility for tracking app startup and performance metrics
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private appStartTime: number = Date.now();

  startTimer(name: string): void {
    if (!__DEV__) return; // Only track in development
    
    this.metrics.set(name, {
      name,
      startTime: Date.now(),
    });
  }

  endTimer(name: string): number | null {
    if (!__DEV__) return null; // Only track in development
    
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance timer '${name}' was not started`);
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - metric.startTime;
    
    metric.endTime = endTime;
    metric.duration = duration;

    console.log(`⏱️ Performance: ${name} took ${duration}ms`);
    return duration;
  }

  getAppStartupTime(): number {
    return Date.now() - this.appStartTime;
  }

  logStartupComplete(): void {
    if (!__DEV__) return;
    
    const totalTime = this.getAppStartupTime();
    console.log(`🚀 App startup completed in ${totalTime}ms`);
    
    // Log all metrics
    (this.metrics ?? []).forEach((metric) => {
      if (metric.duration) {
        console.log(`📊 ${metric.name}: ${metric.duration}ms`);
      }
    });
  }

  reset(): void {
    this.metrics.clear();
    this.appStartTime = Date.now();
  }
}

export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;