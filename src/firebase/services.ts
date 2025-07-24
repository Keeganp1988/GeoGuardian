import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";
import { getFirebaseDb, getFirebaseAuth, COLLECTIONS, getUserDoc, getCircleDoc, getLocationDoc, getEmergencyAlertDoc } from "./firebase";

import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import axios from 'axios';
import { DataSanitizer, FirebaseSecurityValidator } from '../utils/dataSecurity';
import { DataSanitizer as CoreDataSanitizer } from '../utils/dataSanitizer';
import { TypeValidator } from '../utils/typeValidation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../utils/errorHandling';

// Import secure operations
import { SecureFirebaseOperations, EnhancedFirebaseSecurityValidator } from '../utils/secureFirebaseOperations';

// Enhanced utility function to clean location data for Firestore with security validation
const cleanLocationDataForFirestore = (locationData: any): any => {
  // Use the secure data sanitizer instead of basic cleaning
  const sanitized = DataSanitizer.sanitizeLocationData(locationData);
  if (!sanitized) {
    throw new Error('Invalid location data provided');
  }
  return sanitized;
};

// Types
export interface User {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  createdAt: Date;
  lastSeen: Date;
  isOnline: boolean;
}

export interface Circle {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
}

export interface CircleMember {
  id: string;
  circleId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  invitedBy?: string; // Who invited this user
  user?: User;
}

export interface InviteLink {
  id: string;
  circleId?: string;
  privateConnectionId?: string;
  createdBy: string; // Who created the link
  expiresAt: Date;
  isUsed: boolean;
  usedBy?: string; // Who used the link
  usedAt?: Date;
  linkCode: string; // Unique identifier for the link
  type: 'group' | '1on1';
}

export interface LocationData {
  userId: string;
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date; // Last update timestamp (used for heartbeats and general updates)
  arrivalTimestamp?: Date; // When user first arrived at this location (stays fixed until they move)
  heartbeatTimestamp?: Date; // Last heartbeat timestamp (for online/offline status)
  accuracy?: number;
  speed?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  circleMembers: string[]; // Array of user IDs who can access this location
}

export interface LocationHistoryEntry {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: Date;
  accuracy?: number;
  speed?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  movementType: 'stationary' | 'walking' | 'driving' | 'unknown';
  circleMembers: string[]; // Array of user IDs who can access this history entry
}

export interface TripSummary {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  startLocation: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  endLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  totalDistance: number; // in meters
  averageSpeed: number; // in km/h
  maxSpeed: number; // in km/h
  duration: number; // in seconds
  movementType: 'walking' | 'driving' | 'mixed';
  isActive: boolean;
  circleMembers: string[]; // Array of user IDs who can access this trip
}

export interface EmergencyAlert {
  id: string;
  userId: string;
  circleId: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  timestamp: Date;
  status: 'active' | 'resolved';
  message?: string;
}

// Private 1on1 Connection Types
export interface PrivateConnection {
  id: string;
  userA: string;
  userB: string;
  createdAt: Date;
  status: 'active' | 'pending';
  lastActivityAt?: Date;
  // New per-user alert and permission fields
  isSOSContactA?: boolean;
  isCrashContactA?: boolean;
  canPingDeviceA?: boolean;
  isSOSContactB?: boolean;
  isCrashContactB?: boolean;
  canPingDeviceB?: boolean;
}

// Create a new private 1on1 connection
type CreatePrivateConnectionInput = {
  userA: string;
  userB: string;
};

// User Services - Enhanced with security validation
export const createUser = async (userData: Omit<User, 'uid' | 'createdAt' | 'lastSeen' | 'isOnline'>) => {
  try {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase Auth not ready');

    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const user: User = {
      ...userData,
      uid: userId,
      createdAt: new Date(),
      lastSeen: new Date(),
      isOnline: true,
    };

    const userDoc = getUserDoc(userId);
    if (!userDoc) throw new Error('Firebase not ready');

    // Use secure operation with validation and sanitization
    await SecureFirebaseOperations.secureSetDoc(userDoc, user);
    return user;
  } catch (error) {
    ErrorHandler.logError(
      error,
      ErrorCategory.FIREBASE,
      ErrorSeverity.HIGH,
      'createUser'
    );
    throw error;
  }
};

export const getUser = async (userId: string): Promise<User | null> => {
  const userDoc = getUserDoc(userId);
  if (!userDoc) throw new Error('Firebase not ready');

  const doc = await getDoc(userDoc);
  return doc.exists() ? { uid: doc.id, ...doc.data() } as User : null;
};

export const updateUserOnlineStatus = async (userId: string, isOnline: boolean) => {
  const userDoc = getUserDoc(userId);
  if (!userDoc) throw new Error('Firebase not ready');

  await updateDoc(userDoc, {
    isOnline,
    lastSeen: new Date(),
  });
};

export const updateUserProfile = async (userId: string, updates: Partial<User>) => {
  try {
    const userDoc = getUserDoc(userId);
    if (!userDoc) throw new Error('Firebase not ready');

    // Use secure profile update with validation
    await SecureFirebaseOperations.secureUserProfileUpdate(userDoc, {
      ...updates,
      updatedAt: new Date(),
    });
  } catch (error) {
    ErrorHandler.logError(
      error,
      ErrorCategory.FIREBASE,
      ErrorSeverity.HIGH,
      'updateUserProfile'
    );
    throw error;
  }
};

// Helper to get denormalized user info
const getDenormalizedUserInfo = async (userId: string) => {
  const user = await getUser(userId);
  return {
    userName: user?.name || '',
    userProfileImage: user?.profileImage || '',
    userEmail: user?.email || '',
  };
};

// Circle Services
export const createCircle = async (circleData: Omit<Circle, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>) => {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) throw new Error('User not authenticated');

  const circleRef = await addDoc(collection(getFirebaseDb(), COLLECTIONS.CIRCLES), {
    ...circleData,
    ownerId: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    memberCount: 1,
  });

  // Add owner as member with denormalized user info
  const userInfo = await getDenormalizedUserInfo(userId);
  await addDoc(collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS), {
    circleId: circleRef.id,
    userId,
    role: 'owner',
    joinedAt: serverTimestamp(),
    invitedBy: null, // Owner has no inviter
    ...userInfo,
  });

  return {
    id: circleRef.id,
    ...circleData,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberCount: 1,
  } as Circle;
};

export const getCirclesForUser = async (userId: string): Promise<Circle[]> => {
  const membersQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
    where('userId', '==', userId)
  );

  const memberDocs = await getDocs(membersQuery);
  const circleIds = memberDocs.docs.map(doc => doc.data().circleId);

  const circles: Circle[] = [];
  for (const circleId of circleIds) {
    const circleDoc = await getDoc(getCircleDoc(circleId));
    if (circleDoc.exists()) {
      circles.push({ id: circleDoc.id, ...circleDoc.data() } as Circle);
    }
  }

  return circles;
};

export const getCircleMembers = async (circleId: string): Promise<CircleMember[]> => {
  try {
    const membersQuery = query(
      collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
      where('circleId', '==', circleId)
    );
    const memberDocs = await getDocs(membersQuery);
    const members: CircleMember[] = [];
    const docs = CoreDataSanitizer.getSafeArray(memberDocs.docs, 'getCircleMembers');

    for (const memberDoc of docs) {
      try {
        const memberData = CoreDataSanitizer.sanitizeFirebaseDocument(memberDoc.data(), 'memberData');

        // Validate required fields
        const validation = TypeValidator.validateFirebaseDocument(memberData, ['circleId', 'userId'], 'CircleMember');
        if (!validation.isValid) {
          console.warn('Invalid circle member data:', validation.errors);
          continue;
        }

        const safeMember: CircleMember = {
          id: memberDoc.id || '',
          circleId: memberData.circleId || '',
          userId: memberData.userId || '',
          role: (memberData.role as 'owner' | 'admin' | 'member') || 'member',
          joinedAt: memberData.joinedAt?.toDate?.() || new Date(),
          invitedBy: memberData.invitedBy || undefined,
          user: {
            uid: memberData.userId || '',
            name: memberData.userName || 'Unknown User',
            email: memberData.userEmail || '',
            profileImage: memberData.userProfileImage || undefined,
            phone: '',
            createdAt: new Date(),
            lastSeen: new Date(),
            isOnline: false,
          },
        };

        members.push(safeMember);
      } catch (memberError) {
        ErrorHandler.logError(
          memberError,
          ErrorCategory.FIREBASE,
          ErrorSeverity.LOW,
          `getCircleMembers - processing member ${memberDoc.id}`
        );
      }
    }

    return CoreDataSanitizer.getSafeArray(members, 'getCircleMembers result');
  } catch (error) {
    ErrorHandler.logError(
      error,
      ErrorCategory.FIREBASE,
      ErrorSeverity.HIGH,
      'getCircleMembers'
    );
    return [];
  }
};

export const joinCircle = async (inviteCode: string, userId: string) => {
  // Find circle by invite code
  const circlesQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLES),
    where('inviteCode', '==', inviteCode)
  );

  const circleDocs = await getDocs(circlesQuery);
  if (circleDocs.empty) throw new Error('Invalid invite code');

  const circleDoc = circleDocs.docs[0];
  const circleId = circleDoc.id;

  // Check if user is already a member
  const existingMemberQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
    where('circleId', '==', circleId),
    where('userId', '==', userId)
  );

  const existingMember = await getDocs(existingMemberQuery);
  if (!existingMember.empty) throw new Error('Already a member of this circle');

  // Add user as member with denormalized user info
  const userInfo = await getDenormalizedUserInfo(userId);
  await addDoc(collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS), {
    circleId,
    userId,
    role: 'member',
    joinedAt: serverTimestamp(),
    ...userInfo,
  });

  // Update member count
  await updateDoc(getCircleDoc(circleId), {
    memberCount: circleDoc.data().memberCount + 1,
    updatedAt: serverTimestamp(),
  });
};

export const leaveCircle = async (circleId: string, userId: string) => {
  // Find and remove member
  const memberQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
    where('circleId', '==', circleId),
    where('userId', '==', userId)
  );

  const memberDocs = await getDocs(memberQuery);
  if (!memberDocs.empty) {
    await deleteDoc(memberDocs.docs[0].ref);
  }

  // Update member count
  const circleDoc = await getDoc(getCircleDoc(circleId));
  if (circleDoc.exists()) {
    await updateDoc(getCircleDoc(circleId), {
      memberCount: circleDoc.data().memberCount - 1,
      updatedAt: serverTimestamp(),
    });
  }
};

// Location Services
export const updateUserLocation = async (
  locationData: LocationData,
  updateType: 'location' | 'heartbeat' | 'battery' = 'location'
) => {
  try {
    const userId = getFirebaseAuth().currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    // Prepare data based on update type
    let updateData: any = {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      address: locationData.address,
      accuracy: locationData.accuracy,
      speed: locationData.speed,
      batteryLevel: locationData.batteryLevel,
      isCharging: locationData.isCharging,
      circleMembers: locationData.circleMembers,
      timestamp: locationData.timestamp,
    };

    // Handle different update types
    switch (updateType) {
      case 'location':
        // Full location update - include arrival timestamp if provided
        if (locationData.arrivalTimestamp) {
          updateData.arrivalTimestamp = locationData.arrivalTimestamp;
        }
        if (locationData.heartbeatTimestamp) {
          updateData.heartbeatTimestamp = locationData.heartbeatTimestamp;
        }
        break;

      case 'heartbeat':
        // Heartbeat update - only update heartbeat timestamp and battery
        updateData = {
          batteryLevel: locationData.batteryLevel,
          isCharging: locationData.isCharging,
          heartbeatTimestamp: locationData.heartbeatTimestamp || locationData.timestamp,
          // Preserve existing location data
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          address: locationData.address,
          accuracy: locationData.accuracy,
          speed: locationData.speed,
          circleMembers: locationData.circleMembers,
        };
        break;

      case 'battery':
        // Battery update - only update battery data and heartbeat timestamp
        updateData = {
          batteryLevel: locationData.batteryLevel,
          isCharging: locationData.isCharging,
          heartbeatTimestamp: locationData.heartbeatTimestamp || locationData.timestamp,
          // Preserve existing location data
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          address: locationData.address,
          accuracy: locationData.accuracy,
          speed: locationData.speed,
          circleMembers: locationData.circleMembers,
        };
        break;
    }

    // Use secure location update with enhanced validation
    await SecureFirebaseOperations.secureLocationUpdate(
      getLocationDoc(userId),
      updateData,
      locationData.circleMembers
    );

    console.log(`[Firebase] Location updated - Type: ${updateType}`, {
      hasArrivalTimestamp: !!updateData.arrivalTimestamp,
      hasHeartbeatTimestamp: !!updateData.heartbeatTimestamp,
      batteryLevel: updateData.batteryLevel
    });

  } catch (error) {
    ErrorHandler.logError(
      error,
      ErrorCategory.LOCATION,
      ErrorSeverity.HIGH,
      'updateUserLocation'
    );
    throw error;
  }
};

// Heartbeat function for stationary users and battery updates
export const sendHeartbeat = async (
  heartbeatData: {
    batteryLevel?: number;
    isCharging?: boolean;
    heartbeatType: 'stationary' | 'battery';
  },
  circleMembers: string[] = []
) => {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) throw new Error('User not authenticated');

  const heartbeatDoc = {
    userId,
    lastSeen: serverTimestamp(),
    isOnline: true,
    heartbeatType: heartbeatData.heartbeatType,
    circleMembers,
    ...(heartbeatData.batteryLevel !== undefined && { batteryLevel: heartbeatData.batteryLevel }),
    ...(heartbeatData.isCharging !== undefined && { isCharging: heartbeatData.isCharging }),
  };

  await setDoc(getLocationDoc(userId), heartbeatDoc);
};

export const getUserLocation = async (userId: string): Promise<LocationData | null> => {
  const doc = await getDoc(getLocationDoc(userId));
  if (doc.exists()) {
    const data = doc.data();
    return {
      ...data,
      timestamp: data.timestamp?.toDate() || new Date(),
    } as LocationData;
  }
  return null;
};

export const getCircleMembersLocations = async (circleId: string): Promise<LocationData[]> => {
  const members = await getCircleMembers(circleId);
  const locations: LocationData[] = [];

  for (const member of members) {
    const location = await getUserLocation(member.userId);
    if (location) {
      locations.push(location);
    }
  }

  return locations;
};

// Real-time listeners
export const subscribeToUserLocation = (userId: string, callback: (location: LocationData | null) => void) => {
  return onSnapshot(getLocationDoc(userId), (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      // Convert Firestore timestamps to Date objects
      const locationData: LocationData = {
        ...data,
        timestamp: data.timestamp?.toDate() || new Date(),
        arrivalTimestamp: data.arrivalTimestamp?.toDate() || undefined,
        heartbeatTimestamp: data.heartbeatTimestamp?.toDate() || undefined,
      } as LocationData;
      callback(locationData);
    } else {
      callback(null);
    }
  });
};

export const subscribeToCircleMembers = (circleId: string, callback: (members: CircleMember[]) => void) => {
  const membersQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
    where('circleId', '==', circleId)
  );
  return onSnapshot(membersQuery, async (snapshot) => {
    try {
      const members: CircleMember[] = [];
      const docs = CoreDataSanitizer.getSafeArray(snapshot.docs, 'subscribeToCircleMembers');

      for (const memberDoc of docs) {
        try {
          const memberData = CoreDataSanitizer.sanitizeFirebaseDocument(memberDoc.data(), 'memberData');

          // Validate required fields
          const validation = TypeValidator.validateFirebaseDocument(memberData, ['circleId', 'userId'], 'CircleMember');
          if (!validation.isValid) {
            console.warn('Invalid circle member data:', validation.errors);
            continue;
          }

          const safeMember: CircleMember = {
            id: memberDoc.id || '',
            circleId: memberData.circleId || '',
            userId: memberData.userId || '',
            role: (memberData.role as 'owner' | 'admin' | 'member') || 'member',
            joinedAt: memberData.joinedAt?.toDate?.() || new Date(),
            invitedBy: memberData.invitedBy || undefined,
            user: {
              uid: memberData.userId || '',
              name: memberData.userName || 'Unknown User',
              email: memberData.userEmail || '',
              profileImage: memberData.userProfileImage || undefined,
              phone: '',
              createdAt: new Date(),
              lastSeen: new Date(),
              isOnline: false,
            },
          };

          members.push(safeMember);
        } catch (memberError) {
          ErrorHandler.logError(
            memberError,
            ErrorCategory.FIREBASE,
            ErrorSeverity.LOW,
            `subscribeToCircleMembers - processing member ${memberDoc.id}`
          );
        }
      }

      // Always call callback with safe array
      callback(CoreDataSanitizer.getSafeArray(members, 'subscribeToCircleMembers callback'));
    } catch (error) {
      ErrorHandler.logError(
        error,
        ErrorCategory.FIREBASE,
        ErrorSeverity.HIGH,
        'subscribeToCircleMembers'
      );
      // Call callback with empty safe array on error
      callback([]);
    }
  });
};

// Emergency Services
export const createEmergencyAlert = async (alertData: Omit<EmergencyAlert, 'id' | 'timestamp'>) => {
  const alertRef = await addDoc(collection(getFirebaseDb(), COLLECTIONS.EMERGENCY_ALERTS), {
    ...alertData,
    timestamp: serverTimestamp(),
    status: 'active',
  });

  return {
    id: alertRef.id,
    ...alertData,
    timestamp: new Date(),
    status: 'active',
  } as EmergencyAlert;
};

export const resolveEmergencyAlert = async (alertId: string) => {
  await updateDoc(getEmergencyAlertDoc(alertId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
  });
};

export const getActiveEmergencyAlerts = async (circleId: string): Promise<EmergencyAlert[]> => {
  const alertsQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.EMERGENCY_ALERTS),
    where('circleId', '==', circleId),
    where('status', '==', 'active'),
    orderBy('timestamp', 'desc')
  );

  const alertDocs = await getDocs(alertsQuery);
  return alertDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }) as EmergencyAlert);
};

// Invite Link Services
export const createInviteLink = async (
  options: { circleId?: string; privateConnectionId?: string; createdBy: string; type: 'group' | '1on1' }
): Promise<InviteLink> => {
  const { circleId, privateConnectionId, createdBy, type } = options;
  if (type === 'group') {
    // Check if user is a member of the circle
    const memberQuery = query(
      collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
      where('circleId', '==', circleId),
      where('userId', '==', createdBy)
    );
    const memberDocs = await getDocs(memberQuery);
    if (memberDocs.empty) throw new Error('You are not a member of this circle');
  }
  // Generate unique link code
  const linkCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  // Set expiration to 6 hours from now
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 6);
  const inviteLinkRef = await addDoc(collection(getFirebaseDb(), COLLECTIONS.INVITE_LINKS), {
    circleId: type === 'group' ? circleId : null,
    privateConnectionId: type === '1on1' ? privateConnectionId : null,
    createdBy,
    expiresAt,
    isUsed: false,
    linkCode,
    type,
    createdAt: serverTimestamp(),
  });
  return {
    id: inviteLinkRef.id,
    circleId,
    privateConnectionId,
    createdBy,
    expiresAt,
    isUsed: false,
    linkCode,
    type,
  } as InviteLink;
};

export const validateInviteLink = async (linkCode: string): Promise<InviteLink> => {
  const linkQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.INVITE_LINKS),
    where('linkCode', '==', linkCode),
    where('isUsed', '==', false),
    where('expiresAt', '>', new Date())
  );
  const linkDocs = await getDocs(linkQuery);
  if (linkDocs.empty) throw new Error('Invalid or expired invite link');
  const linkDoc = linkDocs.docs[0];
  return { id: linkDoc.id, ...linkDoc.data() } as InviteLink;
};

export interface UseInviteLinkResult {
  id: string;
  type: 'group' | '1on1';
  circleId?: string;
  privateConnectionId?: string;
  createdBy: string;
  otherUserId?: string; // For 1on1 connections, the other user in the connection
}

export const useInviteLink = async (linkCode: string, userId: string): Promise<UseInviteLinkResult> => {
  const inviteLink = await validateInviteLink(linkCode);
  if (inviteLink.type === 'group') {
    if (!inviteLink.circleId) throw new Error('Invalid group invite link: missing circleId');
    // Existing group logic
    const existingMemberQuery = query(
      collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
      where('circleId', '==', inviteLink.circleId),
      where('userId', '==', userId)
    );
    const existingMember = await getDocs(existingMemberQuery);
    if (!existingMember.empty) throw new Error('Already a member of this circle');
    // Ensure user document exists
    const userDoc = await getDoc(getUserDoc(userId));
    if (!userDoc.exists()) {
      await setDoc(getUserDoc(userId), {
        uid: userId,
        name: 'User',
        email: '',
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        isOnline: true,
      });
    }
    await updateDoc(doc(getFirebaseDb(), COLLECTIONS.INVITE_LINKS, inviteLink.id), {
      isUsed: true,
      usedBy: userId,
      usedAt: serverTimestamp(),
    });
    // Add user as member with denormalized user info
    const userInfo = await getDenormalizedUserInfo(userId);
    await addDoc(collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS), {
      circleId: inviteLink.circleId,
      userId,
      role: 'member',
      joinedAt: serverTimestamp(),
      invitedBy: inviteLink.createdBy,
      ...userInfo,
    });
    const circleDoc = await getDoc(getCircleDoc(inviteLink.circleId));
    if (circleDoc.exists()) {
      await updateDoc(getCircleDoc(inviteLink.circleId), {
        memberCount: circleDoc.data().memberCount + 1,
        updatedAt: serverTimestamp(),
      });
    }
    return {
      id: inviteLink.circleId,
      type: 'group',
      circleId: inviteLink.circleId,
      createdBy: inviteLink.createdBy
    };
  } else if (inviteLink.type === '1on1') {
    if (!inviteLink.privateConnectionId) throw new Error('Invalid 1on1 invite link: missing privateConnectionId');
    // 1on1 logic: add user to private connection
    const privateConnRef = doc(getFirebaseDb(), 'privateConnections', inviteLink.privateConnectionId);
    const privateConnDoc = await getDoc(privateConnRef);
    if (!privateConnDoc.exists()) throw new Error('Invalid 1on1 connection');
    const privateConn = privateConnDoc.data();
    // Only allow if user is not already in the connection
    if (privateConn.userA === userId || privateConn.userB === userId) throw new Error('Already in this 1on1 connection');

    // Get the other user ID (userA is the creator)
    const otherUserId = privateConn.userA;

    // Set userB as the joining user
    await updateDoc(privateConnRef, {
      userB: userId,
      status: 'active',
      lastActivityAt: serverTimestamp(),
    });
    await updateDoc(doc(getFirebaseDb(), COLLECTIONS.INVITE_LINKS, inviteLink.id), {
      isUsed: true,
      usedBy: userId,
      usedAt: serverTimestamp(),
    });
    return {
      id: inviteLink.privateConnectionId,
      type: '1on1',
      privateConnectionId: inviteLink.privateConnectionId,
      createdBy: inviteLink.createdBy,
      otherUserId
    };
  }
  throw new Error('Unknown invite link type');
};

export const getVisibleMembers = async (circleId: string, userId: string): Promise<CircleMember[]> => {
  const allMembersQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
    where('circleId', '==', circleId)
  );
  const allMembersDocs = await getDocs(allMembersQuery);
  const allMembers: CircleMember[] = [];
  for (const memberDoc of allMembersDocs.docs) {
    const memberData = memberDoc.data();
    allMembers.push({
      id: memberDoc.id,
      ...memberData,
      user: {
        uid: memberData.userId,
        name: memberData.userName || '',
        email: memberData.userEmail || '',
        profileImage: memberData.userProfileImage || '',
        phone: '',
        createdAt: new Date(),
        lastSeen: new Date(),
        isOnline: false,
      },
    } as CircleMember);
  }
  return allMembers;
};

export const cleanupExpiredInviteLinks = async () => {
  const expiredLinksQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.INVITE_LINKS),
    where('expiresAt', '<', new Date()),
    where('isUsed', '==', false)
  );

  const expiredLinks = await getDocs(expiredLinksQuery);

  for (const linkDoc of expiredLinks.docs) {
    await deleteDoc(linkDoc.ref);
  }
};

// Location History Services
export const saveLocationHistory = async (
  userId: string,
  locationData: Omit<LocationHistoryEntry, 'id' | 'userId' | 'timestamp' | 'circleMembers'>,
  circleMembers: string[]
) => {
  // Clean the location data to remove undefined values
  const cleanedLocationData = cleanLocationDataForFirestore(locationData);

  const historyRef = await addDoc(
    collection(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'history'),
    {
      ...cleanedLocationData,
      userId,
      timestamp: serverTimestamp(),
      circleMembers,
    }
  );

  return {
    id: historyRef.id,
    ...cleanedLocationData,
    userId,
    timestamp: new Date(),
    circleMembers,
  } as LocationHistoryEntry;
};

export const getLocationHistory = async (
  userId: string,
  limitCount: number = 50
): Promise<LocationHistoryEntry[]> => {
  const historyQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'history'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const historyDocs = await getDocs(historyQuery);
  return historyDocs.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      timestamp: data.timestamp?.toDate() || new Date(),
    } as LocationHistoryEntry;
  });
};

export const getLocationHistoryForDateRange = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<LocationHistoryEntry[]> => {
  const historyQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'history'),
    where('timestamp', '>=', startDate),
    where('timestamp', '<=', endDate),
    orderBy('timestamp', 'asc')
  );

  const historyDocs = await getDocs(historyQuery);
  return historyDocs.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      timestamp: data.timestamp?.toDate() || new Date(),
    } as LocationHistoryEntry;
  });
};

// Trip Services
export const createTripSummary = async (
  userId: string,
  tripData: Omit<TripSummary, 'id' | 'userId' | 'circleMembers'>,
  circleMembers: string[]
): Promise<TripSummary> => {
  const tripRef = await addDoc(
    collection(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'trips'),
    {
      ...tripData,
      userId,
      circleMembers,
    }
  );

  return {
    id: tripRef.id,
    ...tripData,
    userId,
    circleMembers,
  } as TripSummary;
};

export const updateTripSummary = async (
  userId: string,
  tripId: string,
  updates: Partial<TripSummary>
): Promise<void> => {
  await updateDoc(
    doc(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'trips', tripId),
    updates
  );
};

export const getTripSummaries = async (
  userId: string,
  limitCount: number = 20
): Promise<TripSummary[]> => {
  const tripsQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'trips'),
    orderBy('startTime', 'desc'),
    limit(limitCount)
  );

  const tripDocs = await getDocs(tripsQuery);
  return tripDocs.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      startTime: data.startTime?.toDate() || new Date(),
      endTime: data.endTime?.toDate() || undefined,
    } as TripSummary;
  });
};

export const getActiveTrip = async (userId: string): Promise<TripSummary | null> => {
  const activeTripQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.LOCATIONS, userId, 'trips'),
    where('isActive', '==', true),
    limit(1)
  );

  const activeTripDocs = await getDocs(activeTripQuery);
  if (activeTripDocs.empty) return null;

  const data = activeTripDocs.docs[0].data();
  return {
    id: activeTripDocs.docs[0].id,
    ...data,
    startTime: data.startTime?.toDate() || new Date(),
    endTime: data.endTime?.toDate() || undefined,
  } as TripSummary;
};

// Helper function to determine movement type based on speed
export const determineMovementType = (speed: number): 'stationary' | 'walking' | 'driving' | 'unknown' => {
  if (speed === 0 || speed < 0.5) return 'stationary';
  if (speed < 10) return 'walking';
  if (speed >= 10) return 'driving';
  return 'unknown';
};

// Helper function to calculate distance between two points (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Helper function to format time display
export const formatTimeDisplay = (timestamp: Date): string => {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60));

  // If within 59 minutes, show time only
  if (diffInMinutes <= 59) {
    return timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  // Check if it's yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = timestamp.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Yesterday at ${timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  }

  // Check if it's within the last 7 days
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (timestamp > weekAgo) {
    // Show day name and time
    const dayName = timestamp.toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName} ${timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })}`;
  }

  // Show date and time for older entries
  return `${timestamp.toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit'
  })} ${timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
};

// Private Connection Services
export const createPrivateConnection = async ({ userA, userB }: CreatePrivateConnectionInput): Promise<PrivateConnection> => {
  const ref = await addDoc(collection(getFirebaseDb(), 'privateConnections'), {
    userA,
    userB,
    createdAt: serverTimestamp(),
    status: 'active',
    // Initialize per-user alert and permission fields to false
    isSOSContactA: false,
    isCrashContactA: false,
    canPingDeviceA: false,
    isSOSContactB: false,
    isCrashContactB: false,
    canPingDeviceB: false,
  });
  return {
    id: ref.id,
    userA,
    userB,
    createdAt: new Date(),
    status: 'active',
    // Return initialized fields as well
    isSOSContactA: false,
    isCrashContactA: false,
    canPingDeviceA: false,
    isSOSContactB: false,
    isCrashContactB: false,
    canPingDeviceB: false,
  };
};

export const getPrivateConnectionsForUser = async (userId: string): Promise<PrivateConnection[]> => {
  const q = query(
    collection(getFirebaseDb(), 'privateConnections'),
    where('status', '==', 'active'),
    where('userA', '==', userId)
  );
  const q2 = query(
    collection(getFirebaseDb(), 'privateConnections'),
    where('status', '==', 'active'),
    where('userB', '==', userId)
  );
  const [snapA, snapB] = await Promise.all([getDocs(q), getDocs(q2)]);
  const results: PrivateConnection[] = [];
  if (snapA) {
    (Array.from(snapA.docs) ?? []).forEach(doc => results.push({ id: doc.id, ...doc.data() } as PrivateConnection));
  }
  if (snapB) {
    (Array.from(snapB.docs) ?? []).forEach(doc => results.push({ id: doc.id, ...doc.data() } as PrivateConnection));
  }
  return results;
};

/**
 * Update the current user's alert/permission fields in a private connection.
 * @param connectionId The Firestore document ID of the private connection
 * @param userId The current user's UID
 * @param updates An object with any of: isSOSContact, isCrashContact, canPingDevice
 */
export const updatePrivateConnectionSettings = async (
  connectionId: string,
  userId: string,
  updates: {
    isSOSContact?: boolean;
    isCrashContact?: boolean;
    canPingDevice?: boolean;
  }
) => {
  const ref = doc(getFirebaseDb(), 'privateConnections', connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Private connection not found');
  const data = snap.data();
  let updateFields: Record<string, boolean> = {};
  if (data.userA === userId) {
    if (updates.isSOSContact !== undefined) updateFields.isSOSContactA = updates.isSOSContact;
    if (updates.isCrashContact !== undefined) updateFields.isCrashContactA = updates.isCrashContact;
    if (updates.canPingDevice !== undefined) updateFields.canPingDeviceA = updates.canPingDevice;
  } else if (data.userB === userId) {
    if (updates.isSOSContact !== undefined) updateFields.isSOSContactB = updates.isSOSContact;
    if (updates.isCrashContact !== undefined) updateFields.isCrashContactB = updates.isCrashContact;
    if (updates.canPingDevice !== undefined) updateFields.canPingDeviceB = updates.canPingDevice;
  } else {
    throw new Error('User is not part of this private connection');
  }
  await updateDoc(ref, updateFields);
};

// Optionally, implement joinPrivateConnection if you want invite-based joining
// ... existing code ...

export const updateCircle = async (circleId: string, updates: Partial<Circle>) => {
  await updateDoc(getCircleDoc(circleId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const deleteCircle = async (circleId: string) => {
  // Delete all members
  const membersQuery = query(
    collection(getFirebaseDb(), COLLECTIONS.CIRCLE_MEMBERS),
    where('circleId', '==', circleId)
  );
  const memberDocs = await getDocs(membersQuery);
  for (const memberDoc of memberDocs.docs) {
    await deleteDoc(memberDoc.ref);
  }
  // Delete the circle itself
  await deleteDoc(getCircleDoc(circleId));
};

// Change current user's password
export const changeUserPassword = async (oldPassword: string, newPassword: string) => {
  const user = getFirebaseAuth().currentUser;
  if (!user || !user.email) throw new Error('User not authenticated');

  // Re-authenticate user
  const credential = EmailAuthProvider.credential(user.email, oldPassword);
  await reauthenticateWithCredential(user, credential);

  // Update password
  await updatePassword(user, newPassword);
};

// Send low battery notification to circle members
export async function sendLowBatteryNotification(userId: string, batteryLevel: number, circleMembers: string[]): Promise<void> {
  try {
    const userDoc = await getDoc(doc(getFirebaseDb(), 'users', userId));
    if (!userDoc.exists()) {
      console.error('User document not found for low battery notification');
      return;
    }

    const userData = userDoc.data();
    const userName = userData.displayName || userData.email || 'Unknown User';

    // Create notification data
    const notificationData = {
      type: 'low_battery',
      userId: userId,
      userName: userName,
      batteryLevel: batteryLevel,
      timestamp: serverTimestamp(),
      message: `${userName}'s battery is at ${batteryLevel}%`,
      isRead: false,
    };

    // Send notification to each circle member
    const notificationPromises = circleMembers.map(async (memberId) => {
      if (memberId === userId) return; // Don't send notification to self

      const notificationRef = doc(collection(getFirebaseDb(), 'users', memberId, 'notifications'));
      await setDoc(notificationRef, notificationData);
    });

    await Promise.all(notificationPromises);
    console.log(`Low battery notification sent to ${circleMembers.length - 1} circle members for user ${userId}`);

  } catch (error) {
    console.error('Failed to send low battery notification:', error);
  }
}

// User-to-user Alert Types
export interface UserAlert {
  id?: string;
  type: 'sos' | 'crash' | 'acknowledgment';
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  recipientId: string;
  timestamp: any; // Firestore timestamp
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  acknowledged: boolean;
  acknowledgedAt?: any; // Firestore timestamp
  message?: string;
  isRead: boolean;
  // Additional fields for acknowledgment alerts
  originalAlertId?: string;
  originalAlertType?: 'sos' | 'crash';
}

/**
 * Send a push notification via Expo to a single device
 */
export const sendExpoPushNotification = async (expoPushToken: string, title: string, body: string, data?: any) => {
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    });
    console.log('✅ Push notification sent to', expoPushToken);
  } catch (err) {
    console.error('❌ Failed to send push notification:', err);
  }
};

/**
 * Create a user alert in /users/{recipientId}/alerts/{alertId} and send push notification
 */
export const createUserAlert = async (alert: Omit<UserAlert, 'id' | 'timestamp' | 'acknowledged' | 'acknowledgedAt' | 'isRead'>) => {
  const { recipientId, senderName, type, location, ...rest } = alert;
  const alertsCollection = collection(getFirebaseDb(), 'users', recipientId, 'alerts');
  const docRef = await addDoc(alertsCollection, {
    ...rest,
    recipientId,
    senderName,
    type,
    location,
    timestamp: serverTimestamp(),
    acknowledged: false,
    acknowledgedAt: null,
    isRead: false,
  });

  // Fetch recipient's expoPushToken from Firestore
  try {
    const { getUserDoc } = await import('./firebase');
    const { getDoc } = await import('firebase/firestore');
    const userDocRef = getUserDoc(recipientId);
    const userSnap = await getDoc(userDocRef);
    const expoPushToken = userSnap.exists() ? userSnap.data().expoPushToken : null;
    if (expoPushToken) {
      const title = type === 'sos' ? 'SOS Alert' : 'Crash Alert';
      const body = `${senderName} sent you a ${type === 'sos' ? 'SOS' : 'Crash'} alert! Tap to view.`;
      await sendExpoPushNotification(expoPushToken, title, body, { alertId: docRef.id, type, location });
    } else {
      console.warn('No expoPushToken found for recipient', recipientId);
    }
  } catch (err) {
    console.error('Error sending push notification after alert creation:', err);
  }

  return docRef.id;
};

// Enhanced Invite Link Services for Deep Linking
export interface InviteWithUserInfo extends InviteLink {
  inviterName: string;
  inviterAvatar?: string;
  inviterEmail?: string;
}

/**
 * Get invite link with inviter user information for display
 */
export const getInviteWithUserInfo = async (linkCode: string): Promise<InviteWithUserInfo> => {
  try {
    // First validate the invite link
    const inviteLink = await validateInviteLink(linkCode);

    // Get inviter user information
    const inviterUser = await getUser(inviteLink.createdBy);
    if (!inviterUser) {
      throw new Error('Inviter user not found');
    }

    // Combine invite link with user info
    const inviteWithUserInfo: InviteWithUserInfo = {
      ...inviteLink,
      inviterName: inviterUser.name,
      inviterAvatar: inviterUser.profileImage,
      inviterEmail: inviterUser.email,
    };

    return inviteWithUserInfo;
  } catch (error) {
    console.error('[Firebase] Error getting invite with user info:', error);
    throw error;
  }
};

/**
 * Generate invite URL for deep linking
 */
export const generateInviteURL = (linkCode: string): string => {
  return `geoguardian://invite/${linkCode}`;
};

/**
 * Generate web fallback URL for invite links
 */
export const generateWebFallbackURL = (linkCode: string): string => {
  return `https://geoguardian.app/invite/${linkCode}`;
};