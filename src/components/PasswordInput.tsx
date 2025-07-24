import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PasswordInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  label: string;
  error?: string[];
  style?: ViewStyle;
  editable?: boolean;
  disabled?: boolean;
}

export default function PasswordInput({
  value,
  onChangeText,
  placeholder,
  label,
  error,
  style,
  editable = true,
  disabled = false
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  return (
    <View style={style}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#FFFFFF' }}>
        {label}
      </Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          style={{
            borderRadius: 8,
            padding: 12,
            paddingRight: 48, // Make room for the eye icon
            fontSize: 16,
            backgroundColor: disabled ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.9)',
            color: disabled ? '#9CA3AF' : '#111827',
            borderWidth: 1,
            borderColor: error && error.length > 0 ? '#EF4444' : '#E5E7EB'
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={!isVisible}
          editable={editable && !disabled}
        />
        <TouchableOpacity
          style={{
            position: 'absolute',
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            width: 24,
            height: '100%'
          }}
          onPress={toggleVisibility}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={disabled}
        >
          <Ionicons
            name={isVisible ? 'eye-off' : 'eye'}
            size={20}
            color={disabled ? '#D1D5DB' : '#6B7280'}
          />
        </TouchableOpacity>
      </View>
      {error && error.length > 0 && (
        <View style={{ marginTop: 4 }}>
          {error.map((errorText, index) => (
            <Text key={index} style={{ fontSize: 12, color: '#EF4444' }}>
              • {errorText}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}