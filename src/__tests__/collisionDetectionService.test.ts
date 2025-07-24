import { CollisionDetectionService, EnhancedMarkerData } from '../services/collisionDetectionService';
import { MarkerData } from '../components/CircleMap';

describe('CollisionDetectionService', () => {
  let service: CollisionDetectionService;

  beforeEach(() => {
    service = new CollisionDetectionService();
  });

  describe('Distance Calculation', () => {
    it('should calculate distance between two coordinates correctly', () => {
      const coord1 = { latitude: 40.7128, longitude: -74.0060 }; // New York
      const coord2 = { latitude: 40.7589, longitude: -73.9851 }; // Times Square
      
      // Use private method through type assertion for testing
      const distance = (service as any).calculateDistance(coord1, coord2);
      
      // Distance should be approximately 5.8 km
      expect(distance).toBeGreaterThan(5000);
      expect(distance).toBeLessThan(7000);
    });

    it('should return 0 for identical coordinates', () => {
      const coord = { latitude: 40.7128, longitude: -74.0060 };
      const distance = (service as any).calculateDistance(coord, coord);
      
      expect(distance).toBe(0);
    });

    it('should handle coordinates at different hemispheres', () => {
      const coord1 = { latitude: 40.7128, longitude: -74.0060 }; // New York
      const coord2 = { latitude: -33.8688, longitude: 151.2093 }; // Sydney
      
      const distance = (service as any).calculateDistance(coord1, coord2);
      
      // Distance should be approximately 15,990 km
      expect(distance).toBeGreaterThan(15000000);
      expect(distance).toBeLessThan(17000000);
    });
  });

  describe('Collision Detection', () => {
    it('should return markers unchanged when no collisions exist', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 41.7128, longitude: -75.0060 },
          title: 'Marker 2',
        },
      ];

      const result = service.detectCollisions(markers);

      expect(result).toHaveLength(2);
      expect(result[0].collisionGroup).toBeUndefined();
      expect(result[1].collisionGroup).toBeUndefined();
      expect(result[0].displayCoordinate).toBeUndefined();
      expect(result[1].displayCoordinate).toBeUndefined();
    });

    it('should detect collisions for markers within threshold distance', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 }, // Very close
          title: 'Marker 2',
        },
      ];

      const result = service.detectCollisions(markers);

      expect(result).toHaveLength(2);
      expect(result[0].collisionGroup).toBeDefined();
      expect(result[1].collisionGroup).toBeDefined();
      expect(result[0].collisionGroup).toBe(result[1].collisionGroup);
      expect(result[0].displayCoordinate).toBeDefined();
      expect(result[1].displayCoordinate).toBeDefined();
    });

    it('should handle single marker without collision', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
      ];

      const result = service.detectCollisions(markers);

      expect(result).toHaveLength(1);
      expect(result[0].collisionGroup).toBeUndefined();
      expect(result[0].displayCoordinate).toBeUndefined();
    });

    it('should handle empty marker array', () => {
      const markers: MarkerData[] = [];
      const result = service.detectCollisions(markers);

      expect(result).toHaveLength(0);
    });

    it('should create separate collision groups for distinct clusters', () => {
      const markers: MarkerData[] = [
        // Group 1 - close together
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'Marker 2',
        },
        // Group 2 - close together but far from group 1
        {
          id: '3',
          coordinate: { latitude: 41.7128, longitude: -75.0060 },
          title: 'Marker 3',
        },
        {
          id: '4',
          coordinate: { latitude: 41.7129, longitude: -75.0061 },
          title: 'Marker 4',
        },
      ];

      const result = service.detectCollisions(markers);

      expect(result).toHaveLength(4);
      
      // Check that we have two different collision groups
      const group1 = result[0].collisionGroup;
      const group2 = result[2].collisionGroup;
      
      expect(group1).toBeDefined();
      expect(group2).toBeDefined();
      expect(group1).not.toBe(group2);
      
      // Check group assignments
      expect(result[1].collisionGroup).toBe(group1);
      expect(result[3].collisionGroup).toBe(group2);
    });
  });

  describe('Spacing Calculation', () => {
    it('should arrange markers in a circle for collision group', () => {
      const collisionGroup: EnhancedMarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'Marker 2',
        },
        {
          id: '3',
          coordinate: { latitude: 40.7127, longitude: -74.0059 },
          title: 'Marker 3',
        },
      ];

      const result = service.calculateSpacing(collisionGroup, 'test-group');

      expect(result).toHaveLength(3);
      
      // All markers should have display coordinates
      result.forEach(marker => {
        expect(marker.displayCoordinate).toBeDefined();
        expect(marker.collisionGroup).toBe('test-group');
        expect(marker.offsetIndex).toBeDefined();
      });

      // Display coordinates should be different from original coordinates
      expect(result[0].displayCoordinate).not.toEqual(result[0].coordinate);
      expect(result[1].displayCoordinate).not.toEqual(result[1].coordinate);
      expect(result[2].displayCoordinate).not.toEqual(result[2].coordinate);

      // All display coordinates should be different
      expect(result[0].displayCoordinate).not.toEqual(result[1].displayCoordinate);
      expect(result[1].displayCoordinate).not.toEqual(result[2].displayCoordinate);
      expect(result[0].displayCoordinate).not.toEqual(result[2].displayCoordinate);
    });

    it('should return single marker unchanged', () => {
      const collisionGroup: EnhancedMarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
      ];

      const result = service.calculateSpacing(collisionGroup);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(collisionGroup[0]);
    });

    it('should handle maximum markers per group limit', () => {
      // Create more markers than the default limit (8)
      const collisionGroup: EnhancedMarkerData[] = Array.from({ length: 12 }, (_, i) => ({
        id: `marker-${i}`,
        coordinate: { latitude: 40.7128 + i * 0.0001, longitude: -74.0060 + i * 0.0001 },
        title: `Marker ${i}`,
      }));

      const result = service.calculateSpacing(collisionGroup, 'large-group');

      // Should only process up to the maximum limit
      expect(result.length).toBeLessThanOrEqual(8);
      
      // All processed markers should have spacing applied
      result.forEach(marker => {
        expect(marker.displayCoordinate).toBeDefined();
        expect(marker.collisionGroup).toBe('large-group');
      });
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customService = new CollisionDetectionService({
        distanceThreshold: 100,
        spacingRadius: 50,
        maxMarkersPerGroup: 5,
      });

      const config = customService.getConfig();
      expect(config.distanceThreshold).toBe(100);
      expect(config.spacingRadius).toBe(50);
      expect(config.maxMarkersPerGroup).toBe(5);
    });

    it('should update configuration', () => {
      service.updateConfig({ distanceThreshold: 75 });
      
      const config = service.getConfig();
      expect(config.distanceThreshold).toBe(75);
      expect(config.spacingRadius).toBe(30); // Should keep default
    });

    it('should return current distance threshold', () => {
      expect(service.getDistanceThreshold()).toBe(50); // Default value
      
      service.updateConfig({ distanceThreshold: 100 });
      expect(service.getDistanceThreshold()).toBe(100);
    });
  });

  describe('Utility Methods', () => {
    it('should correctly identify colliding markers', () => {
      const marker1 = { latitude: 40.7128, longitude: -74.0060 };
      const marker2 = { latitude: 40.7129, longitude: -74.0061 }; // Very close
      const marker3 = { latitude: 41.7128, longitude: -75.0060 }; // Far away

      expect(service.areMarkersColliding(marker1, marker2)).toBe(true);
      expect(service.areMarkersColliding(marker1, marker3)).toBe(false);
    });

    it('should get display markers with spacing applied', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'Marker 2',
        },
      ];

      const result = service.getDisplayMarkers(markers);

      expect(result).toHaveLength(2);
      
      // Coordinates should be different from original due to spacing
      expect(result[0].coordinate).not.toEqual(markers[0].coordinate);
      expect(result[1].coordinate).not.toEqual(markers[1].coordinate);
    });
  });

  describe('Additional Utility Methods', () => {
    it('should get collision groups information', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'Marker 2',
        },
        {
          id: '3',
          coordinate: { latitude: 41.7128, longitude: -75.0060 },
          title: 'Marker 3',
        },
      ];

      const groups = service.getCollisionGroups(markers);
      
      expect(groups.size).toBe(1); // Only one collision group
      const groupEntries = Array.from(groups.values());
      expect(groupEntries[0]).toHaveLength(2); // Two markers in the group
    });

    it('should check if marker is in collision group', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'Marker 2',
        },
        {
          id: '3',
          coordinate: { latitude: 41.7128, longitude: -75.0060 },
          title: 'Marker 3',
        },
      ];

      expect(service.isMarkerInCollisionGroup('1', markers)).toBe(true);
      expect(service.isMarkerInCollisionGroup('2', markers)).toBe(true);
      expect(service.isMarkerInCollisionGroup('3', markers)).toBe(false);
    });

    it('should get collision group count', () => {
      const markers: MarkerData[] = [
        // Group 1
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'Marker 2',
        },
        // Group 2
        {
          id: '3',
          coordinate: { latitude: 41.7128, longitude: -75.0060 },
          title: 'Marker 3',
        },
        {
          id: '4',
          coordinate: { latitude: 41.7129, longitude: -75.0061 },
          title: 'Marker 4',
        },
        // Isolated marker
        {
          id: '5',
          coordinate: { latitude: 42.7128, longitude: -76.0060 },
          title: 'Marker 5',
        },
      ];

      expect(service.getCollisionGroupCount(markers)).toBe(2);
    });

    it('should process markers with validation', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Valid Marker',
        },
        {
          id: '2',
          coordinate: { latitude: NaN, longitude: -74.0060 },
          title: 'Invalid Marker',
        },
        {
          id: '3',
          coordinate: { latitude: 200, longitude: -74.0060 }, // Out of bounds
          title: 'Out of bounds Marker',
        },
      ];

      const result = service.processMarkersWithValidation(markers);
      
      expect(result).toHaveLength(1); // Only valid marker should remain
      expect(result[0].id).toBe('1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle markers with identical coordinates', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7128, longitude: -74.0060 }, // Identical
          title: 'Marker 2',
        },
      ];

      const result = service.detectCollisions(markers);

      expect(result).toHaveLength(2);
      expect(result[0].collisionGroup).toBeDefined();
      expect(result[1].collisionGroup).toBeDefined();
      expect(result[0].displayCoordinate).toBeDefined();
      expect(result[1].displayCoordinate).toBeDefined();
    });

    it('should handle markers with invalid coordinates gracefully', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: NaN, longitude: -74.0060 },
          title: 'Invalid Marker',
        },
        {
          id: '2',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Valid Marker',
        },
      ];

      // Should not throw an error
      expect(() => service.detectCollisions(markers)).not.toThrow();
    });

    it('should handle extreme coordinate values', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 90, longitude: 180 }, // North Pole, Date Line
          title: 'Extreme Marker 1',
        },
        {
          id: '2',
          coordinate: { latitude: -90, longitude: -180 }, // South Pole, Date Line
          title: 'Extreme Marker 2',
        },
      ];

      expect(() => service.detectCollisions(markers)).not.toThrow();
      
      const result = service.detectCollisions(markers);
      expect(result).toHaveLength(2);
    });

    it('should handle validation edge cases', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 0, longitude: 0 }, // Valid edge case
          title: 'Origin Marker',
        },
        {
          id: '2',
          coordinate: { latitude: -90, longitude: -180 }, // Valid boundary
          title: 'Boundary Marker',
        },
        {
          id: '3',
          coordinate: { latitude: 90, longitude: 180 }, // Valid boundary
          title: 'Boundary Marker 2',
        },
      ];

      const result = service.processMarkersWithValidation(markers);
      expect(result).toHaveLength(3); // All should be valid
    });
  });
});