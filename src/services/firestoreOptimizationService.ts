import { 
  writeBatch, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  collection,
  query,
  DocumentReference,
  DocumentData,
  QuerySnapshot,
  DocumentSnapshot,
  WriteBatch,
  serverTimestamp,
  getFirebaseDb,
} from '../utils/sharedImports';
import { setCache, getCache, removeCache } from './cacheService';

// Types for batching operations
export interface BatchOperation {
  type: 'set' | 'update' | 'delete' | 'add';
  ref: DocumentReference | string; // string for collection path when adding
  data?: any;
  options?: any;
  id?: string; // unique identifier for deduplication
}

export interface QueuedRead {
  ref: DocumentReference;
  resolve: (snapshot: DocumentSnapshot) => void;
  reject: (error: Error) => void;
  id: string;
  timestamp: number;
}

export interface QueuedQuery {
  query: any;
  resolve: (snapshot: QuerySnapshot) => void;
  reject: (error: Error) => void;
  id: string;
  timestamp: number;
}

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of cached items
  enabled: boolean;
}

export interface OptimizationConfig {
  batchSize: number;
  batchTimeout: number; // milliseconds
  readBatchSize: number;
  readBatchTimeout: number;
  cache: {
    users: CacheConfig;
    circles: CacheConfig;
    locations: CacheConfig;
    default: CacheConfig;
  };
  deduplicationWindow: number; // milliseconds
}

class FirestoreOptimizationService {
  private writeQueue: BatchOperation[] = [];
  private readQueue: QueuedRead[] = [];
  private queryQueue: QueuedQuery[] = [];
  private writeBatchTimer: NodeJS.Timeout | null = null;
  private readBatchTimer: NodeJS.Timeout | null = null;
  private queryBatchTimer: NodeJS.Timeout | null = null;
  private pendingOperations = new Map<string, Promise<any>>();
  private cacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    evictions: 0
  };

  private config: OptimizationConfig = {
    batchSize: 10,
    batchTimeout: 1000, // 1 second
    readBatchSize: 5,
    readBatchTimeout: 500, // 0.5 seconds
    cache: {
      users: { ttl: 5 * 60 * 1000, maxSize: 100, enabled: true }, // 5 minutes
      circles: { ttl: 10 * 60 * 1000, maxSize: 50, enabled: true }, // 10 minutes
      locations: { ttl: 30 * 1000, maxSize: 200, enabled: true }, // 30 seconds
      default: { ttl: 2 * 60 * 1000, maxSize: 100, enabled: true } // 2 minutes
    },
    deduplicationWindow: 5000 // 5 seconds
  };

  // Initialize the optimization service
  async initialize(customConfig?: Partial<OptimizationConfig>): Promise<void> {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
    console.log('Firestore optimization service initialized');
  }

  // Optimized document read with caching and deduplication
  async getDocument(ref: DocumentReference, useCache: boolean = true): Promise<DocumentSnapshot> {
    const cacheKey = `doc_${ref.path}`;
    const operationId = `read_${ref.path}`;

    // Check for pending operation (deduplication)
    if (this.pendingOperations.has(operationId)) {
      console.log('Deduplicating read operation:', ref.path);
      return this.pendingOperations.get(operationId)!;
    }

    // Check cache first
    if (useCache) {
      const cached = await this.getCachedDocument(cacheKey, ref.path);
      if (cached) {
        this.cacheStats.hits++;
        return cached;
      }
      this.cacheStats.misses++;
    }

    // Create promise for this operation
    const promise = new Promise<DocumentSnapshot>((resolve, reject) => {
      this.readQueue.push({
        ref,
        resolve,
        reject,
        id: operationId,
        timestamp: Date.now()
      });

      // Start batch timer if not already running
      if (!this.readBatchTimer) {
        this.readBatchTimer = setTimeout(() => {
          this.processReadBatch();
        }, this.config.readBatchTimeout);
      }

      // Process immediately if batch is full
      if (this.readQueue.length >= this.config.readBatchSize) {
        this.processReadBatch();
      }
    });

    // Store pending operation for deduplication
    this.pendingOperations.set(operationId, promise);

    // Clean up after operation completes
    promise.finally(() => {
      this.pendingOperations.delete(operationId);
    });

    return promise;
  }

  // Process batched read operations
  private async processReadBatch(): Promise<void> {
    if (this.readBatchTimer) {
      clearTimeout(this.readBatchTimer);
      this.readBatchTimer = null;
    }

    if (this.readQueue.length === 0) return;

    const batch = this.readQueue.splice(0, this.config.readBatchSize);
    console.log(`Processing read batch of ${batch.length} operations`);

    // Execute reads in parallel
    const promises = batch.map(async (queuedRead) => {
      try {
        const snapshot = await getDoc(queuedRead.ref);
        
        // Cache the result
        await this.cacheDocument(queuedRead.ref.path, snapshot);
        
        queuedRead.resolve(snapshot);
      } catch (error) {
        queuedRead.reject(error as Error);
      }
    });

    await Promise.allSettled(promises);
  }

  // Optimized batch write operations
  async batchWrite(operations: BatchOperation[]): Promise<void> {
    // Add operations to queue with deduplication
    for (const operation of operations) {
      const existingIndex = this.writeQueue.findIndex(op => 
        op.id && operation.id && op.id === operation.id
      );
      
      if (existingIndex >= 0) {
        // Replace existing operation (deduplication)
        console.log('Deduplicating write operation:', operation.id);
        this.writeQueue[existingIndex] = operation;
      } else {
        this.writeQueue.push(operation);
      }
    }

    // Start batch timer if not already running
    if (!this.writeBatchTimer) {
      this.writeBatchTimer = setTimeout(() => {
        this.processWriteBatch();
      }, this.config.batchTimeout);
    }

    // Process immediately if batch is full
    if (this.writeQueue.length >= this.config.batchSize) {
      this.processWriteBatch();
    }
  }

  // Process batched write operations
  private async processWriteBatch(): Promise<void> {
    if (this.writeBatchTimer) {
      clearTimeout(this.writeBatchTimer);
      this.writeBatchTimer = null;
    }

    if (this.writeQueue.length === 0) return;

    const batch = this.writeQueue.splice(0, this.config.batchSize);
    console.log(`Processing write batch of ${batch.length} operations`);

    const db = getFirebaseDb();
    const firestoreBatch = writeBatch(db);

    try {
      for (const operation of batch) {
        switch (operation.type) {
          case 'set':
            if (typeof operation.ref === 'string') {
              throw new Error('Set operation requires DocumentReference');
            }
            firestoreBatch.set(operation.ref, operation.data, operation.options || {});
            break;
          
          case 'update':
            if (typeof operation.ref === 'string') {
              throw new Error('Update operation requires DocumentReference');
            }
            firestoreBatch.update(operation.ref, operation.data);
            break;
          
          case 'delete':
            if (typeof operation.ref === 'string') {
              throw new Error('Delete operation requires DocumentReference');
            }
            firestoreBatch.delete(operation.ref);
            break;
          
          case 'add':
            // For add operations, we need to handle them separately since batch doesn't support add
            if (typeof operation.ref !== 'string') {
              throw new Error('Add operation requires collection path string');
            }
            const collectionRef = collection(db, operation.ref);
            const docRef = doc(collectionRef);
            firestoreBatch.set(docRef, operation.data);
            break;
        }
      }

      await firestoreBatch.commit();
      console.log('Write batch committed successfully');

      // Invalidate cache for affected documents
      for (const operation of batch) {
        if (typeof operation.ref !== 'string') {
          await this.invalidateCache(operation.ref.path);
        }
      }

    } catch (error) {
      console.error('Error committing write batch:', error);
      throw error;
    }
  }

  // Convenience methods for common operations
  async optimizedSetDoc(ref: DocumentReference, data: any, options?: any): Promise<void> {
    const operationId = `set_${ref.path}_${Date.now()}`;
    await this.batchWrite([{
      type: 'set',
      ref,
      data,
      options,
      id: operationId
    }]);
  }

  async optimizedUpdateDoc(ref: DocumentReference, data: any): Promise<void> {
    const operationId = `update_${ref.path}_${Date.now()}`;
    await this.batchWrite([{
      type: 'update',
      ref,
      data,
      id: operationId
    }]);
  }

  async optimizedDeleteDoc(ref: DocumentReference): Promise<void> {
    const operationId = `delete_${ref.path}_${Date.now()}`;
    await this.batchWrite([{
      type: 'delete',
      ref,
      id: operationId
    }]);
  }

  async optimizedAddDoc(collectionPath: string, data: any): Promise<void> {
    const operationId = `add_${collectionPath}_${Date.now()}`;
    await this.batchWrite([{
      type: 'add',
      ref: collectionPath,
      data,
      id: operationId
    }]);
  }

  // Cache management methods
  private async getCachedDocument(cacheKey: string, docPath: string): Promise<DocumentSnapshot | null> {
    try {
      const cached = await getCache<{data: any, timestamp: number, exists: boolean}>(cacheKey);
      if (!cached) return null;

      const config = this.getCacheConfig(docPath);
      const isExpired = Date.now() - cached.timestamp > config.ttl;
      
      if (isExpired) {
        await removeCache(cacheKey);
        return null;
      }

      // Create a mock DocumentSnapshot-like object
      const mockSnapshot = {
        exists: () => cached.exists,
        data: () => cached.data,
        id: docPath.split('/').pop() || '',
        ref: doc(getFirebaseDb(), docPath)
      } as DocumentSnapshot;

      return mockSnapshot;
    } catch (error) {
      console.warn('Error getting cached document:', error);
      return null;
    }
  }

  private async cacheDocument(docPath: string, snapshot: DocumentSnapshot): Promise<void> {
    try {
      const config = this.getCacheConfig(docPath);
      if (!config.enabled) return;

      const cacheKey = `doc_${docPath}`;
      const cacheData = {
        data: snapshot.exists() ? snapshot.data() : null,
        timestamp: Date.now(),
        exists: snapshot.exists()
      };

      await setCache(cacheKey, cacheData);
      this.cacheStats.writes++;
    } catch (error) {
      console.warn('Error caching document:', error);
    }
  }

  private async invalidateCache(docPath: string): Promise<void> {
    try {
      const cacheKey = `doc_${docPath}`;
      await removeCache(cacheKey);
      console.log('Cache invalidated for:', docPath);
    } catch (error) {
      console.warn('Error invalidating cache:', error);
    }
  }

  private getCacheConfig(docPath: string): CacheConfig {
    if (docPath.includes('/users/')) return this.config.cache.users;
    if (docPath.includes('/circles/')) return this.config.cache.circles;
    if (docPath.includes('/locations/')) return this.config.cache.locations;
    return this.config.cache.default;
  }

  // Force flush all pending operations
  async flush(): Promise<void> {
    console.log('Flushing all pending Firestore operations');
    
    // Process any pending writes
    if (this.writeQueue.length > 0) {
      await this.processWriteBatch();
    }

    // Process any pending reads
    if (this.readQueue.length > 0) {
      await this.processReadBatch();
    }
  }

  // Get optimization statistics
  getStats() {
    return {
      cache: { ...this.cacheStats },
      queues: {
        writeQueue: this.writeQueue.length,
        readQueue: this.readQueue.length,
        queryQueue: this.queryQueue.length,
      },
      pendingOperations: this.pendingOperations.size
    };
  }

  // Clear all caches
  async clearCache(): Promise<void> {
    // This would need to be implemented based on the cache keys pattern
    console.log('Clearing all Firestore caches');
    this.cacheStats = { hits: 0, misses: 0, writes: 0, evictions: 0 };
  }

  // Update configuration
  updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Firestore optimization config updated');
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    // Clear all timers
    if (this.writeBatchTimer) {
      clearTimeout(this.writeBatchTimer);
      this.writeBatchTimer = null;
    }
    if (this.readBatchTimer) {
      clearTimeout(this.readBatchTimer);
      this.readBatchTimer = null;
    }
    if (this.queryBatchTimer) {
      clearTimeout(this.queryBatchTimer);
      this.queryBatchTimer = null;
    }

    // Flush any remaining operations
    await this.flush();

    console.log('Firestore optimization service cleaned up');
  }
}

// Export singleton instance
const firestoreOptimizationService = new FirestoreOptimizationService();
export default firestoreOptimizationService;