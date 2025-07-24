import React, { useState, useCallback, useEffect } from "react";
import {
  TextInput,
  Share,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CheckBox from '@react-native-community/checkbox';
import * as Notifications from 'expo-notifications';
import SwitchToggle from 'react-native-switch-toggle';

// Shared imports
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  FlatList,
  ActivityIndicator,
  Ionicons,
  useApp,
  useThemeMode,
  useFocusEffect,
  doc,
  updateDoc,
  getFirebaseDb,
} from "../utils/sharedImports";

// Component imports
import CustomHeader from "../components/CustomHeader";
import MemberCard, { MemberData, MemberCardLocation } from '../components/MemberCard';
import { ErrorBoundary, SafeArrayRenderer } from '../components/ErrorBoundary';

// Service imports
import { getCache, setCache, getFavorites, setFavorites, getDisplayName, setDisplayName, removeDisplayName } from '../services/cacheService';
import eventBus from '../services/eventBusService';
import realTimeSyncManager from '../services/realTimeSyncManager';

// UI Components for loading states and feedback
import { LoadingIndicator } from '../components/LoadingIndicator';
import ErrorMessage from '../components/ErrorMessage';
import {
  getCirclesForUser,
  createCircle,
  leaveCircle,
  createInviteLink,
  useInviteLink,
  UseInviteLinkResult,
  Circle as FirebaseCircle,
  getPrivateConnectionsForUser,
  PrivateConnection,
  createPrivateConnection,
  getUser,
  getUserLocation,
  updatePrivateConnectionSettings,
  PrivateConnection as FirebasePrivateConnection,
} from "../firebase/services";

// Types
import { ConnectionsStackNavigationProp, ConnectionsStackParamList, SerializedCircle } from '../types/navigation';
import { EVENT_NAMES, ConnectionChangeEvent, SyncRefreshEvent, LoadingStateEvent, SuccessEvent, ErrorEvent } from '../types/events';



type Props = {
  navigation: ConnectionsStackNavigationProp;
};

type SortMode = "alphabetical" | "manual" | "recent" | "members";

export default function ConnectionsScreen({ navigation }: Props) {
  const { state: { user } } = useApp();
  const { theme } = useThemeMode();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [loading, setLoading] = useState(true);
  const [circleName, setCircleName] = useState("");
  const [circleDescription, setCircleDescription] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [activeCircles, setActiveCircles] = useState<FirebaseCircle[]>([]);
  const [privateConnections, setPrivateConnections] = useState<PrivateConnection[]>([]);
  const [expandedSection, setExpandedSection] = useState<'groups' | 'contacts' | null>(null);
  const insets = useSafeAreaInsets();
  const [userProfiles, setUserProfiles] = useState<{ [uid: string]: { name: string; email: string } }>({});
  const [privateConnectionMembers, setPrivateConnectionMembers] = useState<{ [uid: string]: MemberData }>({});
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<PrivateConnection | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // Modal state for toggles and display name
  const [sosChecked, setSosChecked] = useState(false);
  const [crashChecked, setCrashChecked] = useState(false);
  const [pingChecked, setPingChecked] = useState(false);
  const [favoriteChecked, setFavoriteChecked] = useState(false);
  const [displayName, setDisplayNameState] = useState('');
  const [loadingModal, setLoadingModal] = useState(false);

  // Display name dialog state
  const [showDisplayNameDialog, setShowDisplayNameDialog] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState('');

  // Remove contact dialog state
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // Loading states for connection operations
  const [creatingConnection, setCreatingConnection] = useState(false);
  const [joiningConnection, setJoiningConnection] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // User feedback states (animations removed for silent updates)
  const [operationLoading, setOperationLoading] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');

  const groupsColor = '#3B82F6'; // blue
  const contactsColor = '#10B981'; // green
  const inviteColor = '#3B82F6'; // blue
  const joinColor = '#10B981'; // green

  useEffect(() => {
    if (user) {
      loadUserGroups();
      loadContacts();
    }
  }, [user]);

  // Add event listeners for loading states and user feedback
  useEffect(() => {
    if (!user?.uid) return;

    const eventSubscriptions = [
      // Listen for loading state changes
      eventBus.on<LoadingStateEvent>(EVENT_NAMES.LOADING_STATE_CHANGED, (event) => {
        console.log('[ConnectionsScreen] Loading state changed:', event);
        if (event.operation === 'connection_create' || event.operation === 'connection_join') {
          setOperationLoading(event.isLoading);
          setOperationMessage(event.message || '');
        }
      }),

      // Listen for success events
      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        console.log('[ConnectionsScreen] Success event:', event);
        if (event.operation === 'connection_added') {
          // Silent update - no animation needed
          setSyncError(null); // Clear any previous errors
        }
      }),

      // Listen for error events
      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        console.log('[ConnectionsScreen] Error event:', event);
        if (event.operation === 'connection_create' || event.operation === 'connection_join') {
          setSyncError(event.error);
        }
      }),
    ];

    return () => {
      // Cleanup event subscriptions
      if (eventSubscriptions && Array.isArray(eventSubscriptions)) {
        (eventSubscriptions ?? []).forEach(sub => sub?.unsubscribe?.());
      }
    };
  }, [user]);

  const loadUserGroups = async () => {
    if (!user?.uid) return;
    const cacheKey = `groups_${user.uid}`;
    try {
      setLoading(true);
      // Load from cache first
      const cachedGroups = await getCache<FirebaseCircle[]>(cacheKey);
      if (cachedGroups) setActiveCircles(cachedGroups);
      // Fetch from Firestore
      const groups = await getCirclesForUser(user.uid);
      // Only update if changed
      if (JSON.stringify(groups) !== JSON.stringify(cachedGroups)) {
        setActiveCircles(groups);
        await setCache(cacheKey, groups);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      Alert.alert('Error', 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      const connections = await getPrivateConnectionsForUser(user.uid);
      setPrivateConnections(connections);
      // Fetch other user profiles
      const otherUserIds = (connections ?? []).map(conn => (user.uid === conn.userA ? conn.userB : conn.userA));
      const missingUserIds = (otherUserIds ?? []).filter(uid => uid && !userProfiles[uid]);
      if (missingUserIds.length > 0) {
        const profileResults = await Promise.all((missingUserIds ?? []).map(uid => getUser(uid)));
        const newProfiles: { [uid: string]: { name: string; email: string } } = {};
        (profileResults ?? []).forEach((profile, idx) => {
          if (profile) newProfiles[missingUserIds[idx]] = { name: profile.name || missingUserIds[idx], email: profile.email || '' };
        });
        setUserProfiles(prev => ({ ...prev, ...newProfiles }));
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Error', 'Failed to load contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    // For each private connection, fetch the other user's MemberData
    const fetchMembers = async () => {
      const members: { [uid: string]: MemberData } = {};
      await Promise.all((privateConnections ?? []).map(async (conn) => {
        const otherUserId = user.uid === conn.userA ? conn.userB : conn.userA;
        if (!otherUserId) return;
        const userInfo = await getUser(otherUserId);
        const location = await getUserLocation(otherUserId);
        members[otherUserId] = {
          id: otherUserId,
          name: userInfo?.name || 'Unknown User',
          avatar: userInfo?.profileImage || undefined,
          battery: location?.batteryLevel ?? 0,
          isCharging: location?.isCharging ?? false,
          location: location ? {
            address: location.address || 'Location unknown',
            timestamp: location.timestamp ? new Date(location.timestamp) : new Date(),
            speed: location.speed,
            latitude: location.latitude,
            longitude: location.longitude,
          } : null,
          online: userInfo?.isOnline ?? false,
          lastSeen: userInfo?.lastSeen ? new Date(userInfo.lastSeen) : undefined,
        };
      }));
      setPrivateConnectionMembers(members);
    };
    fetchMembers();
  }, [privateConnections, user]);

  // Load modal values when opened
  useEffect(() => {
    const loadModalValues = async () => {
      if (!selectedConnection || !selectedContactId || !user?.uid) return;
      setLoadingModal(true);
      // Determine if user is A or B
      const isA = selectedConnection.userA === user.uid;
      setSosChecked(isA ? !!selectedConnection.isSOSContactA : !!selectedConnection.isSOSContactB);
      setCrashChecked(isA ? !!selectedConnection.isCrashContactA : !!selectedConnection.isCrashContactB);
      setPingChecked(isA ? !!selectedConnection.canPingDeviceA : !!selectedConnection.canPingDeviceB);
      // Favorites
      const favs = await getFavorites(user.uid);
      setFavoriteChecked(favs.includes(selectedContactId));
      // Display name
      const dn = await getDisplayName(user.uid, selectedContactId);
      setDisplayNameState(dn || '');
      setLoadingModal(false);
    };
    if (manageModalVisible) loadModalValues();
  }, [manageModalVisible, selectedConnection, selectedContactId, user]);

  // Handlers for toggles
  const handleToggleSOS = async (val: boolean) => {
    if (!selectedConnection || !user?.uid) return;

    try {
      setSosChecked(val);
      await updatePrivateConnectionSettings(selectedConnection.id, user.uid, { isSOSContact: val });

      // Emit connection updated event
      const otherUserId = user.uid === selectedConnection.userA ? selectedConnection.userB : selectedConnection.userA;
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: selectedConnection.id,
        changeType: 'updated',
        userId: user.uid,
        otherUserId: otherUserId,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_UPDATED, connectionEvent);
    } catch (error) {
      console.error('Error updating SOS setting:', error);
      setSosChecked(!val); // Revert on error
      setSyncError('Failed to update SOS setting');
    }
  };

  const handleToggleCrash = async (val: boolean) => {
    if (!selectedConnection || !user?.uid) return;

    try {
      setCrashChecked(val);
      await updatePrivateConnectionSettings(selectedConnection.id, user.uid, { isCrashContact: val });

      // Emit connection updated event
      const otherUserId = user.uid === selectedConnection.userA ? selectedConnection.userB : selectedConnection.userA;
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: selectedConnection.id,
        changeType: 'updated',
        userId: user.uid,
        otherUserId: otherUserId,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_UPDATED, connectionEvent);
    } catch (error) {
      console.error('Error updating crash detection setting:', error);
      setCrashChecked(!val); // Revert on error
      setSyncError('Failed to update crash detection setting');
    }
  };

  const handleTogglePing = async (val: boolean) => {
    if (!selectedConnection || !user?.uid) return;

    try {
      // Permission prompt
      if (val) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'You must enable notifications to allow pinging.');
          return;
        }
      }

      setPingChecked(val);
      await updatePrivateConnectionSettings(selectedConnection.id, user.uid, { canPingDevice: val });

      // Emit connection updated event
      const otherUserId = user.uid === selectedConnection.userA ? selectedConnection.userB : selectedConnection.userA;
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: selectedConnection.id,
        changeType: 'updated',
        userId: user.uid,
        otherUserId: otherUserId,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_UPDATED, connectionEvent);
    } catch (error) {
      console.error('Error updating ping setting:', error);
      setPingChecked(!val); // Revert on error
      setSyncError('Failed to update ping setting');
    }
  };
  const handleToggleFavorite = async (val: boolean) => {
    if (!user?.uid || !selectedContactId) return;
    setFavoriteChecked(val);
    const favs = await getFavorites(user.uid);
    let newFavs = favs;
    if (val && !favs.includes(selectedContactId)) newFavs = [...favs, selectedContactId];
    if (!val) newFavs = (favs ?? []).filter(id => id !== selectedContactId);
    await setFavorites(user.uid, newFavs);
  };
  const handleDisplayNameChange = async (val: string) => {
    setDisplayNameState(val);
    if (!user?.uid || !selectedContactId) return;
    if (val.trim()) {
      await setDisplayName(user.uid, selectedContactId, val.trim());
    } else {
      await removeDisplayName(user.uid, selectedContactId);
    }
  };
  const handleRemoveContact = async () => {
    if (!selectedConnection || !user?.uid) return;

    setLoadingModal(true);
    setSyncError(null);

    try {
      // Remove from Firestore
      await updateDoc(doc(getFirebaseDb(), 'privateConnections', selectedConnection.id), { status: 'removed' });

      // Emit connection removed event
      const otherUserId = user.uid === selectedConnection.userA ? selectedConnection.userB : selectedConnection.userA;
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: selectedConnection.id,
        changeType: 'removed',
        userId: user.uid,
        otherUserId: otherUserId,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_REMOVED, connectionEvent);

      // Remove from favorites and display name
      if (selectedContactId) {
        const favs = await getFavorites(user.uid);
        await setFavorites(user.uid, (favs ?? []).filter(id => id !== selectedContactId));
        await removeDisplayName(user.uid, selectedContactId);
      }

      // Trigger sync refresh
      try {
        await realTimeSyncManager.forceSync();
      } catch (syncError) {
        console.warn('Sync refresh failed after removing connection:', syncError);
      }

      setManageModalVisible(false);
      // Refresh list
      await loadContacts();
    } catch (error) {
      console.error('Error removing contact:', error);
      setSyncError('Failed to remove contact');
      Alert.alert('Error', 'Failed to remove contact. Please try again.');
    } finally {
      setLoadingModal(false);
    }
  };

  const sortedGroups = useCallback(() => {
    const groups = [...activeCircles];
    switch (sortMode) {
      case "alphabetical": return groups.sort((a, b) => a.name.localeCompare(b.name));
      case "recent": return groups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case "members": return groups.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
      default: return groups;
    }
  }, [activeCircles, sortMode]);

  const handleCreateGroup = () => {
    setShowCreateModal(false);
    setShowGroupNameModal(true);
  };

  const handleSubmitCreateGroup = async () => {
    if (!newGroupName.trim() || !user?.uid) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }
    try {
      const newCircle = await createCircle({
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || "Safety circle",
        ownerId: user.uid,
      });
      setActiveCircles(prev => [newCircle, ...prev]);
      setNewGroupName("");
      setNewGroupDescription("");
      Keyboard.dismiss();
      setShowGroupNameModal(false);
      navigation.navigate('CircleDetails', { circle: toSerializableGroup(newCircle) });
    } catch (error) {
      Alert.alert('Error', 'Failed to create group.');
    }
  };

  const handleInvite1on1 = async () => {
    setShowCreateModal(false);
    if (!user?.uid) {
      Alert.alert('Error', 'You must be logged in to invite a contact.');
      return;
    }

    // Emit loading state
    eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
      isLoading: true,
      operation: 'connection_create',
      message: 'Creating 1on1 invite link...',
      timestamp: new Date(),
      source: 'ConnectionsScreen'
    });

    setCreatingConnection(true);
    setSyncError(null);

    try {
      const privateConn = await createPrivateConnection({ userA: user.uid, userB: '' });
      const inviteLink = await createInviteLink({ privateConnectionId: privateConn.id, createdBy: user.uid, type: '1on1' });
      const shareUrl = `https://geoguardian.app/invite/${inviteLink.linkCode}`;

      // Emit connection created event
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: privateConn.id,
        changeType: 'added',
        userId: user.uid,
        otherUserId: '', // Will be filled when someone accepts
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);

      // Emit success event (deferred to avoid render phase conflicts)
      setTimeout(() => {
        eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
          operation: 'connection_added',
          message: 'Contact invite link created successfully!',
          timestamp: new Date(),
          source: 'ConnectionsScreen'
        });
      }, 0);

      Share.share({ message: `Join my private contact connection on GeoGuardian: ${shareUrl}`, url: shareUrl });
    } catch (error) {
      console.error('Error creating contact invite:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create contact invite link';

      // Emit error event
      eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
        operation: 'connection_create',
        error: errorMessage,
        retryable: true,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      });

      setSyncError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setCreatingConnection(false);

      // Clear loading state
      eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
        isLoading: false,
        operation: 'connection_create',
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      });
    }
  };

  const handleJoinCircle = async () => {
    if (!inviteLink.trim() || !user?.uid) return Alert.alert("Error", "Please enter an invite link");

    // Emit loading state
    eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
      isLoading: true,
      operation: 'connection_join',
      message: 'Joining connection...',
      timestamp: new Date(),
      source: 'ConnectionsScreen'
    });

    setJoiningConnection(true);
    setSyncError(null);

    // Store original state for potential rollback
    const originalPrivateConnections = [...privateConnections];
    const originalActiveCircles = [...activeCircles];

    try {
      const linkCode = inviteLink.split('/').pop();
      if (!linkCode) {
        throw new Error("Invalid invite link format");
      }

      const result = await useInviteLink(linkCode, user.uid);

      // Handle different invite types
      if (result.type === '1on1' && result.privateConnectionId) {
        // For contact connections, emit connection added event
        const connectionEvent: ConnectionChangeEvent = {
          connectionId: result.privateConnectionId,
          changeType: 'added',
          userId: user.uid,
          otherUserId: result.otherUserId || result.createdBy,
          timestamp: new Date(),
          source: 'ConnectionsScreen'
        };

        // Emit connection change event for real-time sync
        eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);

        // Invalidate cache for private connections to ensure fresh data
        try {
          const { invalidateWithRefresh } = await import('../services/cacheService');
          await invalidateWithRefresh(`private_connections_${user.uid}`, async () => {
            // Refresh callback: reload contacts
            await loadContacts();
          });
        } catch (cacheError) {
          console.warn('Cache invalidation failed:', cacheError);
          // Fallback: just reload connections
          await loadContacts();
        }

        // Trigger immediate subscription setup for the new contact
        try {
          await realTimeSyncManager.forceSync();

          // Emit sync refresh event to ensure live view updates
          eventBus.emit(EVENT_NAMES.SYNC_REFRESH_REQUIRED, {
            reason: 'connection_change',
            affectedUserIds: [result.otherUserId || result.createdBy],
            timestamp: new Date(),
            source: 'ConnectionsScreen'
          });
        } catch (syncError) {
          console.warn('Sync refresh failed after joining connection:', syncError);
          // Don't fail the whole operation if sync fails, but log it
          setSyncError('Connection created but sync may be delayed');
        }

        // Emit success event (deferred to avoid render phase conflicts)
        setTimeout(() => {
          eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
            operation: 'connection_added',
            message: 'You are now connected! Your new contact should appear in the live view shortly.',
            timestamp: new Date(),
            source: 'ConnectionsScreen'
          });
        }, 0);

        Alert.alert("Success", "You are now connected! Your new contact should appear in the live view shortly.");
      } else if (result.type === 'group' && result.circleId) {
        // For circle invites, invalidate circles cache and reload
        try {
          const { invalidateWithRefresh } = await import('../services/cacheService');
          await invalidateWithRefresh(`user_circles_${user.uid}`, async () => {
            await loadUserGroups();
          });
        } catch (cacheError) {
          console.warn('Cache invalidation failed for groups:', cacheError);
          await loadUserGroups();
        }

        Alert.alert("Success", "You have joined the group!");
      }

      // Clear the input and close modal on success
      setInviteLink("");
      setShowJoinModal(false);

    } catch (error) {
      console.error('Error joining via invite link:', error);

      // Rollback state changes on error
      setPrivateConnections(originalPrivateConnections);
      setActiveCircles(originalActiveCircles);

      // Set user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Failed to join via invite link';
      setSyncError(errorMessage);

      // Show detailed error to user
      Alert.alert('Error', errorMessage);

      // Emit error event
      eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
        operation: 'connection_join',
        error: errorMessage,
        retryable: true,
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      });

    } finally {
      setJoiningConnection(false);

      // Clear loading state
      eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
        isLoading: false,
        operation: 'connection_join',
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      });
    }
  };

  const handleShareGroup = async (group: FirebaseCircle) => {
    if (!user?.uid) return;
    try {
      const newInviteLink = await createInviteLink({ circleId: group.id, createdBy: user.uid, type: 'group' });
      const shareUrl = `https://geoguardian.app/invite/${newInviteLink.linkCode}`;
      Share.share({ message: `Join my safety group "${group.name}" on GeoGuardian: ${shareUrl}`, url: shareUrl });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create invite link.');
    }
  };

  const toSerializableGroup = (group: FirebaseCircle): SerializedCircle => ({
    ...group,
    createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : group.createdAt,
    updatedAt: group.updatedAt instanceof Date ? group.updatedAt.toISOString() : group.updatedAt,
  });

  const renderGroupCard = ({ item }: { item: FirebaseCircle }) => (
    <TouchableOpacity
      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}
      onPress={() => navigation.navigate('CircleDetails', { circle: toSerializableGroup(item) })}
      activeOpacity={0.8}
    >
      <View style={{ backgroundColor: `${groupsColor}20`, width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="people" size={24} color={groupsColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>{item.name}</Text>
        <Text style={{ fontSize: 14, color: theme === 'dark' ? '#9CA3AF' : '#6B7280', marginTop: 2 }}>{item.memberCount || 0} members</Text>
      </View>
      <TouchableOpacity onPress={() => handleShareGroup(item)}>
        <Ionicons name="share-outline" size={20} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderContactCard = ({ item, index }: { item: PrivateConnection, index: number }) => {
    const otherUserId = user?.uid === item.userA ? item.userB : item.userA;
    const memberData = privateConnectionMembers[otherUserId];
    if (loading) {
      // Only show loading while data is being fetched
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
          <ActivityIndicator size="small" />
          <Text style={{ fontSize: 16, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Loading...</Text>
        </View>
      );
    }
    if (!memberData) {
      // If not loading and no memberData, don't show anything
      return null;
    }
    return (
      <MemberCard
        member={memberData}
        simplified={true}
        onPress={() => {
          setSelectedConnection(item);
          setSelectedContactId(otherUserId);
          setManageModalVisible(true);
        }}
      />
    );
  };

  const renderSeparator = () => (
    <View style={{ height: 1, backgroundColor: theme === 'dark' ? '#374151' : '#E5E7EB', marginLeft: 80 }} />
  );

  const SectionHeader = ({
    title,
    iconName,
    color,
    expanded,
    onPress,
  }: {
    title: string;
    iconName: keyof typeof Ionicons.glyphMap;
    color: string;
    expanded: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ backgroundColor: `${color}20`, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name={iconName} size={22} color={color} />
      </View>
      <Text style={{ flex: 1, fontSize: 20, fontWeight: 'bold', color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>{title}</Text>
      <Animated.View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
        <Ionicons name="chevron-down" size={22} color={theme === 'dark' ? '#9CA3AF' : '#9CA3AF'} />
      </Animated.View>
    </TouchableOpacity>
  );

  useFocusEffect(
    React.useCallback(() => {
      setExpandedSection(null);
    }, [])
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Display Name Dialog Component
  const renderDisplayNameDialog = () => {
    return (
      <Modal
        visible={showDisplayNameDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDisplayNameDialog(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          activeOpacity={1}
          onPress={() => setShowDisplayNameDialog(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '85%',
              maxWidth: 350,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8
            }}
            activeOpacity={1}
            onPress={() => { }}
          >
            <Text style={{
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 16,
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center'
            }}>
              Enter Display Name
            </Text>

            <TextInput
              value={tempDisplayName}
              onChangeText={setTempDisplayName}
              placeholder="Enter a nickname"
              placeholderTextColor={theme === 'dark' ? '#6B7280' : '#9CA3AF'}
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: theme === 'dark' ? '#4B5563' : '#E5E7EB',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                marginBottom: 20,
                backgroundColor: theme === 'dark' ? '#374151' : '#F9FAFB',
                color: theme === 'dark' ? '#F9FAFB' : '#1E293B'
              }}
            />

            <TouchableOpacity
              style={{
                backgroundColor: '#2563EB',
                borderRadius: 8,
                padding: 14,
                alignItems: 'center'
              }}
              onPress={async () => {
                await handleDisplayNameChange(tempDisplayName);
                setShowDisplayNameDialog(false);
              }}
            >
              <Text style={{
                color: '#FFFFFF',
                fontWeight: 'bold',
                fontSize: 16
              }}>
                Save
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Remove Contact Dialog Component
  const renderRemoveContactDialog = () => {
    return (
      <Modal
        visible={showRemoveDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRemoveDialog(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          activeOpacity={1}
          onPress={() => setShowRemoveDialog(false)}
        >
          <TouchableOpacity
            style={{
              backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '85%',
              maxWidth: 350,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8
            }}
            activeOpacity={1}
            onPress={() => { }}
          >
            <Text style={{
              fontSize: 20,
              fontWeight: 'bold',
              marginBottom: 16,
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center'
            }}>
              Remove Contact
            </Text>

            <Text style={{
              fontSize: 16,
              marginBottom: 24,
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
              textAlign: 'center',
              lineHeight: 22
            }}>
              Are you sure you want to remove this contact?
            </Text>

            <View style={{
              flexDirection: 'row',
              gap: 12,
              justifyContent: 'space-between'
            }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#2563EB',
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center'
                }}
                onPress={async () => {
                  setShowRemoveDialog(false);
                  await handleRemoveContact();
                }}
              >
                <Text style={{
                  color: '#FFFFFF',
                  fontWeight: 'bold',
                  fontSize: 16
                }}>
                  Remove
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#EF4444',
                  borderRadius: 8,
                  padding: 14,
                  alignItems: 'center'
                }}
                onPress={() => setShowRemoveDialog(false)}
              >
                <Text style={{
                  color: '#FFFFFF',
                  fontWeight: 'bold',
                  fontSize: 16
                }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // Manage Contact Modal UI
  const renderManageContactModal = () => {
    if (!selectedConnection || !selectedContactId) return null;
    return (
      <Modal
        visible={manageModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setManageModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: theme === 'dark' ? '#1F2937' : '#fff', borderRadius: 20, padding: 24, width: '92%', maxWidth: 400, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, elevation: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 18, color: theme === 'dark' ? '#F9FAFB' : '#1E293B', textAlign: 'center' }}>Manage Contact</Text>
            {loadingModal ? <ActivityIndicator size="large" /> : <>
              {/* SOS Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="alert-circle-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>SOS Alert Contact</Text>
                  <Text style={{ fontSize: 13, color: theme === 'dark' ? '#9CA3AF' : '#64748B', marginTop: 2 }}>This contact will be alerted when you press SOS.</Text>
                </View>
                <SwitchToggle
                  switchOn={sosChecked}
                  onPress={() => handleToggleSOS(!sosChecked)}
                  circleColorOff={theme === 'dark' ? '#6B7280' : '#FFFFFF'}
                  circleColorOn={theme === 'dark' ? '#3B82F6' : '#FFFFFF'}
                  backgroundColorOn={theme === 'dark' ? '#1E3A8A' : '#3B82F6'}
                  backgroundColorOff={theme === 'dark' ? '#374151' : '#D1D5DB'}
                  containerStyle={{ width: 48, height: 28, borderRadius: 14, padding: 2 }}
                  circleStyle={{ width: 24, height: 24, borderRadius: 12 }}
                />
              </View>
              {/* Crash Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="car-sport-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>Crash Detection Contact</Text>
                  <Text style={{ fontSize: 13, color: theme === 'dark' ? '#9CA3AF' : '#64748B', marginTop: 2 }}>This contact will be alerted if a crash is detected.</Text>
                </View>
                <SwitchToggle
                  switchOn={crashChecked}
                  onPress={() => handleToggleCrash(!crashChecked)}
                  circleColorOff={theme === 'dark' ? '#6B7280' : '#FFFFFF'}
                  circleColorOn={theme === 'dark' ? '#3B82F6' : '#FFFFFF'}
                  backgroundColorOn={theme === 'dark' ? '#1E3A8A' : '#3B82F6'}
                  backgroundColorOff={theme === 'dark' ? '#374151' : '#D1D5DB'}
                  containerStyle={{ width: 48, height: 28, borderRadius: 14, padding: 2 }}
                  circleStyle={{ width: 24, height: 24, borderRadius: 12 }}
                />
              </View>
              {/* Ping Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="notifications-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>Allow Ping</Text>
                  <Text style={{ fontSize: 13, color: theme === 'dark' ? '#9CA3AF' : '#64748B', marginTop: 2 }}>This contact can ping your device to help you find it, even if it's on silent.</Text>
                </View>
                <SwitchToggle
                  switchOn={pingChecked}
                  onPress={() => handleTogglePing(!pingChecked)}
                  circleColorOff={theme === 'dark' ? '#6B7280' : '#FFFFFF'}
                  circleColorOn={theme === 'dark' ? '#3B82F6' : '#FFFFFF'}
                  backgroundColorOn={theme === 'dark' ? '#1E3A8A' : '#3B82F6'}
                  backgroundColorOff={theme === 'dark' ? '#374151' : '#D1D5DB'}
                  containerStyle={{ width: 48, height: 28, borderRadius: 14, padding: 2 }}
                  circleStyle={{ width: 24, height: 24, borderRadius: 12 }}
                />
              </View>
              {/* Favorite Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="star-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>Add as Favorite</Text>
                  <Text style={{ fontSize: 13, color: theme === 'dark' ? '#9CA3AF' : '#64748B', marginTop: 2 }}>Favorites are shown at the top of your contacts list.</Text>
                </View>
                <SwitchToggle
                  switchOn={favoriteChecked}
                  onPress={() => handleToggleFavorite(!favoriteChecked)}
                  circleColorOff={theme === 'dark' ? '#6B7280' : '#FFFFFF'}
                  circleColorOn={theme === 'dark' ? '#3B82F6' : '#FFFFFF'}
                  backgroundColorOn={theme === 'dark' ? '#1E3A8A' : '#3B82F6'}
                  backgroundColorOff={theme === 'dark' ? '#374151' : '#D1D5DB'}
                  containerStyle={{ width: 48, height: 28, borderRadius: 14, padding: 2 }}
                  circleStyle={{ width: 24, height: 24, borderRadius: 12 }}
                />
              </View>
              {/* Display Name */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="person-circle-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>Display Name</Text>
                  <Text style={{ fontSize: 13, color: theme === 'dark' ? '#9CA3AF' : '#64748B', marginTop: 2 }}>Set a nickname for this contact.</Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#2563EB',
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onPress={() => {
                    // Prevent multiple dialogs from opening
                    if (showRemoveDialog) return;
                    setTempDisplayName(displayName);
                    setShowDisplayNameDialog(true);
                  }}
                >
                  <Text style={{
                    color: '#FFFFFF',
                    fontWeight: '600',
                    fontSize: 14
                  }}>
                    Set
                  </Text>
                </TouchableOpacity>
              </View>
              {/* Remove Contact Option */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Ionicons name="trash-outline" size={22} color="#2563EB" style={{ marginRight: 12 }} />
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#1E293B' }}>Remove Contact</Text>
                  <Text style={{ fontSize: 13, color: theme === 'dark' ? '#9CA3AF' : '#64748B', marginTop: 2 }}>Permanently remove this contact from your list</Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#EF4444',
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onPress={() => {
                    // Prevent multiple dialogs from opening
                    if (showDisplayNameDialog) return;
                    setShowRemoveDialog(true);
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>
              </View>
              {/* Save Button */}
              <TouchableOpacity
                style={{ backgroundColor: '#2563EB', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 2 }}
                onPress={async () => {
                  setLoadingModal(true);
                  await loadContacts();
                  setLoadingModal(false);
                  setManageModalVisible(false);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Save</Text>
              </TouchableOpacity>
            </>}
            <TouchableOpacity
              style={{ position: 'absolute', top: 12, right: 12 }}
              onPress={() => setManageModalVisible(false)}
            >
              <Ionicons name="close" size={24} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' }}>
      <CustomHeader title="Connections" />

      {/* Error Message Display */}
      {syncError && (
        <View style={{
          backgroundColor: '#FEF2F2',
          borderColor: '#FECACA',
          borderWidth: 1,
          borderRadius: 8,
          padding: 12,
          margin: 16,
          flexDirection: 'row',
          alignItems: 'center'
        }}>
          <Ionicons name="alert-circle" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={{ flex: 1, color: '#DC2626', fontSize: 14 }}>{syncError}</Text>
          <TouchableOpacity onPress={() => setSyncError(null)}>
            <Ionicons name="close" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={{ padding: 16, paddingBottom: 160 }} contentContainerStyle={{ paddingBottom: 64, flexGrow: 1 }}>
        {/* Show placeholder for new users with no groups or contacts */}
        {activeCircles.length === 0 && privateConnections.length === 0 && (
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 48,
            paddingHorizontal: 24,
            marginTop: 48
          }}>
            <Ionicons name="people-circle-outline" size={64} color="#9CA3AF" />
            <Text style={{
              fontSize: 20,
              fontWeight: 'bold',
              marginTop: 16,
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center'
            }}>
              Welcome to GeoGuardian!
            </Text>
            <Text style={{
              fontSize: 16,
              marginTop: 8,
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
              textAlign: 'center',
              lineHeight: 24
            }}>
              Get started by inviting friends and family to connect with you. Tap "Invite" below to create your first group or contact.
            </Text>
          </View>
        )}

        {/* Groups Section - Only show if user has groups */}
        {activeCircles.length > 0 && (
          <View style={{ borderRadius: 12, backgroundColor: theme === 'dark' ? '#1F2937' : '#F9FAFB', marginBottom: 0, marginTop: 48 }}>
            <SectionHeader
              title="Groups"
              iconName="people-outline"
              color={groupsColor}
              expanded={expandedSection === 'groups'}
              onPress={() => setExpandedSection(expandedSection === 'groups' ? null : 'groups')}
            />
            {expandedSection === 'groups' && (
              <ErrorBoundary context="ConnectionsScreen Groups List">
                <FlatList
                  data={sortedGroups()}
                  renderItem={renderGroupCard}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={renderSeparator}
                />
              </ErrorBoundary>
            )}
          </View>
        )}

        {/* Add spacing between sections only if both exist */}
        {activeCircles.length > 0 && privateConnections.length > 0 && (
          <View style={{ marginTop: 32 }} />
        )}

        {/* Contacts Section - Only show if user has contacts */}
        {privateConnections.length > 0 && (
          <View style={{ borderRadius: 12, backgroundColor: theme === 'dark' ? '#1F2937' : '#F9FAFB', marginBottom: 0 }}>
            <SectionHeader
              title="Contacts"
              iconName="person-outline"
              color={contactsColor}
              expanded={expandedSection === 'contacts'}
              onPress={() => setExpandedSection(expandedSection === 'contacts' ? null : 'contacts')}
            />
            {expandedSection === 'contacts' && (
              <ErrorBoundary context="ConnectionsScreen Contacts List">
                <FlatList
                  data={privateConnections}
                  renderItem={({ item, index }) => renderContactCard({ item, index })}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={renderSeparator}
                />
              </ErrorBoundary>
            )}
          </View>
        )}
        <View style={{ flex: 1 }} />
      </ScrollView>
      {/* Invite/Join Actions fixed above the navigation bar */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 104, zIndex: 10 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: creatingConnection ? 'rgba(37, 99, 235, 0.05)' : 'rgba(37, 99, 235, 0.1)',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: creatingConnection ? 0.6 : 1
            }}
            onPress={() => setShowCreateModal(true)}
            disabled={creatingConnection}
          >
            <View style={{ backgroundColor: '#2563EB', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
              {creatingConnection ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              )}
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 8, color: '#2563EB' }}>
              {creatingConnection ? 'Creating...' : 'Invite'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: joiningConnection ? (theme === 'dark' ? '#2D3748' : '#E2E8F0') : (theme === 'dark' ? '#374151' : '#F3F4F6'),
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: joiningConnection ? 0.6 : 1
            }}
            onPress={() => setShowJoinModal(true)}
            disabled={joiningConnection}
          >
            <View style={{ backgroundColor: joinColor, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' }}>
              {joiningConnection ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="enter-outline" size={20} color="#FFFFFF" />
              )}
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 8, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>
              {joiningConnection ? 'Joining...' : 'Join'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Create/Invite Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
          <View style={{ backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF', borderRadius: 16, padding: 24, width: '92%', maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Invite or Create a Group</Text>
            <TouchableOpacity
              style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', padding: 16, borderRadius: 12, marginBottom: 16 }}
              onPress={handleCreateGroup}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#2563EB', marginBottom: 4 }}>Create a Group</Text>
              <Text style={{ fontSize: 14, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Perfect for families or groups of friends. Everyone in the group can see each other's locations and activities.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', padding: 16, borderRadius: 12 }}
              onPress={handleInvite1on1}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#2563EB', marginBottom: 4 }}>Invite Contact</Text>
              <Text style={{ fontSize: 14, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Ideal for sharing your location and activities privately with just one other person.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={() => setShowCreateModal(false)}>
              <Text style={{ fontSize: 16, color: '#2563EB' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Group Name Modal */}
      <Modal visible={showGroupNameModal} transparent animationType="slide" onRequestClose={() => setShowGroupNameModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
          <View style={{ backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF', borderRadius: 16, padding: 24, width: '92%', maxWidth: 400 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Create New Group</Text>
            <TextInput
              autoFocus
              style={{
                backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6',
                padding: 16,
                borderRadius: 8,
                color: theme === 'dark' ? '#F9FAFB' : '#111827',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme === 'dark' ? '#4B5563' : '#E5E7EB'
              }}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group Name"
              placeholderTextColor={theme === 'dark' ? '#6B7280' : '#9CA3AF'}
            />
            <TextInput
              style={{
                backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6',
                padding: 16,
                borderRadius: 8,
                color: theme === 'dark' ? '#F9FAFB' : '#111827',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme === 'dark' ? '#4B5563' : '#E5E7EB'
              }}
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme === 'dark' ? '#6B7280' : '#9CA3AF'}
              multiline
            />
            <TouchableOpacity style={{ backgroundColor: '#2563EB', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 8 }} onPress={handleSubmitCreateGroup}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' }}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => setShowGroupNameModal(false)}>
              <Text style={{ fontSize: 16, color: '#2563EB' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Join Modal */}
      <Modal visible={showJoinModal} transparent animationType="slide" onRequestClose={() => setShowJoinModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }} activeOpacity={1} onPressOut={() => setShowJoinModal(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: insets.bottom + 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Join a Group</Text>
              <TextInput
                style={{
                  backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6',
                  padding: 16,
                  borderRadius: 8,
                  color: theme === 'dark' ? '#F9FAFB' : '#111827',
                  borderWidth: 1,
                  borderColor: theme === 'dark' ? '#4B5563' : '#E5E7EB'
                }}
                value={inviteLink}
                onChangeText={setInviteLink}
                placeholder="Paste code here"
                placeholderTextColor={theme === 'dark' ? '#6B7280' : '#9CA3AF'}
              />
              <TouchableOpacity
                style={{
                  backgroundColor: joiningConnection ? '#9CA3AF' : '#2563EB',
                  padding: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  marginTop: 16,
                  flexDirection: 'row',
                  justifyContent: 'center'
                }}
                onPress={handleJoinCircle}
                disabled={joiningConnection}
              >
                {joiningConnection && <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />}
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' }}>
                  {joiningConnection ? 'Joining...' : 'Join'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      {renderManageContactModal()}
      {renderDisplayNameDialog()}
      {renderRemoveContactDialog()}

      {/* Loading Indicator removed for silent updates */}

      {/* Error Message */}
      <ErrorMessage
        message={syncError || ''}
        isVisible={!!syncError}
        onRetry={() => {
          setSyncError(null);
          // Retry the last operation based on context
          if (creatingConnection) {
            handleInvite1on1();
          } else if (joiningConnection) {
            handleJoinCircle();
          }
        }}
        onDismiss={() => setSyncError(null)}
        style={{ top: 100 }}
        retryText="Retry"
        type="error"
      />

      {/* Animation removed for silent updates */}
    </View>
  );
}
