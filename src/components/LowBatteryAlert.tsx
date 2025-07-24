import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';

interface LowBatteryAlertProps {
  onDismiss?: () => void;
}

const LowBatteryAlert: React.FC<LowBatteryAlertProps> = ({ onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isCharging, setIsCharging] = useState(false);
  const slideAnim = new Animated.Value(-100);
  const fadeAnim = new Animated.Value(0);

  const lowBatteryThreshold = 15;

  useEffect(() => {
    // Check initial battery state
    checkBatteryState();

    // Set up battery state listener
    const batteryListener = Battery.addBatteryStateListener(async ({ batteryState }) => {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const newBatteryLevel = Math.round((batteryLevel ?? 1) * 100);
      const newChargingState = batteryState === Battery.BatteryState.CHARGING;
      
      setBatteryLevel(newBatteryLevel);
      setIsCharging(newChargingState);

      // Show alert if battery is low and not charging
      if (newBatteryLevel <= lowBatteryThreshold && !newChargingState) {
        showAlert();
      } else {
        hideAlert();
      }
    });

    return () => {
      batteryListener.remove();
    };
  }, []);

  const checkBatteryState = async () => {
    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const powerState = await Battery.getPowerStateAsync();
      
      const newBatteryLevel = Math.round((batteryLevel ?? 1) * 100);
      const newChargingState = powerState.batteryState === Battery.BatteryState.CHARGING;
      
      setBatteryLevel(newBatteryLevel);
      setIsCharging(newChargingState);

      if (newBatteryLevel <= lowBatteryThreshold && !newChargingState) {
        showAlert();
      }
    } catch (error) {
      console.error('Failed to check battery state:', error);
    }
  };

  const showAlert = () => {
    setIsVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideAlert = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
    });
  };

  const handleDismiss = () => {
    hideAlert();
    onDismiss?.();
  };

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
    >
      <View style={styles.alertContent}>
        <View style={styles.iconContainer}>
          <Ionicons name="battery-dead" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Low Battery</Text>
          <Text style={styles.message}>
            Your battery is at {batteryLevel}%. Please charge your device.
          </Text>
        </View>
        <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingTop: 50, // Account for status bar
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  message: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  dismissButton: {
    padding: 8,
  },
});

export default LowBatteryAlert; 