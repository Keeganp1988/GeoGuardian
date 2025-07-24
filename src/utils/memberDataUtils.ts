import { CircleMember, LocationData } from '../firebase/services';
import { MemberData } from '../components/MemberCard';
import { resolveDisplayName, hasNickname } from '../services/cacheService';

// Enhanced member data interface with nickname support
export interface EnhancedMemberData extends MemberData {
  userId: string; // Always present for Firestore queries (same as id)
  originalName: string; // Original username from Firestore
  displayName: string; // Nickname if set, otherwise original name
  hasNickname: boolean; // Flag to indicate if nickname is set
}

/**
 * Transform CircleMember to MemberData with nickname resolution
 */
export const memberToDataWithNickname = async (
  member: CircleMember,
  currentUserId: string,
  memberLocations: Map<string, LocationData>,
  fiveMinutesMs: number = 5 * 60 * 1000
): Promise<EnhancedMemberData> => {
  const location = memberLocations.get(member.userId);
  const now = new Date();
  const lastUpdate = location?.timestamp ? new Date(location.timestamp) : null;
  const isOnline = lastUpdate && (now.getTime() - lastUpdate.getTime() <= fiveMinutesMs);

  // Set lastSeen for offline users
  let lastSeen: Date | undefined;
  if (!isOnline && lastUpdate) {
    lastSeen = lastUpdate;
  }

  const originalName = member.user?.name || 'Unknown';
  const displayName = await resolveDisplayName(currentUserId, member.userId, originalName);
  const hasNicknameSet = await hasNickname(currentUserId, member.userId);

  return {
    id: member.userId, // This satisfies the MemberData interface
    userId: member.userId, // Additional field for Firestore queries
    name: displayName, // This will be the nickname if set, otherwise original name
    originalName,
    displayName,
    hasNickname: hasNicknameSet,
    avatar: member.user?.profileImage,
    battery: location?.batteryLevel ?? 0,
    isCharging: location?.isCharging ?? false,
    location: {
      address: location?.address || "Location not available",
      timestamp: location?.timestamp || new Date(),
      latitude: location?.latitude,
      longitude: location?.longitude,
      movementType: isOnline ? (location?.speed !== undefined ? (location?.speed < 1 ? 'stationary' : location?.speed < 10 ? 'walking' : 'driving') : 'unknown') : 'offline',
    },
    online: !!isOnline,
    lastSeen: lastSeen,
  };
};

/**
 * Transform multiple CircleMembers to MemberData with nickname resolution
 */
export const bulkMemberToDataWithNickname = async (
  members: CircleMember[],
  currentUserId: string,
  memberLocations: Map<string, LocationData>,
  fiveMinutesMs: number = 5 * 60 * 1000
): Promise<EnhancedMemberData[]> => {
  const results = [];

  for (const member of members) {
    const memberData = await memberToDataWithNickname(member, currentUserId, memberLocations, fiveMinutesMs);
    results.push(memberData);
  }

  return results;
};

/**
 * Apply nickname to existing MemberData
 */
export const applyNicknameToMemberData = async (
  memberData: MemberData,
  currentUserId: string
): Promise<EnhancedMemberData> => {
  const originalName = memberData.name;
  const displayName = await resolveDisplayName(currentUserId, memberData.id, originalName);
  const hasNicknameSet = await hasNickname(currentUserId, memberData.id);

  return {
    ...memberData,
    userId: memberData.id,
    originalName,
    displayName,
    hasNickname: hasNicknameSet,
    name: displayName, // Override the name field with display name
  };
};

/**
 * Apply nicknames to multiple existing MemberData objects
 */
export const bulkApplyNicknameToMemberData = async (
  memberDataList: MemberData[],
  currentUserId: string
): Promise<EnhancedMemberData[]> => {
  const results = [];

  for (const memberData of memberDataList) {
    const enhancedData = await applyNicknameToMemberData(memberData, currentUserId);
    results.push(enhancedData);
  }

  return results;
};

/**
 * Create a member data transformation function that includes nickname resolution
 * This is a higher-order function that returns a memberToData function with nickname support
 */
export const createMemberToDataWithNickname = (
  currentUserId: string,
  memberLocations: Map<string, LocationData>,
  fiveMinutesMs: number = 5 * 60 * 1000
) => {
  return async (member: CircleMember): Promise<EnhancedMemberData> => {
    return await memberToDataWithNickname(member, currentUserId, memberLocations, fiveMinutesMs);
  };
};

/**
 * Utility to refresh member data with updated nicknames
 * Useful when nicknames are changed and you need to update existing member data
 */
export const refreshMemberDataWithNicknames = async (
  members: CircleMember[],
  currentUserId: string,
  memberLocations: Map<string, LocationData>,
  fiveMinutesMs: number = 5 * 60 * 1000
): Promise<EnhancedMemberData[]> => {
  return await bulkMemberToDataWithNickname(members, currentUserId, memberLocations, fiveMinutesMs);
};

/**
 * Update a single member data object with current nickname
 * Useful for real-time updates when a nickname changes
 */
export const updateMemberDataWithNickname = async (
  memberData: EnhancedMemberData,
  currentUserId: string
): Promise<EnhancedMemberData> => {
  const displayName = await resolveDisplayName(currentUserId, memberData.userId, memberData.originalName);
  const hasNicknameSet = await hasNickname(currentUserId, memberData.userId);

  return {
    ...memberData,
    displayName,
    hasNickname: hasNicknameSet,
    name: displayName, // Update the name field
  };
};

/**
 * Filter member data by nickname or original name
 */
export const filterMemberDataByName = (
  memberDataList: EnhancedMemberData[],
  searchTerm: string
): EnhancedMemberData[] => {
  const searchLower = searchTerm.toLowerCase().trim();
  if (!searchLower) return memberDataList;

  return memberDataList.filter(member =>
    member.originalName.toLowerCase().includes(searchLower) ||
    member.displayName.toLowerCase().includes(searchLower)
  );
};

/**
 * Sort member data by display name (nickname-aware)
 */
export const sortMemberDataByDisplayName = (
  memberDataList: EnhancedMemberData[],
  ascending: boolean = true
): EnhancedMemberData[] => {
  return [...memberDataList].sort((a, b) => {
    const nameA = a.displayName.toLowerCase();
    const nameB = b.displayName.toLowerCase();

    if (ascending) {
      return nameA.localeCompare(nameB);
    } else {
      return nameB.localeCompare(nameA);
    }
  });
};

/**
 * Group member data by nickname status
 */
export const groupMemberDataByNicknameStatus = (
  memberDataList: EnhancedMemberData[]
): { withNicknames: EnhancedMemberData[]; withoutNicknames: EnhancedMemberData[] } => {
  const withNicknames: EnhancedMemberData[] = [];
  const withoutNicknames: EnhancedMemberData[] = [];

  (memberDataList ?? []).forEach(member => {
    if (member.hasNickname) {
      withNicknames.push(member);
    } else {
      withoutNicknames.push(member);
    }
  });

  return { withNicknames, withoutNicknames };
};

/**
 * Create a member data lookup map by user ID with nickname support
 */
export const createMemberDataLookupMap = (
  memberDataList: EnhancedMemberData[]
): Map<string, EnhancedMemberData> => {
  const lookupMap = new Map<string, EnhancedMemberData>();

  (memberDataList ?? []).forEach(member => {
    lookupMap.set(member.userId, member);
  });

  return lookupMap;
};

/**
 * Validate and sanitize nickname input
 */
export const validateNickname = (nickname: string): { isValid: boolean; sanitized: string; error?: string } => {
  if (!nickname || typeof nickname !== 'string') {
    return { isValid: false, sanitized: '', error: 'Nickname must be a non-empty string' };
  }

  const sanitized = nickname.trim();

  if (sanitized.length === 0) {
    return { isValid: false, sanitized: '', error: 'Nickname cannot be empty' };
  }

  if (sanitized.length > 50) {
    return { isValid: false, sanitized: sanitized.substring(0, 50), error: 'Nickname cannot exceed 50 characters' };
  }

  // Check for invalid characters (optional - adjust based on requirements)
  const invalidChars = /[<>]/;
  if (invalidChars.test(sanitized)) {
    return { isValid: false, sanitized: sanitized.replace(invalidChars, ''), error: 'Nickname contains invalid characters' };
  }

  return { isValid: true, sanitized };
};