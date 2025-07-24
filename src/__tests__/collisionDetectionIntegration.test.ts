import { CollisionDetectionService } from '../services/collisionDetectionService';
import { MarkerData } from '../components/CircleMap';

describe('Collision Detection Service Integration', () => {
  let service: CollisionDetectionService;

  beforeEach(() => {
    service = new CollisionDetectionService();
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical family circle scenario', () => {
      // Simulate a family at home with slightly different GPS readings
      const familyMarkers: MarkerData[] = [
        {
          id: 'dad',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'Dad',
          isUser: true,
          member: {
            userId: 'dad',
            profileColor: '#4F46E5',
            user: { name: 'John Doe', profileImage: 'https://example.com/dad.jpg' }
          }
        },
        {
          id: 'mom',
          coordinate: { latitude: 40.7128, longitude: -74.0060 }, // Exact same location
          title: 'Mom',
          member: {
            userId: 'mom',
            profileColor: '#10B981',
            user: { name: 'Jane Doe', profileImage: 'https://example.com/mom.jpg' }
          }
        },
        {
          id: 'kid1',
          coordinate: { latitude: 40.7129, longitude: -74.0061 }, // Slightly different
          title: 'Kid 1',
          member: {
            userId: 'kid1',
            profileColor: '#F59E0B',
            user: { name: 'Alice Doe' }
          }
        },
        {
          id: 'kid2',
          coordinate: { latitude: 40.7127, longitude: -74.0059 }, // Slightly different
          title: 'Kid 2',
          member: {
            userId: 'kid2',
            profileColor: '#EF4444',
            user: { name: 'Bob Doe' }
          }
        }
      ];

      const result = service.getDisplayMarkers(familyMarkers);

      // All markers should be processed
      expect(result).toHaveLength(4);

      // All should be in the same collision group since they're close
      const collisionGroups = service.getCollisionGroups(familyMarkers);
      expect(collisionGroups.size).toBe(1);

      // All markers should have adjusted coordinates
      result.forEach(marker => {
        expect(marker.coordinate).toBeDefined();
        // The display coordinates should be different from at least some original coordinates
      });

      // User marker should still be identifiable
      const userMarker = result.find(m => m.isUser);
      expect(userMarker).toBeDefined();
      expect(userMarker!.isUser).toBe(true);
    });

    it('should handle multiple separate groups', () => {
      const markers: MarkerData[] = [
        // Group 1: Office location
        {
          id: 'emp1',
          coordinate: { latitude: 40.7589, longitude: -73.9851 },
          title: 'Employee 1',
          member: { userId: 'emp1', user: { name: 'Alice' } }
        },
        {
          id: 'emp2',
          coordinate: { latitude: 40.7590, longitude: -73.9852 },
          title: 'Employee 2',
          member: { userId: 'emp2', user: { name: 'Bob' } }
        },
        // Group 2: Coffee shop
        {
          id: 'friend1',
          coordinate: { latitude: 40.7505, longitude: -73.9934 },
          title: 'Friend 1',
          member: { userId: 'friend1', user: { name: 'Charlie' } }
        },
        {
          id: 'friend2',
          coordinate: { latitude: 40.7506, longitude: -73.9935 },
          title: 'Friend 2',
          member: { userId: 'friend2', user: { name: 'Diana' } }
        },
        // Isolated marker
        {
          id: 'solo',
          coordinate: { latitude: 40.7831, longitude: -73.9712 },
          title: 'Solo Person',
          member: { userId: 'solo', user: { name: 'Eve' } }
        }
      ];

      const result = service.getDisplayMarkers(markers);
      const collisionGroups = service.getCollisionGroups(markers);

      expect(result).toHaveLength(5);
      expect(collisionGroups.size).toBe(2); // Two collision groups

      // Check that isolated marker is not in a collision group
      expect(service.isMarkerInCollisionGroup('solo', markers)).toBe(false);

      // Check that grouped markers are in collision groups
      expect(service.isMarkerInCollisionGroup('emp1', markers)).toBe(true);
      expect(service.isMarkerInCollisionGroup('friend1', markers)).toBe(true);
    });

    it('should maintain marker properties during processing', () => {
      const originalMarkers: MarkerData[] = [
        {
          id: 'user1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'User One',
          isUser: true,
          member: {
            userId: 'user1',
            profileColor: '#4F46E5',
            user: {
              name: 'John Smith',
              profileImage: 'https://example.com/john.jpg'
            }
          }
        },
        {
          id: 'user2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'User Two',
          member: {
            userId: 'user2',
            profileColor: '#10B981',
            user: {
              name: 'Jane Smith'
            }
          }
        }
      ];

      const result = service.getDisplayMarkers(originalMarkers);

      // Check that all original properties are preserved
      result.forEach((processedMarker, index) => {
        const original = originalMarkers[index];
        
        expect(processedMarker.id).toBe(original.id);
        expect(processedMarker.title).toBe(original.title);
        expect(processedMarker.isUser).toBe(original.isUser);
        expect(processedMarker.member).toEqual(original.member);
      });
    });

    it('should handle performance with many markers', () => {
      // Create 50 markers in a small area to test performance
      const manyMarkers: MarkerData[] = Array.from({ length: 50 }, (_, i) => ({
        id: `marker-${i}`,
        coordinate: {
          latitude: 40.7128 + (Math.random() - 0.5) * 0.001, // Small random offset
          longitude: -74.0060 + (Math.random() - 0.5) * 0.001
        },
        title: `Marker ${i}`,
        member: {
          userId: `user-${i}`,
          user: { name: `User ${i}` }
        }
      }));

      const startTime = Date.now();
      const result = service.getDisplayMarkers(manyMarkers);
      const endTime = Date.now();

      // Should complete within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
      
      // Should return all markers
      expect(result).toHaveLength(50);
      
      // Should have created collision groups
      const groupCount = service.getCollisionGroupCount(manyMarkers);
      expect(groupCount).toBeGreaterThan(0);
    });
  });

  describe('Requirements Verification', () => {
    it('should satisfy requirement 2.1: detect collisions and space appropriately', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'User 1',
          member: { userId: '1', user: { name: 'John' } }
        },
        {
          id: '2',
          coordinate: { latitude: 40.7128, longitude: -74.0060 }, // Same location
          title: 'User 2',
          member: { userId: '2', user: { name: 'Jane' } }
        }
      ];

      const result = service.getDisplayMarkers(markers);
      
      // Should detect collision
      expect(service.getCollisionGroupCount(markers)).toBe(1);
      
      // Should space markers appropriately
      expect(result[0].coordinate).not.toEqual(result[1].coordinate);
    });

    it('should satisfy requirement 2.2: ensure markers remain visible and clickable', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'User 1',
          member: { userId: '1', user: { name: 'John' } }
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'User 2',
          member: { userId: '2', user: { name: 'Jane' } }
        }
      ];

      const result = service.getDisplayMarkers(markers);
      
      // All markers should be present (visible)
      expect(result).toHaveLength(2);
      
      // All markers should have valid coordinates (clickable)
      result.forEach(marker => {
        expect(marker.coordinate.latitude).toBeGreaterThan(-90);
        expect(marker.coordinate.latitude).toBeLessThan(90);
        expect(marker.coordinate.longitude).toBeGreaterThan(-180);
        expect(marker.coordinate.longitude).toBeLessThan(180);
      });
    });

    it('should satisfy requirement 2.4: remove spacing when users move apart', () => {
      const closeMarkers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'User 1',
          member: { userId: '1', user: { name: 'John' } }
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 }, // Close
          title: 'User 2',
          member: { userId: '2', user: { name: 'Jane' } }
        }
      ];

      const apartMarkers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'User 1',
          member: { userId: '1', user: { name: 'John' } }
        },
        {
          id: '2',
          coordinate: { latitude: 41.7128, longitude: -75.0060 }, // Far apart
          title: 'User 2',
          member: { userId: '2', user: { name: 'Jane' } }
        }
      ];

      const closeResult = service.getDisplayMarkers(closeMarkers);
      const apartResult = service.getDisplayMarkers(apartMarkers);

      // When close, should have collision groups
      expect(service.getCollisionGroupCount(closeMarkers)).toBe(1);
      
      // When apart, should have no collision groups
      expect(service.getCollisionGroupCount(apartMarkers)).toBe(0);
      
      // When apart, coordinates should match original coordinates
      expect(apartResult[0].coordinate).toEqual(apartMarkers[0].coordinate);
      expect(apartResult[1].coordinate).toEqual(apartMarkers[1].coordinate);
    });

    it('should satisfy requirement 2.5: arrange markers to show same general location', () => {
      const markers: MarkerData[] = [
        {
          id: '1',
          coordinate: { latitude: 40.7128, longitude: -74.0060 },
          title: 'User 1',
          member: { userId: '1', user: { name: 'John' } }
        },
        {
          id: '2',
          coordinate: { latitude: 40.7129, longitude: -74.0061 },
          title: 'User 2',
          member: { userId: '2', user: { name: 'Jane' } }
        },
        {
          id: '3',
          coordinate: { latitude: 40.7127, longitude: -74.0059 },
          title: 'User 3',
          member: { userId: '3', user: { name: 'Bob' } }
        }
      ];

      const result = service.getDisplayMarkers(markers);
      
      // Calculate center of original coordinates
      const originalCenterLat = markers.reduce((sum, m) => sum + m.coordinate.latitude, 0) / markers.length;
      const originalCenterLon = markers.reduce((sum, m) => sum + m.coordinate.longitude, 0) / markers.length;
      
      // Calculate center of display coordinates
      const displayCenterLat = result.reduce((sum, m) => sum + m.coordinate.latitude, 0) / result.length;
      const displayCenterLon = result.reduce((sum, m) => sum + m.coordinate.longitude, 0) / result.length;
      
      // Centers should be very close (within small tolerance)
      expect(Math.abs(originalCenterLat - displayCenterLat)).toBeLessThan(0.001);
      expect(Math.abs(originalCenterLon - displayCenterLon)).toBeLessThan(0.001);
    });
  });
});