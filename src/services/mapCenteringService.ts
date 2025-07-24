import React from 'react';
import MapView from 'react-native-maps';
import { LocationData } from '../firebase/services';

interface MapCenteringService {
  centerOnMember(
    mapRef: React.RefObject<MapView | null>,
    memberLocation: LocationData,
    zoomLevel?: number
  ): Promise<void>;
  
  centerOnUser(
    mapRef: React.RefObject<MapView | null>,
    userLocation: LocationData
  ): Promise<void>;
  
  calculateOptimalZoom(locationType: 'member' | 'user'): {
    latitudeDelta: number;
    longitudeDelta: number;
  };
}

// Animation configuration
const MAP_ANIMATION_CONFIG = {
  duration: 500,
  memberZoom: {
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  },
  userZoom: {
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  },
};

/**
 * Validates coordinate data to ensure it's valid for map centering
 */
const validateCoordinates = (location: LocationData): boolean => {
  if (!location) {
    console.warn('[MapCenteringService] Location data is null or undefined');
    return false;
  }

  if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    console.warn('[MapCenteringService] Invalid coordinate types:', {
      latitude: typeof location.latitude,
      longitude: typeof location.longitude,
    });
    return false;
  }

  // Check for invalid (0,0) coordinates
  if (location.latitude === 0 && location.longitude === 0) {
    console.warn('[MapCenteringService] Invalid (0,0) coordinates detected');
    return false;
  }

  // Check for reasonable coordinate ranges
  if (location.latitude < -90 || location.latitude > 90) {
    console.warn('[MapCenteringService] Invalid latitude range:', location.latitude);
    return false;
  }

  if (location.longitude < -180 || location.longitude > 180) {
    console.warn('[MapCenteringService] Invalid longitude range:', location.longitude);
    return false;
  }

  return true;
};

/**
 * Service for handling map centering and zooming operations
 */
let isAnimating = false; // Prevent multiple simultaneous animations

const mapCenteringService: MapCenteringService = {
  /**
   * Centers the map on a specific member's location with appropriate zoom
   */
  async centerOnMember(
    mapRef: React.RefObject<MapView | null>,
    memberLocation: LocationData,
    zoomLevel?: number
  ): Promise<void> {
    try {
      // Prevent multiple simultaneous animations
      if (isAnimating) {
        console.warn('[MapCenteringService] Animation already in progress, skipping');
        return;
      }

      // Validate coordinates
      if (!validateCoordinates(memberLocation)) {
        throw new Error('Invalid member location coordinates');
      }

      // Check if map reference is available
      if (!mapRef.current) {
        throw new Error('Map reference is not available');
      }

      isAnimating = true;

      const zoom = zoomLevel ? {
        latitudeDelta: zoomLevel,
        longitudeDelta: zoomLevel,
      } : MAP_ANIMATION_CONFIG.memberZoom;

      console.log('[MapCenteringService] Centering on member location:', {
        latitude: memberLocation.latitude,
        longitude: memberLocation.longitude,
        zoom,
      });

      // Animate to member location
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          isAnimating = false;
          reject(new Error('Map centering timeout'));
        }, MAP_ANIMATION_CONFIG.duration + 1000);

        mapRef.current?.animateToRegion(
          {
            latitude: memberLocation.latitude,
            longitude: memberLocation.longitude,
            latitudeDelta: zoom.latitudeDelta,
            longitudeDelta: zoom.longitudeDelta,
          },
          MAP_ANIMATION_CONFIG.duration
        );

        // Clear timeout and resolve after animation duration
        setTimeout(() => {
          clearTimeout(timeout);
          isAnimating = false;
          resolve();
        }, MAP_ANIMATION_CONFIG.duration);
      });

    } catch (error) {
      isAnimating = false;
      console.error('[MapCenteringService] Error centering on member:', error);
      throw error;
    }
  },

  /**
   * Centers the map on the user's current location
   */
  async centerOnUser(
    mapRef: React.RefObject<MapView | null>,
    userLocation: LocationData
  ): Promise<void> {
    try {
      // Prevent multiple simultaneous animations
      if (isAnimating) {
        console.warn('[MapCenteringService] Animation already in progress, skipping');
        return;
      }

      // Validate coordinates
      if (!validateCoordinates(userLocation)) {
        throw new Error('Invalid user location coordinates');
      }

      // Check if map reference is available
      if (!mapRef.current) {
        throw new Error('Map reference is not available');
      }

      isAnimating = true;

      console.log('[MapCenteringService] Centering on user location:', {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });

      // Animate to user location
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          isAnimating = false;
          reject(new Error('Map centering timeout'));
        }, MAP_ANIMATION_CONFIG.duration + 1000);

        mapRef.current?.animateToRegion(
          {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: MAP_ANIMATION_CONFIG.userZoom.latitudeDelta,
            longitudeDelta: MAP_ANIMATION_CONFIG.userZoom.longitudeDelta,
          },
          MAP_ANIMATION_CONFIG.duration
        );

        // Clear timeout and resolve after animation duration
        setTimeout(() => {
          clearTimeout(timeout);
          isAnimating = false;
          resolve();
        }, MAP_ANIMATION_CONFIG.duration);
      });

    } catch (error) {
      isAnimating = false;
      console.error('[MapCenteringService] Error centering on user:', error);
      throw error;
    }
  },

  /**
   * Calculates optimal zoom level based on location type
   */
  calculateOptimalZoom(locationType: 'member' | 'user'): {
    latitudeDelta: number;
    longitudeDelta: number;
  } {
    switch (locationType) {
      case 'member':
        return MAP_ANIMATION_CONFIG.memberZoom;
      case 'user':
        return MAP_ANIMATION_CONFIG.userZoom;
      default:
        return MAP_ANIMATION_CONFIG.memberZoom;
    }
  },
};

export default mapCenteringService;
export { validateCoordinates, MAP_ANIMATION_CONFIG };