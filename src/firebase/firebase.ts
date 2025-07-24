import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore, doc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from '@react-native-async-storage/async-storage';


const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_APP_ID,
};

// Validate Firebase config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase configuration is incomplete:', firebaseConfig);
  throw new Error('Firebase configuration is missing required fields');
}

console.log("FIREBASE CONFIG:", firebaseConfig);

console.log('🟢 firebase.ts: File loaded');

// Initialize Firebase app
let app: any;
let firebaseAuth: any = null;
let firebaseDb: any = null;
let firebaseStorage: any = null;
let firebaseReady = false;

// Initialize Firebase services
function initializeFirebaseServices() {
  console.log('🔥 initializeFirebaseServices: Starting Firebase initialization...');

  // Add performance monitoring
  if (process.env.NODE_ENV === 'development') {
    const startTime = Date.now();
    setTimeout(() => {
      console.log(`⏱️ Firebase initialization took ${Date.now() - startTime}ms`);
    }, 0);
  }

  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
      console.log("✅ Firebase app initialized successfully");
    } else {
      app = getApp();
      console.log("✅ Using existing Firebase app");
    }

    // Initialize Firebase Auth - Firebase handles persistence automatically in React Native
    try {
      firebaseAuth = initializeAuth(app);
      console.log("✅ Firebase Auth initialized with default persistence");
    } catch (error) {
      // If initializeAuth fails (e.g., already initialized), use getAuth
      console.log("🔧 Using existing Firebase Auth instance");
      firebaseAuth = getAuth(app);
    }
    firebaseDb = getFirestore(app);
    firebaseStorage = getStorage(app);

    firebaseReady = true;
    console.log("✅ Firebase services initialized successfully");

    return { auth: firebaseAuth, db: firebaseDb, storage: firebaseStorage, isReady: firebaseReady };
  } catch (error) {
    console.error("❌ Error initializing Firebase services:", error);

    // Check if it's a service unavailable error
    if (error instanceof Error && (
      error.message.includes('network') ||
      error.message.includes('unavailable') ||
      error.message.includes('timeout') ||
      error.message.includes('connection')
    )) {
      console.error("🌐 Firebase service unavailable - please try again later");
      throw new Error('Firebase service unavailable. Please try again later.');
    }

    throw error;
  }
}

// Initialize Firebase lazily - only when needed
let firebaseServices: any = null;

// Export services - removed immediate destructuring

// Export getter functions that ensure Firebase is ready
export function getFirebaseAuth() {
  if (!firebaseServices) {
    firebaseServices = initializeFirebaseServices();
  }
  if (!firebaseReady) {
    throw new Error('Firebase not ready');
  }
  return firebaseAuth;
}

export function getFirebaseDb() {
  if (!firebaseServices) {
    firebaseServices = initializeFirebaseServices();
  }
  if (!firebaseReady) {
    throw new Error('Firebase not ready');
  }
  return firebaseDb;
}

export function getFirebaseStorage() {
  if (!firebaseServices) {
    firebaseServices = initializeFirebaseServices();
  }
  if (!firebaseReady) {
    throw new Error('Firebase not ready');
  }
  return firebaseStorage;
}

export function isFirebaseReady() {
  if (!firebaseServices) {
    firebaseServices = initializeFirebaseServices();
  }
  return firebaseReady;
}

// Firestore collections
export const COLLECTIONS = {
  USERS: 'users',
  CIRCLES: 'circles',
  CIRCLE_MEMBERS: 'circleMembers',
  LOCATIONS: 'locations',
  EMERGENCY_ALERTS: 'emergencyAlerts',
  INVITE_LINKS: 'inviteLinks',
} as const;

// Helper function to get user document reference
export const getUserDoc = (userId: string) => {
  const firebaseDb = getFirebaseDb();
  if (!firebaseDb) {
    throw new Error('Firebase not ready');
  }
  return doc(firebaseDb, COLLECTIONS.USERS, userId);
};

// Helper function to get circle document reference
export const getCircleDoc = (circleId: string) => {
  const firebaseDb = getFirebaseDb();
  if (!firebaseDb) {
    throw new Error('Firebase not ready');
  }
  return doc(firebaseDb, COLLECTIONS.CIRCLES, circleId);
};

// Helper function to get location document reference
export const getLocationDoc = (userId: string) => {
  const firebaseDb = getFirebaseDb();
  if (!firebaseDb) {
    throw new Error('Firebase not ready');
  }
  return doc(firebaseDb, COLLECTIONS.LOCATIONS, userId);
};

// Helper function to get emergency alert document reference
export const getEmergencyAlertDoc = (alertId: string) => {
  const firebaseDb = getFirebaseDb();
  if (!firebaseDb) {
    throw new Error('Firebase not ready');
  }
  return doc(firebaseDb, COLLECTIONS.EMERGENCY_ALERTS, alertId);
};
