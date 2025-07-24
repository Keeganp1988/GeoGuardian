import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../contexts/ThemeContext';
import { useMovementStatus, MovementType } from '../hooks/useMovementStatus';

export interface MovementStatusDisplayProps {
  showStepCount?: boolean;
  showLastUpdate?: boolean;
  compact?: boolean;
}

const MovementStatusDisplay: React.FC<MovementStatusDisplayProps> = ({
  showStepCount = true,
  showLastUpdate = false,
  compact = false,
}) => {
  const { theme } = useThemeMode();
  const movementStatus = useMovementStatus();

  const getMovementIcon = (movement: MovementType): string => {
    switch (movement) {
      case 'walking':
        return 'walk-outline';
      case 'running':
        return 'fitness-outline';
      case 'driving':
        return 'car-outline';
      case 'stationary':
        return 'pause-circle-outline';
      default:
        return 'help-circle-outline';
    }
  };

  const getMovementColor = (movement: MovementType): string => {
    switch (movement) {
      case 'walking':
        return '#10B981'; // Green
      case 'running':
        return '#F59E0B'; // Orange
      case 'driving':
        return '#3B82F6'; // Blue
      case 'stationary':
        return '#6B7280'; // Gray
      default:
        return '#9CA3AF'; // Light gray
    }
  };

  const getMovementLabel = (movement: MovementType): string => {
    switch (movement) {
      case 'walking':
        return 'Walking';
      case 'running':
        return 'Running';
      case 'driving':
        return 'Driving';
      case 'stationary':
        return 'Stationary';
      default:
        return 'Unknown';
    }
  };

  const formatLastUpdate = (date: Date | null): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffSeconds < 3600) {
      return `${Math.floor(diffSeconds / 60)}m ago`;
    } else {
      return `${Math.floor(diffSeconds / 3600)}h ago`;
    }
  };

  const isDarkTheme = theme === 'dark';
  const backgroundColor = isDarkTheme ? '#1F2937' : '#F9FAFB';
  const textColor = isDarkTheme ? '#F3F4F6' : '#1F2937';
  const subtextColor = isDarkTheme ? '#9CA3AF' : '#6B7280';

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor }]}>
        <Ionicons
          name={getMovementIcon(movementStatus.currentMovement) as any}
          size={16}
          color={getMovementColor(movementStatus.currentMovement)}
        />
        <Text style={[styles.compactText, { color: textColor }]}>
          {getMovementLabel(movementStatus.currentMovement)}
        </Text>
        {showStepCount && movementStatus.isStepTrackingActive && (
          <Text style={[styles.compactSteps, { color: subtextColor }]}>
            {movementStatus.stepCount} steps
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.header}>
        <View style={styles.movementInfo}>
          <Ionicons
            name={getMovementIcon(movementStatus.currentMovement) as any}
            size={24}
            color={getMovementColor(movementStatus.currentMovement)}
            style={styles.icon}
          />
          <View>
            <Text style={[styles.movementLabel, { color: textColor }]}>
              {getMovementLabel(movementStatus.currentMovement)}
            </Text>
            <Text style={[styles.statusText, { color: subtextColor }]}>
              {movementStatus.isStepTrackingActive ? 'Step tracking active' : 'GPS tracking only'}
            </Text>
          </View>
        </View>
      </View>

      {showStepCount && movementStatus.isStepTrackingActive && (
        <View style={styles.stepInfo}>
          <Text style={[styles.stepCount, { color: textColor }]}>
            {movementStatus.stepCount.toLocaleString()} steps
          </Text>
          {movementStatus.lastStepTime && (
            <Text style={[styles.lastStep, { color: subtextColor }]}>
              Last step: {formatLastUpdate(movementStatus.lastStepTime)}
            </Text>
          )}
        </View>
      )}

      {showLastUpdate && movementStatus.lastLocationUpdate && (
        <Text style={[styles.lastUpdate, { color: subtextColor }]}>
          Updated: {formatLastUpdate(movementStatus.lastLocationUpdate)}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  header: {
    marginBottom: 8,
  },
  movementInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  movementLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '400',
  },
  stepInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  stepCount: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  lastStep: {
    fontSize: 12,
    fontWeight: '400',
  },
  lastUpdate: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 8,
    textAlign: 'center',
  },
  compactText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  compactSteps: {
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 8,
  },
});

export default MovementStatusDisplay;