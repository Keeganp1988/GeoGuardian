import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackNavigationProp, RootStackParamList } from '../types/navigation';
import MapView, { Marker } from 'react-native-maps';
import { 
  getTripSummaries, 
  formatTimeDisplay,
  TripSummary,
  CircleMember,
  LocationData
} from '../firebase/services';
import { useApp } from '../contexts/AppContext';
import MemberCard, { MemberData } from '../components/MemberCard';

const { height } = Dimensions.get('window');

// Calculate section heights (same as DashboardScreen)
const MAP_HEIGHT = height * 0.65;
const MEMBER_CARD_HEIGHT = 120;

type MemberDetailRouteProp = RouteProp<RootStackParamList, 'MemberDetail'>;

export default function MemberDetailScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const route = useRoute<MemberDetailRouteProp>();
  const { member, memberLocation: passedLocation, memberInfo, userId } = route.params;
  
  const [tripSummaries, setTripSummaries] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberLocation, setMemberLocation] = useState<LocationData | null>(null);
  const [region, setRegion] = useState({
    latitude: 40.7584,
    longitude: -73.9857,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadMemberData();
    loadMemberLocation();
  }, [member, passedLocation]);

  const loadMemberData = async () => {
    setLoading(true);
    try {
      // Get the user ID from either member or direct userId parameter
      const targetUserId = member?.userId || userId;
      if (!targetUserId) {
        console.error('No user ID available');
        return;
      }
      
      // Load trip summaries
      const trips = await getTripSummaries(targetUserId, 20);
      setTripSummaries(trips);
    } catch (error) {
      console.error('Error loading member data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMemberLocation = async () => {
    try {
      // Use passed location if available
      if (passedLocation) {
        setMemberLocation(passedLocation);
        setRegion({
          latitude: passedLocation.latitude,
          longitude: passedLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } else {
        // Try to fetch current location for the user
        const targetUserId = member?.userId || userId;
        if (targetUserId) {
          try {
            const { getUserLocation } = await import('../firebase/services');
            const currentLocation = await getUserLocation(targetUserId);
            
            if (currentLocation) {
              setMemberLocation(currentLocation);
              setRegion({
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              });
            } else {
              // Fallback to placeholder location
              setMemberLocation({
                userId: targetUserId,
                latitude: 40.7584,
                longitude: -73.9857,
                timestamp: new Date(),
                address: 'Location not available',
                circleMembers: [],
              });
              setRegion({
                latitude: 40.7584,
                longitude: -73.9857,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              });
            }
          } catch (locationError) {
            console.error('Error fetching user location:', locationError);
            // Fallback to placeholder location
            setMemberLocation({
              userId: targetUserId,
              latitude: 40.7584,
              longitude: -73.9857,
              timestamp: new Date(),
              address: 'Location not available',
              circleMembers: [],
            });
            setRegion({
              latitude: 40.7584,
              longitude: -73.9857,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading member location:', error);
    }
  };

  const getMovementTypeIcon = (movementType: string) => {
    switch (movementType) {
      case 'walking':
        return 'walk';
      case 'driving':
        return 'car';
      case 'stationary':
        return 'pause';
      default:
        return 'help-circle';
    }
  };

  const getMovementTypeColor = (movementType: string) => {
    switch (movementType) {
      case 'walking':
        return '#10B981';
      case 'driving':
        return '#F59E0B';
      case 'stationary':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const memberToData = (member: CircleMember): MemberData => {
    const now = new Date();
    const lastUpdate = memberLocation?.timestamp ? new Date(memberLocation.timestamp) : null;
    const isOnline = lastUpdate && (now.getTime() - lastUpdate.getTime() <= 5 * 60 * 1000);
    
    // Set lastSeen for offline users
    let lastSeen: Date | undefined;
    if (!isOnline && lastUpdate) {
      lastSeen = lastUpdate;
    }
    
    return {
      id: member.userId,
      name: member.user?.name || 'Unknown',
      avatar: member.user?.profileImage,
      battery: memberLocation?.batteryLevel || 100,
      isCharging: memberLocation?.isCharging || false,
      location: memberLocation ? {
        address: memberLocation.address || "Location not available",
        timestamp: memberLocation.timestamp,
        latitude: memberLocation.latitude,
        longitude: memberLocation.longitude,
      } : {
        address: "Location not available",
        timestamp: new Date(),
      },
      online: !!isOnline,
      lastSeen: lastSeen,
    };
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  const memberCardTranslateY = scrollY.interpolate({
    inputRange: [0, MEMBER_CARD_HEIGHT],
    outputRange: [0, -MEMBER_CARD_HEIGHT],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Loading member details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar with Black Back Arrow */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#000000" />
        </TouchableOpacity>
      </View>

      {/* Map Section - Same size as Live View */}
      <View style={[styles.mapContainer, { height: MAP_HEIGHT }] }>
        <MapView
          style={styles.map}
          region={region}
          showsUserLocation={false}
        >
          {memberLocation && (
            <Marker
              coordinate={{
                latitude: memberLocation.latitude,
                longitude: memberLocation.longitude,
              }}
              title={member?.user?.name || memberInfo?.name || 'Member'}
              description={memberLocation.address || 'No address'}
              pinColor="#10B981"
            />
          )}
        </MapView>
      </View>

      {/* Member Card that slides up over map */}
      <Animated.View 
        style={[
          styles.memberCardContainer,
          {
            transform: [{ translateY: memberCardTranslateY }]
          }
        ]}
      >
        {member && (
          <MemberCard
            member={memberToData(member)}
            onPress={() => {}} // No action needed here
          />
        )}
        {!member && memberInfo && userId && (
          <MemberCard
            member={{
              id: userId,
              name: memberInfo.name,
              avatar: memberInfo.profileImage,
              battery: memberLocation?.batteryLevel || 100,
              isCharging: memberLocation?.isCharging || false,
              location: memberLocation ? {
                address: memberLocation.address || "Location not available",
                timestamp: memberLocation.timestamp,
                latitude: memberLocation.latitude,
                longitude: memberLocation.longitude,
              } : {
                address: "Location not available",
                timestamp: new Date(),
              },
              online: true, // Assume online for SOS alerts
              lastSeen: undefined,
            }}
            onPress={() => {}} // No action needed here
          />
        )}
      </Animated.View>

      {/* Trip History Section */}
      <Animated.ScrollView
        style={styles.tripHistoryContainer}
        contentContainerStyle={styles.tripHistoryContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Spacer to account for member card */}
        <View style={{ height: MEMBER_CARD_HEIGHT + 20 }} />
        
        <Text style={styles.tripHistoryTitle}>Trip History</Text>
        
        {tripSummaries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="map" size={48} color="#CBD5E1" />
            <Text style={styles.emptyStateText}>No trips recorded yet</Text>
          </View>
        ) : (
          (tripSummaries ?? []).map((trip) => (
            <View key={trip.id} style={styles.tripItem}>
              <View style={styles.tripHeader}>
                <View style={styles.tripTime}>
                  <Ionicons name="time" size={16} color="#64748B" />
                  <Text style={styles.tripTimeText}>
                    {formatTimeDisplay(trip.startTime)}
                  </Text>
                </View>
                <View style={styles.tripStatus}>
                  <Ionicons
                    name={getMovementTypeIcon(trip.movementType)}
                    size={16}
                    color={getMovementTypeColor(trip.movementType)}
                  />
                  <Text style={[
                    styles.movementTypeText,
                    { color: getMovementTypeColor(trip.movementType) }
                  ]}>
                    {trip.movementType.charAt(0).toUpperCase() + trip.movementType.slice(1)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.tripDetails}>
                <View style={styles.tripDetailRow}>
                  <View style={styles.tripDetailItem}>
                    <Ionicons name="map" size={14} color="#64748B" />
                    <Text style={styles.tripDetailText}>
                      {formatDistance(trip.totalDistance)}
                    </Text>
                  </View>
                  <View style={styles.tripDetailItem}>
                    <Ionicons name="speedometer" size={14} color="#64748B" />
                    <Text style={styles.tripDetailText}>
                      {Math.round(trip.averageSpeed)} km/h avg
                    </Text>
                  </View>
                  <View style={styles.tripDetailItem}>
                    <Ionicons name="time" size={14} color="#64748B" />
                    <Text style={styles.tripDetailText}>
                      {formatDuration(trip.duration)}
                    </Text>
                  </View>
                </View>
                
                {trip.startLocation?.address && (
                  <Text style={styles.tripAddress} numberOfLines={1}>
                    From: {trip.startLocation.address}
                  </Text>
                )}
                {trip.endLocation?.address && (
                  <Text style={styles.tripAddress} numberOfLines={1}>
                    To: {trip.endLocation.address}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  backButton: {
    padding: 8,
  },
  mapContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
  },
  map: {
    flex: 1,
  },
  memberCardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 5,
  },
  tripHistoryContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  tripHistoryContent: {
    padding: 16,
    paddingTop: 0,
  },
  tripHistoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
  tripItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripTime: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripTimeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginLeft: 4,
  },
  tripStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  movementTypeText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  tripDetails: {
    gap: 8,
  },
  tripDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tripDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripDetailText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 4,
  },
  tripAddress: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
}); 