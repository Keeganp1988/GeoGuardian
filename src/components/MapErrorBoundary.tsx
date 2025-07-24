import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  theme?: string;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MapErrorBoundary] Map component error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const { theme = 'light' } = this.props;
      
      return (
        <View style={{
          flex: 1,
          backgroundColor: theme === 'dark' ? '#1F2937' : '#F3F4F6',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            backgroundColor: theme === 'dark' ? '#374151' : '#FFFFFF',
            padding: 24,
            borderRadius: 16,
            alignItems: 'center',
            maxWidth: 300,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 4,
          }}>
            <Ionicons 
              name="map-outline" 
              size={48} 
              color={theme === 'dark' ? '#9CA3AF' : '#6B7280'} 
              style={{ marginBottom: 16 }}
            />
            
            <Text style={{
              fontSize: 18,
              fontWeight: 'bold',
              color: theme === 'dark' ? '#F9FAFB' : '#111827',
              textAlign: 'center',
              marginBottom: 8
            }}>
              Map Error
            </Text>
            
            <Text style={{
              fontSize: 14,
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
              textAlign: 'center',
              marginBottom: 20,
              lineHeight: 20
            }}>
              The map encountered an error and couldn't load properly. Please try again.
            </Text>
            
            <TouchableOpacity
              style={{
                backgroundColor: '#4F46E5',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center'
              }}
              onPress={this.handleRetry}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={{
                color: '#FFFFFF',
                fontWeight: '600',
                fontSize: 14
              }}>
                Retry
              </Text>
            </TouchableOpacity>
            
            {this.state.error && __DEV__ && (
              <Text style={{
                fontSize: 10,
                color: '#EF4444',
                marginTop: 12,
                textAlign: 'center'
              }}>
                {this.state.error.message}
              </Text>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export default MapErrorBoundary;