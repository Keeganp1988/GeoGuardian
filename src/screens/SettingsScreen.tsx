import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeMode } from '../contexts/ThemeContext';
import { SettingsStackNavigationProp } from '../types/navigation';

const settingsOptions = [
  {
    icon: "person-circle" as const,
    title: "User Profile",
    description: "View and edit your profile information",
    color: '#6366F1',
  },
  {
    icon: "notifications" as const,
    title: "Notifications",
    description: "Configure alert preferences and notification settings",
    color: "#F59E0B",
  },
  {
    icon: "shield-checkmark" as const,
    title: "Safety Features",
    description: "Manage crash detection, SOS button, and emergency settings",
    color: "#10B981",
  },
  {
    icon: "location" as const,
    title: "Location Sharing",
    description: "Control location sharing frequency and privacy settings",
    color: "#3B82F6",
  },
  {
    icon: "battery-half" as const,
    title: "Battery Optimization",
    description: "Optimize battery usage and background activity",
    color: '#8B5CF6',
  },
  {
    icon: "call" as const,
    title: "Emergency Contacts",
    description: "Manage your emergency contact list and preferences",
    color: "#EF4444",
  },
  {
    icon: "color-palette-outline" as const,
    title: "Appearance",
    description: "Light, dark, or system theme",
    color: "#3B82F6",
  },
];

const SettingsScreen = React.memo(() => {
  const navigation = useNavigation<SettingsStackNavigationProp>();
  const { theme, isThemeReady } = useThemeMode();

  // Apply theme immediately to prevent white flash
  const backgroundColor = theme === 'dark' ? '#111827' : '#FFFFFF';

  return (
    <View style={{ flex: 1, backgroundColor }}>
      <ScrollView>
        <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 16, backgroundColor: theme === 'dark' ? '#1F2937' : '#F9FAFB' }}>
            <Ionicons name="settings" size={48} color={theme === 'dark' ? '#F9FAFB' : '#111827'} />
          </View>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>Settings</Text>
          <Text style={{ fontSize: 16, textAlign: 'center', color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>
            Configure your GeoGuardian preferences
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {settingsOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 16, backgroundColor: theme === 'dark' ? '#1F2937' : '#F9FAFB', gap: 16 }}
              onPress={() => {
                if (option.title === 'Appearance') {
                  navigation.navigate('Appearance');
                } else if (option.title === 'User Profile') {
                  navigation.navigate('UserProfile');
                }
              }}
            >
              <View
                style={{ backgroundColor: `${option.color}20`, width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }}
              >
                <Ionicons name={option.icon} size={24} color={option.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#F9FAFB' : '#111827' }}>{option.title}</Text>
                <Text style={{ fontSize: 14, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>
                  {option.description}
                </Text>
              </View>
              <View>
                <Ionicons name="chevron-forward" size={20} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '500', color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>GeoGuardian v1.0.0</Text>
          <Text style={{ fontSize: 12, color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>
            © 2024 GeoGuardian. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
});

export default SettingsScreen;
