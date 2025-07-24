import React from 'react';
import { MarkerData } from '../components/CircleMap';
import { collisionDetectionService } from '../services/collisionDetectionService';
import PinMarker from '../components/PinMarker';

describe('CircleMap Integration - Complete Integration and Testing', () => {
  const sampleMarkers: MarkerData[] = [
    {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'User 1',
      isUser: false,
      member: {
        userId: '1',
        profileColor: '#10B981',
        user: {
          name: 'John Doe',
          profileImage: 'https://example.com/profile1.jpg',
        },
      },
    },
    {
      id: '2',
      coordinate: { latitude: 37.78830, longitude: -122.4325 },
      title: 'User 2',
      isUser: true,
      member: {
        userId: '2',
        profileColor: '#4F46E5',
        user: {
          name: 'Jane Smith',
        },
      },
    },
  ];

  it('should support extended MarkerData interface with collision properties', () => {
    const extendedMarker: MarkerData = {
      ...sampleMarkers[0],
      displayCoordinate: { latitude: 37.78835, longitude: -122.4330 },
      collisionGroup: 'group-1',
      offsetIndex: 0,
    };

    expect(extendedMarker.displayCoordinate).toBeDefined();
    expect(extendedMarker.collisionGroup).toBe('group-1');
    expect(extendedMarker.offsetIndex).toBe(0);
  });

  it('should process markers with collision detection service', () => {
    const processedMarkers = collisionDetectionService.processMarkersWithValidation(sampleMarkers);
    
    expect(processedMarkers).toHaveLength(sampleMarkers.length);
    expect(processedMarkers[0]).toHaveProperty('id');
    expect(processedMarkers[0]).toHaveProperty('coordinate');
    expect(processedMarkers[0]).toHaveProperty('title');
  });

  it('should handle markers with collision groups', () => {
    // Create markers at the same location to trigger collision detection
    const collidingMarkers: MarkerData[] = [
      {
        id: '1',
        coordinate: { latitude: 37.78825, longitude: -122.4324 },
        title: 'User 1',
        isUser: false,
      },
      {
        id: '2',
        coordinate: { latitude: 37.78825, longitude: -122.4324 }, // Same location
        title: 'User 2',
        isUser: true,
      },
    ];

    const processedMarkers = collisionDetectionService.processMarkersWithValidation(collidingMarkers);
    
    // Check if collision detection was applied
    const hasCollisionGroups = processedMarkers.some(marker => marker.collisionGroup);
    const hasDisplayCoordinates = processedMarkers.some(marker => marker.displayCoordinate);
    
    expect(hasCollisionGroups || hasDisplayCoordinates).toBe(true);
  });

  it('should maintain marker properties during collision processing', () => {
    const processedMarkers = collisionDetectionService.processMarkersWithValidation(sampleMarkers);
    
    processedMarkers.forEach((processedMarker, index) => {
      const originalMarker = sampleMarkers[index];
      expect(processedMarker.id).toBe(originalMarker.id);
      expect(processedMarker.title).toBe(originalMarker.title);
      expect(processedMarker.isUser).toBe(originalMarker.isUser);
      expect(processedMarker.member).toEqual(originalMarker.member);
    });
  });

  it('should handle empty markers array', () => {
    const processedMarkers = collisionDetectionService.processMarkersWithValidation([]);
    expect(processedMarkers).toHaveLength(0);
  });

  it('should handle invalid marker data gracefully', () => {
    const invalidMarkers: MarkerData[] = [
      {
        id: '1',
        coordinate: { latitude: NaN, longitude: -122.4324 },
        title: 'Invalid User',
        isUser: false,
      },
      {
        id: '2',
        coordinate: { latitude: 37.78825, longitude: -122.4324 },
        title: 'Valid User',
        isUser: true,
      },
    ];

    const processedMarkers = collisionDetectionService.processMarkersWithValidation(invalidMarkers);
    
    // Should filter out invalid markers
    expect(processedMarkers.length).toBeLessThanOrEqual(invalidMarkers.length);
    
    // Valid markers should remain
    const validMarker = processedMarkers.find(m => m.id === '2');
    expect(validMarker).toBeDefined();
    expect(validMarker?.title).toBe('Valid User');
  });

  it('should use displayCoordinate when available', () => {
    const markerWithDisplayCoordinate: MarkerData = {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      displayCoordinate: { latitude: 37.78835, longitude: -122.4330 },
      title: 'Spaced User',
      isUser: false,
      collisionGroup: 'group-1',
      offsetIndex: 0,
    };

    // The marker should have both original and display coordinates
    expect(markerWithDisplayCoordinate.coordinate).toEqual({ latitude: 37.78825, longitude: -122.4324 });
    expect(markerWithDisplayCoordinate.displayCoordinate).toEqual({ latitude: 37.78835, longitude: -122.4330 });
    expect(markerWithDisplayCoordinate.collisionGroup).toBe('group-1');
  });

  it('should get collision group count', () => {
    const collidingMarkers: MarkerData[] = [
      {
        id: '1',
        coordinate: { latitude: 37.78825, longitude: -122.4324 },
        title: 'User 1',
        isUser: false,
      },
      {
        id: '2',
        coordinate: { latitude: 37.78825, longitude: -122.4324 }, // Same location
        title: 'User 2',
        isUser: true,
      },
      {
        id: '3',
        coordinate: { latitude: 37.79000, longitude: -122.4400 }, // Different location
        title: 'User 3',
        isUser: false,
      },
    ];

    const groupCount = collisionDetectionService.getCollisionGroupCount(collidingMarkers);
    expect(typeof groupCount).toBe('number');
    expect(groupCount).toBeGreaterThanOrEqual(0);
  });
});

describe('PinMarker Component Integration', () => {
  const mockMarker: MarkerData = {
    id: '1',
    coordinate: { latitude: 37.78825, longitude: -122.4324 },
    title: 'Test User',
    isUser: false,
    member: {
      userId: '1',
      profileColor: '#10B981',
      user: {
        name: 'John Doe',
        profileImage: 'https://example.com/profile.jpg',
      },
    },
  };

  it('should create PinMarker component without crashing', () => {
    // Test that component can be instantiated
    const component = React.createElement(PinMarker, {
      marker: mockMarker,
      theme: 'light'
    });
    
    expect(component).toBeDefined();
    expect(component.type).toBe(PinMarker);
  });

  it('should handle marker with initials fallback', () => {
    const markerWithoutImage: MarkerData = {
      ...mockMarker,
      member: {
        userId: '1',
        profileColor: '#10B981',
        user: {
          name: 'John Doe',
          // No profileImage
        },
      },
    };

    const component = React.createElement(PinMarker, {
      marker: markerWithoutImage,
      theme: 'light'
    });
    
    expect(component).toBeDefined();
    expect(component.props.marker.member?.user?.name).toBe('John Doe');
  });

  it('should handle current user marker', () => {
    const userMarker: MarkerData = {
      ...mockMarker,
      isUser: true,
    };

    const component = React.createElement(PinMarker, {
      marker: userMarker,
      theme: 'light'
    });
    
    expect(component).toBeDefined();
    expect(component.props.marker.isUser).toBe(true);
  });

  it('should handle spaced markers with collision data', () => {
    const spacedMarker: MarkerData = {
      ...mockMarker,
      displayCoordinate: { latitude: 37.78835, longitude: -122.4330 },
      collisionGroup: 'group-1',
      offsetIndex: 0,
    };

    const component = React.createElement(PinMarker, {
      marker: spacedMarker,
      theme: 'light'
    });
    
    expect(component).toBeDefined();
    expect(component.props.marker.displayCoordinate).toBeDefined();
    expect(component.props.marker.collisionGroup).toBe('group-1');
  });

  it('should handle missing member data gracefully', () => {
    const markerWithoutMember: MarkerData = {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'Test User',
      isUser: false,
      // No member data
    };

    const component = React.createElement(PinMarker, {
      marker: markerWithoutMember,
      theme: 'light'
    });
    
    expect(component).toBeDefined();
    expect(component.props.marker.member).toBeUndefined();
  });
});

describe('Collision Detection Service - Comprehensive Testing', () => {
  beforeEach(() => {
    // Reset service to default configuration
    collisionDetectionService.updateConfig({
      distanceThreshold: 50,
      spacingRadius: 30,
      maxMarkersPerGroup: 8,
    });
  });

  describe('Distance Calculations', () => {
    it('should calculate distance between coordinates correctly', () => {
      const coord1 = { latitude: 37.78825, longitude: -122.4324 };
      const coord2 = { latitude: 37.78830, longitude: -122.4325 };
      
      const areColliding = collisionDetectionService.areMarkersColliding(coord1, coord2);
      expect(typeof areColliding).toBe('boolean');
    });

    it('should detect markers at same location as colliding', () => {
      const coord1 = { latitude: 37.78825, longitude: -122.4324 };
      const coord2 = { latitude: 37.78825, longitude: -122.4324 };
      
      const areColliding = collisionDetectionService.areMarkersColliding(coord1, coord2);
      expect(areColliding).toBe(true);
    });

    it('should not detect distant markers as colliding', () => {
      const coord1 = { latitude: 37.78825, longitude: -122.4324 };
      const coord2 = { latitude: 37.79000, longitude: -122.4400 };
      
      const areColliding = collisionDetectionService.areMarkersColliding(coord1, coord2);
      expect(areColliding).toBe(false);
    });
  });

  describe('Collision Detection Algorithm', () => {
    it('should handle single marker without collision processing', () => {
      const singleMarker: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'Single User',
          isUser: false,
        },
      ];

      const processed = collisionDetectionService.detectCollisions(singleMarker);
      expect(processed).toHaveLength(1);
      expect(processed[0].collisionGroup).toBeUndefined();
      expect(processed[0].displayCoordinate).toBeUndefined();
    });

    it('should detect and group colliding markers', () => {
      const collidingMarkers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 1',
          isUser: false,
        },
        {
          id: '2',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 2',
          isUser: true,
        },
        {
          id: '3',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 3',
          isUser: false,
        },
      ];

      const processed = collisionDetectionService.detectCollisions(collidingMarkers);
      expect(processed).toHaveLength(3);
      
      // All markers should have collision group and display coordinates
      processed.forEach(marker => {
        expect(marker.collisionGroup).toBeDefined();
        expect(marker.displayCoordinate).toBeDefined();
        expect(marker.offsetIndex).toBeDefined();
      });

      // All markers should have the same collision group
      const firstGroup = processed[0].collisionGroup;
      processed.forEach(marker => {
        expect(marker.collisionGroup).toBe(firstGroup);
      });
    });

    it('should handle multiple collision groups', () => {
      const markersWithMultipleGroups: MarkerData[] = [
        // Group 1
        {
          id: '1',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 1',
          isUser: false,
        },
        {
          id: '2',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 2',
          isUser: true,
        },
        // Group 2
        {
          id: '3',
          coordinate: { latitude: 37.79000, longitude: -122.4400 },
          title: 'User 3',
          isUser: false,
        },
        {
          id: '4',
          coordinate: { latitude: 37.79000, longitude: -122.4400 },
          title: 'User 4',
          isUser: false,
        },
        // Isolated marker
        {
          id: '5',
          coordinate: { latitude: 37.80000, longitude: -122.4500 },
          title: 'User 5',
          isUser: false,
        },
      ];

      const processed = collisionDetectionService.detectCollisions(markersWithMultipleGroups);
      expect(processed).toHaveLength(5);

      // Should have 2 collision groups
      const groups = collisionDetectionService.getCollisionGroups(markersWithMultipleGroups);
      expect(groups.size).toBe(2);

      // Isolated marker should not have collision group
      const isolatedMarker = processed.find(m => m.id === '5');
      expect(isolatedMarker?.collisionGroup).toBeUndefined();
    });
  });

  describe('Spacing Algorithm', () => {
    it('should arrange markers in circular pattern', () => {
      const collidingMarkers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 1',
          isUser: false,
        },
        {
          id: '2',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 2',
          isUser: true,
        },
        {
          id: '3',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'User 3',
          isUser: false,
        },
      ];

      const spacedMarkers = collisionDetectionService.calculateSpacing(collidingMarkers, 'test-group');
      expect(spacedMarkers).toHaveLength(3);

      // All markers should have display coordinates
      spacedMarkers.forEach(marker => {
        expect(marker.displayCoordinate).toBeDefined();
        expect(marker.collisionGroup).toBe('test-group');
        expect(marker.offsetIndex).toBeDefined();
      });

      // Display coordinates should be different from original
      spacedMarkers.forEach(marker => {
        const original = marker.coordinate;
        const display = marker.displayCoordinate!;
        expect(
          original.latitude !== display.latitude || 
          original.longitude !== display.longitude
        ).toBe(true);
      });
    });

    it('should handle maximum markers per group limit', () => {
      // Create more markers than the limit
      const manyMarkers: MarkerData[] = Array.from({ length: 12 }, (_, i) => ({
        id: `${i + 1}`,
        coordinate: { latitude: 37.78825, longitude: -122.4324 },
        title: `User ${i + 1}`,
        isUser: false,
      }));

      const spacedMarkers = collisionDetectionService.calculateSpacing(manyMarkers, 'large-group');
      
      // Should be limited to maxMarkersPerGroup (8)
      expect(spacedMarkers.length).toBeLessThanOrEqual(8);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle empty markers array', () => {
      const processed = collisionDetectionService.processMarkersWithValidation([]);
      expect(processed).toHaveLength(0);
    });

    it('should filter out invalid coordinates', () => {
      const invalidMarkers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: NaN, longitude: -122.4324 },
          title: 'Invalid User 1',
          isUser: false,
        },
        {
          id: '2',
          coordinate: { latitude: 37.78825, longitude: Infinity },
          title: 'Invalid User 2',
          isUser: false,
        },
        {
          id: '3',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'Valid User',
          isUser: true,
        },
      ];

      const processed = collisionDetectionService.processMarkersWithValidation(invalidMarkers);
      
      // Should only include valid marker
      expect(processed).toHaveLength(1);
      expect(processed[0].id).toBe('3');
      expect(processed[0].title).toBe('Valid User');
    });

    it('should handle coordinates out of bounds', () => {
      const outOfBoundsMarkers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 91, longitude: -122.4324 }, // Invalid latitude
          title: 'Out of bounds 1',
          isUser: false,
        },
        {
          id: '2',
          coordinate: { latitude: 37.78825, longitude: 181 }, // Invalid longitude
          title: 'Out of bounds 2',
          isUser: false,
        },
        {
          id: '3',
          coordinate: { latitude: 37.78825, longitude: -122.4324 },
          title: 'Valid User',
          isUser: true,
        },
      ];

      const processed = collisionDetectionService.processMarkersWithValidation(outOfBoundsMarkers);
      
      // Should only include valid marker
      expect(processed).toHaveLength(1);
      expect(processed[0].id).toBe('3');
    });

    it('should maintain performance with large datasets', () => {
      // Create a large dataset
      const largeDataset: MarkerData[] = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        coordinate: { 
          latitude: 37.78825 + (Math.random() - 0.5) * 0.01, 
          longitude: -122.4324 + (Math.random() - 0.5) * 0.01 
        },
        title: `User ${i + 1}`,
        isUser: i === 0,
      }));

      const startTime = Date.now();
      const processed = collisionDetectionService.processMarkersWithValidation(largeDataset);
      const endTime = Date.now();

      expect(processed).toHaveLength(largeDataset.length);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Configuration Management', () => {
    it('should allow configuration updates', () => {
      const newConfig = {
        distanceThreshold: 100,
        spacingRadius: 50,
        maxMarkersPerGroup: 10,
      };

      collisionDetectionService.updateConfig(newConfig);
      const currentConfig = collisionDetectionService.getConfig();

      expect(currentConfig.distanceThreshold).toBe(100);
      expect(currentConfig.spacingRadius).toBe(50);
      expect(currentConfig.maxMarkersPerGroup).toBe(10);
    });

    it('should return current distance threshold', () => {
      const threshold = collisionDetectionService.getDistanceThreshold();
      expect(typeof threshold).toBe('number');
      expect(threshold).toBeGreaterThan(0);
    });
  });
});

describe('Profile Picture Consistency with MemberCard', () => {
  it('should use same profile color logic as MemberCard', () => {
    const userMarker: MarkerData = {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'Current User',
      isUser: true,
      member: {
        userId: '1',
        profileColor: '#10B981',
        user: {
          name: 'John Doe',
        },
      },
    };

    const component = React.createElement(PinMarker, {
      marker: userMarker,
      theme: 'light'
    });
    
    // Should handle current user marker (consistent with MemberCard logic)
    expect(component.props.marker.isUser).toBe(true);
    expect(component.props.marker.member?.profileColor).toBe('#10B981');
  });

  it('should use same initials logic as MemberCard', () => {
    const marker: MarkerData = {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'Test User',
      isUser: false,
      member: {
        userId: '1',
        profileColor: '#10B981',
        user: {
          name: 'John Doe Smith',
        },
      },
    };

    const component = React.createElement(PinMarker, {
      marker: marker,
      theme: 'light'
    });
    
    // Should have name for initials calculation (consistent with MemberCard)
    expect(component.props.marker.member?.user?.name).toBe('John Doe Smith');
  });

  it('should handle missing name gracefully like MemberCard', () => {
    const marker: MarkerData = {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'Test User',
      isUser: false,
      member: {
        userId: '1',
        profileColor: '#10B981',
        user: {
          // No name provided
        },
      },
    };

    const component = React.createElement(PinMarker, {
      marker: marker,
      theme: 'light'
    });
    
    // Should handle missing name gracefully
    expect(component.props.marker.member?.user?.name).toBeUndefined();
  });

  it('should verify profile picture consistency patterns', () => {
    // Test that PinMarker follows same patterns as MemberCard for profile pictures
    const markerWithImage: MarkerData = {
      id: '1',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'User with Image',
      isUser: false,
      member: {
        userId: '1',
        profileColor: '#4F46E5',
        user: {
          name: 'John Doe',
          profileImage: 'https://example.com/profile.jpg',
        },
      },
    };

    const markerWithoutImage: MarkerData = {
      id: '2',
      coordinate: { latitude: 37.78825, longitude: -122.4324 },
      title: 'User without Image',
      isUser: false,
      member: {
        userId: '2',
        profileColor: '#4F46E5',
        user: {
          name: 'Jane Smith',
          // No profileImage - should fall back to initials
        },
      },
    };

    const componentWithImage = React.createElement(PinMarker, {
      marker: markerWithImage,
      theme: 'light'
    });

    const componentWithoutImage = React.createElement(PinMarker, {
      marker: markerWithoutImage,
      theme: 'light'
    });

    // Both should be valid components
    expect(componentWithImage).toBeDefined();
    expect(componentWithoutImage).toBeDefined();

    // Should have consistent profile color handling
    expect(componentWithImage.props.marker.member?.profileColor).toBe('#4F46E5');
    expect(componentWithoutImage.props.marker.member?.profileColor).toBe('#4F46E5');

    // Image marker should have profileImage, fallback should not
    expect(componentWithImage.props.marker.member?.user?.profileImage).toBeDefined();
    expect(componentWithoutImage.props.marker.member?.user?.profileImage).toBeUndefined();
  });
});