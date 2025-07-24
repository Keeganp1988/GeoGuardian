import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

// Database types
export interface LocationCache {
  id?: number;
  user_id: string;
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date;
  arrival_timestamp?: Date;
  heartbeat_timestamp?: Date;
  accuracy?: number;
  speed?: number;
  battery_level?: number;
  is_charging?: boolean;
  movement_type?: string;
  zone_center_lat?: number;
  zone_center_lng?: number;
  zone_entry_time?: Date;
  zone_radius?: number;
  is_stationary?: boolean;
  is_synced: boolean;
  created_at?: Date;
  locationServicesEnabled?: boolean; // NEW FIELD
}

export interface TripHistory {
  id?: number;
  user_id: string;
  trip_id: string;
  start_time: Date;
  end_time?: Date;
  start_latitude: number;
  start_longitude: number;
  end_latitude?: number;
  end_longitude?: number;
  total_distance: number;
  average_speed: number;
  max_speed: number;
  duration: number;
  movement_type: string;
  is_active: boolean;
  is_synced: boolean;
  created_at?: Date;
}

export interface TripWaypoint {
  id?: number;
  trip_id: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed?: number;
  accuracy?: number;
  sequence_order: number;
  created_at?: Date;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at?: Date;
}

// Database row types for type safety
interface LocationCacheRow {
  id: number;
  user_id: string;
  latitude: number;
  longitude: number;
  address: string | null;
  timestamp: string;
  arrival_timestamp: string | null;
  heartbeat_timestamp: string | null;
  accuracy: number | null;
  speed: number | null;
  battery_level: number | null;
  is_charging: boolean;
  movement_type: string | null;
  zone_center_lat: number | null;
  zone_center_lng: number | null;
  zone_entry_time: string | null;
  zone_radius: number | null;
  is_stationary: boolean;
  is_synced: boolean;
  created_at: string | null;
  location_services_enabled: number; // NEW FIELD
}

interface TripHistoryRow {
  id: number;
  user_id: string;
  trip_id: string;
  start_time: string;
  end_time: string | null;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number | null;
  end_longitude: number | null;
  total_distance: number;
  average_speed: number;
  max_speed: number;
  duration: number;
  movement_type: string;
  is_active: boolean;
  is_synced: boolean;
  created_at: string | null;
}

interface TripWaypointRow {
  id: number;
  trip_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  accuracy: number | null;
  sequence_order: number;
  created_at: string | null;
}

interface AppSettingRow {
  key: string;
  value: string;
  updated_at: string | null;
}

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  // Initialize database
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await SQLite.openDatabaseAsync('safecircle.db');
      await this.createTables();
      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  // Create all tables
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const createLocationCacheTable = `
      CREATE TABLE IF NOT EXISTS location_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        address TEXT,
        timestamp DATETIME NOT NULL,
        arrival_timestamp DATETIME,
        heartbeat_timestamp DATETIME,
        accuracy REAL,
        speed REAL,
        battery_level INTEGER,
        is_charging BOOLEAN,
        movement_type TEXT,
        zone_center_lat REAL,
        zone_center_lng REAL,
        zone_entry_time DATETIME,
        zone_radius REAL DEFAULT 10,
        is_stationary BOOLEAN DEFAULT 0,
        is_synced BOOLEAN DEFAULT 0,
        location_services_enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createTripHistoryTable = `
      CREATE TABLE IF NOT EXISTS trip_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        trip_id TEXT UNIQUE,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        start_latitude REAL NOT NULL,
        start_longitude REAL NOT NULL,
        end_latitude REAL,
        end_longitude REAL,
        total_distance REAL,
        average_speed REAL,
        max_speed REAL,
        duration INTEGER,
        movement_type TEXT,
        is_active BOOLEAN DEFAULT 1,
        is_synced BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createTripWaypointsTable = `
      CREATE TABLE IF NOT EXISTS trip_waypoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp DATETIME NOT NULL,
        speed REAL,
        accuracy REAL,
        sequence_order INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createAppSettingsTable = `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create indexes for better performance
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_location_cache_user_timestamp ON location_cache(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_location_cache_synced ON location_cache(is_synced);
      CREATE INDEX IF NOT EXISTS idx_trip_history_user_active ON trip_history(user_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_trip_history_synced ON trip_history(is_synced);
      CREATE INDEX IF NOT EXISTS idx_trip_waypoints_trip_id ON trip_waypoints(trip_id);
    `;

    await this.db.execAsync(createLocationCacheTable);
    await this.db.execAsync(createTripHistoryTable);
    await this.db.execAsync(createTripWaypointsTable);
    await this.db.execAsync(createAppSettingsTable);
    await this.db.execAsync(createIndexes);
  }

  // Location Cache Operations
  async saveLocation(location: Omit<LocationCache, 'id' | 'created_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.runAsync(
      `INSERT INTO location_cache (
        user_id, latitude, longitude, address, timestamp, arrival_timestamp, 
        heartbeat_timestamp, accuracy, speed, battery_level, is_charging, 
        movement_type, zone_center_lat, zone_center_lng, zone_entry_time, 
        zone_radius, is_stationary, is_synced, location_services_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        location.user_id,
        location.latitude,
        location.longitude,
        location.address || null,
        location.timestamp.toISOString(),
        location.arrival_timestamp?.toISOString() || null,
        location.heartbeat_timestamp?.toISOString() || null,
        location.accuracy || null,
        location.speed || null,
        location.battery_level || null,
        location.is_charging || false,
        location.movement_type || null,
        location.zone_center_lat || null,
        location.zone_center_lng || null,
        location.zone_entry_time?.toISOString() || null,
        location.zone_radius || 10,
        location.is_stationary || false,
        location.is_synced,
        location.locationServicesEnabled === false ? 0 : 1 // store as 0/1
      ]
    );

    return result.lastInsertRowId;
  }

  async getLatestLocation(userId: string): Promise<LocationCache | null> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = await this.db.getAllAsync(
      `SELECT * FROM location_cache WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) return null;
    const row = rows[0] as LocationCacheRow;
    return {
      ...row,
      address: row.address ?? undefined,
      accuracy: row.accuracy ?? undefined,
      speed: row.speed ?? undefined,
      battery_level: row.battery_level ?? undefined,
      movement_type: row.movement_type ?? undefined,
      zone_center_lat: row.zone_center_lat ?? undefined,
      zone_center_lng: row.zone_center_lng ?? undefined,
      zone_entry_time: row.zone_entry_time ? new Date(row.zone_entry_time) : undefined,
      zone_radius: row.zone_radius ?? undefined,
      timestamp: new Date(row.timestamp),
      arrival_timestamp: row.arrival_timestamp ? new Date(row.arrival_timestamp) : undefined,
      heartbeat_timestamp: row.heartbeat_timestamp ? new Date(row.heartbeat_timestamp) : undefined,
      created_at: row.created_at ? new Date(row.created_at) : undefined,
      locationServicesEnabled: row.location_services_enabled === 1
    };
  }

  async getUnsyncedLocations(userId: string): Promise<LocationCache[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `SELECT * FROM location_cache 
       WHERE user_id = ? AND is_synced = 0 
       ORDER BY timestamp ASC`,
      [userId]
    );

    return result.map(row => {
      const typedRow = row as LocationCacheRow;
      return {
        ...typedRow,
        timestamp: new Date(typedRow.timestamp),
        arrival_timestamp: typedRow.arrival_timestamp ? new Date(typedRow.arrival_timestamp) : undefined,
        heartbeat_timestamp: typedRow.heartbeat_timestamp ? new Date(typedRow.heartbeat_timestamp) : undefined,
        zone_entry_time: typedRow.zone_entry_time ? new Date(typedRow.zone_entry_time) : undefined,
        created_at: typedRow.created_at ? new Date(typedRow.created_at) : undefined,
        locationServicesEnabled: typedRow.location_services_enabled === 1
      } as LocationCache;
    });
  }

  async markLocationsAsSynced(ids: number[]): Promise<void> {
    if (!this.db || ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    await this.db.runAsync(
      `UPDATE location_cache SET is_synced = 1 WHERE id IN (${placeholders})`,
      ids
    );
  }

  async cleanupOldLocations(daysToKeep: number = 7): Promise<void> {
    if (!this.db) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await this.db.runAsync(
      `DELETE FROM location_cache WHERE timestamp < ?`,
      [cutoffDate.toISOString()]
    );
  }

  // 20-day data retention cleanup for all user data
  async cleanupOldData(daysToKeep: number = 20): Promise<void> {
    if (!this.db) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateString = cutoffDate.toISOString();

    try {
      console.log(`[DatabaseService] Starting cleanup of data older than ${daysToKeep} days`);

      // Clean up old location cache data
      const locationResult = await this.db.runAsync(
        `DELETE FROM location_cache WHERE created_at < ?`,
        [cutoffDateString]
      );

      // Clean up old trip history data (only completed trips)
      const tripResult = await this.db.runAsync(
        `DELETE FROM trip_history WHERE created_at < ? AND is_active = 0`,
        [cutoffDateString]
      );

      // Clean up orphaned trip waypoints (waypoints for trips that no longer exist)
      const waypointResult = await this.db.runAsync(
        `DELETE FROM trip_waypoints WHERE trip_id NOT IN (SELECT trip_id FROM trip_history)`
      );

      console.log(`[DatabaseService] Cleanup completed:`, {
        locationsDeleted: locationResult.changes,
        tripsDeleted: tripResult.changes,
        waypointsDeleted: waypointResult.changes
      });

    } catch (error) {
      console.error('[DatabaseService] Error during data cleanup:', error);
    }
  }

  // Trip History Operations
  async saveTrip(trip: Omit<TripHistory, 'id' | 'created_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.runAsync(
      `INSERT INTO trip_history (
        user_id, trip_id, start_time, end_time, start_latitude, start_longitude,
        end_latitude, end_longitude, total_distance, average_speed, max_speed,
        duration, movement_type, is_active, is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trip.user_id,
        trip.trip_id,
        trip.start_time.toISOString(),
        trip.end_time?.toISOString() || null,
        trip.start_latitude,
        trip.start_longitude,
        trip.end_latitude || null,
        trip.end_longitude || null,
        trip.total_distance,
        trip.average_speed,
        trip.max_speed,
        trip.duration,
        trip.movement_type,
        trip.is_active,
        trip.is_synced
      ]
    );

    return result.lastInsertRowId;
  }

  async updateTrip(tripId: string, updates: Partial<TripHistory>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'created_at')
      .map(key => `${key} = ?`)
      .join(', ');

    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id' && key !== 'created_at')
      .map(([key, value]) => {
        if (value instanceof Date) return value.toISOString();
        return value;
      });

    await this.db.runAsync(
      `UPDATE trip_history SET ${setClause} WHERE trip_id = ?`,
      [...values, tripId]
    );
  }

  async getActiveTrip(userId: string): Promise<TripHistory | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      `SELECT * FROM trip_history 
       WHERE user_id = ? AND is_active = 1 
       ORDER BY start_time DESC 
       LIMIT 1`,
      [userId]
    );

    if (!result) return null;

    const row = result as TripHistoryRow;
    return {
      ...row,
      start_time: new Date(row.start_time),
      end_time: row.end_time ? new Date(row.end_time) : undefined,
      created_at: row.created_at ? new Date(row.created_at) : undefined
    } as TripHistory;
  }

  async getRecentTrips(userId: string, limit: number = 10): Promise<TripHistory[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `SELECT * FROM trip_history 
       WHERE user_id = ? AND is_active = 0 
       ORDER BY start_time DESC 
       LIMIT ?`,
      [userId, limit]
    );

    return result.map(row => {
      const typedRow = row as TripHistoryRow;
      return {
        ...typedRow,
        start_time: new Date(typedRow.start_time),
        end_time: typedRow.end_time ? new Date(typedRow.end_time) : undefined,
        created_at: typedRow.created_at ? new Date(typedRow.created_at) : undefined
      } as TripHistory;
    });
  }

  async getUnsyncedTrips(userId: string): Promise<TripHistory[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `SELECT * FROM trip_history 
       WHERE user_id = ? AND is_synced = 0 
       ORDER BY start_time ASC`,
      [userId]
    );

    return result.map(row => {
      const typedRow = row as TripHistoryRow;
      return {
        ...typedRow,
        start_time: new Date(typedRow.start_time),
        end_time: typedRow.end_time ? new Date(typedRow.end_time) : undefined,
        created_at: typedRow.created_at ? new Date(typedRow.created_at) : undefined
      } as TripHistory;
    });
  }

  async markTripsAsSynced(tripIds: string[]): Promise<void> {
    if (!this.db || tripIds.length === 0) return;

    const placeholders = tripIds.map(() => '?').join(',');
    await this.db.runAsync(
      `UPDATE trip_history SET is_synced = 1 WHERE trip_id IN (${placeholders})`,
      tripIds
    );
  }

  // Trip Waypoints Operations
  async saveWaypoint(waypoint: Omit<TripWaypoint, 'id' | 'created_at'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.runAsync(
      `INSERT INTO trip_waypoints (
        trip_id, latitude, longitude, timestamp, speed, accuracy, sequence_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        waypoint.trip_id,
        waypoint.latitude,
        waypoint.longitude,
        waypoint.timestamp.toISOString(),
        waypoint.speed || null,
        waypoint.accuracy || null,
        waypoint.sequence_order
      ]
    );

    return result.lastInsertRowId;
  }

  async getTripWaypoints(tripId: string): Promise<TripWaypoint[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      `SELECT * FROM trip_waypoints 
       WHERE trip_id = ? 
       ORDER BY sequence_order ASC`,
      [tripId]
    );

    return result.map(row => {
      const typedRow = row as TripWaypointRow;
      return {
        ...typedRow,
        timestamp: new Date(typedRow.timestamp),
        created_at: typedRow.created_at ? new Date(typedRow.created_at) : undefined
      } as TripWaypoint;
    });
  }

  // App Settings Operations
  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      `SELECT value FROM app_settings WHERE key = ?`,
      [key]
    );

    if (!result) return null;
    
    const row = result as AppSettingRow;
    return row.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, value, new Date().toISOString()]
    );
  }

  // Utility Operations
  async getDatabaseSize(): Promise<number> {
    if (!this.db) return 0;

    const result = await this.db.getFirstAsync(
      `SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`
    );

    if (!result) return 0;
    
    const row = result as { size: number };
    return row.size;
  }

  async clearAllData(): Promise<void> {
    if (!this.db) return;

    await this.db.execAsync(`
      DELETE FROM location_cache;
      DELETE FROM trip_history;
      DELETE FROM trip_waypoints;
      DELETE FROM app_settings;
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export default databaseService; 