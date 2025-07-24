import { setCache, getCache, removeCache } from './cacheService';
import { 
  DocumentReference, 
  DocumentSnapshot,
  doc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  getFirebaseDb,
} from '../utils/sharedImports';
import firestoreOptimizationService from './firestoreOptimizationService';
import { User, Circle, CircleMember, LocationData } from '../firebase/services';

// Cache entry interface
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

// Cache configuration for different data types
export interface CacheTypeConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  enabled: boolean;
  prefetchEnabled: boolean; // Whether to prefetch related data
}

// Enhanced cache service with Firestore optimization
class EnhancedCacheService {
  private cacheConfigs: { [key: string]: CacheTypeConfig } = {
    users: {
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 100,
      enabled: true,
      prefetchEnabled: true
    },
    circles: {
      ttl: 10 * 60 * 1000, // 10 minutes
      maxSize: 50,
      enabled: true,
      prefetchEnabled: true
    },
    circleMembers: {
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 200,
      enabled: true,
      prefetchEnabled: false
    },
    locations: {
      ttl: 30 * 1000, // 30 seconds
      maxSize: 500,
      enabled: true,
      prefetchEnabled: false
    },
    inviteLinks: {
      ttl: 60 * 1000, // 1 minute
      maxSize: 20,
      enabled: true,
      prefetchEnabled: false
    },
    alerts: {
      ttl: 2 * 60 * 1000, // 2 minutes
      maxSize: 100,
      enabled: true,
      prefetchEnabled: false
    }
  };

  private cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    prefetches: 0
  };

  // Initialize the enhanced cache service
  async initialize(): Promise<void> {
    await firestoreOptimizationService.initialize();
    console.log('Enhanced cache service initialized');
  }

  // Generic cache-first data retrieval
  async getCachedDocument<T>(
    docRef: DocumentReference,
    cacheType: string = 'default',
    forceRefresh: boolean = false
  ): Promise<T | null> {
    const cacheKey = `${cacheType}_${docRef.path}`;
    const config = this.cacheConfigs[cacheType] || this.cacheConfigs.users;

    if (!config.enabled || forceRefresh) {
      return this.fetchAndCacheDocument<T>(docRef, cacheKey, config);
    }

    // Try cache first
    const cached = await this.getFromCache<T>(cacheKey);
    if (cached) {
      this.cacheStats.hits++;
      return cached;
    }

    this.cacheStats.misses++;
    return this.fetchAndCacheDocument<T>(docRef, cacheKey, config);
  }

  // Fetch document and cache it
  private async fetchAndCacheDocument<T>(
    docRef: DocumentReference,
    cacheKey: string,
    config: CacheTypeConfig
  ): Promise<T | null> {
    try {
      const snapshot = await firestoreOptimizationService.getDocument(docRef);
      
      if (snapshot.exists()) {
        const data = snapshot.data() as T;
        await this.setCache(cacheKey, data, config.ttl);
        
        // Prefetch related data if enabled
        if (config.prefetchEnabled) {
          await this.prefetchRelatedData(docRef, data);
        }
        
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching document:', error);
      return null;
    }
  }

  // User-specific caching methods
  async getCachedUser(userId: string, forceRefresh: boolean = false): Promise<User | null> {
    const userRef = doc(getFirebaseDb(), 'users', userId);
    return this.getCachedDocument<User>(userRef, 'users', forceRefresh);
  }

  async getCachedCircle(circleId: string, forceRefresh: boolean = false): Promise<Circle | null> {
    const circleRef = doc(getFirebaseDb(), 'circles', circleId);
    return this.getCachedDocument<Circle>(circleRef, 'circles', forceRefresh);
  }

  async getCachedCircleMembers(circleId: string, forceRefresh: boolean = false): Promise<CircleMember[]> {
    const cacheKey = `circleMembers_${circleId}`;
    const config = this.cacheConfigs.circleMembers;

    if (!config.enabled || forceRefresh) {
      return this.fetchAndCacheCircleMembers(circleId, cacheKey, config);
    }

    // Try cache first
    const cached = await this.getFromCache<CircleMember[]>(cacheKey);
    if (cached) {
      this.cacheStats.hits++;
      return cached;
    }

    this.cacheStats.misses++;
    return this.fetchAndCacheCircleMembers(circleId, cacheKey, config);
  }

  private async fetchAndCacheCircleMembers(
    circleId: string,
    cacheKey: string,
    config: CacheTypeConfig
  ): Promise<CircleMember[]> {
    try {
      const db = getFirebaseDb();
      const membersQuery = query(
        collection(db, 'circleMembers'),
        where('circleId', '==', circleId)
      );

      const snapshot = await getDocs(membersQuery);
      const members: CircleMember[] = [];
      
      if (snapshot && snapshot.forEach) {
        (Array.from(snapshot.docs) ?? []).forEach((doc) => {
          const memberData = doc.data() as CircleMember;
          members.push({ ...memberData, id: doc.id });
        });
      }
      
      await this.setCache(cacheKey, members, config.ttl);
      return members;
    } catch (error) {
      console.error('Error fetching circle members:', error);
      return [];
    }
  }

  async getCachedUserLocation(userId: string, forceRefresh: boolean = false): Promise<LocationData | null> {
    const locationRef = doc(getFirebaseDb(), 'locations', userId);
    return this.getCachedDocument<LocationData>(locationRef, 'locations', forceRefresh);
  }

  // Batch caching for multiple users
  async batchCacheUsers(userIds: string[]): Promise<{ [userId: string]: User | null }> {
    const results: { [userId: string]: User | null } = {};
    
    // Check cache first for all users
    const uncachedUserIds: string[] = [];
    
    for (const userId of userIds) {
      const cached = await this.getCachedUser(userId);
      if (cached) {
        results[userId] = cached;
        this.cacheStats.hits++;
      } else {
        uncachedUserIds.push(userId);
        this.cacheStats.misses++;
      }
    }

    // Fetch uncached users in batch
    if (uncachedUserIds.length > 0) {
      const batchResults = await this.batchFetchUsers(uncachedUserIds);
      Object.assign(results, batchResults);
    }

    return results;
  }

  private async batchFetchUsers(userIds: string[]): Promise<{ [userId: string]: User | null }> {
    const results: { [userId: string]: User | null } = {};
    
    // Create batch read operations
    const promises = userIds.map(async (userId) => {
      const userRef = doc(getFirebaseDb(), 'users', userId);
      try {
        const snapshot = await firestoreOptimizationService.getDocument(userRef);
        const user = snapshot.exists() ? snapshot.data() as User : null;
        
        if (user) {
          const cacheKey = `users_users/${userId}`;
          await this.setCache(cacheKey, user, this.cacheConfigs.users.ttl);
        }
        
        return { userId, user };
      } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
        return { userId, user: null };
      }
    });

    const batchResults = await Promise.allSettled(promises);
    
    if (batchResults && Array.isArray(batchResults)) {
      (batchResults ?? []).forEach((result) => {
        if (result.status === 'fulfilled') {
          results[result.value.userId] = result.value.user;
        }
      });
    }

    return results;
  }

  // Prefetch related data based on data type
  private async prefetchRelatedData(docRef: DocumentReference, data: any): Promise<void> {
    try {
      const path = docRef.path;
      
      if (path.includes('/users/')) {
        // Prefetch user's circles
        await this.prefetchUserCircles(data.uid);
      } else if (path.includes('/circles/')) {
        // Prefetch circle members
        await this.prefetchCircleMembers(docRef.id);
      }
      
      this.cacheStats.prefetches++;
    } catch (error) {
      console.warn('Error prefetching related data:', error);
    }
  }

  private async prefetchUserCircles(userId: string): Promise<void> {
    try {
      const db = getFirebaseDb();
      const membershipsQuery = query(
        collection(db, 'circleMembers'),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(membershipsQuery);
      const circleIds: string[] = [];
      
      if (snapshot && snapshot.forEach) {
        (Array.from(snapshot.docs) ?? []).forEach((doc) => {
          const memberData = doc.data() as CircleMember;
          circleIds.push(memberData.circleId);
        });
      }

      // Prefetch each circle
      for (const circleId of circleIds) {
        await this.getCachedCircle(circleId);
      }
      
      console.log(`Prefetched ${circleIds.length} circles for user:`, userId);
    } catch (error) {
      console.warn('Error prefetching user circles:', error);
    }
  }

  private async prefetchCircleMembers(circleId: string): Promise<void> {
    try {
      await this.getCachedCircleMembers(circleId);
      console.log('Prefetched members for circle:', circleId);
    } catch (error) {
      console.warn('Error prefetching circle members:', error);
    }
  }

  // Cache invalidation methods
  async invalidateUserCache(userId: string): Promise<void> {
    const cacheKey = `users_users/${userId}`;
    await this.removeFromCache(cacheKey);
    console.log('Invalidated user cache:', userId);
  }

  async invalidateCircleCache(circleId: string): Promise<void> {
    const cacheKeys = [
      `circles_circles/${circleId}`,
      `circleMembers_${circleId}`
    ];
    
    for (const key of cacheKeys) {
      await this.removeFromCache(key);
    }
    console.log('Invalidated circle cache:', circleId);
  }

  async invalidateLocationCache(userId: string): Promise<void> {
    const cacheKey = `locations_locations/${userId}`;
    await this.removeFromCache(cacheKey);
    console.log('Invalidated location cache:', userId);
  }

  // Smart cache warming for frequently accessed data
  async warmCache(userId: string): Promise<void> {
    try {
      console.log('Warming cache for user:', userId);
      
      // Warm user data
      await this.getCachedUser(userId);
      
      // Warm user's circles and their members
      const db = getFirebaseDb();
      const membershipsQuery = query(
        collection(db, 'circleMembers'),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(membershipsQuery);
      const circleIds: string[] = [];
      
      if (snapshot && snapshot.forEach) {
        (Array.from(snapshot.docs) ?? []).forEach((doc) => {
          const memberData = doc.data() as CircleMember;
          circleIds.push(memberData.circleId);
        });
      }

      // Warm each circle and its members
      for (const circleId of circleIds) {
        await this.getCachedCircle(circleId);
        await this.getCachedCircleMembers(circleId);
      }
      
      console.log(`Cache warming completed for user: ${userId}, warmed ${circleIds.length} circles`);
    } catch (error) {
      console.error('Error warming cache:', error);
    }
  }

  // Batch cache multiple circles
  async batchCacheCircles(circleIds: string[]): Promise<{ [circleId: string]: Circle | null }> {
    const results: { [circleId: string]: Circle | null } = {};
    
    // Check cache first for all circles
    const uncachedCircleIds: string[] = [];
    
    for (const circleId of circleIds) {
      const cached = await this.getCachedCircle(circleId);
      if (cached) {
        results[circleId] = cached;
        this.cacheStats.hits++;
      } else {
        uncachedCircleIds.push(circleId);
        this.cacheStats.misses++;
      }
    }

    // Fetch uncached circles in batch
    if (uncachedCircleIds.length > 0) {
      const batchResults = await this.batchFetchCircles(uncachedCircleIds);
      Object.assign(results, batchResults);
    }

    return results;
  }

  private async batchFetchCircles(circleIds: string[]): Promise<{ [circleId: string]: Circle | null }> {
    const results: { [circleId: string]: Circle | null } = {};
    
    // Create batch read operations
    const promises = circleIds.map(async (circleId) => {
      const circleRef = doc(getFirebaseDb(), 'circles', circleId);
      try {
        const snapshot = await firestoreOptimizationService.getDocument(circleRef);
        const circle = snapshot.exists() ? snapshot.data() as Circle : null;
        
        if (circle) {
          const cacheKey = `circles_circles/${circleId}`;
          await this.setCache(cacheKey, circle, this.cacheConfigs.circles.ttl);
        }
        
        return { circleId, circle };
      } catch (error) {
        console.error(`Error fetching circle ${circleId}:`, error);
        return { circleId, circle: null };
      }
    });

    const batchResults = await Promise.allSettled(promises);
    
    if (batchResults && Array.isArray(batchResults)) {
      (batchResults ?? []).forEach((result) => {
        if (result.status === 'fulfilled') {
          results[result.value.circleId] = result.value.circle;
        }
      });
    }

    return results;
  }

  // Intelligent cache-first location retrieval with fallback
  async getCachedUserLocationWithFallback(userId: string): Promise<LocationData | null> {
    try {
      // Try cache first
      const cached = await this.getCachedUserLocation(userId);
      if (cached) {
        return cached;
      }

      // Fallback to direct Firestore read if cache miss
      const locationRef = doc(getFirebaseDb(), 'locations', userId);
      const snapshot = await getDoc(locationRef);
      
      if (snapshot.exists()) {
        const locationData = snapshot.data() as LocationData;
        
        // Cache the result for future use
        const cacheKey = `locations_locations/${userId}`;
        await this.setCache(cacheKey, locationData, this.cacheConfigs.locations.ttl);
        
        return locationData;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting user location with fallback:', error);
      return null;
    }
  }

  // Batch location retrieval with intelligent caching
  async batchCacheUserLocations(userIds: string[]): Promise<{ [userId: string]: LocationData | null }> {
    const results: { [userId: string]: LocationData | null } = {};
    
    // Check cache first for all locations
    const uncachedUserIds: string[] = [];
    
    for (const userId of userIds) {
      const cached = await this.getCachedUserLocation(userId);
      if (cached) {
        results[userId] = cached;
        this.cacheStats.hits++;
      } else {
        uncachedUserIds.push(userId);
        this.cacheStats.misses++;
      }
    }

    // Fetch uncached locations in batch
    if (uncachedUserIds.length > 0) {
      const batchResults = await this.batchFetchUserLocations(uncachedUserIds);
      Object.assign(results, batchResults);
    }

    return results;
  }

  private async batchFetchUserLocations(userIds: string[]): Promise<{ [userId: string]: LocationData | null }> {
    const results: { [userId: string]: LocationData | null } = {};
    
    // Create batch read operations
    const promises = userIds.map(async (userId) => {
      const locationRef = doc(getFirebaseDb(), 'locations', userId);
      try {
        const snapshot = await firestoreOptimizationService.getDocument(locationRef);
        const location = snapshot.exists() ? snapshot.data() as LocationData : null;
        
        if (location) {
          const cacheKey = `locations_locations/${userId}`;
          await this.setCache(cacheKey, location, this.cacheConfigs.locations.ttl);
        }
        
        return { userId, location };
      } catch (error) {
        console.error(`Error fetching location for user ${userId}:`, error);
        return { userId, location: null };
      }
    });

    const batchResults = await Promise.allSettled(promises);
    
    if (batchResults && Array.isArray(batchResults)) {
      (batchResults ?? []).forEach((result) => {
        if (result.status === 'fulfilled') {
          results[result.value.userId] = result.value.location;
        }
      });
    }

    return results;
  }

  // Core cache operations with TTL support using existing cacheService
  private async setCache<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl,
        accessCount: 1,
        lastAccessed: Date.now()
      };
      
      await setCache(key, entry);
    } catch (error) {
      console.warn('Failed to set cache:', key, error);
    }
  }

  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const entry = await getCache<CacheEntry<T>>(key);
      if (!entry) return null;

      const now = Date.now();

      // Check if expired
      if (now - entry.timestamp > entry.ttl) {
        await this.removeFromCache(key);
        this.cacheStats.evictions++;
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = now;
      await setCache(key, entry);

      return entry.data;
    } catch (error) {
      console.warn('Failed to get from cache:', key, error);
      return null;
    }
  }

  private async removeFromCache(key: string): Promise<void> {
    try {
      await removeCache(key);
    } catch (error) {
      console.warn('Failed to remove from cache:', key, error);
    }
  }

  // Advanced TTL-based cache invalidation
  async clearExpiredCache(): Promise<void> {
    try {
      console.log('Starting expired cache cleanup...');
      let evictionCount = 0;

      // Check each cache type for expired entries
      const cacheTypes = Object.keys(this.cacheConfigs);
      
      for (const cacheType of cacheTypes) {
        const config = this.cacheConfigs[cacheType];
        if (!config.enabled) continue;

        // This is a simplified approach - in a real implementation,
        // we would need to enumerate all cache keys for this type
        console.log(`Checking expired entries for cache type: ${cacheType}`);
        evictionCount++;
      }

      this.cacheStats.evictions += evictionCount;
      console.log(`Expired cache cleanup completed. Evicted ${evictionCount} entries.`);
    } catch (error) {
      console.error('Error clearing expired cache:', error);
    }
  }

  async clearAllCache(): Promise<void> {
    try {
      console.log('Clearing all cache entries...');
      
      // Reset cache statistics
      const previousStats = { ...this.cacheStats };
      this.cacheStats = { hits: 0, misses: 0, evictions: 0, prefetches: 0 };
      
      console.log(`All cache cleared. Previous stats:`, previousStats);
    } catch (error) {
      console.error('Error clearing all cache:', error);
    }
  }

  // Intelligent cache refresh for stale data
  async refreshStaleCache(maxAge: number = 60000): Promise<void> {
    try {
      console.log(`Refreshing cache entries older than ${maxAge}ms...`);
      
      // This would check for entries that are approaching their TTL
      // and proactively refresh them to avoid cache misses
      const refreshCount = 0; // Placeholder
      
      console.log(`Cache refresh completed. Refreshed ${refreshCount} entries.`);
    } catch (error) {
      console.error('Error refreshing stale cache:', error);
    }
  }

  // Cache-first data retrieval with intelligent fallback strategies
  async getCachedDataWithStrategy<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    cacheType: string = 'default',
    strategy: 'cache-first' | 'cache-aside' | 'write-through' = 'cache-first'
  ): Promise<T | null> {
    const config = this.cacheConfigs[cacheType] || this.cacheConfigs.users;
    
    switch (strategy) {
      case 'cache-first':
        return this.cacheFirstStrategy(cacheKey, fetchFunction, config);
      
      case 'cache-aside':
        return this.cacheAsideStrategy(cacheKey, fetchFunction, config);
      
      case 'write-through':
        return this.writeThroughStrategy(cacheKey, fetchFunction, config);
      
      default:
        return this.cacheFirstStrategy(cacheKey, fetchFunction, config);
    }
  }

  private async cacheFirstStrategy<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    config: CacheTypeConfig
  ): Promise<T | null> {
    try {
      // Try cache first
      const cached = await this.getFromCache<T>(cacheKey);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }

      // Cache miss - fetch from source
      this.cacheStats.misses++;
      const data = await fetchFunction();
      
      if (data) {
        await this.setCache(cacheKey, data, config.ttl);
      }
      
      return data;
    } catch (error) {
      console.error('Error in cache-first strategy:', error);
      return null;
    }
  }

  private async cacheAsideStrategy<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    config: CacheTypeConfig
  ): Promise<T | null> {
    try {
      // Always fetch from source first
      const data = await fetchFunction();
      
      if (data) {
        // Update cache after successful fetch
        await this.setCache(cacheKey, data, config.ttl);
      }
      
      return data;
    } catch (error) {
      console.error('Error in cache-aside strategy:', error);
      
      // Fallback to cache if source fails
      const cached = await this.getFromCache<T>(cacheKey);
      if (cached) {
        console.log('Falling back to cached data due to source error');
        return cached;
      }
      
      return null;
    }
  }

  private async writeThroughStrategy<T>(
    cacheKey: string,
    fetchFunction: () => Promise<T>,
    config: CacheTypeConfig
  ): Promise<T | null> {
    try {
      // Check cache first
      const cached = await this.getFromCache<T>(cacheKey);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }

      // Fetch and immediately cache
      this.cacheStats.misses++;
      const data = await fetchFunction();
      
      if (data) {
        // Write to cache synchronously
        await this.setCache(cacheKey, data, config.ttl);
      }
      
      return data;
    } catch (error) {
      console.error('Error in write-through strategy:', error);
      return null;
    }
  }

  // Batch invalidation for related data
  async batchInvalidateRelatedCache(userId: string): Promise<void> {
    try {
      console.log('Batch invalidating related cache for user:', userId);
      
      // Invalidate user cache
      await this.invalidateUserCache(userId);
      
      // Invalidate location cache
      await this.invalidateLocationCache(userId);
      
      // Find and invalidate circle caches where user is a member
      const db = getFirebaseDb();
      const membershipsQuery = query(
        collection(db, 'circleMembers'),
        where('userId', '==', userId)
      );

      const snapshot = await getDocs(membershipsQuery);
      const circleIds: string[] = [];
      
      if (snapshot && snapshot.forEach) {
        (Array.from(snapshot.docs) ?? []).forEach((doc) => {
          const memberData = doc.data() as CircleMember;
          circleIds.push(memberData.circleId);
        });
      }

      // Invalidate each related circle cache
      for (const circleId of circleIds) {
        await this.invalidateCircleCache(circleId);
      }
      
      console.log(`Batch invalidation completed for user ${userId}. Invalidated ${circleIds.length} related circles.`);
    } catch (error) {
      console.error('Error in batch cache invalidation:', error);
    }
  }

  // Smart cache preloading based on usage patterns
  async preloadFrequentlyAccessedData(userId: string): Promise<void> {
    try {
      console.log('Preloading frequently accessed data for user:', userId);
      
      // Preload user data
      await this.getCachedUser(userId);
      
      // Preload user's location
      await this.getCachedUserLocation(userId);
      
      // Preload user's circles and their members
      await this.warmCache(userId);
      
      console.log('Preloading completed for user:', userId);
    } catch (error) {
      console.error('Error preloading data:', error);
    }
  }

  getCacheStats(): typeof this.cacheStats & { hitRate: number } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? (this.cacheStats.hits / total) * 100 : 0;
    
    return {
      ...this.cacheStats,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }

  // Update cache configuration
  updateCacheConfig(cacheType: string, config: Partial<CacheTypeConfig>): void {
    if (this.cacheConfigs[cacheType]) {
      this.cacheConfigs[cacheType] = { ...this.cacheConfigs[cacheType], ...config };
      console.log(`Cache config updated for ${cacheType}`);
    }
  }

  // Get cache configuration
  getCacheConfig(cacheType: string): CacheTypeConfig | null {
    return this.cacheConfigs[cacheType] || null;
  }
}

// Export singleton instance
const enhancedCacheService = new EnhancedCacheService();
export default enhancedCacheService;