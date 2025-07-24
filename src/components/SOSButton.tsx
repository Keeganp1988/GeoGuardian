import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useThemeMode } from '../contexts/ThemeContext';

interface SOSButtonProps {
  onActivate?: () => void;
  onCancel?: () => void;
  large?: boolean;
  autoActivate?: boolean;
}

export default function SOSButton({ onActivate, onCancel, large = false, autoActivate = false }: SOSButtonProps) {
  const { theme } = useThemeMode();
  const [isActivated, setIsActivated] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const isFocused = typeof useIsFocused === 'function' ? useIsFocused() : true;

  useEffect(() => {
    if (autoActivate && isFocused) {
      setIsActivated(true);
      setIsCountingDown(true);
      setCountdown(10);
    }
  }, [autoActivate, isFocused]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCountingDown && countdown > 0) {
      interval = setInterval(() => setCountdown((prev) => prev - 1), 1000);
      return () => {
        clearInterval(interval);
      };
    } else if (isCountingDown && countdown === 0) {
      handleSOSActivate();
    }
    return () => clearInterval(interval);
  }, [isCountingDown, countdown]);

  const handleSOSPress = () => {
    setIsActivated(true);
    setIsCountingDown(true);
    setCountdown(10);
  };

  const handleCancel = () => {
    setIsActivated(false);
    setIsCountingDown(false);
    setCountdown(10);
    onCancel?.();
  };

  const handleSOSActivate = () => {
    setIsActivated(false);
    setIsCountingDown(false);
    setCountdown(10);
    onActivate?.();
  };

  return (
    <>
      <View style={large ? { position: 'absolute', zIndex: 50, alignSelf: 'center', top: '40%' } : { position: 'absolute', bottom: 96, right: 20, zIndex: 50 }}>
        <TouchableOpacity
          style={large ? {
            width: 96, height: 96, borderRadius: 48, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
          } : {
            width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4
          }}
          onPress={handleSOSPress}
        >
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: large ? 24 : 8, letterSpacing: 1, marginTop: large ? 0 : -2 }}>SOS</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={isActivated} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme === 'dark' ? '#1F2937' : '#fff', borderRadius: 24, padding: 32, alignItems: 'center', width: '100%', maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 16 }}>
            <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 4, borderColor: '#EF4444', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 48, fontWeight: 'bold', color: '#EF4444' }}>{countdown}</Text>
            </View>

            <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme === 'dark' ? '#F9FAFB' : '#111827', marginBottom: 12 }}>Emergency Alert</Text>
            <Text style={{ fontSize: 16, color: theme === 'dark' ? '#9CA3AF' : '#6B7280', textAlign: 'center', marginBottom: 32 }}>
              Your emergency contacts will be notified in {countdown} seconds
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, backgroundColor: theme === 'dark' ? '#374151' : '#F3F4F6', marginRight: 6 }}
                onPress={handleCancel}
              >
                <Ionicons name="close" size={20} color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, backgroundColor: '#2563EB', marginLeft: 6 }}
                onPress={handleSOSActivate}
              >
                <Ionicons name="send" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF' }}>Send Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
