import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { ErrorHandler, ErrorCategory } from '../utils/errorHandling';
import { Validator, validationRules } from '../utils/validation';

// Types for enhanced cache functionality
export type CacheChangeType = 'invalidated' | 'updated' | 'removed';
export type CacheChangeListener = (key: string, changeType: CacheChangeType) => void;
export type RefreshCallback = () => Promise<void>;

// Cache change listeners registry
const cacheChangeListeners: Set<CacheChangeListener> = new Set();

// Helper function to notify cache change listeners
const notifyCacheChange = (key: string, changeType: CacheChangeType) => {
  (cacheChangeListeners ?? []).forEach(listener => {
    try {
      listener(key, changeType);
    } catch (error) {
      console.warn('Error in cache change listener:', error);
    }
  });
};

// NOTE: expo-sqlite only works on Android/iOS, not web.
let db: SQLite.SQLiteDatabase | null = null;

// Initialize database safely
async function initializeDatabase() {
  try {
    if (Platform.OS === 'web') {
      console.warn('SQLite not supported on web platform');
      return null;
    }
    
    if (!db) {
      db = await SQLite.openDatabaseAsync('safe_circle.db');
      console.log('Database initialized successfully');
    }
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    return null;
  }
}

// Helper function to safely execute database operations
async function safeDbOperation(operation: (database: SQLite.SQLiteDatabase) => void, operationName: string) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn(`Database not available, skipping ${operationName}`);
    return;
  }
  operation(database);
}

export async function initLocalDB() {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping initialization');
    return;
  }
  
  try {
    // Locations table - add user_id field
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        timestamp INTEGER,
        latitude REAL,
        longitude REAL,
        speed REAL,
        movement_type TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Zones table - add user_id field
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        center_latitude REAL,
        center_longitude REAL,
        radius REAL,
        start_time INTEGER
      );
    `);
    
    // Trips table - add user_id field
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        start_time INTEGER,
        end_time INTEGER,
        path TEXT,
        movement_type TEXT,
        image_uri TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Charging events table - add user_id field
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS charging_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        timestamp INTEGER,
        event_type TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Trip downloads table
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trip_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER,
        user_id TEXT,
        downloaded INTEGER DEFAULT 0
      );
    `);
    
    console.log('Local database tables created successfully');
  } catch (error) {
    console.error('Error creating database tables:', error);
  }
}

export default db;

export const setCache = async (key: string, value: unknown): Promise<boolean> => {
  try {
    // Input validation
    Validator.validateOrThrow(key, [
      validationRules.required('key'),
      validationRules.string('key')
    ], 'setCache');

    if (value === undefined) {
      throw new Error('Cannot cache undefined value');
    }

    await AsyncStorage.setItem(key, JSON.stringify(value));
    notifyCacheChange(key, 'updated');
    return true;
  } catch (error) {
    ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, 'setCache');
    console.warn('Failed to set cache', key, error);
    return false;
  }
};

export const getCache = async <T = unknown>(key: string): Promise<T | null> => {
  try {
    // Input validation
    Validator.validateOrThrow(key, [
      validationRules.required('key'),
      validationRules.string('key')
    ], 'getCache');

    const value = await AsyncStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, 'getCache');
    console.warn('Failed to get cache', key, error);
    return null;
  }
};

export const removeCache = async (key: string) => {
  try {
    await AsyncStorage.removeItem(key);
    notifyCacheChange(key, 'removed');
  } catch (e) {
    console.warn('Failed to remove cache', key, e);
  }
};

// Enhanced Cache Service Functions

/**
 * Invalidate cache and trigger refresh callback
 * @param cacheKey - The cache key to invalidate
 * @param refreshCallback - Optional callback to execute after cache invalidation
 */
export const invalidateWithRefresh = async (
  cacheKey: string,
  refreshCallback?: RefreshCallback
): Promise<void> => {
  try {
    // Input validation
    Validator.validateOrThrow(cacheKey, [
      validationRules.required('cacheKey'),
      validationRules.string('cacheKey')
    ], 'invalidateWithRefresh');

    // Remove the cache entry
    await AsyncStorage.removeItem(cacheKey);
    
    // Notify listeners about cache invalidation
    notifyCacheChange(cacheKey, 'invalidated');
    
    // Execute refresh callback if provided
    if (refreshCallback) {
      try {
        await refreshCallback();
      } catch (error) {
        console.warn('Error executing refresh callback for key:', cacheKey, error);
        ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, 'invalidateWithRefresh.refreshCallback');
      }
    }
  } catch (error) {
    ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, 'invalidateWithRefresh');
    console.warn('Failed to invalidate cache with refresh:', cacheKey, error);
  }
};

/**
 * Batch invalidate multiple cache keys and trigger refresh callback
 * @param cacheKeys - Array of cache keys to invalidate
 * @param refreshCallback - Optional callback to execute after all cache invalidations
 */
export const batchInvalidateWithRefresh = async (
  cacheKeys: string[],
  refreshCallback?: RefreshCallback
): Promise<void> => {
  try {
    // Input validation
    if (!Array.isArray(cacheKeys)) {
      throw new Error('cacheKeys must be an array');
    }

    if (cacheKeys.length === 0) {
      console.warn('No cache keys provided for batch invalidation');
      return;
    }

    // Validate each cache key
    (cacheKeys ?? []).forEach((key, index) => {
      Validator.validateOrThrow(key, [
        validationRules.required(`cacheKeys[${index}]`),
        validationRules.string(`cacheKeys[${index}]`)
      ], 'batchInvalidateWithRefresh');
    });

    // Remove all cache entries
    await AsyncStorage.multiRemove(cacheKeys);
    
    // Notify listeners about each cache invalidation
    (cacheKeys ?? []).forEach(key => {
      notifyCacheChange(key, 'invalidated');
    });
    
    // Execute refresh callback if provided
    if (refreshCallback) {
      try {
        await refreshCallback();
      } catch (error) {
        console.warn('Error executing refresh callback for batch invalidation:', cacheKeys, error);
        ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, 'batchInvalidateWithRefresh.refreshCallback');
      }
    }
  } catch (error) {
    ErrorHandler.logError(error, ErrorCategory.UNKNOWN, undefined, 'batchInvalidateWithRefresh');
    console.warn('Failed to batch invalidate cache with refresh:', cacheKeys, error);
  }
};

/**
 * Add a cache change listener
 * @param listener - Function to call when cache changes occur
 * @returns Function to remove the listener
 */
export const onCacheChange = (listener: CacheChangeListener): (() => void) => {
  cacheChangeListeners.add(listener);
  
  // Return cleanup function
  return () => {
    cacheChangeListeners.delete(listener);
  };
};

/**
 * Remove a specific cache change listener
 * @param listener - The listener function to remove
 */
export const offCacheChange = (listener: CacheChangeListener): void => {
  cacheChangeListeners.delete(listener);
};

/**
 * Clear all cache change listeners
 */
export const clearCacheChangeListeners = (): void => {
  cacheChangeListeners.clear();
};

/**
 * Get the number of active cache change listeners
 */
export const getCacheChangeListenerCount = (): number => {
  return cacheChangeListeners.size;
};

// Location helpers - updated to include user_id
export async function insertLocation({ user_id, timestamp, latitude, longitude, speed, movement_type, synced = 0 }: { user_id: string, timestamp: number, latitude: number, longitude: number, speed: number, movement_type: string, synced?: number }) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping insertLocation');
    return;
  }
  
  try {
    await database.runAsync(
      'INSERT INTO locations (user_id, timestamp, latitude, longitude, speed, movement_type, synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, timestamp, latitude, longitude, speed, movement_type, synced]
    );
    console.log('Location cached for user:', user_id, { timestamp, latitude, longitude, speed, movement_type, synced });
  } catch (error) {
    console.error('Error inserting location:', error);
  }
}

export async function getLastLocation(user_id: string): Promise<any> {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping getLastLocation');
    return null;
  }
  
  try {
    const result = await database.getAllAsync(
      'SELECT * FROM locations WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1',
      [user_id]
    );
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Error getting last location:', error);
    return null;
  }
}

export async function getUnsyncedLocations(user_id: string): Promise<any[]> {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping getUnsyncedLocations');
    return [];
  }
  
  try {
    const result = await database.getAllAsync(
      'SELECT * FROM locations WHERE user_id = ? AND synced = 0 ORDER BY timestamp ASC',
      [user_id]
    );
    return result;
  } catch (error) {
    console.error('Error getting unsynced locations:', error);
    return [];
  }
}

export async function markLocationsSynced(user_id: string, ids: number[]) {
  if (ids.length === 0) return;
  
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping markLocationsSynced');
    return;
  }
  
  try {
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE locations SET synced = 1 WHERE user_id = ? AND id IN (${placeholders})`,
      [user_id, ...ids]
    );
    console.log('Locations marked as synced for user:', user_id, ids);
  } catch (error) {
    console.error('Error marking locations synced:', error);
  }
}

// Zone helpers - updated to include user_id
export async function setZone({ user_id, center_latitude, center_longitude, radius, start_time }: { user_id: string, center_latitude: number, center_longitude: number, radius: number, start_time: number }) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping setZone');
    return;
  }
  
  try {
    // Clear existing zone for this user
    await database.runAsync('DELETE FROM zones WHERE user_id = ?', [user_id]);
    // Insert new zone
    await database.runAsync(
      'INSERT INTO zones (user_id, center_latitude, center_longitude, radius, start_time) VALUES (?, ?, ?, ?, ?)',
      [user_id, center_latitude, center_longitude, radius, start_time]
    );
    console.log('Zone set for user:', user_id, { center_latitude, center_longitude, radius, start_time });
  } catch (error) {
    console.error('Error setting zone:', error);
  }
}

export async function getZone(user_id: string): Promise<any> {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping getZone');
    return null;
  }
  
  try {
    const result = await database.getAllAsync(
      'SELECT * FROM zones WHERE user_id = ? ORDER BY start_time DESC LIMIT 1',
      [user_id]
    );
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Error getting zone:', error);
    return null;
  }
}

// Trip helpers - updated to include user_id
export async function insertTrip({ user_id, start_time, end_time, path, movement_type, image_uri, synced = 0 }: { user_id: string, start_time: number, end_time: number, path: string, movement_type: string, image_uri: string, synced?: number }) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping insertTrip');
    return;
  }
  
  try {
    await database.runAsync(
      'INSERT INTO trips (user_id, start_time, end_time, path, movement_type, image_uri, synced) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, start_time, end_time, path, movement_type, image_uri, synced]
    );
    console.log('Trip inserted for user:', user_id, { start_time, end_time, path, movement_type, image_uri, synced });
  } catch (error) {
    console.error('Error inserting trip:', error);
  }
}

export async function getUnsyncedTrips(user_id: string): Promise<any[]> {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping getUnsyncedTrips');
    return [];
  }
  
  try {
    const result = await database.getAllAsync(
      'SELECT * FROM trips WHERE user_id = ? AND synced = 0 ORDER BY start_time ASC',
      [user_id]
    );
    return result;
  } catch (error) {
    console.error('Error getting unsynced trips:', error);
    return [];
  }
}

export async function markTripsSynced(user_id: string, ids: number[]) {
  if (ids.length === 0) return;
  
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping markTripsSynced');
    return;
  }
  
  try {
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE trips SET synced = 1 WHERE user_id = ? AND id IN (${placeholders})`,
      [user_id, ...ids]
    );
    console.log('Trips marked as synced for user:', user_id, ids);
  } catch (error) {
    console.error('Error marking trips synced:', error);
  }
}

export async function deleteOldTrips(user_id: string, olderThan: number) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping deleteOldTrips');
    return;
  }
  
  try {
    await database.runAsync(
      'DELETE FROM trips WHERE user_id = ? AND start_time < ?',
      [user_id, olderThan]
    );
    console.log('Old trips cleanup for user:', user_id, 'older than:', olderThan);
  } catch (error) {
    console.error('Error deleting old trips:', error);
  }
}

// Charging event helpers - updated to include user_id
export async function insertChargingEvent({ user_id, timestamp, event_type, synced = 0 }: { user_id: string, timestamp: number, event_type: string, synced?: number }) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping insertChargingEvent');
    return;
  }
  
  try {
    await database.runAsync(
      'INSERT INTO charging_events (user_id, timestamp, event_type, synced) VALUES (?, ?, ?, ?)',
      [user_id, timestamp, event_type, synced]
    );
    console.log('Charging event cached for user:', user_id, { timestamp, event_type, synced });
  } catch (error) {
    console.error('Error inserting charging event:', error);
  }
}

export async function getUnsyncedChargingEvents(user_id: string): Promise<any[]> {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping getUnsyncedChargingEvents');
    return [];
  }
  
  try {
    const result = await database.getAllAsync(
      'SELECT * FROM charging_events WHERE user_id = ? AND synced = 0 ORDER BY timestamp ASC',
      [user_id]
    );
    return result;
  } catch (error) {
    console.error('Error getting unsynced charging events:', error);
    return [];
  }
}

export async function markChargingEventsSynced(user_id: string, ids: number[]) {
  if (ids.length === 0) return;
  
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping markChargingEventsSynced');
    return;
  }
  
  try {
    const placeholders = ids.map(() => '?').join(',');
    await database.runAsync(
      `UPDATE charging_events SET synced = 1 WHERE user_id = ? AND id IN (${placeholders})`,
      [user_id, ...ids]
    );
    console.log('Charging events marked as synced for user:', user_id, ids);
  } catch (error) {
    console.error('Error marking charging events synced:', error);
  }
}

// Trip download helpers
export async function markTripDownloaded(trip_id: number, user_id: string) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping markTripDownloaded');
    return;
  }
  
  try {
    await database.runAsync(
      'INSERT OR REPLACE INTO trip_downloads (trip_id, user_id, downloaded) VALUES (?, ?, 1)',
      [trip_id, user_id]
    );
    console.log('Trip marked as downloaded:', { trip_id, user_id });
  } catch (error) {
    console.error('Error marking trip downloaded:', error);
  }
}

export async function getTripDownloads(trip_id: number): Promise<any[]> {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping getTripDownloads');
    return [];
  }
  
  try {
    const result = await database.getAllAsync(
      'SELECT * FROM trip_downloads WHERE trip_id = ?',
      [trip_id]
    );
    return result;
  } catch (error) {
    console.error('Error getting trip downloads:', error);
    return [];
  }
}

export async function deleteOldLocations(user_id: string, olderThan: number) {
  const database = await initializeDatabase();
  if (!database) {
    console.warn('Database not available, skipping deleteOldLocations');
    return;
  }
  
  try {
    await database.runAsync(
      'DELETE FROM locations WHERE user_id = ? AND timestamp < ?',
      [user_id, olderThan]
    );
    console.log('Old locations cleanup for user:', user_id, 'older than:', olderThan);
  } catch (error) {
    console.error('Error deleting old locations:', error);
  }
}

// Utility: Generate Google Static Maps image URL for a trip path
export function getGoogleStaticMapUrl(path: Array<{ latitude: number; longitude: number }>, width = 600, height = 400): string {
  const apiKey = 'process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY';
  const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
  const size = `size=${width}x${height}`;
  const pathStr = path.map(p => `${p.latitude},${p.longitude}`).join('|');
  const pathParam = `path=color:0x0000ff|weight:5|${pathStr}`;
  const markers = path.length > 0 ? `&markers=color:green|label:S|${path[0].latitude},${path[0].longitude}&markers=color:red|label:E|${path[path.length-1].latitude},${path[path.length-1].longitude}` : '';
  return `${baseUrl}?${size}&${pathParam}${markers}&key=${apiKey}`;
} 

// Favorites and Display Name helpers
export const getFavorites = async (userId: string): Promise<string[]> => {
  return (await getCache<string[]>(`favorites_${userId}`)) || [];
};

export const setFavorites = async (userId: string, favorites: string[]) => {
  await setCache(`favorites_${userId}`, favorites);
};

export const getDisplayName = async (userId: string, contactId: string): Promise<string | null> => {
  return await getCache<string>(`displayName_${userId}_${contactId}`);
};

export const setDisplayName = async (userId: string, contactId: string, displayName: string) => {
  await setCache(`displayName_${userId}_${contactId}`, displayName);
};

export const removeDisplayName = async (userId: string, contactId: string) => {
  await removeCache(`displayName_${userId}_${contactId}`);
};

// Enhanced Nickname Management Functions

/**
 * Get nickname for a contact, returns null if no nickname is set
 */
export const getNickname = async (userId: string, contactId: string): Promise<string | null> => {
  return await getDisplayName(userId, contactId);
};

/**
 * Set nickname for a contact
 */
export const setNickname = async (userId: string, contactId: string, nickname: string): Promise<void> => {
  await setDisplayName(userId, contactId, nickname);
};

/**
 * Remove nickname for a contact
 */
export const removeNickname = async (userId: string, contactId: string): Promise<void> => {
  await removeDisplayName(userId, contactId);
};

/**
 * Check if a contact has a nickname set
 */
export const hasNickname = async (userId: string, contactId: string): Promise<boolean> => {
  const nickname = await getNickname(userId, contactId);
  return nickname !== null && nickname.trim() !== '';
};

/**
 * Resolve display name - returns nickname if set, otherwise returns original name
 */
export const resolveDisplayName = async (userId: string, contactId: string, originalName: string): Promise<string> => {
  const nickname = await getNickname(userId, contactId);
  return nickname && nickname.trim() !== '' ? nickname : originalName;
};

/**
 * Get all nicknames for a user (returns map of contactId -> nickname)
 */
export const getAllNicknames = async (userId: string): Promise<{ [contactId: string]: string }> => {
  try {
    // Get all keys from AsyncStorage that match the nickname pattern
    const allKeys = await AsyncStorage.getAllKeys();
    const nicknameKeys = allKeys.filter(key => key.startsWith(`displayName_${userId}_`));
    
    const nicknames: { [contactId: string]: string } = {};
    
    for (const key of nicknameKeys) {
      const contactId = key.replace(`displayName_${userId}_`, '');
      const nickname = await getCache<string>(key);
      if (nickname && nickname.trim() !== '') {
        nicknames[contactId] = nickname;
      }
    }
    
    return nicknames;
  } catch (error) {
    console.warn('Failed to get all nicknames:', error);
    return {};
  }
};

/**
 * Bulk resolve display names for multiple contacts
 */
export const bulkResolveDisplayNames = async (
  userId: string, 
  contacts: Array<{ id: string; originalName: string }>
): Promise<Array<{ id: string; originalName: string; displayName: string; hasNickname: boolean }>> => {
  const results = [];
  
  for (const contact of contacts) {
    const nickname = await getNickname(userId, contact.id);
    const displayName = nickname && nickname.trim() !== '' ? nickname : contact.originalName;
    const hasNickname = nickname !== null && nickname.trim() !== '';
    
    results.push({
      id: contact.id,
      originalName: contact.originalName,
      displayName,
      hasNickname
    });
  }
  
  return results;
};

/**
 * Clear all nicknames for a user (useful for account cleanup)
 */
export const clearAllNicknames = async (userId: string): Promise<void> => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const nicknameKeys = allKeys.filter(key => key.startsWith(`displayName_${userId}_`));
    
    if (nicknameKeys.length > 0) {
      await AsyncStorage.multiRemove(nicknameKeys);
      console.log(`Cleared ${nicknameKeys.length} nicknames for user:`, userId);
    }
  } catch (error) {
    console.warn('Failed to clear all nicknames:', error);
  }
};

/**
 * Get nickname count for a user
 */
export const getNicknameCount = async (userId: string): Promise<number> => {
  try {
    const nicknames = await getAllNicknames(userId);
    return Object.keys(nicknames).length;
  } catch (error) {
    console.warn('Failed to get nickname count:', error);
    return 0;
  }
};

/**
 * Batch set multiple nicknames at once
 */
export const batchSetNicknames = async (
  userId: string, 
  nicknames: Array<{ contactId: string; nickname: string }>
): Promise<void> => {
  try {
    const keyValuePairs: [string, string][] = nicknames.map(({ contactId, nickname }) => [
      `displayName_${userId}_${contactId}`,
      JSON.stringify(nickname)
    ]);
    
    await AsyncStorage.multiSet(keyValuePairs);
    console.log(`Batch set ${nicknames.length} nicknames for user:`, userId);
  } catch (error) {
    console.warn('Failed to batch set nicknames:', error);
  }
};

/**
 * Search contacts by nickname or original name
 */
export const searchContactsByName = async (
  userId: string,
  contacts: Array<{ id: string; originalName: string }>,
  searchTerm: string
): Promise<Array<{ id: string; originalName: string; displayName: string; hasNickname: boolean; matchType: 'nickname' | 'original' | 'both' }>> => {
  const searchLower = searchTerm.toLowerCase().trim();
  if (!searchLower) return [];
  
  const results = [];
  
  for (const contact of contacts) {
    const nickname = await getNickname(userId, contact.id);
    const displayName = nickname && nickname.trim() !== '' ? nickname : contact.originalName;
    const hasNickname = nickname !== null && nickname.trim() !== '';
    
    const originalMatches = contact.originalName.toLowerCase().includes(searchLower);
    const nicknameMatches = nickname && nickname.toLowerCase().includes(searchLower);
    
    let matchType: 'nickname' | 'original' | 'both' = 'original';
    if (originalMatches && nicknameMatches) {
      matchType = 'both';
    } else if (nicknameMatches) {
      matchType = 'nickname';
    }
    
    if (originalMatches || nicknameMatches) {
      results.push({
        id: contact.id,
        originalName: contact.originalName,
        displayName,
        hasNickname,
        matchType
      });
    }
  }
  
  return results;
}; 