import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeMode, ThemeMode } from '../contexts/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { SettingsStackNavigationProp } from '../types/navigation';

const AppearanceOption = ({
  title,
  icon,
  isActive,
  onPress,
  isDarkMode,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  onPress: () => void;
  isDarkMode: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden',
    }}
  >
    {isActive ? (
      <LinearGradient
        colors={['#60A5FA', '#2563EB', '#1E3A8A']}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 8,
        }}
      />
    ) : (
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: isDarkMode ? '#1F2937' : '#F9FAFB',
          borderRadius: 8,
        }}
      />
    )}
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons
        name={icon}
        size={24}
        color={isActive ? '#FFFFFF' : isDarkMode ? '#9CA3AF' : '#6B7280'}
        style={{ marginRight: 16 }}
      />
      <Text
        style={{
          fontSize: 18,
          color: isActive ? '#FFFFFF' : isDarkMode ? '#F9FAFB' : '#111827',
        }}
      >
        {title}
      </Text>
    </View>
    {isActive && <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />}
  </TouchableOpacity>
);

const AppearanceScreen = React.memo(() => {
  const { mode, setMode, theme, isThemeReady } = useThemeMode();
  const navigation = useNavigation<SettingsStackNavigationProp>();
  const isDarkMode = theme === 'dark';

  // Apply theme immediately to prevent white flash
  const backgroundColor = isDarkMode ? '#111827' : '#FFFFFF';

  const options: { mode: ThemeMode; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: 'light', title: 'Light', icon: 'sunny' },
    { mode: 'dark', title: 'Dark', icon: 'moon' },
    { mode: 'system', title: 'System', icon: 'cog' },
  ];

  return (
    <View style={{ 
      flex: 1, 
      backgroundColor, 
      padding: 24, 
      paddingTop: 64 
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={{ padding: 8, position: 'absolute', left: -8, top: 0 }}
        >
          <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#F9FAFB' : '#111827'} />
        </TouchableOpacity>
        <Text style={{ 
          fontSize: 24, 
          fontWeight: 'bold', 
          color: isDarkMode ? '#F9FAFB' : '#111827', 
          textAlign: 'center', 
          width: '100%' 
        }}>
          Appearance
        </Text>
      </View>
      {options.map((option) => (
        <AppearanceOption
          key={option.mode}
          title={option.title}
          icon={option.icon}
          isActive={mode === option.mode}
          onPress={() => setMode(option.mode)}
          isDarkMode={isDarkMode}
        />
      ))}
    </View>
  );
});

export default AppearanceScreen;