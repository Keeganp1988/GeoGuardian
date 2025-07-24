import React from 'react';
import { View, ActivityIndicator, Text, Animated } from 'react-native';
import { useThemeMode } from '../utils/sharedImports';

interface LoadingIndicatorProps {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
  style?: any;
  showMessage?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Loading...',
  size = 'small',
  color,
  style,
  showMessage = true,
}) => {
  const { theme } = useThemeMode();
  
  const defaultColor = color || (theme === 'dark' ? '#9CA3AF' : '#6B7280');
  
  return (
    <View style={[
      { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: 8,
      }, 
      style
    ]}>
      <ActivityIndicator size={size} color={defaultColor} />
      {showMessage && (
        <Text style={{ 
          marginLeft: 8, 
          fontSize: 14, 
          color: defaultColor,
          fontWeight: '500'
        }}>
          {message}
        </Text>
      )}
    </View>
  );
};

interface SyncLoadingIndicatorProps {
  isVisible: boolean;
  message?: string;
  style?: any;
}

export const SyncLoadingIndicator: React.FC<SyncLoadingIndicatorProps> = ({
  isVisible,
  message = 'Syncing...',
  style,
}) => {
  const { theme } = useThemeMode();
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(opacity, {
      toValue: isVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isVisible, opacity]);

  if (!isVisible) return null;

  return (
    <Animated.View style={[
      {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: theme === 'dark' ? 'rgba(79, 70, 229, 0.9)' : 'rgba(79, 70, 229, 0.9)',
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        opacity,
      },
      style
    ]}>
      <ActivityIndicator size="small" color="white" />
      <Text style={{ 
        color: 'white', 
        fontWeight: '600', 
        marginLeft: 8,
        fontSize: 14
      }}>
        {message}
      </Text>
    </Animated.View>
  );
};

export default LoadingIndicator;