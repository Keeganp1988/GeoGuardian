// Shared Firebase utility functions to reduce code duplication

import { 
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  DocumentReference,
  DocumentData,
  QuerySnapshot,
  DocumentSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/firebase';

// Common Firebase operations wrapper
export class FirebaseUtils {
  private static db = getFirebaseDb();

  // Get document with error handling
  static async getDocument<T = DocumentData>(
    collectionPath: string, 
    docId: string
  ): Promise<T | null> {
    try {
      const docRef = doc(this.db, collectionPath, docId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? (docSnap.data() as T) : null;
    } catch (error) {
      // Error getting document - handled by caller
      return null;
    }
  }

  // Update document with error handling
  static async updateDocument(
    collectionPath: string, 
    docId: string, 
    data: Partial<DocumentData>
  ): Promise<boolean> {
    try {
      const docRef = doc(this.db, collectionPath, docId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      // Error updating document - handled by caller
      return false;
    }
  }

  // Set document with error handling
  static async setDocument(
    collectionPath: string, 
    docId: string, 
    data: DocumentData
  ): Promise<boolean> {
    try {
      const docRef = doc(this.db, collectionPath, docId);
      await setDoc(docRef, {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      // Error setting document - handled by caller
      return false;
    }
  }

  // Subscribe to document changes with error handling
  static subscribeToDocument<T = DocumentData>(
    collectionPath: string,
    docId: string,
    callback: (data: T | null) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const docRef = doc(this.db, collectionPath, docId);
    return onSnapshot(
      docRef,
      (docSnap) => {
        const data = docSnap.exists() ? (docSnap.data() as T) : null;
        callback(data);
      },
      (error) => {
        // Error subscribing to document - handled by onError callback
        onError?.(error);
      }
    );
  }

  // Subscribe to collection changes with error handling
  static subscribeToCollection<T = DocumentData>(
    collectionPath: string,
    queryConstraints: Parameters<typeof query>[1][] = [],
    callback: (data: T[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const collectionRef = collection(this.db, collectionPath);
    const q = queryConstraints.length > 0 
      ? query(collectionRef, ...queryConstraints)
      : collectionRef;
    
    return onSnapshot(
      q,
      (querySnapshot) => {
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as T));
        callback(data);
      },
      (error) => {
        // Error subscribing to collection - handled by onError callback
        onError?.(error);
      }
    );
  }

  // Batch operations with error handling
  static async executeBatch(operations: Array<{
    type: 'set' | 'update' | 'delete';
    ref: DocumentReference;
    data?: DocumentData;
  }>): Promise<boolean> {
    try {
      const batch = writeBatch(this.db);
      
      operations.forEach(({ type, ref, data }) => {
        switch (type) {
          case 'set':
            if (data) {
              batch.set(ref, {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
            break;
          case 'update':
            if (data) {
              batch.update(ref, {
                ...data,
                updatedAt: serverTimestamp(),
              });
            }
            break;
          case 'delete':
            batch.delete(ref);
            break;
        }
      });

      await batch.commit();
      return true;
    } catch (error) {
      // Error executing batch operations - handled by caller
      return false;
    }
  }
}

// Common Firebase service patterns
export const createFirebaseSubscription = <T>(
  subscriptionFn: () => Unsubscribe,
  onData: (data: T) => void,
  onError?: (error: Error) => void
): (() => void) => {
  let unsubscribe: Unsubscribe | null = null;
  
  try {
    unsubscribe = subscriptionFn();
  } catch (error) {
    // Error creating Firebase subscription - handled by onError callback
    onError?.(error as Error);
  }
  
  return () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
};

// Firebase error interface
interface FirebaseError extends Error {
  code: string;
  message: string;
}

// Common error handling for Firebase operations
export const handleFirebaseError = (error: FirebaseError | Error, operation: string): void => {
  // Only log in development environment
  if (process.env.NODE_ENV === 'development') {
    console.error(`Firebase ${operation} error:`, error);
    
    // You can add more specific error handling here
    if ('code' in error) {
      if (error.code === 'permission-denied') {
        console.error('Permission denied for Firebase operation');
      } else if (error.code === 'unavailable') {
        console.error('Firebase service unavailable');
      }
    }
  }
};