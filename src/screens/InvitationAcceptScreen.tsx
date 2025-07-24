import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../contexts/ThemeContext';
import { useApp } from '../contexts/AppContext';
import { useInvitation, InviteWithUserInfo } from '../contexts/InvitationContext';
import { getInviteWithUserInfo, useInviteLink } from '../firebase/services';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { RootStackParamList, RootStackNavigationProp } from '../types/navigation';

type InvitationAcceptRouteProp = RouteProp<RootStackParamList, 'InvitationAccept'>;

export default function InvitationAcceptScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
  const route = useRoute<InvitationAcceptRouteProp>();
  const { theme } = useThemeMode();
  const { user } = useApp();
  const { setPendingInvitation, clearInvitation, setProcessingInvitation } = useInvitation();
  
  const [inviteInfo, setInviteInfo] = useState<InviteWithUserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { linkCode } = route.params;

  useEffect(() => {
    loadInviteInfo();
  }, [linkCode]);

  const loadInviteInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const invite = await getInviteWithUserInfo(linkCode);
      setInviteInfo(invite);
      setPendingInvitation(invite);
    } catch (err: any) {
      console.error('[InvitationAcceptScreen] Error loading invite info:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const getErrorMessage = (error: any): string => {
    if (error.message?.includes('Invalid or expired')) {
      return 'This invitation has expired or is no longer valid.';
    }
    if (error.message?.includes('Already a member')) {
      return 'You are already a member of this circle.';
    }
    if (error.message?.includes('Already in this 1on1')) {
      return 'You are already connected with this person.';
    }
    return 'Unable to load invitation details. Please try again.';
  };

  const handleAcceptInvitation = async () => {
    if (!user?.uid || !inviteInfo) return;

    try {
      setAccepting(true);
      setProcessingInvitation(true);
      
      const result = await useInviteLink(linkCode, user.uid);
      
      // Show success message
      Alert.alert(
        'Invitation Accepted!',
        inviteInfo.type === 'group' 
          ? 'You have successfully joined the circle.' 
          : 'You are now connected with this person.',
        [
          {
            text: 'OK',
            onPress: () => {
              clearInvitation();
              // Navigate to appropriate screen based on invitation type
              if (result.type === 'group') {
                navigation.navigate('Tabs');
              } else {
                navigation.navigate('Tabs');
              }
            },
          },
        ]
      );
    } catch (err: any) {
      console.error('[InvitationAcceptScreen] Error accepting invitation:', err);
      Alert.alert(
        'Error',
        getErrorMessage(err),
        [{ text: 'OK' }]
      );
    } finally {
      setAccepting(false);
      setProcessingInvitation(false);
    }
  };

  const handleDeclineInvitation = () => {
    Alert.alert(
      'Decline Invitation',
      'Are you sure you want to decline this invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            clearInvitation();
            navigation.goBack();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={[styles.loadingText, { color: theme === 'dark' ? '#F9FAFB' : '#111827' }]}>
            Loading invitation...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' }]}>
        <View style={styles.errorContainer}>
          <Ionicons 
            name="warning-outline" 
            size={64} 
            color={theme === 'dark' ? '#EF4444' : '#DC2626'} 
          />
          <Text style={[styles.errorTitle, { color: theme === 'dark' ? '#F9FAFB' : '#111827' }]}>
            Invitation Error
          </Text>
          <Text style={[styles.errorMessage, { color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: '#2563EB' }]}
            onPress={loadInviteInfo}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.backButton, { borderColor: theme === 'dark' ? '#374151' : '#D1D5DB' }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backButtonText, { color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!inviteInfo) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons 
              name="close" 
              size={24} 
              color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} 
            />
          </TouchableOpacity>
        </View>

        {/* Invitation Card */}
        <View style={[styles.invitationCard, { 
          backgroundColor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
          borderColor: theme === 'dark' ? '#374151' : '#E5E7EB'
        }]}>
          {/* Inviter Avatar */}
          <View style={styles.avatarContainer}>
            {inviteInfo.inviterAvatar ? (
              <Image source={{ uri: inviteInfo.inviterAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: '#2563EB' }]}>
                <Text style={styles.avatarText}>
                  {inviteInfo.inviterName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Invitation Details */}
          <Text style={[styles.invitationTitle, { color: theme === 'dark' ? '#F9FAFB' : '#111827' }]}>
            You're Invited!
          </Text>
          
          <Text style={[styles.inviterName, { color: theme === 'dark' ? '#F9FAFB' : '#111827' }]}>
            {inviteInfo.inviterName}
          </Text>
          
          <Text style={[styles.invitationMessage, { color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }]}>
            {inviteInfo.type === 'group' 
              ? 'has invited you to join their circle'
              : 'wants to connect with you'
            }
          </Text>

          {/* Invitation Type Badge */}
          <View style={[styles.typeBadge, { 
            backgroundColor: inviteInfo.type === 'group' ? '#10B981' : '#3B82F6' 
          }]}>
            <Ionicons 
              name={inviteInfo.type === 'group' ? 'people' : 'person-add'} 
              size={16} 
              color="#FFFFFF" 
            />
            <Text style={styles.typeBadgeText}>
              {inviteInfo.type === 'group' ? 'Group Circle' : '1-on-1 Connection'}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: '#10B981' }]}
            onPress={handleAcceptInvitation}
            disabled={accepting}
          >
            {accepting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                <Text style={styles.acceptButtonText}>Accept Invitation</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.declineButton, { 
              borderColor: theme === 'dark' ? '#374151' : '#D1D5DB' 
            }]}
            onPress={handleDeclineInvitation}
            disabled={accepting}
          >
            <Ionicons 
              name="close" 
              size={20} 
              color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} 
            />
            <Text style={[styles.declineButtonText, { 
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280' 
            }]}>
              Decline
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  invitationCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarContainer: {
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  invitationTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  inviterName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  invitationMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  actionButtons: {
    marginTop: 40,
    gap: 12,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  declineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  declineButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});