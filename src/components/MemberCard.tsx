import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeMode } from '../contexts/ThemeContext';
import { EnhancedMemberData } from '../utils/memberDataUtils';

export interface MemberCardLocation {
  address: string;
  timestamp: Date;
  speed?: number;
  latitude?: number;
  longitude?: number;
  movementType?: 'stationary' | 'walking' | 'driving' | 'unknown' | 'offline';
  lastSeen?: Date;
}

export interface MemberData {
  id: string;
  name: string;
  avatar?: string;
  battery: number;
  isCharging: boolean;
  location: MemberCardLocation | null;
  online: boolean;
  lastSeen?: Date;
}

interface MemberCardProps {
  member: MemberData | EnhancedMemberData;
  onPress?: () => void;
  showOriginalName?: boolean; // Optional flag to show original name instead of nickname
  simplified?: boolean; // Optional flag to show simplified card with only avatar and name
}



// Utility function to format timestamps for display
const formatDisplayTimestamp = (date: Date): string => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "Unknown";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Handle negative time differences (future dates)
  if (diffMs < 0) {
    return "Just now";
  }

  // Handle very recent updates (less than 1 minute)
  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60 && now.getDate() === date.getDate() && now.getMonth() === date.getMonth() && now.getFullYear() === date.getFullYear()) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else if (diffDays === 0) {
    // Today, more than 59 minutes ago
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (diffDays === 1) {
    // Yesterday
    return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  } else if (diffDays < 7) {
    // Within last 7 days
    return date.toLocaleDateString([], { weekday: 'long' });
  } else {
    // Older
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
};

// Custom Battery Component
const CustomBatteryIcon = ({ battery, isCharging, isOnline }: { battery: number; isCharging: boolean; isOnline: boolean }) => {
  // Ensure battery is a valid number
  const batteryLevel = typeof battery === 'number' && !isNaN(battery) ? Math.max(0, Math.min(100, battery)) : 0;
  const chargingState = Boolean(isCharging);
  const greyColor = '#A1A1AA';

  const getBatteryColor = () => {
    if (!isOnline) return greyColor;
    if (chargingState) {
      // When charging, always show green unless critically low
      if (batteryLevel < 10) return '#F59E0B';
      return '#22C55E';
    } else {
      // When not charging, color based on level
      if (batteryLevel >= 50) return '#22C55E';  // Green for 50%+
      if (batteryLevel >= 20) return '#F59E0B';  // Amber for 20-49%
      return '#EF4444'; // Red for under 20%
    }
  };

  const getBatteryFillWidth = () => {
    // Calculate fill width based on actual percentage
    const percentage = batteryLevel / 100;
    return Math.max(1, 16 * percentage); // 16px is the inner width, minimum 1px
  };

  const batteryColor = getBatteryColor();
  const fillWidth = getBatteryFillWidth();

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Battery Icon */}
      <View style={{ position: 'relative', width: 22, height: 12 }}>
        {/* Battery Outline */}
        <View style={{
          position: 'absolute',
          left: 0,
          top: 2,
          width: 18,
          height: 8,
          borderWidth: 1,
          borderColor: batteryColor,
          borderRadius: 1,
          backgroundColor: 'transparent'
        }} />
        {/* Battery Fill */}
        <View style={{
          position: 'absolute',
          left: 1,
          top: 3,
          width: fillWidth,
          height: 6,
          backgroundColor: batteryColor,
          borderRadius: 0.5
        }} />
        {/* Battery Terminal (positive end) */}
        <View style={{
          position: 'absolute',
          right: 0,
          top: 4,
          width: 2,
          height: 4,
          backgroundColor: batteryColor,
          borderRadius: 1
        }} />
        {/* Charging Indicator - White Lightning Bolt */}
        {chargingState && isOnline && (
          <Ionicons
            name="flash"
            size={10}
            color="#FFFFFF"
            style={{
              position: 'absolute',
              top: 1,
              left: 6,
              zIndex: 2,
              textShadowColor: 'rgba(0, 0, 0, 0.5)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 1
            }}
          />
        )}
      </View>
      {/* Battery Percentage */}
      <Text style={{ 
        fontSize: 10, 
        fontWeight: 'bold', 
        color: batteryColor,
        marginTop: 2
      }}>
        {`${batteryLevel}%`}
      </Text>
    </View>
  );
};

export default function MemberCard({ member, onPress, showOriginalName = false, simplified = false }: MemberCardProps) {
  const { theme } = useThemeMode();
  
  // Helper function to determine what name to display
  const getDisplayName = (member: MemberData | EnhancedMemberData, showOriginalName: boolean): string => {
    // Check if this is an EnhancedMemberData with nickname support
    const isEnhanced = 'displayName' in member && 'originalName' in member && 'hasNickname' in member;
    
    if (isEnhanced) {
      const enhancedMember = member as EnhancedMemberData;
      if (showOriginalName) {
        // Show original name when explicitly requested
        return enhancedMember.originalName || "Unknown Member";
      } else {
        // Use displayName which will be nickname if set, otherwise original name
        // This ensures nicknames are prioritized when available
        return enhancedMember.displayName || enhancedMember.originalName || "Unknown Member";
      }
    } else {
      // Regular MemberData - just use the name field
      // For regular MemberData, the name field should already contain the appropriate display name
      return member.name || "Unknown Member";
    }
  };



  const getStatusDotColor = (online: boolean) => {
    return online ? '#22C55E' : '#6B7280';
  };

  const getInitials = (name: string) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase();
  };



  const getMovementTypeDisplay = (movementType?: string, online?: boolean) => {
    if (!online) return <Text style={{ fontSize: 12, color: theme === 'dark' ? '#9CA3AF' : '#888' }}>Offline</Text>;
    switch (movementType) {
      case 'stationary': return <Text style={{ fontSize: 12, color: '#16A34A' }}>Stationary</Text>;
      case 'walking': return <Text style={{ fontSize: 12, color: '#D97706' }}>Walking</Text>;
      case 'driving': return <Text style={{ fontSize: 12, color: '#2563EB' }}>Driving</Text>;
      case 'offline': return <Text style={{ fontSize: 12, color: theme === 'dark' ? '#9CA3AF' : '#888' }}>Offline</Text>;
      case 'unknown':
      default: 
        // For online users with unknown movement, show "Active" instead of "Unknown"
        return online 
          ? <Text style={{ fontSize: 12, color: '#16A34A' }}>Active</Text>
          : <Text style={{ fontSize: 12, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Unknown</Text>;
    }
  };

  // Determine what address to show
  let address = 'Location unknown';
  if (member.location) {
    address = member.location.address || 'Location unknown';
  }

  // Timestamp for location display (when user arrived at this location)
  let locationTimeDisplay = 'Unknown';
  if (member.location?.timestamp) {
    const timestamp = new Date(member.location.timestamp);
    console.log(`[MemberCard] Processing arrival timestamp for ${member.name}:`, {
      originalTimestamp: member.location.timestamp,
      parsedTimestamp: timestamp,
      isValidDate: !isNaN(timestamp.getTime()),
      now: new Date(),
      diffMs: new Date().getTime() - timestamp.getTime(),
      isOnline: member.online
    });
    
    // For online users, show when they arrived at current location
    // For offline users, show when they were last seen
    if (member.online) {
      locationTimeDisplay = formatDisplayTimestamp(timestamp);
    } else {
      locationTimeDisplay = `Last seen ${formatDisplayTimestamp(timestamp)}`;
    }
  }

  // Timestamp for last seen (offline)
  let lastSeenDisplay = '';
  if (!member.online && member.lastSeen) {
    lastSeenDisplay = formatDisplayTimestamp(new Date(member.lastSeen));
  }

  // Get the display name to use throughout the component
  const displayName = getDisplayName(member, showOriginalName);

  // Debug battery and charging data
  console.log(`[MemberCard] Battery data for ${displayName}:`, {
    battery: member.battery,
    isCharging: member.isCharging,
    online: member.online,
    batteryType: typeof member.battery,
    chargingType: typeof member.isCharging,
    shouldShowChargingIcon: member.isCharging && member.online,
    locationTimestamp: member.location?.timestamp,
    timestampType: typeof member.location?.timestamp
  });

  // Simplified version for connections screen
  if (simplified) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{ 
          backgroundColor: theme === 'dark' ? '#1F2937' : '#F9FAFB', 
          borderRadius: 12, 
          padding: 12, 
          flexDirection: 'row', 
          alignItems: 'center', 
          marginBottom: 8, 
          shadowColor: '#000', 
          shadowOffset: { width: 0, height: 1 }, 
          shadowOpacity: 0.05, 
          shadowRadius: 2, 
          elevation: 1 
        }}
      >
        {/* Avatar only */}
        <View style={{ alignItems: 'center', justifyContent: 'center', width: 56 }}>
          {member.avatar ? (
            <Image source={{ uri: member.avatar }} style={{ width: 48, height: 48, borderRadius: 24 }} />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>
                {getInitials(displayName)}
              </Text>
            </View>
          )}
        </View>

        {/* Name only */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#111827' }} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Full version (existing implementation)
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{ backgroundColor: theme === 'dark' ? '#1F2937' : '#F9FAFB', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
    >
      {/* Avatar and Battery */}
      <View style={{ alignItems: 'center', justifyContent: 'space-between', width: 56 }}>
        <View style={{ position: 'relative' }}>
          {member.avatar ? (
            <Image source={{ uri: member.avatar }} style={{ width: 48, height: 48, borderRadius: 24 }} />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>
                {getInitials(displayName)}
              </Text>
            </View>
          )}
          <View style={{ position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: theme === 'dark' ? '#1F2937' : '#F9FAFB', backgroundColor: getStatusDotColor(member.online) }} />
        </View>
        {/* Battery below avatar */}
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <CustomBatteryIcon battery={member.battery} isCharging={member.isCharging} isOnline={member.online} />
        </View>
      </View>

      {/* Member Info */}
      <View style={{ flex: 1, marginLeft: 8 }}>
        {/* Name */}
        <Text style={{ fontSize: 18, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#111827' }} numberOfLines={1}>
          {displayName}
        </Text>
        {/* Address and Movement Type Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }} numberOfLines={2}>
              {address}
            </Text>
            {/* Location timestamp under address */}
            <Text style={{ fontSize: 12, color: theme === 'dark' ? '#6B7280' : '#A1A1AA', marginTop: 2 }}>
              {locationTimeDisplay}
            </Text>
          </View>
          <View style={{ marginLeft: 8, alignItems: 'flex-end' }}>
            {getMovementTypeDisplay(member.location?.movementType, member.online)}
            {/* Last seen timestamp under movement status if offline */}
            {!member.online && lastSeenDisplay && (
              <Text style={{ fontSize: 12, color: theme === 'dark' ? '#6B7280' : '#A1A1AA', marginTop: 2 }}>
                {lastSeenDisplay}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
