import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Modal,
  Image,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import {
  getTripSummaries,
  formatTimeDisplay,
  TripSummary,
  CircleMember,
  LocationData,
  getLocationHistoryForDateRange
} from '../firebase/services';
import MemberCard, { MemberData } from './MemberCard';
import { PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import { useThemeMode } from '../contexts/ThemeContext';
import { lightMapStyle, darkMapStyle } from '../constants/mapStyles';
import { addDays, subDays, isAfter } from 'date-fns';

import { TripState } from '../services/tripManagementService';
import databaseService from '../services/databaseService';

const { height } = Dimensions.get('window');
const EXPANDED_HEIGHT = height * 0.85;
const TRIP_HISTORY_HEIGHT = height * 0.95;
const LAST_N_DAYS = 7;

interface MemberDetailOverlayProps {
  member: CircleMember | null;
  memberLocation: LocationData | null;
  isVisible: boolean;
  onClose: () => void;
  mapRegion: any;
  onBackToMembers: () => void;
}

export default function MemberDetailOverlay({
  member,
  memberLocation,
  isVisible,
  onClose,
  mapRegion,
  onBackToMembers,
}: MemberDetailOverlayProps) {
  const { theme } = useThemeMode();
  const [tripSummaries, setTripSummaries] = useState<TripSummary[]>([]);
  const [localTrips, setLocalTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [tripDetails, setTripDetails] = useState<{ [tripId: string]: LocationData[] }>({});
  const [currentTrip, setCurrentTrip] = useState<TripState | null>(null);
  const [showTripHistory, setShowTripHistory] = useState(false);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const tripHistoryHeight = useRef(new Animated.Value(0)).current;
  const isDarkMode = theme === 'dark';

  useEffect(() => {
    if (isVisible && member) {
      loadMemberData();
      Animated.spring(animatedHeight, { toValue: 1, useNativeDriver: false }).start();
    } else {
      Animated.timing(animatedHeight, { toValue: 0, duration: 300, useNativeDriver: false }).start();
      setShowTripHistory(false);
      tripHistoryHeight.setValue(0);
    }
  }, [isVisible, member]);

  useEffect(() => {
    if (showTripHistory) {
      Animated.spring(tripHistoryHeight, { toValue: 1, useNativeDriver: false }).start();
    } else {
      Animated.timing(tripHistoryHeight, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    }
  }, [showTripHistory]);

  const loadMemberData = async () => {
    if (!member) return;
    setLoading(true);
    try {
      // Load both Firestore trips and local trips
      const now = new Date();
      const fromDate = subDays(now, LAST_N_DAYS);
      
      // Load Firestore trips
      const allTrips = await getTripSummaries(member.userId, 30);
      const trips = allTrips.filter(trip => isAfter(trip.startTime, fromDate));
      setTripSummaries(trips);
      
      // Load local trips from SQLite (if available)
      try {
        const localTripsData = await databaseService.getRecentTrips(member.userId, 10);
        setLocalTrips(localTripsData);
      } catch (error) {
        console.log('Local trips not available:', error);
        setLocalTrips([]);
      }
      
      // Check for current active trip (if available)
      try {
        const activeTrip = await databaseService.getActiveTrip(member.userId);
        if (activeTrip && 'is_active' in activeTrip) {
          // Convert TripHistory to TripState format
          setCurrentTrip({
            isActive: activeTrip.is_active,
            tripId: activeTrip.trip_id,
            startTime: activeTrip.start_time,
            startLocation: {
              userId: activeTrip.user_id,
              latitude: activeTrip.start_latitude,
              longitude: activeTrip.start_longitude,
              timestamp: activeTrip.start_time,
              circleMembers: []
            },
            currentLocation: null,
            totalDistance: activeTrip.total_distance,
            waypoints: [],
            maxSpeed: activeTrip.max_speed,
            averageSpeed: activeTrip.average_speed,
            movementType: activeTrip.movement_type,
            lastUpdateTime: activeTrip.start_time
          });
        }
      } catch (error) {
        console.log('Active trip not available:', error);
        setCurrentTrip(null);
      }
    } catch (error) {
      console.error('Error loading member data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTripPress = async (trip: TripSummary) => {
    if (expandedTripId === trip.id) {
      setExpandedTripId(null);
    } else {
      setExpandedTripId(trip.id);
      if (!tripDetails[trip.id]) {
        const history = await getLocationHistoryForDateRange(trip.userId, trip.startTime, trip.endTime || new Date());
        setTripDetails(prev => ({ ...prev, [trip.id]: history }));
      }
    }
  };

  const memberData = member ? memberToData(member) : null;

  function memberToData(member: CircleMember): MemberData {
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
      battery: memberLocation?.batteryLevel || 0,
      isCharging: memberLocation?.isCharging || false,
      location: memberLocation
        ? {
            address: memberLocation.address || "Location unavailable",
            timestamp: memberLocation.timestamp || new Date(),
            speed: memberLocation.speed,
            latitude: memberLocation.latitude,
            longitude: memberLocation.longitude,
            movementType: undefined, // Let MemberCard handle movementType logic if needed
          }
        : null,
      online: !!isOnline,
      lastSeen: lastSeen,
    };
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
  };

  const formatDistance = (meters: number) => {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const formatSpeed = (mps: number) => {
    const kmh = mps * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  const handleSwipeUp = () => {
    setShowTripHistory(true);
  };

  const handleSwipeDown = () => {
    if (showTripHistory) {
      setShowTripHistory(false);
    } else {
      onBackToMembers();
    }
  };

  const onGestureEvent = (event: PanGestureHandlerGestureEvent) => {
    const { translationY, state } = event.nativeEvent;
    
    if (state === State.END) {
      if (translationY < -50 && !showTripHistory) {
        // Swipe up - show trip history
        handleSwipeUp();
      } else if (translationY > 50 && showTripHistory) {
        // Swipe down from trip history - go back to member card
        handleSwipeDown();
      } else if (translationY > 50 && !showTripHistory) {
        // Swipe down from member card - go back to members list
        handleSwipeDown();
      }
    }
  };

  const overlayStyle = {
    height: animatedHeight.interpolate({
      inputRange: [0, 1],
      outputRange: [0, showTripHistory ? TRIP_HISTORY_HEIGHT : EXPANDED_HEIGHT],
    }),
    transform: [{
      translateY: animatedHeight.interpolate({
        inputRange: [0, 1],
        outputRange: [height, 0],
      }),
    }],
  };

  const tripHistoryStyle = {
    height: tripHistoryHeight.interpolate({
      inputRange: [0, 1],
      outputRange: [0, TRIP_HISTORY_HEIGHT],
    }),
    opacity: tripHistoryHeight.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  };

  if (!isVisible) return null;

  return (
    <Modal transparent visible={isVisible} onRequestClose={onClose} animationType="fade">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        
        <PanGestureHandler onGestureEvent={onGestureEvent}>
          <Animated.View style={[
            overlayStyle, 
            { 
              backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 8,
            }
          ]}>
            {/* Member Card View */}
            {!showTripHistory && (
              <>
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <View style={{ 
                    width: 40, 
                    height: 6, 
                    backgroundColor: isDarkMode ? '#6B7280' : '#D1D5DB', 
                    borderRadius: 3 
                  }} />
                </View>
                {memberData && <View style={{ paddingHorizontal: 16 }}><MemberCard member={memberData} /></View>}
                
                {/* Swipe up indicator */}
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Ionicons name="chevron-up" size={24} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
                  <Text style={{ 
                    fontSize: 14, 
                    color: isDarkMode ? '#9CA3AF' : '#6B7280',
                    marginTop: 4 
                  }}>
                    Swipe up for trip history
                  </Text>
                </View>
              </>
            )}

            {/* Trip History View */}
            {showTripHistory && (
              <Animated.View style={[tripHistoryStyle, { flex: 1 }]}>
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <View style={{ 
                    width: 40, 
                    height: 6, 
                    backgroundColor: isDarkMode ? '#6B7280' : '#D1D5DB', 
                    borderRadius: 3 
                  }} />
                </View>
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 }}>
                  <Text style={{ 
                    fontSize: 20, 
                    fontWeight: 'bold', 
                    color: isDarkMode ? '#F9FAFB' : '#111827' 
                  }}>
                    Trip History
                  </Text>
                  <TouchableOpacity onPress={() => setShowTripHistory(false)}>
                    <Ionicons name="close" size={24} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
                  {/* Current Trip */}
                  {currentTrip && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={{ 
                        fontSize: 18, 
                        fontWeight: 'bold', 
                        color: isDarkMode ? '#F9FAFB' : '#111827',
                        marginBottom: 12 
                      }}>
                        Current Trip
                      </Text>
                      <View style={{ 
                        backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', 
                        padding: 16, 
                        borderRadius: 12 
                      }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>Duration</Text>
                          <Text style={{ color: isDarkMode ? '#F9FAFB' : '#111827', fontWeight: '600' }}>
                            {formatDuration(Math.floor((Date.now() - currentTrip.startTime.getTime()) / 1000))}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>Distance</Text>
                          <Text style={{ color: isDarkMode ? '#F9FAFB' : '#111827', fontWeight: '600' }}>
                            {formatDistance(currentTrip.totalDistance)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>Avg Speed</Text>
                          <Text style={{ color: isDarkMode ? '#F9FAFB' : '#111827', fontWeight: '600' }}>
                            {formatSpeed(currentTrip.averageSpeed)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>Movement</Text>
                          <Text style={{ color: isDarkMode ? '#F9FAFB' : '#111827', fontWeight: '600' }}>
                            {currentTrip.movementType}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Recent Trips */}
                  <Text style={{ 
                    fontSize: 18, 
                    fontWeight: 'bold', 
                    color: isDarkMode ? '#F9FAFB' : '#111827',
                    marginBottom: 12 
                  }}>
                    Recent Trips
                  </Text>
                  
                  {loading ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      {/* Local Trips */}
                      {localTrips.length > 0 && (
                        <>
                          <Text style={{ 
                            fontSize: 14, 
                            color: isDarkMode ? '#9CA3AF' : '#6B7280',
                            marginBottom: 8 
                          }}>
                            Local Trips
                          </Text>
                          {localTrips.map((trip, index) => (
                            <View key={index} style={{ 
                              backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', 
                              padding: 12, 
                              borderRadius: 8,
                              marginBottom: 8 
                            }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={{ 
                                  fontWeight: 'bold', 
                                  color: isDarkMode ? '#F9FAFB' : '#111827' 
                                }}>
                                  {formatDistance(trip.total_distance)} {trip.movement_type}
                                </Text>
                                <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>
                                  {formatDuration(trip.duration)}
                                </Text>
                              </View>
                              <Text style={{ 
                                fontSize: 12, 
                                color: isDarkMode ? '#9CA3AF' : '#6B7280' 
                              }}>
                                {new Date(trip.start_time).toLocaleDateString()} - {new Date(trip.start_time).toLocaleTimeString()}
                              </Text>
                            </View>
                          ))}
                        </>
                      )}

                      {/* Firestore Trips */}
                      {tripSummaries.length > 0 && (
                        <>
                          <Text style={{ 
                            fontSize: 14, 
                            color: isDarkMode ? '#9CA3AF' : '#6B7280',
                            marginBottom: 8,
                            marginTop: localTrips.length > 0 ? 16 : 0
                          }}>
                            Cloud Trips
                          </Text>
                          {tripSummaries.map(trip => (
                            <View key={trip.id} style={{ 
                              backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', 
                              padding: 12, 
                              borderRadius: 8,
                              marginBottom: 8 
                            }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <Text style={{ 
                                  fontWeight: 'bold', 
                                  color: isDarkMode ? '#F9FAFB' : '#111827' 
                                }}>
                                  {formatDistance(trip.totalDistance)} {trip.movementType}
                                </Text>
                                <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>
                                  {formatDuration(trip.duration)}
                                </Text>
                              </View>
                              <Text style={{ 
                                fontSize: 12, 
                                color: isDarkMode ? '#9CA3AF' : '#6B7280' 
                              }}>
                                {formatTimeDisplay(trip.startTime)} - {formatTimeDisplay(trip.endTime || new Date())}
                              </Text>
                            </View>
                          ))}
                        </>
                      )}

                      {localTrips.length === 0 && tripSummaries.length === 0 && (
                        <Text style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>
                          No recent trips recorded.
                        </Text>
                      )}
                    </>
                  )}

                  {/* Swipe down indicator */}
                  <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <Ionicons name="chevron-down" size={24} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
                    <Text style={{ 
                      fontSize: 14, 
                      color: isDarkMode ? '#9CA3AF' : '#6B7280',
                      marginTop: 4 
                    }}>
                      Swipe down to go back
                    </Text>
                  </View>
                </ScrollView>
              </Animated.View>
            )}
          </Animated.View>
        </PanGestureHandler>
      </View>
    </Modal>
  );
}