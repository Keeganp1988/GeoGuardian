import { LocationData } from '../firebase/services';
import databaseService, { TripHistory, TripWaypoint } from './databaseService';
// locationIntelligenceService functionality now integrated into consolidatedLocationService
import { calculateDistance, determineMovementType } from '../firebase/services';
import userStatusService, { TripEvent } from './userStatusService';

export interface TripState {
  isActive: boolean;
  tripId: string;
  startTime: Date;
  startLocation: LocationData;
  currentLocation: LocationData | null;
  totalDistance: number;
  waypoints: TripWaypoint[];
  maxSpeed: number;
  averageSpeed: number;
  movementType: string;
  lastUpdateTime: Date;
}

export interface TripSummary {
  tripId: string;
  startTime: Date;
  endTime: Date;
  startLocation: LocationData;
  endLocation: LocationData;
  totalDistance: number;
  averageSpeed: number;
  maxSpeed: number;
  duration: number;
  movementType: string;
  waypointCount: number;
}

class TripManagementService {
  private currentTrip: TripState | null = null;
  private userId: string = '';
  private isInitialized = false;
  private tripEndThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
  private lastMovementTime: Date | null = null;

  // Initialize the service
  async initialize(userId: string): Promise<void> {
    this.userId = userId;
    await databaseService.initialize();
    
    // Check for any active trips on startup
    const activeTrip = await databaseService.getActiveTrip(userId);
    if (activeTrip) {
      this.currentTrip = {
        isActive: true,
        tripId: activeTrip.trip_id,
        startTime: activeTrip.start_time,
        startLocation: {
          userId: activeTrip.user_id,
          latitude: activeTrip.start_latitude,
          longitude: activeTrip.start_longitude,
          timestamp: activeTrip.start_time,
          circleMembers: []
        },
        currentLocation: null,
        totalDistance: activeTrip.total_distance,
        waypoints: [],
        maxSpeed: activeTrip.max_speed,
        averageSpeed: activeTrip.average_speed,
        movementType: activeTrip.movement_type,
        lastUpdateTime: activeTrip.start_time
      };
      
      // Load waypoints for active trip
      this.currentTrip.waypoints = await databaseService.getTripWaypoints(activeTrip.trip_id);
    }
    
    this.isInitialized = true;
    console.log('Trip management service initialized');
  }

  // Process location update and handle trip logic
  async processLocationUpdate(location: LocationData, isStationary: boolean = false): Promise<{
    tripStarted: boolean;
    tripEnded: boolean;
    tripUpdated: boolean;
    currentTrip: TripState | null;
  }> {
    if (!this.isInitialized) return { tripStarted: false, tripEnded: false, tripUpdated: false, currentTrip: null };
    
    let tripStarted = false;
    let tripEnded = false;
    let tripUpdated = false;

    // Check if we should start a new trip
    if (!this.currentTrip?.isActive && !isStationary && this.shouldStartTrip(location)) {
      await this.startTrip(location);
      tripStarted = true;
    }

    // Update current trip if active
    if (this.currentTrip?.isActive) {
      await this.updateTrip(location);
      tripUpdated = true;
      
      // Check if trip should end
      if (isStationary && this.shouldEndTrip()) {
        await this.endTrip(location);
        tripEnded = true;
      }
    }

    // Update last movement time
    if (!isStationary) {
      this.lastMovementTime = new Date();
    }

    return {
      tripStarted,
      tripEnded,
      tripUpdated,
      currentTrip: this.currentTrip
    };
  }

  // Determine if a new trip should start
  private shouldStartTrip(location: LocationData): boolean {
    // Start trip if:
    // 1. User has moved significantly from last known location
    // 2. Movement type indicates active travel
    // 3. Speed is above walking threshold
    
    const speed = location.speed || 0;
    const movementType = determineMovementType(speed);
    
    return speed > 0.5 && movementType !== 'stationary';
  }

  // Start a new trip
  private async startTrip(location: LocationData): Promise<void> {
    const tripId = `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentTrip = {
      isActive: true,
      tripId,
      startTime: new Date(),
      startLocation: location,
      currentLocation: location,
      totalDistance: 0,
      waypoints: [],
      maxSpeed: location.speed || 0,
      averageSpeed: location.speed || 0,
      movementType: determineMovementType(location.speed || 0),
      lastUpdateTime: new Date()
    };

    // Save trip to database
    await databaseService.saveTrip({
      user_id: this.userId,
      trip_id: tripId,
      start_time: this.currentTrip.startTime,
      start_latitude: location.latitude,
      start_longitude: location.longitude,
      total_distance: 0,
      average_speed: location.speed || 0,
      max_speed: location.speed || 0,
      duration: 0,
      movement_type: this.currentTrip.movementType,
      is_active: true,
      is_synced: false
    });

    // Add first waypoint
    await this.addWaypoint(location, 0);

    // Notify userStatusService of trip start
    await userStatusService.handleTripEvent({
      userId: this.userId,
      event: 'start',
      location: {
        userId: this.userId,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        accuracy: location.accuracy,
        speed: location.speed,
        batteryLevel: location.batteryLevel,
        isCharging: location.isCharging,
        movementType: determineMovementType(location.speed || 0),
        timestamp: location.timestamp,
        circleMembers: location.circleMembers,
      },
      tripId,
    });

    console.log(`Trip started: ${tripId} at ${location.latitude}, ${location.longitude}`);
  }

  // Update current trip with new location
  private async updateTrip(location: LocationData): Promise<void> {
    if (!this.currentTrip) return;

    const previousLocation = this.currentTrip.currentLocation;
    this.currentTrip.currentLocation = location;

    // Calculate distance from previous location
    if (previousLocation) {
      const distance = calculateDistance(
        previousLocation.latitude,
        previousLocation.longitude,
        location.latitude,
        location.longitude
      );
      this.currentTrip.totalDistance += distance;
    }

    // Update speed statistics
    const currentSpeed = location.speed || 0;
    this.currentTrip.maxSpeed = Math.max(this.currentTrip.maxSpeed, currentSpeed);
    
    // Update average speed
    const tripDuration = Date.now() - this.currentTrip.startTime.getTime();
    this.currentTrip.averageSpeed = (this.currentTrip.totalDistance / (tripDuration / 1000)) || 0;

    // Add waypoint
    await this.addWaypoint(location, this.currentTrip.waypoints.length);

    // Notify userStatusService of trip update
    await userStatusService.handleTripEvent({
      userId: this.userId,
      event: 'update',
      location: {
        userId: this.userId,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        accuracy: location.accuracy,
        speed: location.speed,
        batteryLevel: location.batteryLevel,
        isCharging: location.isCharging,
        movementType: determineMovementType(location.speed || 0),
        timestamp: location.timestamp,
        circleMembers: location.circleMembers,
      },
      tripId: this.currentTrip.tripId,
    });
  }

  // Add waypoint to current trip
  private async addWaypoint(location: LocationData, sequenceOrder: number): Promise<void> {
    if (!this.currentTrip) return;

    const waypoint: Omit<TripWaypoint, 'id' | 'created_at'> = {
      trip_id: this.currentTrip.tripId,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: location.timestamp,
      speed: location.speed,
      accuracy: location.accuracy,
      sequence_order: sequenceOrder
    };

    const waypointId = await databaseService.saveWaypoint(waypoint);
    
    // Add to current trip state
    this.currentTrip.waypoints.push({
      ...waypoint,
      id: waypointId,
      created_at: new Date()
    });
  }

  // Determine if trip should end
  private shouldEndTrip(): boolean {
    if (!this.lastMovementTime) return false;
    
    const timeSinceLastMovement = Date.now() - this.lastMovementTime.getTime();
    return timeSinceLastMovement >= this.tripEndThreshold;
  }

  // End trip
  private async endTrip(endLocation: LocationData): Promise<void> {
    if (!this.currentTrip) return;
    this.currentTrip.isActive = false;

    const endTime = new Date();
    const tripDuration = (endTime.getTime() - this.currentTrip.startTime.getTime()) / 1000;

    // Update trip in database
    await databaseService.updateTrip(this.currentTrip.tripId, {
      end_time: endTime,
      end_latitude: endLocation.latitude,
      end_longitude: endLocation.longitude,
      total_distance: this.currentTrip.totalDistance,
      average_speed: this.currentTrip.averageSpeed,
      max_speed: this.currentTrip.maxSpeed,
      duration: tripDuration,
      movement_type: this.currentTrip.movementType,
      is_active: false,
      is_synced: false
    });

    // Notify userStatusService of trip end
    await userStatusService.handleTripEvent({
      userId: this.userId,
      event: 'end',
      location: {
        userId: this.userId,
        latitude: endLocation.latitude,
        longitude: endLocation.longitude,
        address: endLocation.address,
        accuracy: endLocation.accuracy,
        speed: endLocation.speed,
        batteryLevel: endLocation.batteryLevel,
        isCharging: endLocation.isCharging,
        movementType: determineMovementType(endLocation.speed || 0),
        timestamp: endLocation.timestamp,
        circleMembers: endLocation.circleMembers,
      },
      tripId: this.currentTrip.tripId,
    });
  }

  // Get current trip state
  getCurrentTrip(): TripState | null {
    return this.currentTrip;
  }

  // Get trip summary
  async getTripSummary(tripId: string): Promise<TripSummary | null> {
    const trip = await databaseService.getActiveTrip(this.userId);
    if (!trip || trip.trip_id !== tripId) return null;

    const waypoints = await databaseService.getTripWaypoints(tripId);
    
    return {
      tripId: trip.trip_id,
      startTime: trip.start_time,
      endTime: trip.end_time || new Date(),
      startLocation: {
        userId: trip.user_id,
        latitude: trip.start_latitude,
        longitude: trip.start_longitude,
        timestamp: trip.start_time,
        circleMembers: []
      },
      endLocation: {
        userId: trip.user_id,
        latitude: trip.end_latitude || trip.start_latitude,
        longitude: trip.end_longitude || trip.start_longitude,
        timestamp: trip.end_time || new Date(),
        circleMembers: []
      },
      totalDistance: trip.total_distance,
      averageSpeed: trip.average_speed,
      maxSpeed: trip.max_speed,
      duration: trip.duration,
      movementType: trip.movement_type,
      waypointCount: waypoints.length
    };
  }

  // Get recent trips
  async getRecentTrips(limit: number = 10): Promise<TripSummary[]> {
    // This would need to be implemented in databaseService
    // For now, return empty array
    return [];
  }

  // Force end current trip
  async forceEndTrip(): Promise<void> {
    if (this.currentTrip?.isActive) {
      await this.endTrip(this.currentTrip.currentLocation || this.currentTrip.startLocation);
    }
  }

  // Get trip statistics
  getTripStatistics(): {
    isActive: boolean;
    duration: number;
    distance: number;
    averageSpeed: number;
    maxSpeed: number;
    waypointCount: number;
  } | null {
    if (!this.currentTrip?.isActive) return null;

    const duration = Date.now() - this.currentTrip.startTime.getTime();
    
    return {
      isActive: true,
      duration: Math.floor(duration / 1000),
      distance: this.currentTrip.totalDistance,
      averageSpeed: this.currentTrip.averageSpeed,
      maxSpeed: this.currentTrip.maxSpeed,
      waypointCount: this.currentTrip.waypoints.length
    };
  }

  // Cleanup old trips
  async cleanupOldTrips(daysToKeep: number = 30): Promise<void> {
    // This would need to be implemented in databaseService
    console.log(`Cleaning up trips older than ${daysToKeep} days`);
  }
}

// Export singleton instance
export const tripManagementService = new TripManagementService();
export default tripManagementService; 