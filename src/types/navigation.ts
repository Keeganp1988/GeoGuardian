import { CircleMember, LocationData, User, Circle } from '../firebase/services';

// Enhanced navigation parameter types for SOS alert functionality

// Serialized version of Circle for navigation (dates as strings)
export interface SerializedCircle {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

// Serialized version of LocationData for navigation (dates as strings)
export interface SerializedLocationData {
  userId: string;
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: string; // Serialized as ISO string
  arrivalTimestamp?: string; // Serialized as ISO string
  heartbeatTimestamp?: string; // Serialized as ISO string
  accuracy?: number;
  speed?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  circleMembers: string[];
}

// Dashboard Navigation Parameters
export interface DashboardNavigationParams {
  selectedMemberId?: string;
  memberLocation?: LocationData | SerializedLocationData | null;
  memberInfo?: User | null;
}

// Member Detail Navigation Parameters
export interface MemberDetailNavigationParams {
  member?: CircleMember;
  memberLocation?: LocationData | null;
  memberInfo?: User | null;
  userId?: string; // For direct navigation from alerts
}

// Root Stack Navigator Parameters (Main app navigation)
export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { code: string };
  Tabs: undefined;
  MemberDetail: MemberDetailNavigationParams;
  InvitationAccept: { linkCode: string };
};

// LiveView Stack Parameters (nested within LiveView tab)
export type LiveViewStackParamList = {
  Dashboard: DashboardNavigationParams;
  MemberDetail: MemberDetailNavigationParams;
};

// Tab Navigator Parameters (Bottom tabs)
export type TabParamList = {
  LiveView: { screen: keyof LiveViewStackParamList; params?: DashboardNavigationParams } | undefined;
  Connections: undefined;
  SOS: undefined;
  Emergency: undefined; // Alerts tab
  Settings: undefined;
};

// Connections Stack Parameters
export type ConnectionsStackParamList = {
  ConnectionsList: undefined;
  CircleDetails: { circle: SerializedCircle; isNew?: boolean };
};

// Settings Stack Parameters
export type SettingsStackParamList = {
  SettingsMain: undefined;
  Appearance: undefined;
  UserProfile: undefined;
};

// Navigation prop types for common usage patterns
export type RootStackNavigationProp = import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParamList>;
export type TabNavigationProp = import('@react-navigation/bottom-tabs').BottomTabNavigationProp<TabParamList>;
export type ConnectionsStackNavigationProp = import('@react-navigation/stack').StackNavigationProp<ConnectionsStackParamList>;
export type SettingsStackNavigationProp = import('@react-navigation/stack').StackNavigationProp<SettingsStackParamList>;