import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { MarkerData } from './CircleMap';

export interface PinMarkerProps {
  marker: MarkerData;
  theme: string;
  onPress?: () => void;
}

const PinMarker: React.FC<PinMarkerProps> = ({ marker, onPress }) => {
  const [imageError, setImageError] = useState(false);

  // Simple debug logging
  console.log(`[PinMarker] Rendering ${marker.title} (${marker.id})`);

  // Get user initials for fallback display - consistent with MemberCard
  const getInitials = (name?: string): string => {
    if (!name) return 'M';
    const initials = name.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    return initials;
  };

  // Get profile color - matches MemberCard logic
  const getProfileColor = (): string => {
    const color = marker.isUser 
      ? '#4F46E5' // Indigo for current user - consistent with MemberCard
      : marker.member?.profileColor || '#4F46E5'; // Use same default as MemberCard
    
    return color;
  };

  // Get border color for user distinction and spaced markers
  const getBorderColor = (): string => {
    let color: string;
    
    // Add subtle visual indicator for spaced markers
    if (marker.displayCoordinate) {
      color = marker.isUser ? '#6366F1' : '#34D399';
    } else if (marker.isUser) {
      color = '#6366F1'; // Lighter indigo for user border
    } else {
      color = '#FFFFFF'; // White border for other users
    }
    
    return color;
  };

  // Get border width for spaced markers
  const getBorderWidth = (): number => {
    const width = marker.displayCoordinate ? 2 : 3;
    return width;
  };

  // Determine if we should show profile image
  const shouldShowImage = marker.member?.user?.profileImage && !imageError;


  // Get display text for fallback
  const getDisplayText = (): string => {
    const text = marker.isUser 
      ? 'Y' // 'You' indicator for current user
      : getInitials(marker.member?.user?.name);
    
    return text;
  };

  const profileColor = getProfileColor();
  const borderColor = getBorderColor();
  const borderWidth = getBorderWidth();

  // Pin is now a reasonable size: 44x44px head with 8x12px point

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 100,  // Much larger
        height: 100, // Much larger
        backgroundColor: profileColor,
        borderRadius: 50,
        borderWidth: 6,  // Thicker border
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 10,
      }}
    >
      {/* Profile Picture or Initial */}
      {shouldShowImage ? (
        <Image
          source={{ uri: marker.member!.user!.profileImage! }}
          style={{
            width: 80,  // Much larger image
            height: 80, // Much larger image
            borderRadius: 40,
          }}
          resizeMode="cover"
          onError={() => {
            setImageError(true);
          }}
        />
      ) : (
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 32,  // Much larger text
            fontWeight: 'bold',
          }}
        >
          {getDisplayText()}
        </Text>
      )}
    </View>
  );
};

export default PinMarker;