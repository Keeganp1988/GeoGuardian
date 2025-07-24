// Shared navigation utilities to reduce code duplication

import { useNavigation } from '@react-navigation/native';
import { 
  TabNavigationProp, 
  RootStackNavigationProp,
  ConnectionsStackNavigationProp,
  SettingsStackNavigationProp 
} from '../types/navigation';

// Typed navigation hooks for different navigators
export const useTabNavigation = () => {
  return useNavigation<TabNavigationProp>();
};

export const useRootStackNavigation = () => {
  return useNavigation<RootStackNavigationProp>();
};

export const useConnectionsNavigation = () => {
  return useNavigation<ConnectionsStackNavigationProp>();
};

export const useSettingsNavigation = () => {
  return useNavigation<SettingsStackNavigationProp>();
};

// Import types for better typing
import { CircleMember, Circle } from '../firebase/services';

// Navigation parameter types
interface MemberDetailParams {
  member: CircleMember;
  circle?: Circle;
  timestamp: number;
}

interface CircleDetailParams {
  circle: Circle;
  timestamp: number;
}

// Common navigation patterns
export const navigationPatterns = {
  // Navigate to member detail with proper params
  navigateToMemberDetail: (
    navigation: any, // Navigation type varies per screen implementation
    member: CircleMember,
    circle?: Circle
  ) => {
    const params: MemberDetailParams = {
      member,
      circle,
      timestamp: Date.now(),
    };
    navigation.navigate('MemberDetail', params);
  },

  // Navigate to circle details
  navigateToCircleDetails: (
    navigation: any, // Navigation type varies per screen implementation
    circle: Circle
  ) => {
    const params: CircleDetailParams = {
      circle,
      timestamp: Date.now(),
    };
    navigation.navigate('CircleDetails', params);
  },

  // Navigate back with optional params
  navigateBack: (
    navigation: any, // Navigation type varies per screen implementation
    params?: Record<string, any>
  ) => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Dashboard', params);
    }
  },

  // Reset navigation stack
  resetToScreen: (
    navigation: any, // Navigation type varies per screen implementation
    screenName: string,
    params?: Record<string, any>
  ) => {
    navigation.reset({
      index: 0,
      routes: [{ name: screenName, params }],
    });
  },
};

// Common navigation options
export const commonScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
  cardStyleInterpolator: ({ current, layouts }: any) => {
    return {
      cardStyle: {
        transform: [
          {
            translateX: current?.progress?.interpolate({
              inputRange: [0, 1],
              outputRange: [layouts?.screen?.width || 0, 0],
            }) || 0,
          },
        ],
      },
    };
  },
};

// Screen transition animations
export const screenTransitions = {
  slideFromRight: {
    cardStyleInterpolator: ({ current, layouts }: any) => {
      return {
        cardStyle: {
          transform: [
            {
              translateX: current?.progress?.interpolate({
                inputRange: [0, 1],
                outputRange: [layouts?.screen?.width || 0, 0],
              }) || 0,
            },
          ],
        },
      };
    },
  },
  
  fadeIn: {
    cardStyleInterpolator: ({ current }: any) => {
      return {
        cardStyle: {
          opacity: current?.progress ?? 1,
        },
      };
    },
  },
  
  slideFromBottom: {
    cardStyleInterpolator: ({ current, layouts }: any) => {
      return {
        cardStyle: {
          transform: [
            {
              translateY: current?.progress?.interpolate({
                inputRange: [0, 1],
                outputRange: [layouts?.screen?.height || 0, 0],
              }) || 0,
            },
          ],
        },
      };
    },
  },
};