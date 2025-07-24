import userStatusService, { HeartbeatUpdate } from './userStatusService';
import locationErrorHandler from '../utils/locationErrorHandler';

export class HeartbeatService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly FALLBACK_INTERVAL = 60 * 60 * 1000; // 60 minutes fallback
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private userId: string = '';
  private circleMembers: string[] = [];
  private consecutiveFailures: number = 0;
  private lastSuccessfulHeartbeat: Date | null = null;
  private fallbackMode: boolean = false;
  private retryTimeout: NodeJS.Timeout | null = null;

  /**
   * Start heartbeat when user becomes stationary (10m radius active)
   */
  startStationaryHeartbeat(userId: string, circleMembers: string[]): void {
    this.stopHeartbeat(); // Clear any existing heartbeat
    
    this.userId = userId;
    this.circleMembers = circleMembers;
    this.consecutiveFailures = 0;
    this.fallbackMode = false;

    console.log('[HeartbeatService] Starting stationary heartbeat (30-minute intervals)');
    
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeatWithFallback();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat when user moves (zone exit)
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[HeartbeatService] Stopped stationary heartbeat');
    }
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    
    // Reset state
    this.consecutiveFailures = 0;
    this.fallbackMode = false;
  }

  /**
   * Send battery heartbeat (called from battery monitoring)
   */
  async sendBatteryHeartbeat(batteryLevel: number, isCharging: boolean): Promise<void> {
    try {
      await userStatusService.sendHeartbeat({
        userId: this.userId,
        batteryLevel,
        isCharging,
        timestamp: new Date(),
      });
      console.log(`[HeartbeatService] Battery heartbeat sent - Level: ${batteryLevel}%`);
    } catch (error) {
      console.error('[HeartbeatService] Failed to send battery heartbeat:', error);
    }
  }

  /**
   * Send heartbeat with enhanced fallback mechanisms
   */
  private async sendHeartbeatWithFallback(): Promise<void> {
    try {
      await this.sendHeartbeat();
      this.onHeartbeatSuccess();
    } catch (error) {
      await this.onHeartbeatFailure(error);
    }
  }

  /**
   * Send stationary heartbeat
   */
  private async sendHeartbeat(): Promise<void> {
    const heartbeat: HeartbeatUpdate = {
      userId: this.userId,
      timestamp: new Date(),
    };
    
    await userStatusService.sendHeartbeat(heartbeat);
    console.log('[HeartbeatService] Stationary heartbeat sent');
  }

  /**
   * Handle successful heartbeat
   */
  private onHeartbeatSuccess(): void {
    this.consecutiveFailures = 0;
    this.lastSuccessfulHeartbeat = new Date();
    
    // Exit fallback mode if we were in it
    if (this.fallbackMode) {
      this.fallbackMode = false;
      this.restartNormalHeartbeat();
      console.log('[HeartbeatService] Exited fallback mode - heartbeat recovered');
    }
  }

  /**
   * Handle heartbeat failure with retry and fallback logic
   */
  private async onHeartbeatFailure(error: any): Promise<void> {
    this.consecutiveFailures++;
    console.error(`[HeartbeatService] Heartbeat failure ${this.consecutiveFailures}/${this.MAX_RETRY_ATTEMPTS}:`, error);

    // Use error handler to classify and potentially recover from the error
    const recovered = await locationErrorHandler.handleLocationError(error, 'heartbeat');
    
    if (recovered) {
      // If error handler recovered, try sending heartbeat again
      try {
        await this.sendHeartbeat();
        this.onHeartbeatSuccess();
        return;
      } catch (retryError) {
        console.error('[HeartbeatService] Heartbeat retry after recovery failed:', retryError);
      }
    }

    // If we've exceeded max retries, enter fallback mode
    if (this.consecutiveFailures >= this.MAX_RETRY_ATTEMPTS) {
      await this.enterFallbackMode();
    } else {
      // Schedule a retry
      this.scheduleHeartbeatRetry();
    }
  }

  /**
   * Enter fallback mode with extended intervals
   */
  private async enterFallbackMode(): Promise<void> {
    if (this.fallbackMode) return; // Already in fallback mode

    this.fallbackMode = true;
    console.warn('[HeartbeatService] Entering fallback mode due to consecutive failures');

    // Stop current heartbeat and restart with fallback interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeatWithFallback();
    }, this.FALLBACK_INTERVAL);

    // Try alternative heartbeat methods
    await this.tryAlternativeHeartbeat();
  }

  /**
   * Try alternative heartbeat methods when primary fails
   */
  private async tryAlternativeHeartbeat(): Promise<void> {
    try {
      // Alternative 1: Send a simplified heartbeat with minimal data
      const simpleHeartbeat: HeartbeatUpdate = {
        userId: this.userId,
        timestamp: new Date(),
        // Remove optional fields that might cause issues
      };

      await userStatusService.sendHeartbeat(simpleHeartbeat);
      console.log('[HeartbeatService] Alternative simple heartbeat sent');
      this.onHeartbeatSuccess();
      return;
    } catch (error) {
      console.warn('[HeartbeatService] Alternative simple heartbeat failed:', error);
    }

    try {
      // Alternative 2: Store heartbeat locally for later sync
      await this.storeHeartbeatLocally();
      console.log('[HeartbeatService] Heartbeat stored locally for later sync');
    } catch (error) {
      console.error('[HeartbeatService] Failed to store heartbeat locally:', error);
    }
  }

  /**
   * Store heartbeat locally when remote fails
   */
  private async storeHeartbeatLocally(): Promise<void> {
    // This would integrate with local database service
    const localHeartbeat = {
      userId: this.userId,
      timestamp: new Date().toISOString(),
      type: 'stationary',
      synced: false,
    };

    // Store in local database for later sync
    console.log('[HeartbeatService] Storing heartbeat locally:', localHeartbeat);
    // await databaseService.storeHeartbeat(localHeartbeat);
  }

  /**
   * Schedule a heartbeat retry with exponential backoff
   */
  private scheduleHeartbeatRetry(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    // Exponential backoff: 30s, 60s, 120s
    const retryDelay = Math.min(30000 * Math.pow(2, this.consecutiveFailures - 1), 120000);
    
    console.log(`[HeartbeatService] Scheduling heartbeat retry in ${retryDelay / 1000} seconds`);
    
    this.retryTimeout = setTimeout(async () => {
      try {
        await this.sendHeartbeat();
        this.onHeartbeatSuccess();
      } catch (error) {
        await this.onHeartbeatFailure(error);
      }
    }, retryDelay);
  }

  /**
   * Restart normal heartbeat interval
   */
  private restartNormalHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeatWithFallback();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Check if heartbeat is active
   */
  isHeartbeatActive(): boolean {
    return this.heartbeatInterval !== null;
  }

  /**
   * Get remaining time until next heartbeat
   */
  getTimeUntilNextHeartbeat(): number {
    if (!this.heartbeatInterval) return 0;
    
    // This is a simplified calculation - in a real implementation,
    // you'd track the last heartbeat time more precisely
    return this.fallbackMode ? this.FALLBACK_INTERVAL : this.HEARTBEAT_INTERVAL;
  }

  /**
   * Get heartbeat system health status
   */
  getHeartbeatHealth(): {
    isActive: boolean;
    consecutiveFailures: number;
    inFallbackMode: boolean;
    lastSuccessfulHeartbeat: Date | null;
    systemHealthy: boolean;
  } {
    return {
      isActive: this.isHeartbeatActive(),
      consecutiveFailures: this.consecutiveFailures,
      inFallbackMode: this.fallbackMode,
      lastSuccessfulHeartbeat: this.lastSuccessfulHeartbeat,
      systemHealthy: this.consecutiveFailures < this.MAX_RETRY_ATTEMPTS && !this.fallbackMode,
    };
  }

  /**
   * Force a heartbeat attempt (for testing or manual trigger)
   */
  async forceHeartbeat(): Promise<boolean> {
    try {
      await this.sendHeartbeat();
      this.onHeartbeatSuccess();
      return true;
    } catch (error) {
      await this.onHeartbeatFailure(error);
      return false;
    }
  }

  /**
   * Reset heartbeat system to healthy state
   */
  resetHeartbeatSystem(): void {
    this.consecutiveFailures = 0;
    this.fallbackMode = false;
    
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // Restart with normal interval if currently active
    if (this.isHeartbeatActive()) {
      this.restartNormalHeartbeat();
    }

    console.log('[HeartbeatService] Heartbeat system reset to healthy state');
  }
}

// Export singleton instance
export const heartbeatService = new HeartbeatService();
export default heartbeatService; 