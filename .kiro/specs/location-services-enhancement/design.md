# Design Document

## Overview

This design addresses the location services enhancement requirements by improving the existing GPS warning component, implementing pedometer functionality, and creating a comprehensive permission management system. The solution leverages Expo's location, sensors, and linking APIs while providing a better user experience through improved UI/UX and proper settings navigation.

## Architecture

### Core Components

1. **Enhanced GPSWarning Component** - Improved UI/UX with proper styling and settings navigation
2. **PedometerService** - New service for step tracking using device sensors
3. **PermissionManager** - Centralized permission handling for location and motion sensors
4. **LocationSettingsHelper** - Platform-specific settings navigation utilities

### Service Layer Integration

The design integrates with the existing `ConsolidatedLocationService` and extends it with:
- Enhanced permission management
- Pedometer integration
- Background permission handling
- Permission state monitoring

## Components and Interfaces

### 1. Enhanced GPSWarning Component

**Location**: `src/components/GPSWarning.tsx` (existing, to be enhanced)

**Key Improvements**:
- Fixed styling to eliminate blur and positioning issues
- Platform-specific settings navigation (iOS: Location Services, Android: Location Settings)
- Better visual hierarchy and accessibility
- Real-time permission status monitoring

**Interface**:
```typescript
interface GPSWarningProps {
  style?: ViewStyle;
  onPermissionChange?: (hasPermission: boolean) => void;
}

interface GPSWarningState {
  showWarning: boolean;
  permissionStatus: LocationPermissionStatus;
  servicesEnabled: boolean;
}
```

### 2. PedometerService

**Location**: `src/services/pedometerService.ts` (new)

**Responsibilities**:
- Initialize pedometer functionality using expo-sensors
- Provide real-time step count updates
- Handle permission requests for motion sensors
- Manage background step tracking
- Graceful degradation when pedometer unavailable

**Interface**:
```typescript
interface PedometerService {
  initialize(): Promise<boolean>;
  startStepCounting(): Promise<void>;
  stopStepCounting(): void;
  getCurrentStepCount(): number;
  onStepCountChange(callback: (steps: number) => void): void;
  isAvailable(): boolean;
  requestPermissions(): Promise<boolean>;
}

interface StepData {
  steps: number;
  timestamp: Date;
  isAvailable: boolean;
}
```

### 3. PermissionManager

**Location**: `src/services/permissionManager.ts` (new)

**Responsibilities**:
- Centralized permission handling for all app permissions
- First-launch permission flow
- Background permission management
- Permission status monitoring and change detection
- User-friendly permission explanations

**Interface**:
```typescript
interface PermissionManager {
  initializePermissions(): Promise<PermissionStatus>;
  requestLocationPermissions(includeBackground?: boolean): Promise<boolean>;
  requestMotionPermissions(): Promise<boolean>;
  checkAllPermissions(): Promise<PermissionStatus>;
  onPermissionChange(callback: (status: PermissionStatus) => void): void;
}

interface PermissionStatus {
  location: {
    foreground: PermissionState;
    background: PermissionState;
  };
  motion: PermissionState;
  notifications: PermissionState;
}
```

### 4. LocationSettingsHelper

**Location**: `src/utils/locationSettingsHelper.ts` (new)

**Responsibilities**:
- Platform-specific settings navigation
- Deep linking to appropriate settings screens
- Fallback handling for unsupported platforms

**Interface**:
```typescript
interface LocationSettingsHelper {
  openLocationSettings(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  canOpenLocationSettings(): boolean;
}
```

## Data Models

### Permission State Model
```typescript
type PermissionState = 'granted' | 'denied' | 'undetermined' | 'restricted';

interface LocationPermission {
  foreground: PermissionState;
  background: PermissionState;
  servicesEnabled: boolean;
}

interface MotionPermission {
  state: PermissionState;
  isAvailable: boolean;
}
```

### Step Tracking Model
```typescript
interface StepCountData {
  currentSteps: number;
  dailySteps: number;
  lastUpdated: Date;
  isTracking: boolean;
}

interface PedometerEvent {
  steps: number;
  distance?: number;
  timestamp: Date;
}
```

## Error Handling

### Permission Errors
- **Denied Permissions**: Show user-friendly explanations with guidance to settings
- **Restricted Permissions**: Handle parental controls and enterprise restrictions
- **Undetermined State**: Provide clear rationale before requesting permissions

### Pedometer Errors
- **Device Unavailable**: Graceful degradation with informative messaging
- **Sensor Errors**: Retry logic with exponential backoff
- **Background Restrictions**: Handle platform-specific background limitations

### Settings Navigation Errors
- **Deep Link Failures**: Fallback to general app settings
- **Platform Differences**: Handle iOS/Android setting path variations
- **Permission Changes**: Detect and respond to settings changes

## Testing Strategy

### Unit Tests
- **GPSWarning Component**: UI rendering, permission state handling, settings navigation
- **PedometerService**: Step counting accuracy, permission handling, error scenarios
- **PermissionManager**: Permission flow logic, state management, change detection
- **LocationSettingsHelper**: Platform-specific navigation, fallback handling

### Integration Tests
- **Permission Flow**: End-to-end permission request and handling
- **Settings Navigation**: Verify correct settings screens open on each platform
- **Service Integration**: Test pedometer integration with location services
- **Background Functionality**: Verify background permissions and functionality

### Platform-Specific Tests
- **iOS**: Location Services settings navigation, background app refresh
- **Android**: Location settings navigation, battery optimization handling
- **Permission Timing**: Test permission requests at appropriate app lifecycle moments

## Implementation Approach

### Phase 1: Enhanced GPS Warning
1. Fix existing GPSWarning component styling and positioning
2. Implement platform-specific settings navigation
3. Add proper error handling and user feedback
4. Integrate with existing location service

### Phase 2: Pedometer Integration
1. Create PedometerService with expo-sensors integration
2. Implement step counting and real-time updates
3. Add motion permission handling
4. Integrate with app context for global access

### Phase 3: Comprehensive Permission Management
1. Create centralized PermissionManager
2. Implement first-launch permission flow
3. Add background permission handling
4. Create permission change monitoring

### Phase 4: Integration and Testing
1. Integrate all components with existing services
2. Add comprehensive error handling
3. Implement testing strategy
4. Performance optimization and cleanup

## Platform Considerations

### iOS Specific
- Use `Linking.openURL('app-settings:')` for Location Services
- Handle background app refresh requirements
- Respect iOS permission timing guidelines
- Use Core Motion framework through expo-sensors

### Android Specific
- Use `Linking.sendIntent()` for location settings
- Handle battery optimization settings
- Manage runtime permissions properly
- Use step counter sensor through expo-sensors

### Cross-Platform
- Unified permission interface across platforms
- Consistent error handling and user messaging
- Platform-appropriate UI/UX patterns
- Graceful degradation for unsupported features