import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert as RNAlert,
  SectionList,
  Linking,
  ActivityIndicator,
  Platform,
  FlatList,
  Dimensions,
  Animated,
  Easing,
  Modal,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MemberCard, { MemberData } from "../components/MemberCard";
import CustomHeader from "../components/CustomHeader";
import { useApp } from "../contexts/AppContext";
import { useThemeMode } from "../contexts/ThemeContext";
import {
  getCirclesForUser,
  subscribeToCircleMembers,
  subscribeToUserLocation,
  createEmergencyAlert,
  Circle,
  CircleMember,
  LocationData,
  getUser,
  getUserLocation,
  getPrivateConnectionsForUser,
  PrivateConnection,
  User,
  UserAlert,
} from "../firebase/services";
import { DashboardNavigationParams, MemberDetailNavigationParams } from '../types/navigation';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Location from 'expo-location';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/firebase';
import { sendExpoPushNotification } from '../firebase/services';
import { darkMapStyle, lightMapStyle } from "../constants/mapStyles";
import CircleMap, { MarkerData } from '../components/CircleMap';
import CircleList from '../components/CircleList';
import MemberSectionList from '../components/MemberSectionList';
import MemberDetailOverlay from '../components/MemberDetailOverlay';
import MapControls from '../components/MapControls';
import MapErrorBoundary from '../components/MapErrorBoundary';
import { ErrorBoundary, SafeArrayRenderer } from '../components/ErrorBoundary';

import mapCenteringService, { validateCoordinates } from '../services/mapCenteringService';
import { PanGestureHandler, State as GestureState, NativeViewGestureHandler } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TRIP_OVERLAY_TOP = Math.max(80, SCREEN_HEIGHT * 0.1); // Responsive top position
const TRIP_OVERLAY_MIN_HEIGHT = Math.max(160, SCREEN_HEIGHT * 0.2); // Responsive min height
const TAB_BAR_HEIGHT = 56;

const DashboardScreen = React.memo(() => {
  const scrollGestureHandlerRef = useRef(null);
  const { state: { user } } = useApp();
  const { theme, isThemeReady } = useThemeMode();

  // Get theme-aware modal styles
  const modalStyles = getModalStyles(theme);
  // Define the navigation type for LiveViewStack
  type LiveViewStackParamList = {
    Dashboard: DashboardNavigationParams;
    MemberDetail: MemberDetailNavigationParams;
  };

  const navigation = useNavigation<StackNavigationProp<LiveViewStackParamList>>();
  const route = useRoute();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [activeCircleIndex, setActiveCircleIndex] = useState(0);
  const [allCircleMembers, setAllCircleMembers] = useState<{ [circleId: string]: CircleMember[] }>({});
  const [memberLocations, setMemberLocations] = useState<Map<string, LocationData>>(new Map());
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [region, setRegion] = useState({
    latitude: -29.9107954, // Default to user's approximate location from logs
    longitude: 31.0163581,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [circlesLoading, setCirclesLoading] = useState(true);
  const [locationWarning, setLocationWarning] = useState(false);
  const mapRef = useRef<MapView>(null);
  const initialRegionSet = useRef(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');

  const [privateConnections, setPrivateConnections] = useState<PrivateConnection[]>([]);
  const [privateConnectionProfiles, setPrivateConnectionProfiles] = useState<{ [uid: string]: User }>({});
  const THIRTY_MINUTES_MS = 30 * 60 * 1000; // For online status determination

  // Overlay state
  const [selectedMember, setSelectedMember] = useState<CircleMember | null>(null);
  const [overlayMode, setOverlayMode] = useState<'collapsed' | 'member' | 'tripHistory'>('collapsed');
  const [selectedMemberLocation, setSelectedMemberLocation] = useState<LocationData | null>(null);
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const tripOverlayAnim = useRef(new Animated.Value(0)).current; // 0 = collapsed, 1 = expanded
  const [tripHistoryAtTop, setTripHistoryAtTop] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  // Animate overlay up (member -> tripHistory)
  const animateToTripHistory = () => {
    Animated.timing(tripOverlayAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  };

  // Animate overlay down (tripHistory -> member)
  const animateToMember = () => {
    Animated.timing(tripOverlayAnim, {
      toValue: 0,
      duration: 900,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  };

  const loadData = useCallback(async () => {
    if (!user?.uid) return;
    setCirclesLoading(true);
    try {
      const userCircles = await getCirclesForUser(user.uid);
      setCircles(userCircles);
      checkLocationStatus();
      // Lazy import consolidatedLocationService to prevent Firebase initialization on app start
      const consolidatedLocationService = (await import("../services/consolidatedLocationService")).default;

      // Initialize the service if not already initialized
      if (user?.uid) {
        try {
          await consolidatedLocationService.initialize({
            userId: user.uid,
            circleMembers: [], // Will be updated when circles are loaded
            enableBackgroundUpdates: true,
          });
          await consolidatedLocationService.startLocationTracking();
        } catch (locationError) {
          console.warn("Location service initialization failed:", locationError);
          // Don't show error alert for location permission issues
          if (locationError instanceof Error && !locationError.message.includes('Not authorized')) {
            throw locationError; // Re-throw non-permission errors
          }
        }
      }
    } catch (error) {
      console.error("Error loading initial data:", error);
      // Only show error alert for non-location permission issues
      if (!(error instanceof Error && error.message.includes('Not authorized'))) {
        RNAlert.alert("Error", "Could not load your data. Please restart the app.");
      }
    } finally {
      setCirclesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    loadData();
    return () => {
      // Lazy import consolidatedLocationService for cleanup
      import("../services/consolidatedLocationService").then(module => {
        module.default.stopLocationTracking();
      }).catch(console.error);
    };
  }, [loadData, user]);

  useEffect(() => {
    if (!user?.uid) return;
    
    try {
      const unsub = subscribeToUserLocation(user.uid, (location) => {
        try {
          if (location && location.latitude && location.longitude) {
            setUserLocation(location);

            // Set initial region immediately on first location
            if (!initialRegionSet.current) {
              console.log('[DashboardScreen] Setting initial region to user location:', location);
              setRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              });
              initialRegionSet.current = true;
            } else {
              // For subsequent updates, just update the region
              console.log('[DashboardScreen] Updating region to user location:', location);
              setRegion(prev => ({
                ...prev,
                latitude: location.latitude,
                longitude: location.longitude,
              }));

              // Animate map to user location
              if (mapRef.current) {
                try {
                  mapRef.current.animateToRegion({
                    latitude: location.latitude,
                    longitude: location.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }, 500);
                } catch (animationError) {
                  console.warn('[DashboardScreen] Map animation failed:', animationError);
                }
              }
            }
          }
        } catch (locationError) {
          console.error('[DashboardScreen] Error processing location update:', locationError);
        }
      });
      return unsub;
    } catch (subscriptionError) {
      console.error('[DashboardScreen] Error setting up location subscription:', subscriptionError);
      return () => {}; // Return empty cleanup function
    }
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const locationSubscriptions: (() => void)[] = [];
    // Log circles array before subscribing
    console.log('[DashboardScreen] circles:', circles);
    const memberSubscriptions = (circles ?? []).map(circle =>
      subscribeToCircleMembers(circle.id, (members) => {
        console.log('[DashboardScreen] subscribeToCircleMembers:', circle.id, members);
        setAllCircleMembers(prev => ({ ...prev, [circle.id]: members }));
        (members ?? []).forEach(member => {
          if (member.userId !== user.uid) {
            console.log('[DashboardScreen] subscribing to location for:', member.userId);
            const unsub = subscribeToUserLocation(member.userId, (location) => {
              console.log('[DashboardScreen] subscribeToUserLocation:', member.userId, location);
              // Validate location data before storing using enhanced validation
              if (location && validateCoordinates(location)) {
                setMemberLocations(prev => new Map(prev).set(member.userId, location));
              } else {
                console.log('[DashboardScreen] Filtered invalid location for:', member.userId, location);
              }
            });
            locationSubscriptions.push(unsub);
          }
        });
      })
    );
    return () => {
      if (memberSubscriptions && Array.isArray(memberSubscriptions)) {
        (memberSubscriptions ?? []).forEach(unsub => unsub?.());
      }
      if (locationSubscriptions && Array.isArray(locationSubscriptions)) {
        (locationSubscriptions ?? []).forEach(unsub => unsub?.());
      }
    };
  }, [circles, user]);

  useEffect(() => {
    if (!user?.uid) return;

    // Set up real-time subscription for private connections
    const db = getFirebaseDb();
    const connectionsRef = collection(db, 'privateConnections');
    const q = query(connectionsRef);

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const allConnections = (snapshot.docs ?? []).map(doc => ({ id: doc.id, ...doc.data() } as PrivateConnection));
      const userConnections = (allConnections ?? []).filter(conn =>
        conn.userA === user.uid || conn.userB === user.uid
      );

      setPrivateConnections(userConnections);

      // Fetch other user profiles for new connections
      const otherUserIds = (userConnections ?? []).map(conn => (user.uid === conn.userA ? conn.userB : conn.userA));
      const missingUserIds = (otherUserIds ?? []).filter(uid => uid && !privateConnectionProfiles[uid]);

      if (missingUserIds.length > 0) {
        const profileResults = await Promise.all((missingUserIds ?? []).map(uid => getUser(uid)));
        const newProfiles: { [uid: string]: User } = {};
        (profileResults ?? []).forEach((profile, idx) => {
          if (profile) newProfiles[missingUserIds[idx]] = profile;
        });
        setPrivateConnectionProfiles(prev => ({ ...prev, ...newProfiles }));
      }
    });

    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const locationSubscriptions: (() => void)[] = [];
    (privateConnections ?? []).forEach(conn => {
      const otherUserId = user.uid === conn.userA ? conn.userB : conn.userA;
      if (otherUserId) {
        console.log('[DashboardScreen] subscribing to location for 1on1:', otherUserId);
        const unsub = subscribeToUserLocation(otherUserId, (location) => {
          console.log('[DashboardScreen] subscribeToUserLocation (1on1):', otherUserId, location);
          // Validate location data before storing using enhanced validation
          if (location && validateCoordinates(location)) {
            setMemberLocations(prev => new Map(prev).set(otherUserId, location));
          } else {
            console.log('[DashboardScreen] Filtered invalid 1on1 location for:', otherUserId, location);
          }
        });
        locationSubscriptions.push(unsub);
      }
    });
    return () => {
      if (locationSubscriptions && Array.isArray(locationSubscriptions)) {
        (locationSubscriptions ?? []).forEach(unsub => unsub?.());
      }
    };
  }, [privateConnections, user]);

  const checkLocationStatus = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    setLocationWarning(status !== 'granted' || !servicesEnabled);
  };

  const handleMemberPress = async (member: CircleMember) => {
    const startTime = Date.now();

    try {
      tripOverlayAnim.setValue(0);
      setSelectedMember(member);
      setOverlayMode('member');

      // Center map on selected member using the new service
      const location = memberLocations.get(member.userId);
      if (location && validateCoordinates(location)) {
        console.log('[DashboardScreen] Centering and zooming to member:', member.user?.name);

        // Add timeout for map centering operation
        const centeringPromise = mapCenteringService.centerOnMember(mapRef, location);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Map centering timeout')), 5000)
        );

        await Promise.race([centeringPromise, timeoutPromise]);

        // Update region state for consistency with optimal zoom
        const optimalZoom = mapCenteringService.calculateOptimalZoom('member');
        setRegion(prev => ({
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: optimalZoom.latitudeDelta,
          longitudeDelta: optimalZoom.longitudeDelta,
        }));

        const duration = Date.now() - startTime;
        console.log(`[DashboardScreen] Member press handled in ${duration}ms`);
      } else {
        console.warn('[DashboardScreen] No valid location data available for member:', member.userId);
        RNAlert.alert(
          "Location Unavailable",
          `${member.user?.name || 'This member'}'s location is not currently available. They may have location sharing disabled or be offline.`,
          [{ text: "OK", style: "default" }]
        );
      }
    } catch (error) {
      console.error('[DashboardScreen] Failed to center on member:', error);
      const duration = Date.now() - startTime;
      console.log(`[DashboardScreen] Member press failed after ${duration}ms`);

      RNAlert.alert(
        "Location Error",
        "Unable to center map on member's location. Please check your internet connection and try again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: () => handleMemberPress(member) }
        ]
      );
    }
  };

  const handleTripHistorySwipeUp = () => {
    setOverlayMode('tripHistory');
  };

  const handleTripHistorySwipeDown = () => {
    setOverlayMode('member');
  };

  const handleBackToList = () => {
    setSelectedMember(null);
    setOverlayMode('collapsed');
  };

  // Memoize sections for member list
  const sections = React.useMemo(() => {
    if (!user?.uid) return [];
    const circleSections = (circles ?? []).map(circle => ({
      title: circle.name,
      data: (allCircleMembers[circle?.id] || []).filter(m => m?.userId !== user.uid),
    }));
    const oneOnOneSection = privateConnections.length > 0 ? [{
      title: '1on1 Connections',
      data: (privateConnections ?? []).map(conn => {
        const otherUserId = user.uid === conn.userA ? conn.userB : conn.userA;
        const userProfile = privateConnectionProfiles[otherUserId];
        if (!userProfile) return undefined;
        return {
          id: otherUserId,
          userId: otherUserId,
          user: userProfile,
          circleId: '',
          role: 'member',
          joinedAt: new Date(),
        };
      }).filter(Boolean) as CircleMember[],
    }] : [];
    return [...(circleSections ?? []), ...(oneOnOneSection ?? [])];
  }, [circles, allCircleMembers, user, privateConnections, privateConnectionProfiles]);

  // Memoize markers for map with performance optimization
  const filteredMarkers = React.useMemo(() => {
    console.log('[DashboardScreen] Recalculating markers...');

    if (isOverlayVisible && selectedMember) {
      const location = memberLocations.get(selectedMember.userId);
      return location && validateCoordinates(location)
        ? [{
          id: selectedMember.userId,
          coordinate: { latitude: location.latitude, longitude: location.longitude },
          title: selectedMember.user?.name || 'Member',
          isUser: false
        }]
        : [];
    }

    // Performance optimization: limit markers when not in overlay mode
    const MAX_MARKERS = 50; // Limit to prevent performance issues
    const allMarkers = [];

    // Circle members with validation
    const circleMarkers = Object.values(allCircleMembers || {}).flat()
      .map(member => {
        const location = memberLocations.get(member.userId);
        if (!location || !validateCoordinates(location)) return null;

        return {
          id: member.userId,
          coordinate: { latitude: location.latitude, longitude: location.longitude },
          title: member.user?.name || 'Member',
          isUser: false,
          member: {
            userId: member.userId,
            profileColor: '#10B981',
            user: {
              name: member.user?.name,
              profileImage: member.user?.profileImage,
            },
          },
        };
      })
      .filter(Boolean)
      .slice(0, MAX_MARKERS); // Limit markers for performance

    allMarkers.push(...circleMarkers);

    // 1on1 connections with validation
    const connectionMarkers = (privateConnections ?? [])
      .map(conn => {
        const otherUserId = user?.uid === conn.userA ? conn.userB : conn.userA;
        const userProfile = privateConnectionProfiles[otherUserId];
        const location = memberLocations.get(otherUserId);

        if (!userProfile || !location || !validateCoordinates(location)) return null;

        return {
          id: otherUserId,
          coordinate: { latitude: location.latitude, longitude: location.longitude },
          title: userProfile.name || userProfile.email?.split('@')[0] || 'Member',
          isUser: false,
          member: {
            userId: otherUserId,
            profileColor: '#8B5CF6',
            user: {
              name: userProfile.name || userProfile.email?.split('@')[0] || 'Member',
              profileImage: userProfile.profileImage,
            },
          },
        };
      })
      .filter(Boolean)
      .slice(0, MAX_MARKERS - allMarkers.length); // Respect total limit

    allMarkers.push(...connectionMarkers);

    // Current user with validation
    if (userLocation && user && validateCoordinates(userLocation)) {
      allMarkers.push({
        id: user.uid,
        coordinate: { latitude: userLocation.latitude, longitude: userLocation.longitude },
        title: 'You',
        isUser: true,
        member: {
          userId: user.uid,
          profileColor: '#4F46E5',
          user: {
            name: user.displayName || 'You',
            profileImage: user.photoURL,
          },
        },
      });
    }

    console.log(`[DashboardScreen] Generated ${allMarkers.length} markers`);
    return allMarkers as MarkerData[];
  }, [isOverlayVisible, selectedMember, allCircleMembers, memberLocations, userLocation, user, privateConnections, privateConnectionProfiles]);

  const memberToData = (member: CircleMember): MemberData => {
    const location = memberLocations.get(member.userId);
    const now = new Date();

    // Use heartbeat timestamp for online status determination (30-minute threshold)
    // If no heartbeat timestamp, fall back to regular timestamp
    const lastHeartbeat = location?.heartbeatTimestamp ? new Date(location.heartbeatTimestamp) :
      (location?.timestamp ? new Date(location.timestamp) : null);
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    const isOnline = lastHeartbeat && (now.getTime() - lastHeartbeat.getTime() <= THIRTY_MINUTES_MS);

    // Use arrival timestamp for location display (when user first arrived at this location)
    const displayTimestamp = location?.arrivalTimestamp ? new Date(location.arrivalTimestamp) :
      (location?.timestamp ? new Date(location.timestamp) : new Date());

    // Set lastSeen for offline users
    let lastSeen: Date | undefined;
    if (!isOnline && lastHeartbeat) {
      lastSeen = lastHeartbeat;
    }

    console.log(`[DashboardScreen] memberToData for ${member.userId}:`, {
      latitude: location?.latitude,
      longitude: location?.longitude,
      address: location?.address,
      speed: location?.speed,
      batteryLevel: location?.batteryLevel,
      isCharging: location?.isCharging,
      timestamp: location?.timestamp,
      arrivalTimestamp: location?.arrivalTimestamp,
      heartbeatTimestamp: location?.heartbeatTimestamp,
      displayTimestamp,
      isOnline,
      onlineCheckTime: lastHeartbeat,
      movementType: isOnline ? (
        location?.speed !== undefined && location?.speed !== null
          ? (location.speed < 1 ? 'stationary' : location.speed < 10 ? 'walking' : 'driving')
          : 'stationary'
      ) : 'offline'
    });

    return {
      id: member.userId,
      name: member.user?.name || 'Unknown',
      avatar: member.user?.profileImage,
      battery: location?.batteryLevel ?? 0,
      isCharging: location?.isCharging ?? false,
      location: {
        address: location?.address || "Location not available",
        timestamp: displayTimestamp, // Use arrival timestamp for display
        latitude: location?.latitude,
        longitude: location?.longitude,
        movementType: isOnline ? (
          location?.speed !== undefined && location?.speed !== null
            ? (location.speed < 1 ? 'stationary' : location.speed < 10 ? 'walking' : 'driving')
            : 'stationary' // Default to stationary when speed is unavailable but user is online
        ) : 'offline',
      },
      online: !!isOnline,
      lastSeen: lastSeen,
    };
  };

  const handleExpandToggle = () => setIsMapExpanded((prev) => !prev);

  const handleCenterLocation = async () => {
    if (userLocation && validateCoordinates(userLocation)) {
      try {
        console.log('[DashboardScreen] Centering on user location');
        await mapCenteringService.centerOnUser(mapRef, userLocation);

        // Update region state for consistency
        const optimalZoom = mapCenteringService.calculateOptimalZoom('user');
        setRegion(prev => ({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: optimalZoom.latitudeDelta,
          longitudeDelta: optimalZoom.longitudeDelta,
        }));
      } catch (error) {
        console.error('[DashboardScreen] Failed to center on user location:', error);
        RNAlert.alert(
          "Location Error",
          "Unable to center map on your location. Please check your internet connection and try again.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Retry", onPress: handleCenterLocation }
          ]
        );
      }
    } else {
      RNAlert.alert(
        "Location Unavailable",
        "Your location is not currently available. Please check your location settings and ensure location services are enabled.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Settings", onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  const handleToggleLayers = () => setMapType((prev) => {
    switch (prev) {
      case 'standard': return 'satellite';
      case 'satellite': return 'standard';
      default: return 'standard';
    }
  });

  // Test function to force battery check
  const handleForceBatteryCheck = async () => {
    try {
      const consolidatedLocationService = (await import("../services/consolidatedLocationService")).default;
      await consolidatedLocationService.forceBatteryCheck();
      console.log('[DashboardScreen] Forced battery check completed');
    } catch (error) {
      console.error('[DashboardScreen] Failed to force battery check:', error);
    }
  };



  // Log memberLocations map
  React.useEffect(() => {
    console.log('[DashboardScreen] memberLocations:', Array.from(memberLocations.entries()));
  }, [memberLocations]);

  // Log output of memberToData for each member in the list
  React.useEffect(() => {
    const allMembers = Object.values(allCircleMembers).flat();
    (allMembers ?? []).forEach(member => {
      try {
        const data = memberToData(member);
        console.log('[DashboardScreen] memberToData:', { memberId: member.userId, data });
      } catch (e) {
        console.error('[DashboardScreen] Error in memberToData:', member, e);
      }
    });
  }, [allCircleMembers, memberLocations]);

  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [activeAlert, setActiveAlert] = useState<UserAlert | null>(null);

  // Listen for user alerts
  useEffect(() => {
    if (!user?.uid) return;
    const db = getFirebaseDb();
    const alertsRef = collection(db, 'users', user.uid, 'alerts');
    const q = query(alertsRef, orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const alertList = (snapshot.docs ?? []).map(doc => ({ id: doc.id, ...doc.data() } as UserAlert));
      setAlerts(alertList);
      // Show modal if there is an unacknowledged SOS/Crash alert
      const unacknowledged = (alertList ?? []).find(a => !a.acknowledged && (a.type === 'sos' || a.type === 'crash'));
      if (unacknowledged) {
        setActiveAlert(unacknowledged);
        setShowAlertModal(true);
      } else {
        setShowAlertModal(false);
        setActiveAlert(null);
      }
    });
    return unsub;
  }, [user]);

  // Handler for acknowledging an alert
  const handleAcknowledgeAlert = async () => {
    if (!user?.uid || !activeAlert) return;
    try {
      const db = getFirebaseDb();
      const alertDocRef = doc(db, 'users', user.uid, 'alerts', activeAlert.id!);
      await updateDoc(alertDocRef, {
        acknowledged: true,
        acknowledgedAt: serverTimestamp(),
      });
      setShowAlertModal(false);
      // Send push notification to sender (if possible)
      if (activeAlert.senderId) {
        const senderDocRef = doc(db, 'users', activeAlert.senderId);
        const senderSnap = await getDoc(senderDocRef);
        const expoPushToken = senderSnap.exists() ? senderSnap.data().expoPushToken : null;
        if (expoPushToken) {
          await sendExpoPushNotification(
            expoPushToken,
            'Alert Acknowledged',
            `${user.displayName || 'A contact'} acknowledged your alert!`,
            { alertId: activeAlert.id, type: activeAlert.type }
          );
        }
      }
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  // Handler for Track Now - behaves exactly like clicking on a member card
  const handleTrackNow = async () => {
    if (!activeAlert?.senderId) {
      console.warn('No sender ID available for tracking');
      setShowAlertModal(false);
      return;
    }

    setShowAlertModal(false);

    try {
      // First, try to find the member in existing circle members
      const allMembers = Object.values(allCircleMembers).flat();
      let targetMember = allMembers.find(m => m.userId === activeAlert.senderId);

      // If not found in circles, check private connections
      if (!targetMember) {
        const otherUserId = activeAlert.senderId;
        const userProfile = privateConnectionProfiles[otherUserId];
        if (userProfile) {
          // Create a temporary member object for private connection
          targetMember = {
            id: otherUserId,
            userId: otherUserId,
            user: userProfile,
            circleId: '',
            role: 'member' as const,
            joinedAt: new Date(),
          };
        }
      }

      // If we found the member, use handleMemberPress (same as clicking member card)
      if (targetMember) {
        console.log('[DashboardScreen] Track Now: Found member, simulating member card click');
        await handleMemberPress(targetMember);
      } else {
        // Fallback: fetch user info and create temporary member
        console.log('[DashboardScreen] Track Now: Member not found, creating temporary member');
        const senderInfo = await getUser(activeAlert.senderId);
        if (senderInfo) {
          const tempMember: CircleMember = {
            id: activeAlert.senderId,
            userId: activeAlert.senderId,
            user: senderInfo,
            circleId: '',
            role: 'member' as const,
            joinedAt: new Date(),
          };
          await handleMemberPress(tempMember);
        } else {
          console.error('[DashboardScreen] Could not fetch sender information');
          RNAlert.alert(
            "Error",
            "Unable to locate the sender. Please try again.",
            [{ text: "OK", style: "default" }]
          );
        }
      }
    } catch (error) {
      console.error('[DashboardScreen] Failed to track member:', error);
      RNAlert.alert(
        "Error",
        "Unable to track the sender's location. Please check your internet connection and try again.",
        [{ text: "OK", style: "default" }]
      );
    }
  };

  // Handle selectedMemberId param from SOS alerts - simulate member card click
  useEffect(() => {
    // @ts-ignore
    const { selectedMemberId, memberLocation, memberInfo } = route?.params || {};
    if (selectedMemberId) {
      console.log('[DashboardScreen] Received SOS navigation params:', {
        selectedMemberId,
        hasLocation: !!memberLocation,
        hasUserInfo: !!memberInfo,
        userName: memberInfo?.name
      });

      // Clear the navigation params first to prevent repeated navigation
      // @ts-ignore
      navigation.setParams({
        selectedMemberId: undefined,
        memberLocation: undefined,
        memberInfo: undefined
      });

      // Deserialize memberLocation timestamps if present
      let deserializedLocation = null;
      if (memberLocation) {
        deserializedLocation = {
          ...memberLocation,
          timestamp: new Date(memberLocation.timestamp),
          arrivalTimestamp: memberLocation.arrivalTimestamp ? new Date(memberLocation.arrivalTimestamp) : undefined,
          heartbeatTimestamp: memberLocation.heartbeatTimestamp ? new Date(memberLocation.heartbeatTimestamp) : undefined,
        };
        console.log('[DashboardScreen] Deserialized location:', deserializedLocation);
      }

      // Simulate member card click behavior
      const simulateMemberPress = async () => {
        try {
          // First, try to find the member in existing circle members
          const allMembers = Object.values(allCircleMembers).flat();
          let targetMember = allMembers.find(m => m.userId === selectedMemberId);

          console.log('[DashboardScreen] Looking for member in circles:', {
            selectedMemberId,
            totalCircleMembers: allMembers.length,
            foundInCircles: !!targetMember
          });

          // If not found in circles, check private connections
          if (!targetMember) {
            const userProfile = privateConnectionProfiles[selectedMemberId];
            console.log('[DashboardScreen] Checking private connections:', {
              hasProfile: !!userProfile,
              profileName: userProfile?.name
            });

            if (userProfile) {
              // Create a temporary member object for private connection
              targetMember = {
                id: selectedMemberId,
                userId: selectedMemberId,
                user: userProfile,
                circleId: '',
                role: 'member' as const,
                joinedAt: new Date(),
              };
              console.log('[DashboardScreen] Created temp member from private connection');
            }
          }

          // Update member location if provided
          if (deserializedLocation) {
            setMemberLocations(prev => new Map(prev).set(selectedMemberId, deserializedLocation));
            console.log('[DashboardScreen] Updated member location in map');
          }

          // If we found the member, use handleMemberPress (same as clicking member card)
          if (targetMember) {
            console.log('[DashboardScreen] SOS Navigation: Found member, simulating member card click for:', targetMember.user?.name);
            await handleMemberPress(targetMember);
          } else if (memberInfo) {
            // Fallback: use provided memberInfo to create temporary member
            console.log('[DashboardScreen] SOS Navigation: Using provided memberInfo for:', memberInfo.name);
            const tempMember: CircleMember = {
              id: selectedMemberId,
              userId: selectedMemberId,
              user: memberInfo,
              circleId: '',
              role: 'member' as const,
              joinedAt: new Date(),
            };

            // Also update member location for this temp member
            if (deserializedLocation) {
              setMemberLocations(prev => new Map(prev).set(selectedMemberId, deserializedLocation));
            }

            await handleMemberPress(tempMember);
          } else {
            // Last resort: fetch user info and create temporary member
            console.log('[DashboardScreen] SOS Navigation: Fetching user info as last resort');
            const senderInfo = await getUser(selectedMemberId);
            if (senderInfo) {
              console.log('[DashboardScreen] Fetched sender info:', senderInfo.name);
              const tempMember: CircleMember = {
                id: selectedMemberId,
                userId: selectedMemberId,
                user: senderInfo,
                circleId: '',
                role: 'member' as const,
                joinedAt: new Date(),
              };
              await handleMemberPress(tempMember);
            } else {
              console.error('[DashboardScreen] Could not find or fetch member information');
            }
          }
        } catch (error) {
          console.error('[DashboardScreen] Failed to simulate member press from SOS alert:', error);
        }
      };

      // Add a small delay to ensure the screen is fully loaded and data is available
      const delay = Object.keys(allCircleMembers).length === 0 && Object.keys(privateConnectionProfiles).length === 0 ? 500 : 100;
      console.log('[DashboardScreen] Scheduling member press simulation with delay:', delay);
      setTimeout(simulateMemberPress, delay);
    }
  }, [route?.params, navigation, allCircleMembers, privateConnectionProfiles]);

  // Apply theme immediately to prevent white flash
  const backgroundColor = theme === 'dark' ? '#111827' : '#FFFFFF';



  // Remove loading screen - let content load silently

  if (circles.length === 0 && privateConnections.length === 0 && !circlesLoading) {
    return (
      <View style={{ flex: 1, backgroundColor }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="people-circle-outline" size={80} color="#6B7280" />
          <Text style={{ fontSize: 20, fontWeight: 'bold', marginTop: 16, textAlign: 'center', color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>
            Welcome to GeoGuardian
          </Text>
          <Text style={{ fontSize: 16, color: '#6B7280', marginTop: 8, textAlign: 'center' }}>
            Create group or invite a contact to see your friends and family on the map.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#4F46E5', marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 25 }}
            onPress={() => navigation.navigate('Connections' as never)}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{
      flex: 1,
      backgroundColor,
      position: 'relative'
    }}>
      {/* Map and controls container */}
      <View
        style={
          isMapExpanded
            ? {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: TAB_BAR_HEIGHT,
              zIndex: 100,
            }
            : { flex: 1, position: 'relative', zIndex: 1 }
        }
      >
        <MapErrorBoundary theme={theme} onRetry={() => {
          // Reset error state and force re-render
          setMapError(null);
          setMapLoading(true);
          setRegion(prev => ({ ...prev }));
        }}>
          {/* Map placeholder to prevent blank space during MapView initialization */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme === 'dark' ? '#111827' : '#F3F4F6',
            zIndex: 0
          }} />

          <CircleMap
            mapRef={mapRef}
            initialRegion={region}
            markers={filteredMarkers}
            theme={theme}
            mapType={mapType}
            onMapReady={() => {
              console.log('[DashboardScreen] Map ready');
              setMapLoading(false);
              setMapError(null);
            }}
          />

          {/* Subtle map loading overlay */}
          {mapLoading && (
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme === 'dark' ? '#111827' : '#F3F4F6',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1
            }}>
              <View style={{
                backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
                padding: 20,
                borderRadius: 12,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 4,
              }}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={{
                  marginTop: 12,
                  color: theme === 'dark' ? '#F9FAFB' : '#111827',
                  fontSize: 16,
                  fontWeight: '500'
                }}>
                  Loading Map...
                </Text>
              </View>
            </View>
          )}
        </MapErrorBoundary>

        {/* Map Controls with dynamic positioning */}
        <MapControls
          overlayMode={overlayMode}
          isMapExpanded={isMapExpanded}
          overlayHeight={overlayMode === 'collapsed' ? TRIP_OVERLAY_MIN_HEIGHT : overlayMode === 'member' ? 200 : 0}
          onCenterLocation={handleCenterLocation}
          onToggleLayers={handleToggleLayers}
          onExpandToggle={handleExpandToggle}
          theme={theme}
        />
      </View>

      {locationWarning && (
        <TouchableOpacity
          style={{ position: 'absolute', top: 96, left: 20, right: 20, backgroundColor: 'rgba(245, 158, 11, 0.9)', padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}
          onPress={() => Linking.openSettings()}
        >
          <Ionicons name="warning-outline" size={20} color="white" />
          <Text style={{ color: 'white', fontWeight: '600', marginLeft: 8 }}>Location services are off. Tap to enable.</Text>
        </TouchableOpacity>
      )}

      {/* Overlay: Collapsed (full list) */}
      {overlayMode === 'collapsed' && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: TAB_BAR_HEIGHT, backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, zIndex: 10, minHeight: TRIP_OVERLAY_MIN_HEIGHT }}>
          <ErrorBoundary context="DashboardScreen MemberSectionList">
            <MemberSectionList
              sections={sections}
              memberToData={memberToData}
              handleMemberPress={handleMemberPress}
              overlayMode={overlayMode}
              height={TRIP_OVERLAY_MIN_HEIGHT}
            />
          </ErrorBoundary>
        </View>
      )}

      {/* Overlay: Member card at resting position or Trip History */}
      {selectedMember && overlayMode !== 'collapsed' && (
        <PanGestureHandler
          simultaneousHandlers={scrollGestureHandlerRef}
          enabled={overlayMode !== 'tripHistory' || tripHistoryAtTop}
          onGestureEvent={({ nativeEvent }) => {
            if (nativeEvent.translationY > 40 && nativeEvent.state === GestureState.ACTIVE) {
              if (overlayMode === 'tripHistory') {
                animateToMember();
                setOverlayMode('member');
              } else if (overlayMode === 'member') {
                setOverlayMode('collapsed');
                setSelectedMember(null);
              }
            } else if (nativeEvent.translationY < -40 && nativeEvent.state === GestureState.ACTIVE && overlayMode === 'member') {
              animateToTripHistory();
              setOverlayMode('tripHistory');
            }
          }}
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.translationY > 40 && nativeEvent.state === GestureState.END) {
              if (overlayMode === 'tripHistory') {
                animateToMember();
                setOverlayMode('member');
              } else if (overlayMode === 'member') {
                setOverlayMode('collapsed');
                setSelectedMember(null);
              }
            } else if (nativeEvent.translationY < -40 && nativeEvent.state === GestureState.END && overlayMode === 'member') {
              animateToTripHistory();
              setOverlayMode('tripHistory');
            }
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              // Fix: Use bottom positioning to eliminate gap with bottom navigation
              bottom: tripOverlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [TAB_BAR_HEIGHT, TAB_BAR_HEIGHT],
              }),
              // Fix: Ensure height extends fully without gaps in member mode
              height: tripOverlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [200, SCREEN_HEIGHT - TRIP_OVERLAY_TOP - TAB_BAR_HEIGHT],
              }),
              backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
              borderTopLeftRadius: tripOverlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 16],
              }),
              borderTopRightRadius: tripOverlayAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 16],
              }),
              zIndex: 30, // Higher z-index for trip history mode
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 8,
              overflow: 'hidden',
            }}
          >
            <MemberSectionList
              sections={[]}
              memberToData={memberToData}
              handleMemberPress={() => { }}
              selectedMember={selectedMember}
              overlayMode={overlayMode}
              onBackToList={() => {
                setOverlayMode('collapsed');
                setSelectedMember(null);
              }}
              onTripHistorySwipeUp={() => setOverlayMode('tripHistory')}
              height={overlayMode === 'tripHistory' ? SCREEN_HEIGHT - TRIP_OVERLAY_TOP : 200}
              scrollGestureHandlerRef={scrollGestureHandlerRef}
              onTripHistoryAtTopChange={setTripHistoryAtTop}
              containerStyle={overlayMode === 'tripHistory' ? {
                backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
                flex: 1,
                minHeight: SCREEN_HEIGHT - TRIP_OVERLAY_TOP,
              } : {}}
            />
          </Animated.View>
        </PanGestureHandler>
      )}

      {showAlertModal && activeAlert && (
        <Modal
          visible
          transparent
          animationType="fade"
          key={`dashboard-modal-${theme}`} // Force re-render when theme changes
        >
          <View style={modalStyles.modalOverlay}>
            <View style={modalStyles.modalContent}>
              <>
                <Text style={modalStyles.bigAlertType}>! {activeAlert.type === 'sos' ? 'SOS Alert' : 'Crash Alert'}</Text>
                <Text style={modalStyles.bigSender}>
                  <Text style={{ fontWeight: 'bold' }}>{activeAlert.senderName}</Text> sent you an {activeAlert.type === 'sos' ? 'SOS' : 'Crash'} alert.
                </Text>
                {activeAlert.location?.address && (
                  <TouchableOpacity onPress={() => {
                    if (activeAlert.location?.latitude && activeAlert.location?.longitude) {
                      const url = `https://maps.google.com/?q=${activeAlert.location.latitude},${activeAlert.location.longitude}`;
                      Linking.openURL(url);
                    }
                  }}>
                    <Text style={modalStyles.locationText}>
                      Location: <Text style={{ fontWeight: 'bold', color: '#2563EB', textDecorationLine: 'underline' }}>{activeAlert.location.address}</Text>
                    </Text>
                  </TouchableOpacity>
                )}
                <Text style={modalStyles.modalTime}>{activeAlert.timestamp?.toDate?.().toLocaleString?.() || ''}</Text>
                {activeAlert.message && <Text style={modalStyles.alertMessage}>{activeAlert.message}</Text>}
                <View style={modalStyles.divider} />
                <View style={modalStyles.buttonRowTop}>
                  <TouchableOpacity style={[modalStyles.modalButton, modalStyles.trackButton]} onPress={handleTrackNow}>
                    <Ionicons name="navigate" size={20} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Track Now</Text>
                  </TouchableOpacity>
                  {!activeAlert.acknowledged && (
                    <TouchableOpacity style={[modalStyles.modalButton, modalStyles.ackButton]} onPress={handleAcknowledgeAlert}>
                      <Ionicons name="checkmark-done" size={20} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Acknowledge</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ height: 18, width: '100%' }} />
                <View style={modalStyles.buttonRowBottom}>
                  <TouchableOpacity style={[modalStyles.modalButton, modalStyles.dismissButton]} onPress={() => setShowAlertModal(false)}>
                    <Ionicons name="close" size={20} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#2563EB', fontWeight: '600' }}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
});

export default DashboardScreen;

// Move styles inside component to access theme
const getModalStyles = (theme: 'light' | 'dark') => {
  const baseStyles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    bigAlertType: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#EF4444',
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: 1,
    },
    locationText: {
      fontSize: 16,
      color: '#2563EB',
      marginBottom: 4,
      textAlign: 'center',
    },
    alertMessage: {
      fontSize: 18,
      color: '#EF4444',
      fontWeight: 'bold',
      backgroundColor: '#FEE2E2',
      borderRadius: 10,
      padding: 12,
      marginTop: 14,
      marginBottom: 10,
      textAlign: 'center',
      shadowColor: '#EF4444',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    buttonRowTop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      width: '100%' as const,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonRowBottom: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%' as const,
    },
    modalButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 24,
      minWidth: 120,
      marginVertical: 4,
      marginHorizontal: 2,
      marginBottom: 0,
    },
    trackButton: {
      backgroundColor: '#2563EB',
    },
    ackButton: {
      backgroundColor: '#22C55E',
    },
  });

  const themeStyles = {
    modalContent: {
      backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
      borderRadius: 24,
      padding: 32,
      alignItems: 'center' as const,
      width: '100%' as const,
      maxWidth: 400,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 16,
    },
    bigSender: {
      fontSize: 20,
      fontWeight: 'bold' as const,
      color: theme === 'dark' ? '#F9FAFB' : '#1E293B',
      marginBottom: 8,
      textAlign: 'center' as const,
    },
    modalTime: {
      fontSize: 13,
      color: theme === 'dark' ? '#9CA3AF' : '#64748B',
      marginBottom: 8,
    },
    divider: {
      width: '100%' as const,
      height: 1,
      backgroundColor: theme === 'dark' ? '#374151' : '#E5E7EB',
      marginVertical: 18,
    },
    dismissButton: {
      backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6',
      borderWidth: 1,
      borderColor: '#2563EB',
    },
  };

  return { ...baseStyles, ...themeStyles };
};