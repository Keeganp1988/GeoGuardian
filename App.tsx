import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import type { NavigationContainerRef } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { getPrivateConnectionsForUser, getUser, getUserLocation, createUserAlert } from './src/firebase/services';
import { AppProvider, useApp } from "./src/contexts/AppContext";
import { ThemeProvider, useThemeMode } from "./src/contexts/ThemeContext";
import { InvitationProvider, useInvitation } from "./src/contexts/InvitationContext";
import SOSButton from './src/components/SOSButton';
import LowBatteryAlert from './src/components/LowBatteryAlert';
import GPSWarning from './src/components/GPSWarning';
import { initLocalDB } from './src/services/cacheService';
import { View, TouchableOpacity, StyleSheet, Text, Keyboard, ActivityIndicator, Appearance } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFirebaseDb } from './src/firebase/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

import './global.css';
import performanceMonitor from './src/utils/performanceMonitor';
import deepLinkService from './src/services/deepLinkService';
import { ErrorBoundary } from './src/components/ErrorBoundary';

// Add error handling and style safety patches
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    console.log('🚨 CONSOLE ERROR:', ...args);

    // Check for forEach null reference errors
    const errorMessage = args.join(' ');
    if (errorMessage.includes('Cannot read property \'forEach\' of null')) {
      console.log('🔍 FOREACH NULL ERROR DETECTED - Stack trace:');
      console.trace();
    }

    originalConsoleError.apply(console, args);
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    console.log('⚠️ CONSOLE WARNING:', ...args);
    originalConsoleWarn.apply(console, args);
  };

  // Patch React Native's style processing to handle null arrays
  try {
    const { StyleSheet } = require('react-native');
    if (StyleSheet && StyleSheet.flatten) {
      const originalFlatten = StyleSheet.flatten;
      StyleSheet.flatten = (style: any) => {
        try {
          // Ensure style is not null and handle arrays safely
          if (style === null || style === undefined) {
            return {};
          }

          if (Array.isArray(style)) {
            // Filter out null/undefined values from style arrays and handle nested arrays
            const safeStyle = style.filter(s => s !== null && s !== undefined).map(s => {
              if (Array.isArray(s)) {
                return s.filter(nested => nested !== null && nested !== undefined);
              }
              return s;
            });
            return originalFlatten(safeStyle.length > 0 ? safeStyle : [{}]);
          }

          return originalFlatten(style);
        } catch (error) {
          console.warn('StyleSheet.flatten error caught and handled:', error);
          return {};
        }
      };
    }
  } catch (patchError) {
    console.warn('Failed to patch StyleSheet.flatten:', patchError);
  }
}

// Background location task is now handled by ConsolidatedLocationService

// Screens - Import directly to prevent white flash during navigation
import LoginScreen from "./src/screens/LoginScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import AlertsScreen from "./src/screens/AlertsScreen";
import ConnectionsScreen from "./src/screens/ConnectionsScreen";
import CircleDetailsScreen from "./src/screens/CircleDetailsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import MemberDetailScreen from "./src/screens/MemberDetailScreen";
import AppearanceScreen from "./src/screens/AppearanceScreen";
import UserProfileScreen from "./src/screens/UserProfileScreen";
import InvitationAcceptScreen from "./src/screens/InvitationAcceptScreen";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Create a dedicated Stack for the Circles Tab
function ConnectionsStack() {
  const { theme } = useThemeMode();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' },
        cardStyleInterpolator: ({ current, layouts }) => ({
          cardStyle: {
            opacity: current?.progress ?? 1,
            backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF',
          },
        }),
      }}
    >
      <Stack.Screen name="ConnectionsList" component={ConnectionsScreen} />
      <Stack.Screen name="CircleDetails" component={CircleDetailsScreen} />
    </Stack.Navigator>
  );
}

// Create a dedicated Stack for the LiveView Tab
function LiveViewStack() {
  const { theme } = useThemeMode();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' },
        cardStyleInterpolator: ({ current, layouts }) => ({
          cardStyle: {
            opacity: current?.progress ?? 1,
            backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF',
          },
        }),
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="MemberDetail" component={MemberDetailScreen} />
    </Stack.Navigator>
  );
}

function SettingsStackScreen() {
  const { theme } = useThemeMode();
  return (
    <Stack.Navigator screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' },
      cardStyleInterpolator: ({ current, layouts }) => ({
        cardStyle: {
          opacity: current?.progress ?? 1,
          backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF',
        },
      }),
    }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
    </Stack.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation, unreadAlertsCount }: BottomTabBarProps & { unreadAlertsCount: number }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { theme } = useThemeMode();

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub?.remove();
      hideSub?.remove();
    };
  }, []);

  // Add comprehensive safety checks for all required props
  if (!state || !descriptors || !navigation) {
    console.warn('CustomTabBar: Missing required props', { state: !!state, descriptors: !!descriptors, navigation: !!navigation });
    return null;
  }

  // Ensure routes array exists and is valid
  if (!state.routes || !Array.isArray(state.routes)) {
    console.warn('CustomTabBar: Invalid routes array', { routes: state.routes });
    return null;
  }

  if (keyboardVisible) return null;

  // Safely create tab bar styles
  const tabBarStyle = [
    styles.tabBarEven,
    {
      backgroundColor: theme === 'dark' ? '#1F2937' : '#fff',
      borderTopColor: theme === 'dark' ? '#374151' : '#E5E7EB'
    }
  ].filter(Boolean); // Remove any null/undefined styles

  return (
    <View style={styles.tabBarContainer}>
      <View style={tabBarStyle}>
        {(state.routes ?? []).map((route, index) => {
          try {
            if (!route || typeof route !== 'object') {
              console.warn('CustomTabBar: Invalid route at index', index);
              return null;
            }
            return renderTabButton(route, index, state, descriptors, navigation, theme, unreadAlertsCount);
          } catch (error) {
            console.error('CustomTabBar: Error rendering tab button:', error);
            return null;
          }
        }).filter(Boolean)}
      </View>
    </View>
  );
}

function renderTabButton(
  route: { key: string; name: string },
  index: number,
  state: BottomTabBarProps['state'],
  descriptors: BottomTabBarProps['descriptors'],
  navigation: BottomTabBarProps['navigation'],
  theme: 'light' | 'dark',
  unreadAlertsCount: number
) {
  try {
    if (!route || !descriptors || !navigation || !state) {
      console.warn('renderTabButton: Missing required props');
      return null;
    }

    const { options } = descriptors[route.key] || {};
    const isFocused = state && typeof state.index === 'number' ? state.index === index : false;

    const onPress = () => {
      try {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!isFocused && !event.defaultPrevented) {
          navigation.navigate(route.name);
        }
      } catch (error) {
        console.error('renderTabButton: Error in onPress:', error);
      }
    };

    let label: string;
    if (typeof options?.tabBarLabel === 'string') {
      label = options.tabBarLabel;
    } else {
      label = route.name || 'Tab';
    }

    // SOS tab: background always red
    const isSOSTab = route.name === 'SOS';

    // Get badge from options or use unreadAlertsCount for Emergency tab
    let badge = options?.tabBarBadge;
    if (route.name === 'Emergency' && unreadAlertsCount > 0) {
      badge = unreadAlertsCount > 99 ? '99+' : unreadAlertsCount;
    }
    const badgeStyle = options?.tabBarBadgeStyle;

    // Safely create icon button style
    const iconButtonStyle = {
      backgroundColor: isSOSTab ? '#EF4444' : (isFocused ? '#2563EB' : (theme === 'dark' ? '#374151' : '#FFFFFF')),
      borderRadius: isSOSTab ? 26 : 20,
      width: isSOSTab ? 52 : 40,
      height: isSOSTab ? 52 : 40,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: isSOSTab ? 0 : 2,
      alignSelf: 'center' as const,
    };

    // Safely create badge style
    const safeBadgeStyle = [
      {
        position: 'absolute' as const,
        top: -4,
        right: -8,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingHorizontal: 4,
        zIndex: 1,
      },
      badgeStyle
    ].filter(Boolean);

    // Safely create text style
    const textStyle = [
      styles.tabLabel,
      route.name === 'SOS'
        ? { color: theme === 'dark' ? '#F9FAFB' : '#111827', fontSize: 18, fontWeight: 'bold' as const, marginTop: 0 }
        : { color: isFocused ? '#2563EB' : (theme === 'dark' ? '#9CA3AF' : '#6B7280'), marginTop: 0 }
    ].filter(Boolean);

    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={options?.tabBarAccessibilityLabel}
        testID={options?.tabBarTestID}
        onPress={onPress}
        style={styles.tabButton}
      >
        <View style={{ position: 'relative' }}>
          <View style={iconButtonStyle}>
            {options?.tabBarIcon && options.tabBarIcon({
              focused: isFocused,
              color: isFocused ? '#FFFFFF' : (theme === 'dark' ? '#9CA3AF' : '#2563EB'),
              size: 24
            })}
          </View>

          {/* Render badge if it exists */}
          {badge !== undefined && badge !== null && (
            <View style={safeBadgeStyle}>
              <Text style={{
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: 20,
              }}>
                {badge}
              </Text>
            </View>
          )}
        </View>

        <Text style={textStyle}> {label} </Text>
      </TouchableOpacity>
    );
  } catch (error) {
    console.error('renderTabButton: Error rendering tab button:', error);
    return null;
  }
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 100,
    elevation: 100,
  },
  tabBarEven: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 44,
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});

function TabNavigator() {
  const { theme } = useThemeMode();
  const { state } = useApp();
  const user = state.user;
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);

  // Subscribe to unread alerts count
  useEffect(() => {
    if (!user?.uid) {
      setUnreadAlertsCount(0);
      return;
    }

    const db = getFirebaseDb();
    const alertsRef = collection(db, 'users', user.uid, 'alerts');

    // Query for unread alerts (acknowledgments that haven't been read, or regular alerts that haven't been acknowledged)
    const unsubscribe = onSnapshot(alertsRef, (snapshot) => {
      let unreadCount = 0;

      try {
        // Check if snapshot exists and has docs array before iterating
        if (snapshot && snapshot.docs && Array.isArray(snapshot.docs) && snapshot.docs.length > 0) {
          // Use safe forEach to prevent null reference errors
          (snapshot.docs ?? []).forEach(doc => {
            try {
              if (doc && typeof doc.data === 'function') {
                const alert = doc.data();
                if (alert && typeof alert === 'object') {
                  if (alert.type === 'acknowledgment') {
                    // For acknowledgment alerts, check if they've been read
                    if (!alert.isRead) {
                      unreadCount++;
                    }
                  } else {
                    // For regular alerts (SOS/crash), check if they've been acknowledged
                    if (!alert.acknowledged) {
                      unreadCount++;
                    }
                  }
                }
              }
            } catch (docError) {
              console.warn('[TabNavigator] Error processing alert document:', docError);
            }
          });
        }
      } catch (snapshotError) {
        console.error('[TabNavigator] Error processing snapshot:', snapshotError);
      }

      setUnreadAlertsCount(unreadCount);
      console.log('[TabNavigator] Unread alerts count updated:', unreadCount);
    }, (error) => {
      console.error('[TabNavigator] Error listening to alerts:', error);
      setUnreadAlertsCount(0);
    });

    return unsubscribe;
  }, [user?.uid]);

  // Handler for SOS activation
  const handleSOSActivate = async () => {
    if (!user?.uid) return;
    // Get all private connections
    const connections = await getPrivateConnectionsForUser(user.uid);
    // Get user info and location
    const userInfo = await getUser(user.uid);
    const userLocation = await getUserLocation(user.uid);
    // For each connection, if the contact is marked as SOS Alert Contact, send alert
    for (const conn of connections) {
      let recipientId = null;
      let isSOSContact = false;
      if (conn.userA === user.uid && conn.isSOSContactB) {
        recipientId = conn.userB;
        isSOSContact = true;
      } else if (conn.userB === user.uid && conn.isSOSContactA) {
        recipientId = conn.userA;
        isSOSContact = true;
      }
      if (recipientId && isSOSContact) {
        await createUserAlert({
          type: 'sos',
          senderId: user.uid,
          senderName: userInfo?.name || 'Unknown',
          senderAvatar: userInfo?.profileImage || '',
          recipientId,
          location: {
            latitude: userLocation?.latitude || 0,
            longitude: userLocation?.longitude || 0,
            address: userLocation?.address || '',
          },
          message: `${userInfo?.name || 'A user'} has sent an SOS!`,
        });
      }
    }
  };

  const getTabBarIcon = (routeName: string, focused: boolean, color: string, size: number) => {
    const iconMap: Record<string, [string, string]> = {
      LiveView: ["location", "location-outline"],
      Connections: ["people", "people-outline"],
      SOS: ["warning", "warning-outline"],
      Emergency: ["notifications", "notifications-outline"],
      Settings: ["settings", "settings-outline"],
    };

    const [focusedIcon, unfocusedIcon] = iconMap[routeName] || ["location-outline", "location-outline"];
    const iconName = focused ? focusedIcon : unfocusedIcon;
    const iconColor = routeName === "SOS" ? "#FFFFFF" : color;

    return <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={size} color={iconColor} />;
  };

  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} unreadAlertsCount={unreadAlertsCount} />}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => getTabBarIcon(route.name, focused, color, size),
        header: () => null,
        sceneContainerStyle: { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' },
        lazy: false, // Prevent lazy loading to reduce white flash
      })}
    >
      <Tab.Screen
        name="LiveView"
        component={LiveViewStack}
        options={{
          tabBarLabel: "Live View",
          unmountOnBlur: false,
        }}
      />
      <Tab.Screen
        name="Connections"
        component={ConnectionsStack}
        options={{
          tabBarLabel: "Connections",
          unmountOnBlur: false,
        }}
      />
      <Tab.Screen
        name="SOS"
        children={() => {
          const { theme } = useThemeMode();
          return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' }}>
              <SOSButton large autoActivate onActivate={handleSOSActivate} />
            </View>
          );
        }}
        options={{
          tabBarLabel: "SOS",
        }}
      />
      <Tab.Screen
        name="Emergency"
        component={AlertsScreen}
        options={{
          tabBarLabel: "Alerts",
          unmountOnBlur: false,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackScreen}
        options={{
          tabBarLabel: "Settings",
          unmountOnBlur: false,
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { state, authLoadingState } = useApp();
  const user = state.user;
  const { theme } = useThemeMode();

  // Debug logging to track user state changes
  React.useEffect(() => {
    console.log('🔄 AppNavigator: User state changed:', user ? 'authenticated' : 'not authenticated');
    console.log('🔄 AppNavigator: Auth loading state:', authLoadingState);
  }, [user, authLoadingState]);
  const { pendingInvitation } = useInvitation();
  const navigationRef = React.useRef<NavigationContainerRef<any>>(null);

  // Initialize deep linking when navigation is ready
  React.useEffect(() => {
    if (navigationRef.current) {
      deepLinkService.initialize(navigationRef.current);
    }
  }, []);

  // Handle pending invitations after authentication
  React.useEffect(() => {
    if (user && pendingInvitation && navigationRef.current?.isReady()) {
      // Navigate to invitation screen after login
      setTimeout(() => {
        navigationRef.current?.navigate('InvitationAccept', {
          linkCode: pendingInvitation.linkCode
        });
      }, 500); // Small delay to ensure navigation is ready
    }
  }, [user, pendingInvitation]);

  // Create custom navigation themes to prevent white flash - memoized for performance
  const customLightTheme = React.useMemo(() => ({
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: '#FFFFFF',
      card: '#FFFFFF',
      primary: '#2563EB',
    },
  }), []);

  const customDarkTheme = React.useMemo(() => ({
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: '#111827',
      card: '#1F2937',
      primary: '#2563EB',
    },
  }), []);

  // Show loading screen during auth transitions
  if (authLoadingState === 'initializing') {
    const loadingMessage = authLoadingState === 'initializing'
      ? 'Checking saved login...'
      : 'Loading...';

    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF'
      }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 24,
            backgroundColor: theme === 'dark' ? '#1F2937' : '#F3F4F6'
          }}>
            <Ionicons name="location" size={48} color="#2563EB" />
          </View>
          <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 16 }} />
          <Text style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            marginBottom: 8
          }}>
            GeoGuardian
          </Text>
          <Text style={{
            fontSize: 14,
            color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
            textAlign: 'center'
          }}>
            {loadingMessage}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={theme === 'dark' ? customDarkTheme : customLightTheme}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF' },
          cardStyleInterpolator: ({ current, layouts }) => ({
            cardStyle: {
              opacity: current?.progress ?? 1,
              backgroundColor: theme === 'dark' ? '#111827' : '#FFFFFF',
            },
          }),
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} />
            <Stack.Screen
              name="InvitationAccept"
              component={InvitationAcceptScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{
                presentation: 'card',
                animationTypeForReplace: 'push',
                cardStyleInterpolator: ({ current, layouts }) => ({
                  cardStyle: {
                    opacity: current?.progress ?? 1,
                  },
                }),
              }}
            />
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{
                presentation: 'card',
                animationTypeForReplace: 'push',
                cardStyleInterpolator: ({ current, layouts }) => ({
                  cardStyle: {
                    opacity: current?.progress ?? 1,
                  },
                }),
              }}
            />
            <Stack.Screen
              name="InvitationAccept"
              component={InvitationAcceptScreen}
              options={{ presentation: 'modal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function App() {
  useEffect(() => {
    performanceMonitor.startTimer('App Initialization');

    // Defer database initialization to improve startup time
    setTimeout(() => {
      performanceMonitor.startTimer('Database Initialization');
      initLocalDB().finally(() => {
        performanceMonitor.endTimer('Database Initialization');
      });
    }, 1000);

    // Log startup completion after a delay
    setTimeout(() => {
      performanceMonitor.endTimer('App Initialization');
      performanceMonitor.logStartupComplete();
    }, 2000);
  }, []);

  // Get system theme immediately to prevent white flash
  const systemColorScheme = Appearance.getColorScheme();
  const initialBackgroundColor = systemColorScheme === 'dark' ? '#111827' : '#FFFFFF';

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: initialBackgroundColor }}>
      <AppProvider>
        <ThemeProvider>
          <InvitationProvider>
            <AppContent />
          </InvitationProvider>
        </ThemeProvider>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { theme, isThemeReady } = useThemeMode();

  // Apply theme immediately to prevent white flash
  const backgroundColor = theme === 'dark' ? '#111827' : '#FFFFFF';

  // Show minimal loading screen only if theme is not ready
  if (!isThemeReady) {
    return (
      <View style={{
        flex: 1,
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 24,
            backgroundColor: theme === 'dark' ? '#1F2937' : '#F3F4F6'
          }}>
            <Ionicons name="location" size={48} color="#2563EB" />
          </View>
          <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 16 }} />
          <Text style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme === 'dark' ? '#F9FAFB' : '#111827',
            marginBottom: 8
          }}>
            GeoGuardian
          </Text>
          <Text style={{
            fontSize: 14,
            color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
            textAlign: 'center'
          }}>
            Loading theme...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ErrorBoundary context="AppContent" fallback={
      <View style={{ flex: 1, backgroundColor, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme === 'dark' ? '#F9FAFB' : '#111827', fontSize: 18, marginBottom: 16 }}>
          Something went wrong
        </Text>
        <Text style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280', textAlign: 'center', paddingHorizontal: 32 }}>
          Please restart the app. If the problem persists, contact support.
        </Text>
      </View>
    }>
      <View style={{ flex: 1, backgroundColor }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <ErrorBoundary context="GPSWarning">
          <GPSWarning />
        </ErrorBoundary>
        <ErrorBoundary context="AppNavigator">
          <AppNavigator />
        </ErrorBoundary>
        <ErrorBoundary context="LowBatteryAlert">
          <LowBatteryAlert />
        </ErrorBoundary>
      </View>
    </ErrorBoundary>
  );
}

export default App;


