import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Linking } from 'react-native';

interface MapPlaceholderProps {
  theme: string;
  message: string;
  showSettingsButton?: boolean;
}

const MapPlaceholder: React.FC<MapPlaceholderProps> = ({ 
  theme, 
  message,
  showSettingsButton = false
}) => {
  const backgroundColor = theme === 'dark' ? '#1F2937' : '#F3F4F6';
  const textColor = theme === 'dark' ? '#F9FAFB' : '#111827';
  const subtextColor = theme === 'dark' ? '#9CA3AF' : '#6B7280';

  return (
    <View style={{ 
      flex: 1, 
      backgroundColor, 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: 20 
    }}>
      <Ionicons 
        name="map-outline" 
        size={64} 
        color={subtextColor} 
        style={{ marginBottom: 16 }} 
      />
      <Text style={{ 
        fontSize: 16, 
        color: subtextColor, 
        textAlign: 'center',
        lineHeight: 20 
      }}>
        {message}
      </Text>
      
      {showSettingsButton && (
        <TouchableOpacity
          style={{ 
            backgroundColor: '#4F46E5', 
            paddingHorizontal: 20, 
            paddingVertical: 12, 
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 16
          }}
          onPress={() => Linking.openSettings()}
        >
          <Ionicons name="settings-outline" size={16} color="white" style={{ marginRight: 8 }} />
          <Text style={{ color: 'white', fontWeight: '600' }}>Open Settings</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default MapPlaceholder;