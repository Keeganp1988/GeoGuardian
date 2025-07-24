import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons, useThemeMode } from '../utils/sharedImports';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  isVisible: boolean;
  style?: any;
  retryText?: string;
  type?: 'error' | 'warning' | 'info';
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  onDismiss,
  isVisible,
  style,
  retryText = 'Retry',
  type = 'error',
}) => {
  const { theme } = useThemeMode();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-50)).current;

  React.useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, opacity, translateY]);

  const getBackgroundColor = () => {
    switch (type) {
      case 'error':
        return 'rgba(239, 68, 68, 0.9)';
      case 'warning':
        return 'rgba(245, 158, 11, 0.9)';
      case 'info':
        return 'rgba(59, 130, 246, 0.9)';
      default:
        return 'rgba(239, 68, 68, 0.9)';
    }
  };

  const getIconName = () => {
    switch (type) {
      case 'error':
        return 'alert-circle-outline';
      case 'warning':
        return 'warning-outline';
      case 'info':
        return 'information-circle-outline';
      default:
        return 'alert-circle-outline';
    }
  };

  if (!isVisible) return null;

  return (
    <Animated.View style={[
      {
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        backgroundColor: getBackgroundColor(),
        padding: 12,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 1000,
        opacity,
        transform: [{ translateY }],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
      },
      style
    ]}>
      <Ionicons name={getIconName()} size={20} color="white" />
      <Text style={{ 
        color: 'white', 
        fontWeight: '600', 
        marginLeft: 8,
        flex: 1,
        fontSize: 14
      }}>
        {message}
      </Text>
      
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            marginLeft: 8,
          }}
        >
          <Text style={{ 
            color: 'white', 
            fontWeight: '600',
            fontSize: 12
          }}>
            {retryText}
          </Text>
        </TouchableOpacity>
      )}
      
      {onDismiss && (
        <TouchableOpacity
          onPress={onDismiss}
          style={{
            marginLeft: 8,
            padding: 4,
          }}
        >
          <Ionicons name="close" size={16} color="white" />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

export default ErrorMessage;