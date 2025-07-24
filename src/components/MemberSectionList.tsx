import React, { useState, useRef, useCallback } from 'react';
import { SectionList, Text, View, ScrollView, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import MemberCard, { MemberData } from './MemberCard';
import { CircleMember } from '../firebase/services';
import { useThemeMode } from '../contexts/ThemeContext';

interface Section {
  title: string;
  data: CircleMember[];
}

interface MemberSectionListProps {
  sections: Section[];
  memberToData: (member: CircleMember) => MemberData;
  handleMemberPress: (member: CircleMember) => void;
  height?: number;
  selectedMember?: CircleMember | null;
  overlayMode?: 'collapsed' | 'member' | 'tripHistory';
  onTripHistorySwipeUp?: () => void;
  onBackToList?: () => void;
  containerStyle?: object;
  scrollGestureHandlerRef?: any;
  onTripHistoryAtTopChange?: (atTop: boolean) => void;
}

const MemberSectionList: React.FC<MemberSectionListProps> = ({
  sections,
  memberToData,
  handleMemberPress,
  height = 250,
  selectedMember,
  overlayMode = 'collapsed',
  onTripHistorySwipeUp,
  onBackToList,
  containerStyle = {},
  scrollGestureHandlerRef,
  onTripHistoryAtTopChange,
}) => {
  const { theme } = useThemeMode();
  const [selectedTripIndex, setSelectedTripIndex] = useState<number | null>(null);
  const scrollY = useRef(0);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const atTop = y <= 0;
    if (onTripHistoryAtTopChange) onTripHistoryAtTopChange(atTop);
    scrollY.current = y;
  }, [onTripHistoryAtTopChange]);

  // Helper: collapse trip history/detail to expanded membercard view
  const handleCollapseTripHistory = () => {
    setSelectedTripIndex(null);
    if (onTripHistorySwipeUp) {
      // This will set overlayMode to 'expanded' in parent
      onTripHistorySwipeUp();
    }
  };

  // Helper: close overlay and return to full membercard list
  const handleBackToList = () => {
    setSelectedTripIndex(null);
    if (onBackToList) onBackToList();
  };

  if (overlayMode !== 'collapsed' && selectedMember) {
    // Only show the selected membercard in member or tripHistory mode
    return (
      <View style={[{ flex: 1, justifyContent: 'flex-start', backgroundColor: theme === 'dark' ? '#1F2937' : 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16 }, containerStyle]}>
        {/* Member Card at the top */}
        <MemberCard
          member={memberToData(selectedMember)}
          onPress={onBackToList} // Tap card to collapse to live view
        />
        {/* Swipe notch and label in 'member' mode */}
        {overlayMode === 'member' && (
          <View style={{ alignItems: 'center', paddingVertical: 12, paddingBottom: 60 }}>
            <View style={{ width: 40, height: 6, backgroundColor: theme === 'dark' ? '#4B5563' : '#CBD5E1', borderRadius: 3, marginBottom: 4 }} />
            <Text style={{ fontSize: 14, color: theme === 'dark' ? '#9CA3AF' : '#64748B' }}>Swipe up for trip history</Text>
          </View>
        )}
        {/* Trip history in 'tripHistory' mode */}
        {overlayMode === 'tripHistory' && (
          <View style={{ 
            flex: 1, 
            backgroundColor: theme === 'dark' ? '#1F2937' : 'white', 
            borderTopLeftRadius: 16, 
            borderTopRightRadius: 16, 
            marginTop: 8, 
            overflow: 'hidden',
            minHeight: height // Ensure minimum height to prevent gaps
          }}>
            {/* Drag handle and swipe-down/collapse indicator */}
            <View style={{ alignItems: 'center', padding: 8 }}>
              <View style={{ width: 60, height: 6, borderRadius: 3, backgroundColor: theme === 'dark' ? '#4B5563' : '#CBD5E1', marginBottom: 8 }} />
              <Text style={{ fontSize: 12, color: theme === 'dark' ? '#9CA3AF' : '#64748B' }}>Swipe down to collapse</Text>
            </View>
            <NativeViewGestureHandler ref={scrollGestureHandlerRef}>
              <ScrollView
                style={{ flex: 1, minHeight: 0, paddingHorizontal: 8 }}
                contentContainerStyle={{ paddingBottom: 100 }} // Reduced padding to prevent gaps
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                {selectedTripIndex === null ? (
                  <>
                    <Text style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 18, marginVertical: 8, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Trip History (Last 7 Days)</Text>
                    {[...Array(7)].map((_, i) => (
                      <TouchableOpacity key={i} style={{ margin: 12, padding: 12, backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6', borderRadius: 12 }} onPress={() => setSelectedTripIndex(i)}>
                        {/* Placeholder for static map image */}
                        <View style={{ height: 100, backgroundColor: theme === 'dark' ? '#4B5563' : '#CBD5E1', borderRadius: 8, marginBottom: 8, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Static Map Image</Text>
                        </View>
                        <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Start: 2024-05-0{i+1} 08:00</Text>
                        <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>End: 2024-05-0{i+1} 09:00</Text>
                        <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Distance: 12.3 km</Text>
                        <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Total Time: 1h 0m</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : (
                  <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
                    {/* Back button: returns to trip history list, not full membercard list */}
                    <TouchableOpacity onPress={() => setSelectedTripIndex(null)} style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 18, color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>{'< Back to Trip History'}</Text>
                    </TouchableOpacity>
                    <Text style={{ fontWeight: 'bold', fontSize: 20, marginBottom: 8, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Trip Details</Text>
                    <View style={{ height: 120, backgroundColor: theme === 'dark' ? '#4B5563' : '#CBD5E1', borderRadius: 8, marginBottom: 12, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Static Map Image</Text>
                    </View>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Start Address: Placeholder Address A</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>End Address: Placeholder Address B</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Start Time: 2024-05-0{selectedTripIndex+1} 08:00</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>End Time: 2024-05-0{selectedTripIndex+1} 09:00</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Distance: 12.3 km</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Total Time: 1h 0m</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Max Speed: 80 km/h (placeholder)</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Average Speed: 45 km/h (placeholder)</Text>
                    <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Risky Driving: 2 events (placeholder)</Text>
                  </View>
                )}
              </ScrollView>
            </NativeViewGestureHandler>
          </View>
        )}
      </View>
    );
  }
  // Default: show full list
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MemberCard member={memberToData(item as CircleMember)} onPress={() => handleMemberPress(item as CircleMember)} />}
      renderSectionHeader={({ section: { title, data } }) => {
        if (data.length === 0) return null;
        return <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 8, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>{title}</Text>;
      }}
      style={[{ height }, containerStyle]}
      contentContainerStyle={{ paddingBottom: 80 }}
    />
  );
};

export default MemberSectionList; 