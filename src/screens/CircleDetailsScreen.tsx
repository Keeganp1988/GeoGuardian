import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Alert, Share, ActionSheetIOS, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import CustomHeader from '../components/CustomHeader';
import { ConnectionsStackNavigationProp, ConnectionsStackParamList } from '../types/navigation';
import { CircleMember as FirebaseCircleMember, getVisibleMembers, createInviteLink, User, leaveCircle, deleteCircle } from '../firebase/services';
import { useApp } from '../contexts/AppContext';
import { useThemeMode } from '../contexts/ThemeContext';

// Define the type for the route's params
type CircleDetailsScreenRouteProp = RouteProp<ConnectionsStackParamList, 'CircleDetails'>;

export default function CircleDetailsScreen() {
    const navigation = useNavigation<ConnectionsStackNavigationProp>();
    const route = useRoute<CircleDetailsScreenRouteProp>();
    const { state: { user } } = useApp();
    const [members, setMembers] = useState<FirebaseCircleMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionMember, setActionMember] = useState<FirebaseCircleMember | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [showGroupManagementModal, setShowGroupManagementModal] = useState(false);
    const { theme } = useThemeMode();

    // This is now type-safe
    const { circle } = route.params;

    // Convert createdAt/updatedAt to Date if they are strings
    const createdAt = typeof circle.createdAt === 'string' ? new Date(circle.createdAt) : circle.createdAt;
    const updatedAt = typeof circle.updatedAt === 'string' ? new Date(circle.updatedAt) : circle.updatedAt;

    const isOwner = user?.uid === circle.ownerId;

    useEffect(() => {
        if (user) {
            loadCircleMembers();
        }
    }, [circle.id, user]);

    const loadCircleMembers = async () => {
        if (!user) return;

        try {
            setLoading(true);
            const circleMembers = await getVisibleMembers(circle.id, user.uid);
            setMembers(circleMembers);
        } catch (error) {
            console.error('Error loading circle members:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async () => {
        if (!user) return;

        try {
            // Create a new invite link
            const inviteLink = await createInviteLink({ circleId: circle.id, createdBy: user.uid, type: 'group' });

            // Create the shareable URL
            const shareUrl = `https://geoguardian.app/invite/${inviteLink.linkCode}`;
            const shareMessage = `Join my safety circle "${circle.name}" on GeoGuardian! Click this link to join: ${shareUrl}`;

            // Use React Native's Share API
            Share.share({
                message: shareMessage,
                url: shareUrl,
            });
        } catch (error) {
            console.error('Error creating invite link:', error);
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create invite link. Please try again.');
        }
    };

    const handleMemberAction = (member: FirebaseCircleMember) => {
        if (Platform.OS === 'ios') {
            const options: string[] = [];
            const destructiveIndex = isOwner && member.userId !== user?.uid ? 0 : 1;
            if (isOwner && member.userId !== user?.uid) {
                options.push('Remove from Circle');
            }
            if (member.userId === user?.uid) {
                options.push('Leave Circle');
            }
            options.push('Cancel');
            ActionSheetIOS.showActionSheetWithOptions({
                options,
                destructiveButtonIndex: destructiveIndex,
                cancelButtonIndex: options.length - 1,
            }, async (buttonIndex) => {
                if (options[buttonIndex] === 'Remove from Circle') {
                    await handleRemoveMember(member);
                } else if (options[buttonIndex] === 'Leave Circle') {
                    await handleRemoveMember(member);
                }
            });
        } else {
            setActionMember(member);
            setShowActionModal(true);
        }
    };

    const handleRemoveMember = async (member: FirebaseCircleMember) => {
        try {
            await leaveCircle(circle.id, member.userId);
            setShowActionModal(false);
            setActionMember(null);
            loadCircleMembers();
        } catch (error) {
            Alert.alert('Error', 'Failed to remove member.');
        }
    };

    const handleGroupManagement = () => {
        if (Platform.OS === 'ios') {
            const options: string[] = [];
            if (isOwner) {
                options.push('Delete Circle');
            }
            options.push('Leave Circle');
            options.push('Cancel');

            ActionSheetIOS.showActionSheetWithOptions({
                options,
                destructiveButtonIndex: isOwner ? 0 : 0,
                cancelButtonIndex: options.length - 1,
            }, async (buttonIndex) => {
                if (options[buttonIndex] === 'Delete Circle') {
                    await handleDeleteCircle();
                } else if (options[buttonIndex] === 'Leave Circle') {
                    await handleLeaveCircle();
                }
            });
        } else {
            setShowGroupManagementModal(true);
        }
    };

    const handleDeleteCircle = async () => {
        Alert.alert(
            'Delete Circle',
            `Are you sure you want to delete "${circle.name}"? This action cannot be undone and will remove all members from the circle.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCircle(circle.id);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete circle. Please try again.');
                        }
                    }
                }
            ]
        );
    };

    const handleLeaveCircle = async () => {
        if (!user) return;

        Alert.alert(
            'Leave Circle',
            `Are you sure you want to leave "${circle.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await leaveCircle(circle.id, user.uid);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to leave circle. Please try again.');
                        }
                    }
                }
            ]
        );
    };

    const renderMemberItem = ({ item }: { item: FirebaseCircleMember }) => (
        <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <View style={[styles.memberItem]} className="bg-white rounded-xl shadow-sm p-3">
                <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitials}>{item.user?.name?.substring(0, 1) || '?'}</Text>
                    <View style={[styles.onlineIndicator, { backgroundColor: item.user?.isOnline ? '#10B981' : '#6B7280' }]} />
                </View>
                <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{item.user?.name || 'Unknown'}</Text>
                    <Text style={styles.memberRole}>{item.role}</Text>
                </View>
                <TouchableOpacity style={styles.memberActions} onPress={() => handleMemberAction(item)}>
                    <Ionicons name="ellipsis-vertical" size={20} color="#64748B" />
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderMemberSeparator = () => <View style={{ height: 12 }} />;

    return (
        <View style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
            <CustomHeader
                leftComponent={
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                }
                centerComponent={
                    <Text style={[styles.headerTitle, { color: '#FFFFFF' }]}>{circle.name}</Text>
                }
            />
            <ScrollView style={styles.scrollView}>
                <View style={styles.content}>
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: '#1E293B' }]}>
                                Members ({loading ? '...' : members.length})
                            </Text>
                            <View style={styles.sectionActions}>
                                <TouchableOpacity style={[styles.inviteButton, { backgroundColor: '#2563EB' }]} onPress={handleInvite}>
                                    <Ionicons name="person-add" size={16} color="#FFFFFF" />
                                    <Text style={[styles.inviteButtonText, { color: '#FFFFFF' }]}>Invite</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.gearButton, { backgroundColor: '#6B7280' }]} onPress={handleGroupManagement}>
                                    <Ionicons name="settings-outline" size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <Text style={[styles.loadingText, { color: '#64748B' }]}>Loading members...</Text>
                            </View>
                        ) : members.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                                <Text style={[styles.emptyText, { color: '#64748B' }]}>No members yet</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={members}
                                renderItem={renderMemberItem}
                                keyExtractor={(item) => item.id}
                                scrollEnabled={false}
                                contentContainerStyle={[styles.membersList, { backgroundColor: '#F1F5F9' }]}
                                ItemSeparatorComponent={renderMemberSeparator}
                            />
                        )}
                    </View>
                </View>
            </ScrollView>
            {/* Android Action Modal */}
            {Platform.OS !== 'ios' && (
                <Modal
                    visible={showActionModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowActionModal(false)}
                >
                    <View style={{ flex: 1, backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ backgroundColor: theme === 'dark' ? '#18181B' : '#FFFFFF', borderRadius: 18, padding: 24, minWidth: 270, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
                            {isOwner && actionMember && actionMember.userId !== user?.uid && (
                                <TouchableOpacity onPress={() => handleRemoveMember(actionMember)} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 12, marginBottom: 12, shadowColor: '#EF4444', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                    <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 17 }}>Remove from Circle</Text>
                                </TouchableOpacity>
                            )}
                            {actionMember && actionMember.userId === user?.uid && (
                                <TouchableOpacity onPress={() => handleRemoveMember(actionMember)} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 12, marginBottom: 12, shadowColor: '#EF4444', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                    <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 17 }}>Leave Circle</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => setShowActionModal(false)} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 12, shadowColor: '#8B5CF6', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                <Ionicons name="close" size={20} color="#8B5CF6" />
                                <Text style={{ color: '#8B5CF6', fontSize: 17 }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Android Group Management Modal */}
            {Platform.OS !== 'ios' && (
                <Modal
                    visible={showGroupManagementModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowGroupManagementModal(false)}
                >
                    <View style={{ flex: 1, backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ backgroundColor: theme === 'dark' ? '#18181B' : '#FFFFFF', borderRadius: 18, padding: 24, minWidth: 270, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
                            {isOwner && (
                                <TouchableOpacity onPress={handleDeleteCircle} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 12, marginBottom: 12, shadowColor: '#EF4444', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                    <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 17 }}>Delete Circle</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={handleLeaveCircle} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 12, marginBottom: 12, shadowColor: '#EF4444', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                <Ionicons name="exit-outline" size={20} color="#EF4444" />
                                <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 17 }}>Leave Circle</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setShowGroupManagementModal(false)} style={{ paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F3F4F6', borderRadius: 12, shadowColor: '#8B5CF6', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                <Ionicons name="close" size={20} color="#8B5CF6" />
                                <Text style={{ color: '#8B5CF6', fontSize: 17 }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
    inviteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8,
    },
    inviteButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    membersList: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        overflow: 'hidden',
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    memberAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    memberInitials: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    onlineIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        position: 'absolute',
        bottom: 0,
        right: 0,
    },
    memberInfo: {
        flex: 1,
    },
    memberName: {
        fontSize: 16,
        fontWeight: '600',
    },
    memberRole: {
        fontSize: 14,
        color: '#64748B',
        textTransform: 'capitalize',
    },
    memberActions: {
        padding: 8,
    },
    backButton: {
        padding: 4,
    },
    gearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 16,
    },
}); 