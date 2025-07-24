import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, Modal, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CustomHeader from "../components/CustomHeader";
import { useApp } from "../contexts/AppContext";
import { UserAlert, getUserLocation, getUser, sendExpoPushNotification } from "../firebase/services";
import { getFirebaseDb } from '../firebase/firebase';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, serverTimestamp, getDoc, addDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useThemeMode } from '../contexts/ThemeContext';
import { TabNavigationProp } from '../types/navigation';

export default function AlertsScreen() {
  const { state: { user } } = useApp();
  const { theme, isThemeReady } = useThemeMode();
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<UserAlert | null>(null);
  const [showModal, setShowModal] = useState(false);
  const navigation = useNavigation<TabNavigationProp>();

  useEffect(() => {
    if (!user?.uid) return;
    const db = getFirebaseDb();
    const alertsRef = collection(db, 'users', user.uid, 'alerts');
    const q = query(alertsRef, orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const alertList = (snapshot.docs ?? []).map(doc => ({ id: doc.id, ...doc.data() } as UserAlert));
      setAlerts(alertList);
    });
    return unsub;
  }, [user]);

  const handleAcknowledge = async () => {
    if (!user?.uid || !selectedAlert) return;

    console.log('[AlertsScreen] Acknowledging alert:', selectedAlert.id);

    try {
      const db = getFirebaseDb();

      // Update the original alert as acknowledged
      const alertDocRef = doc(db, 'users', user.uid, 'alerts', selectedAlert.id!);
      await updateDoc(alertDocRef, {
        acknowledged: true,
        acknowledgedAt: serverTimestamp(),
      });

      console.log('[AlertsScreen] Alert marked as acknowledged');
      setShowModal(false);

      // Create an acknowledgment alert for the sender
      if (selectedAlert.senderId) {
        console.log('[AlertsScreen] Creating acknowledgment alert for sender:', selectedAlert.senderId);

        // Create acknowledgment alert in sender's alerts collection
        const senderAlertsCollection = collection(db, 'users', selectedAlert.senderId, 'alerts');
        const acknowledgmentAlert = {
          type: 'acknowledgment' as const,
          senderId: user.uid,
          senderName: user.displayName || user.email || 'A contact',
          senderAvatar: user.photoURL,
          recipientId: selectedAlert.senderId,
          originalAlertId: selectedAlert.id,
          originalAlertType: selectedAlert.type,
          timestamp: serverTimestamp(),
          acknowledged: false,
          acknowledgedAt: null,
          isRead: false, // Ensure acknowledgment alerts start as unread
          message: `Your ${selectedAlert.type === 'sos' ? 'SOS' : 'crash'} alert has been acknowledged.`
        };

        await addDoc(senderAlertsCollection, acknowledgmentAlert);
        console.log('[AlertsScreen] Acknowledgment alert created');

        // Also send push notification
        const senderDocRef = doc(db, 'users', selectedAlert.senderId);
        const senderSnap = await getDoc(senderDocRef);
        const expoPushToken = senderSnap.exists() ? senderSnap.data().expoPushToken : null;
        if (expoPushToken) {
          await sendExpoPushNotification(
            expoPushToken,
            'Alert Acknowledged',
            `${user.displayName || 'A contact'} acknowledged your ${selectedAlert.type === 'sos' ? 'SOS' : 'crash'} alert!`,
            { alertId: selectedAlert.id, type: 'acknowledgment' }
          );
          console.log('[AlertsScreen] Push notification sent to sender');
        }
      }
    } catch (err) {
      console.error('[AlertsScreen] Failed to acknowledge alert:', err);
    }
  };

  const handleTrackNow = async () => {
    if (!selectedAlert?.senderId) {
      console.warn('[AlertsScreen] No sender ID available for tracking');
      setShowModal(false);
      return;
    }

    console.log('[AlertsScreen] Track Now clicked for sender:', selectedAlert.senderId);
    setShowModal(false);

    try {
      // Fetch sender's current location and user information
      console.log('[AlertsScreen] Fetching sender location and info...');
      const [senderLocation, senderInfo] = await Promise.all([
        getUserLocation(selectedAlert.senderId),
        getUser(selectedAlert.senderId)
      ]);

      console.log('[AlertsScreen] Fetched data:', {
        hasLocation: !!senderLocation,
        hasUserInfo: !!senderInfo,
        senderName: senderInfo?.name
      });

      // Navigate to LiveView tab and then to Dashboard screen with parameters
      const navigationParams = {
        screen: 'Dashboard' as const,
        params: {
          selectedMemberId: selectedAlert.senderId,
          memberLocation: senderLocation ? {
            ...senderLocation,
            timestamp: senderLocation.timestamp.toISOString(),
            arrivalTimestamp: senderLocation.arrivalTimestamp?.toISOString(),
            heartbeatTimestamp: senderLocation.heartbeatTimestamp?.toISOString(),
          } : null,
          memberInfo: senderInfo
        }
      };

      console.log('[AlertsScreen] Navigating with params:', navigationParams);
      navigation.navigate('LiveView', navigationParams);
      console.log('[AlertsScreen] Navigation to LiveView completed');
    } catch (error) {
      console.error('[AlertsScreen] Failed to fetch sender information:', error);

      // Fallback navigation with minimal information
      console.log('[AlertsScreen] Using fallback navigation');
      const fallbackParams = {
        screen: 'Dashboard' as const,
        params: {
          selectedMemberId: selectedAlert.senderId
        }
      };
      console.log('[AlertsScreen] Fallback navigation params:', fallbackParams);
      navigation.navigate('LiveView', fallbackParams);
    }
  };

  // Create theme-independent base styles
  const baseStyles = StyleSheet.create({
    unreadDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#EF4444',
      marginLeft: 10,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
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
  });

  // Create theme-dependent styles as objects (not StyleSheet)
  const themeStyles = {
    alertItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: theme === 'dark' ? '#1F2937' : '#fff',
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 14,
    },
    senderName: {
      fontSize: 16,
      color: theme === 'dark' ? '#F9FAFB' : '#1E293B',
      marginBottom: 2,
    },
    timeText: {
      fontSize: 13,
      color: theme === 'dark' ? '#9CA3AF' : '#64748B',
    },
    modalContent: {
      backgroundColor: theme === 'dark' ? '#1F2937' : '#fff',
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
    bigSender: {
      fontSize: 20,
      fontWeight: 'bold' as const,
      color: theme === 'dark' ? '#F9FAFB' : '#1E293B',
      marginBottom: 8,
      textAlign: 'center' as const,
    },
  };

  const markAlertAsRead = async (alert: UserAlert) => {
    if (!user?.uid || !alert.id || alert.isRead) return;

    try {
      const db = getFirebaseDb();
      const alertDocRef = doc(db, 'users', user.uid, 'alerts', alert.id);
      await updateDoc(alertDocRef, {
        isRead: true,
      });
      console.log('[AlertsScreen] Alert marked as read:', alert.id);

      // Update local state immediately for better UX
      setAlerts(prevAlerts =>
        (prevAlerts ?? []).map(a =>
          a.id === alert.id ? { ...a, isRead: true } : a
        )
      );
    } catch (error) {
      console.error('[AlertsScreen] Failed to mark alert as read:', error);
    }
  };

  const renderAlertItem = ({ item }: { item: UserAlert }) => {
    const getAlertIcon = () => {
      switch (item.type) {
        case 'sos':
          return { name: 'alert-circle', color: '#EF4444' };
        case 'crash':
          return { name: 'car-sport', color: '#2563EB' };
        case 'acknowledgment':
          return { name: 'checkmark-circle', color: '#22C55E' };
        default:
          return { name: 'alert-circle', color: '#EF4444' };
      }
    };

    const getAlertText = () => {
      switch (item.type) {
        case 'sos':
          return 'sent an SOS';
        case 'crash':
          return 'Crash detected';
        case 'acknowledgment':
          return `acknowledged your ${item.originalAlertType === 'sos' ? 'SOS' : 'crash'} alert`;
        default:
          return 'sent an alert';
      }
    };

    const icon = getAlertIcon();
    const showUnreadDot = item.type === 'acknowledgment' ? !item.isRead : !item.acknowledged;

    return (
      <TouchableOpacity
        style={themeStyles.alertItem}
        onPress={() => {
          setSelectedAlert(item);
          setShowModal(true);
          // Mark as read when opened
          markAlertAsRead(item);
        }}
        activeOpacity={0.8}
      >
        <View style={themeStyles.iconContainer}>
          <Ionicons name={icon.name as any} size={28} color={icon.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={themeStyles.senderName}>
            <Text style={{ fontWeight: 'bold' }}>{item.senderName}</Text> {getAlertText()}
          </Text>
          <Text style={themeStyles.timeText}>{item.timestamp?.toDate?.().toLocaleString?.() || ''}</Text>
        </View>
        {showUnreadDot && <View style={baseStyles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  // Apply theme immediately to prevent white flash
  const backgroundColor = theme === 'dark' ? '#111827' : '#F9FAFB';

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <CustomHeader title="Alerts" />
      <FlatList
        data={alerts}
        keyExtractor={item => item.id!}
        renderItem={renderAlertItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: theme === 'dark' ? '#9CA3AF' : '#6B7280', marginTop: 48 }}>No alerts yet.</Text>}
      />
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        key={`modal-${theme}`} // Force re-render when theme changes
      >
        <View style={baseStyles.modalOverlay}>
          <View style={themeStyles.modalContent}>
            {selectedAlert && (
              <>
                {selectedAlert.type === 'acknowledgment' ? (
                  // Acknowledgment alert modal
                  <>
                    <Text style={[baseStyles.bigAlertType, { color: '#22C55E' }]}>✓ Alert Acknowledged</Text>
                    <Text style={themeStyles.bigSender}>
                      <Text style={{ fontWeight: 'bold' }}>{selectedAlert.senderName}</Text> acknowledged your {selectedAlert.originalAlertType === 'sos' ? 'SOS' : 'crash'} alert.
                    </Text>
                    <Text style={themeStyles.modalTime}>{selectedAlert.timestamp?.toDate?.().toLocaleString?.() || ''}</Text>
                    {selectedAlert.message && <Text style={[baseStyles.alertMessage, { backgroundColor: '#D1FAE5', color: '#065F46' }]}>{selectedAlert.message}</Text>}
                    <View style={themeStyles.divider} />
                    <View style={baseStyles.buttonRowBottom}>
                      <TouchableOpacity style={[baseStyles.modalButton, themeStyles.dismissButton]} onPress={() => setShowModal(false)}>
                        <Ionicons name="close" size={20} color="#2563EB" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#2563EB', fontWeight: '600' }}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  // Regular SOS/Crash alert modal
                  <>
                    <Text style={baseStyles.bigAlertType}>! {selectedAlert.type === 'sos' ? 'SOS Alert' : 'Crash Alert'}</Text>
                    <Text style={themeStyles.bigSender}><Text style={{ fontWeight: 'bold' }}>{selectedAlert.senderName}</Text> sent you an {selectedAlert.type === 'sos' ? 'SOS' : 'Crash'} alert.</Text>
                    {selectedAlert.location?.address && (
                      <TouchableOpacity onPress={() => {
                        if (selectedAlert.location?.latitude && selectedAlert.location?.longitude) {
                          const url = `https://maps.google.com/?q=${selectedAlert.location.latitude},${selectedAlert.location.longitude}`;
                          Linking.openURL(url);
                        }
                      }}>
                        <Text style={baseStyles.locationText}>
                          Location: <Text style={{ fontWeight: 'bold', color: '#2563EB', textDecorationLine: 'underline' }}>{selectedAlert.location.address}</Text>
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={themeStyles.modalTime}>{selectedAlert.timestamp?.toDate?.().toLocaleString?.() || ''}</Text>
                    {selectedAlert.message && <Text style={baseStyles.alertMessage}>{selectedAlert.message}</Text>}
                    <View style={themeStyles.divider} />
                    <View style={baseStyles.buttonRowTop}>
                      <TouchableOpacity style={[baseStyles.modalButton, baseStyles.trackButton]} onPress={handleTrackNow}>
                        <Ionicons name="navigate" size={20} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Track Now</Text>
                      </TouchableOpacity>
                      {!selectedAlert.acknowledged && (
                        <TouchableOpacity style={[baseStyles.modalButton, baseStyles.ackButton]} onPress={handleAcknowledge}>
                          <Ionicons name="checkmark-done" size={20} color="#fff" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#fff', fontWeight: '600' }}>Acknowledge</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={{ height: 18, width: '100%' }} />
                    <View style={baseStyles.buttonRowBottom}>
                      <TouchableOpacity style={[baseStyles.modalButton, themeStyles.dismissButton]} onPress={() => setShowModal(false)}>
                        <Ionicons name="close" size={20} color="#2563EB" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#2563EB', fontWeight: '600' }}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

