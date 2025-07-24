import { MarkerData } from '../components/CircleMap';

// Extended MarkerData interface for collision detection
export interface EnhancedMarkerData extends MarkerData {
  displayCoordinate?: { latitude: number; longitude: number };
  collisionGroup?: string;
  offsetIndex?: number;
}

// Configuration for collision detection
export interface CollisionDetectionConfig {
  distanceThreshold: number; // Distance in meters to consider markers as colliding
  spacingRadius: number; // Radius for spacing markers in meters
  maxMarkersPerGroup: number; // Maximum markers to handle in a collision group
}

// Default configuration
const DEFAULT_CONFIG: CollisionDetectionConfig = {
  distanceThreshold: 50, // 50 meters
  spacingRadius: 30, // 30 meters spacing
  maxMarkersPerGroup: 8, // Maximum 8 markers per group for performance
};

/**
 * Service for detecting marker collisions and calculating spacing
 */
export class CollisionDetectionService {
  private config: CollisionDetectionConfig;

  constructor(config: Partial<CollisionDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate distance between two coordinates in meters
   */
  private calculateDistance(
    coord1: { latitude: number; longitude: number },
    coord2: { latitude: number; longitude: number }
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(coord2.latitude - coord1.latitude);
    const dLon = this.toRadians(coord2.longitude - coord1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.latitude)) *
      Math.cos(this.toRadians(coord2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Convert meters to coordinate offset
   */
  private metersToCoordinateOffset(
    meters: number,
    latitude: number
  ): { latOffset: number; lonOffset: number } {
    const latOffset = meters / 111320; // 1 degree latitude ≈ 111,320 meters
    const lonOffset = meters / (111320 * Math.cos(this.toRadians(latitude)));

    return { latOffset, lonOffset };
  }

  /**
   * Detect collisions between markers
   */
  public detectCollisions(markers: MarkerData[]): EnhancedMarkerData[] {
    console.log('[CollisionDetection] 🔍 Starting collision detection...');
    console.log('[CollisionDetection] 📊 Input:', {
      markerCount: markers.length,
      distanceThreshold: this.config.distanceThreshold,
      spacingRadius: this.config.spacingRadius
    });

    if (markers.length <= 1) {
      console.log('[CollisionDetection] ℹ️ Single or no markers - no collision detection needed');
      return markers.map(marker => ({ ...marker }));
    }

    const enhancedMarkers: EnhancedMarkerData[] = markers.map(marker => ({ ...marker }));
    const processed = new Set<string>();
    let groupId = 0;

    for (let i = 0; i < enhancedMarkers.length; i++) {
      if (processed.has(enhancedMarkers[i].id)) continue;

      const collisionGroup: EnhancedMarkerData[] = [enhancedMarkers[i]];
      processed.add(enhancedMarkers[i].id);

      console.log(`[CollisionDetection] 🔍 Checking collisions for marker ${enhancedMarkers[i].id} at:`, enhancedMarkers[i].coordinate);

      // Find all markers that collide with the current marker
      for (let j = i + 1; j < enhancedMarkers.length; j++) {
        if (processed.has(enhancedMarkers[j].id)) continue;

        const distance = this.calculateDistance(
          enhancedMarkers[i].coordinate,
          enhancedMarkers[j].coordinate
        );

        console.log(`[CollisionDetection] 📏 Distance between ${enhancedMarkers[i].id} and ${enhancedMarkers[j].id}:`, {
          distance: Math.round(distance),
          threshold: this.config.distanceThreshold,
          isColliding: distance <= this.config.distanceThreshold
        });

        if (distance <= this.config.distanceThreshold) {
          collisionGroup.push(enhancedMarkers[j]);
          processed.add(enhancedMarkers[j].id);
          console.log(`[CollisionDetection] ⚡ Collision detected! Added ${enhancedMarkers[j].id} to group`);
        }
      }

      // If there are collisions, assign group ID and calculate spacing
      if (collisionGroup.length > 1) {
        const groupIdStr = `collision-group-${groupId++}`;
        console.log(`[CollisionDetection] 🎯 Creating collision group ${groupIdStr} with ${collisionGroup.length} markers:`,
          collisionGroup.map(m => ({ id: m.id, coordinate: m.coordinate }))
        );

        const spacedMarkers = this.calculateSpacing(collisionGroup, groupIdStr);

        console.log(`[CollisionDetection] 📐 Calculated spacing for group ${groupIdStr}:`,
          spacedMarkers.map(m => ({
            id: m.id,
            original: m.coordinate,
            display: m.displayCoordinate,
            offsetIndex: m.offsetIndex
          }))
        );

        // Update the enhanced markers with spacing information
        spacedMarkers.forEach(spacedMarker => {
          const index = enhancedMarkers.findIndex(m => m.id === spacedMarker.id);
          if (index !== -1) {
            enhancedMarkers[index] = spacedMarker;
          }
        });
      } else {
        console.log(`[CollisionDetection] ✅ No collisions for marker ${enhancedMarkers[i].id}`);
      }
    }

    console.log('[CollisionDetection] ✅ Collision detection complete:', {
      totalMarkers: enhancedMarkers.length,
      collisionGroups: groupId,
      spacedMarkers: enhancedMarkers.filter(m => !!m.displayCoordinate).length
    });

    return enhancedMarkers;
  }

  /**
   * Calculate circular spacing for colliding markers
   */
  public calculateSpacing(
    collisionGroup: EnhancedMarkerData[],
    groupId?: string
  ): EnhancedMarkerData[] {
    console.log(`[CollisionDetection] 📐 Calculating spacing for ${collisionGroup.length} markers...`);

    if (collisionGroup.length <= 1) {
      console.log('[CollisionDetection] ℹ️ Single marker - no spacing needed');
      return collisionGroup;
    }

    // Limit the number of markers per group for performance
    const limitedGroup = collisionGroup.slice(0, this.config.maxMarkersPerGroup);

    if (limitedGroup.length < collisionGroup.length) {
      console.warn(`[CollisionDetection] ⚠️ Limited collision group to ${limitedGroup.length} markers (max: ${this.config.maxMarkersPerGroup})`);
    }

    // Calculate the center point of all markers
    const centerLat = limitedGroup.reduce((sum, marker) => sum + marker.coordinate.latitude, 0) / limitedGroup.length;
    const centerLon = limitedGroup.reduce((sum, marker) => sum + marker.coordinate.longitude, 0) / limitedGroup.length;

    console.log(`[CollisionDetection] 📍 Collision group center:`, {
      latitude: centerLat,
      longitude: centerLon,
      markerCount: limitedGroup.length
    });

    // Calculate spacing radius based on number of markers
    const dynamicRadius = this.config.spacingRadius * Math.max(1, Math.sqrt(limitedGroup.length / 4));

    console.log(`[CollisionDetection] 📏 Spacing configuration:`, {
      baseRadius: this.config.spacingRadius,
      dynamicRadius: Math.round(dynamicRadius),
      markerCount: limitedGroup.length
    });

    // Convert radius to coordinate offsets
    const { latOffset, lonOffset } = this.metersToCoordinateOffset(dynamicRadius, centerLat);

    console.log(`[CollisionDetection] 🗺️ Coordinate offsets:`, {
      latOffset: latOffset.toFixed(6),
      lonOffset: lonOffset.toFixed(6),
      radiusMeters: Math.round(dynamicRadius)
    });

    // Arrange markers in a circle
    const spacedMarkers = limitedGroup.map((marker, index) => {
      const angle = (2 * Math.PI * index) / limitedGroup.length;
      const displayCoordinate = {
        latitude: centerLat + latOffset * Math.cos(angle),
        longitude: centerLon + lonOffset * Math.sin(angle),
      };

      console.log(`[CollisionDetection] 📌 Spaced marker ${index + 1}/${limitedGroup.length}:`, {
        id: marker.id,
        originalCoord: marker.coordinate,
        displayCoord: displayCoordinate,
        angle: Math.round(angle * 180 / Math.PI), // Convert to degrees for readability
        offsetIndex: index
      });

      return {
        ...marker,
        displayCoordinate,
        collisionGroup: groupId || `group-${Date.now()}-${index}`,
        offsetIndex: index,
      };
    });

    console.log(`[CollisionDetection] ✅ Spacing calculation complete for group ${groupId}:`, {
      inputMarkers: collisionGroup.length,
      spacedMarkers: spacedMarkers.length,
      centerPoint: { latitude: centerLat, longitude: centerLon },
      spacingRadius: Math.round(dynamicRadius)
    });

    return spacedMarkers;
  }

  /**
   * Get the current distance threshold
   */
  public getDistanceThreshold(): number {
    return this.config.distanceThreshold;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<CollisionDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  public getConfig(): CollisionDetectionConfig {
    return { ...this.config };
  }

  /**
   * Check if two markers are colliding
   */
  public areMarkersColliding(
    marker1: { latitude: number; longitude: number },
    marker2: { latitude: number; longitude: number }
  ): boolean {
    const distance = this.calculateDistance(marker1, marker2);
    return distance <= this.config.distanceThreshold;
  }

  /**
   * Get markers that should be displayed (with spacing applied)
   */
  public getDisplayMarkers(markers: MarkerData[]): EnhancedMarkerData[] {
    const enhancedMarkers = this.detectCollisions(markers);

    return enhancedMarkers.map(marker => ({
      ...marker,
      // Use displayCoordinate if available, otherwise use original coordinate
      coordinate: marker.displayCoordinate || marker.coordinate,
    }));
  }

  /**
   * Get collision groups information
   */
  public getCollisionGroups(markers: MarkerData[]): Map<string, EnhancedMarkerData[]> {
    const enhancedMarkers = this.detectCollisions(markers);
    const groups = new Map<string, EnhancedMarkerData[]>();

    enhancedMarkers.forEach(marker => {
      if (marker.collisionGroup) {
        if (!groups.has(marker.collisionGroup)) {
          groups.set(marker.collisionGroup, []);
        }
        groups.get(marker.collisionGroup)!.push(marker);
      }
    });

    return groups;
  }

  /**
   * Check if a marker is part of a collision group
   */
  public isMarkerInCollisionGroup(markerId: string, markers: MarkerData[]): boolean {
    const enhancedMarkers = this.detectCollisions(markers);
    const marker = enhancedMarkers.find(m => m.id === markerId);
    return marker?.collisionGroup !== undefined;
  }

  /**
   * Get the number of collision groups
   */
  public getCollisionGroupCount(markers: MarkerData[]): number {
    const groups = this.getCollisionGroups(markers);
    return groups.size;
  }

  /**
   * Validate marker data before processing
   */
  private validateMarkerData(markers: MarkerData[]): MarkerData[] {
    return markers.filter(marker => {
      // Check if coordinate exists
      if (!marker.coordinate) {
        console.warn(`[CollisionDetection] No coordinate for marker ${marker.id}`);
        return false;
      }

      // Check for valid coordinates
      if (
        typeof marker.coordinate.latitude !== 'number' ||
        typeof marker.coordinate.longitude !== 'number' ||
        isNaN(marker.coordinate.latitude) ||
        isNaN(marker.coordinate.longitude)
      ) {
        console.warn(`[CollisionDetection] Invalid coordinates for marker ${marker.id}`);
        return false;
      }

      // Check for (0,0) coordinates which are usually invalid
      if (marker.coordinate.latitude === 0 && marker.coordinate.longitude === 0) {
        console.warn(`[CollisionDetection] Zero coordinates (0,0) for marker ${marker.id} - likely invalid`);
        return false;
      }

      // Check coordinate bounds
      if (
        marker.coordinate.latitude < -90 ||
        marker.coordinate.latitude > 90 ||
        marker.coordinate.longitude < -180 ||
        marker.coordinate.longitude > 180
      ) {
        console.warn(`[CollisionDetection] Coordinates out of bounds for marker ${marker.id}`);
        return false;
      }

      return true;
    });
  }

  /**
   * Process markers with validation
   */
  public processMarkersWithValidation(markers: MarkerData[]): EnhancedMarkerData[] {
    try {
      const validMarkers = this.validateMarkerData(markers);
      
      if (validMarkers.length === 0) {
        return [];
      }

      const enhancedMarkers = this.detectCollisions(validMarkers);
      return enhancedMarkers;
    } catch (error) {
      console.error('[CollisionDetection] Error processing markers:', error);
      // Return original markers as fallback
      return markers.map(marker => ({ ...marker }));
    }
  }
}

// Export a default instance
export const collisionDetectionService = new CollisionDetectionService();

// Export types (remove duplicate export)
export type { CollisionDetectionConfig as CollisionConfig };