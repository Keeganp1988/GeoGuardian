import React, { useEffect, useRef, useLayoutEffect } from 'react';
import { View, Text, Animated, Dimensions } from 'react-native';
import { Ionicons, useThemeMode } from '../utils/sharedImports';

interface SuccessAnimationProps {
  isVisible: boolean;
  message?: string;
  onComplete?: () => void;
  duration?: number;
  style?: any;
}

export const SuccessAnimation: React.FC<SuccessAnimationProps> = ({
  isVisible,
  message = 'Success!',
  onComplete,
  duration = 2000,
  style,
}) => {
  const { theme } = useThemeMode();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  const translateY = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (isVisible) {
      // Defer animation to next tick to avoid render phase conflicts
      const animationTimeout = setTimeout(() => {
        // Animate in
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Auto-hide after duration
          setTimeout(() => {
            Animated.parallel([
              Animated.timing(opacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(translateY, {
                toValue: -50,
                duration: 300,
                useNativeDriver: true,
              }),
            ]).start(() => {
              onComplete?.();
            });
          }, duration - 600); // Subtract animation duration
        });
      }, 0);

      return () => clearTimeout(animationTimeout);
    }
  }, [isVisible, opacity, scale, translateY, duration, onComplete]);

  if (!isVisible) return null;

  return (
    <Animated.View style={[
      {
        position: 'absolute',
        top: '40%',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        opacity,
        transform: [{ scale }, { translateY }],
      },
      style
    ]}>
      <View style={{
        backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(16, 185, 129, 0.95)',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}>
        <Ionicons name="checkmark-circle" size={24} color="white" />
        <Text style={{
          color: 'white',
          fontWeight: '600',
          fontSize: 16,
          marginLeft: 8,
        }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
};

interface NewContactAnimationProps {
  isVisible: boolean;
  contactName?: string;
  onComplete?: () => void;
}

export const NewContactAnimation: React.FC<NewContactAnimationProps> = ({
  isVisible,
  contactName = 'New contact',
  onComplete,
}) => {
  const { theme } = useThemeMode();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isVisible) {
      // Defer animation to next tick to avoid render phase conflicts
      const animationTimeout = setTimeout(() => {
        // Initial entrance animation
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Pulse animation
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            // Auto-hide after showing
            setTimeout(() => {
              Animated.parallel([
                Animated.timing(opacity, {
                  toValue: 0,
                  duration: 300,
                  useNativeDriver: true,
                }),
                Animated.timing(scale, {
                  toValue: 0.8,
                  duration: 300,
                  useNativeDriver: true,
                }),
              ]).start(() => {
                onComplete?.();
              });
            }, 1500);
          });
        });
      }, 0);

      return () => clearTimeout(animationTimeout);
    }
  }, [isVisible, opacity, scale, pulseAnim, onComplete]);

  if (!isVisible) return null;

  return (
    <Animated.View style={{
      position: 'absolute',
      top: '35%',
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      opacity,
      transform: [{ scale: Animated.multiply(scale, pulseAnim) }],
    }}>
      <View style={{
        backgroundColor: theme === 'dark' ? 'rgba(79, 70, 229, 0.95)' : 'rgba(79, 70, 229, 0.95)',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}>
        <Ionicons name="person-add" size={24} color="white" />
        <Text style={{
          color: 'white',
          fontWeight: '600',
          fontSize: 16,
          marginLeft: 8,
        }}>
          {contactName} joined!
        </Text>
      </View>
    </Animated.View>
  );
};

export default SuccessAnimation;