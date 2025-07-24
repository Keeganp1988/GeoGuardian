import databaseService from './databaseService';
import { updateUserLocation } from '../firebase/services';
// Centralized service for all Firestore and local DB updates related to user status, location, heartbeat, battery, and trip events.

export type MovementType = 'stationary' | 'walking' | 'running' | 'driving' | 'unknown';

export interface UserStatusUpdate {
  userId: string;
  latitude: number;
  longitude: number;
  address?: string;
  accuracy?: number;
  speed?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  movementType: MovementType;
  timestamp: Date;
  circleMembers: string[];
}

export interface HeartbeatUpdate {
  userId: string;
  batteryLevel?: number;
  isCharging?: boolean;
  timestamp: Date;
}

export interface BatteryUpdate {
  userId: string;
  batteryLevel: number;
  isCharging: boolean;
  timestamp: Date;
}

export interface TripEvent {
  userId: string;
  event: 'start' | 'end' | 'update';
  location: UserStatusUpdate;
  tripId?: string;
}

class UserStatusService {
  // Location update (optimized - now handled by consolidated location service)
  async updateLocation(update: UserStatusUpdate): Promise<void> {
    // Location updates are now handled by the consolidated location service
    // This method is kept for backward compatibility but delegates to the main service
    console.log('Location update delegated to consolidated location service');
  }

  // Heartbeat update (optimized - maintains online status)
  async sendHeartbeat(update: HeartbeatUpdate): Promise<void> {
    try {
      // 1. Get the last known location from local DB
      const lastLocation = await databaseService.getLatestLocation(update.userId);
      if (!lastLocation) {
        console.warn('Cannot send heartbeat without a known location');
        return;
      }

      // 2. Prepare optimized heartbeat payload (only essential data)
      const heartbeatPayload = {
        userId: update.userId,
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        address: lastLocation.address,
        accuracy: lastLocation.accuracy,
        speed: lastLocation.speed,
        batteryLevel: update.batteryLevel ?? lastLocation.battery_level,
        isCharging: update.isCharging ?? lastLocation.is_charging,
        timestamp: update.timestamp,
        circleMembers: [], // Empty array for heartbeat updates
      };

      // 3. Update Firestore with heartbeat (maintains online status)
      await updateUserLocation(heartbeatPayload, 'heartbeat');
      console.log('Heartbeat sent successfully');
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  // Battery update (optimized - now handled by consolidated location service)
  async updateBattery(update: BatteryUpdate): Promise<void> {
    // Battery updates are now handled by the consolidated location service
    // This method is kept for backward compatibility
    console.log(`Battery status update delegated: ${update.batteryLevel}% (charging: ${update.isCharging})`);
  }

  // Trip events (start, end, update)
  async handleTripEvent(event: TripEvent): Promise<void> {
    // 1. Prepare trip event payload
    const tripPayload = {
      userId: event.userId,
      tripId: event.tripId,
      event: event.event,
      location: event.location,
      timestamp: event.location.timestamp,
    };

    // 2. Store trip event in Firestore trip summaries collection (for 'end' event)
    if (event.event === 'end') {
      // Example: store trip summary (replace with your Firestore logic)
      // await addDoc(collection(/* your Firestore db */, 'tripSummaries'), tripPayload);
    }
    // 3. Optionally, update local DB with trip event if needed
  }

  // Sync unsynced data when online
  async syncPendingUpdates(): Promise<void> {
    // 1. Sync unsynced locations
    // (Assume userId is available in context or passed as needed)
    // You may want to batch this for efficiency
    // const unsyncedLocations = await databaseService.getUnsyncedLocations(userId);
    // for (const loc of unsyncedLocations) {
    //   await updateUserLocation({ ... }, []);
    //   // Mark as synced
    // }
    // 2. Sync unsynced trips, waypoints, etc. (similar logic)
    // 3. Mark all as synced in local DB after successful upload
  }
}

const userStatusService = new UserStatusService();
export default userStatusService; 