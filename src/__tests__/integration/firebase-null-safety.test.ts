import { 
  subscribeToCircleMembers, 
  getCirclesForUser, 
  getPrivateConnectionsForUser,
  sanitizeFirebaseDocument,
  getSafeArray 
} from '../../firebase/services';
import { DataSanitizer } from '../../utils/dataSanitizer';

// Mock Firebase to simulate incomplete data scenarios
jest.mock('../../firebase/firebase', () => ({
  getFirebaseDb: jest.fn(() => ({
    collection: jest.fn(),
    doc: jest.fn(),
  })),
  getFirebaseAuth: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
}));

describe('Firebase Services Null Safety Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('subscribeToCircleMembers with incomplete data', () => {
    it('should handle null members array gracefully', () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();

      // Mock onSnapshot to return incomplete data
      const { onSnapshot } = require('firebase/firestore');
      onSnapshot.mockImplementation((query: any, callback: any) => {
        // Simulate Firebase returning a document without members array
        const mockSnapshot = {
          docs: [
            {
              id: 'circle1',
              data: () => ({
                name: 'Test Circle',
                // members array is missing (undefined)
              })
            }
          ]
        };
        callback(mockSnapshot);
        return mockUnsubscribe;
      });

      // This should not throw an error
      expect(() => {
        subscribeToCircleMembers('circle1', mockCallback);
      }).not.toThrow();

      // Callback should be called with empty array instead of undefined
      expect(mockCallback).toHaveBeenCalledWith([]);
    });

    it('should handle malformed member objects', () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();

      const { onSnapshot } = require('firebase/firestore');
      onSnapshot.mockImplementation((query: any, callback: any) => {
        const mockSnapshot = {
          docs: [
            {
              id: 'circle1',
              data: () => ({
                name: 'Test Circle',
                members: [
                  { userId: 'user1', user: { name: 'John' } }, // Valid member
                  { userId: null }, // Invalid member - missing user data
                  null, // Completely null member
                  { user: { name: 'Jane' } }, // Missing userId
                ]
              })
            }
          ]
        };
        callback(mockSnapshot);
        return mockUnsubscribe;
      });

      subscribeToCircleMembers('circle1', mockCallback);

      // Should filter out invalid members and only return valid ones
      expect(mockCallback).toHaveBeenCalledWith([
        { userId: 'user1', user: { name: 'John' } }
      ]);
    });
  });

  describe('getCirclesForUser with incomplete data', () => {
    it('should handle missing circle data gracefully', async () => {
      const { getDocs } = require('firebase/firestore');
      
      getDocs.mockResolvedValue({
        docs: [
          {
            id: 'circle1',
            data: () => ({
              name: 'Complete Circle',
              memberCount: 5,
              createdAt: new Date(),
            })
          },
          {
            id: 'circle2',
            data: () => ({
              // Missing name and other required fields
              memberCount: null,
            })
          },
          {
            id: 'circle3',
            data: () => null // Completely null data
          }
        ]
      });

      const circles = await getCirclesForUser('user1');

      // Should return only valid circles with safe defaults
      expect(circles).toHaveLength(2);
      expect(circles[0]).toEqual(expect.objectContaining({
        id: 'circle1',
        name: 'Complete Circle',
        memberCount: 5,
      }));
      expect(circles[1]).toEqual(expect.objectContaining({
        id: 'circle2',
        name: '', // Safe default
        memberCount: 0, // Safe default
      }));
    });
  });

  describe('getPrivateConnectionsForUser with incomplete data', () => {
    it('should handle missing connection data', async () => {
      const { getDocs } = require('firebase/firestore');
      
      getDocs.mockResolvedValue({
        docs: [
          {
            id: 'conn1',
            data: () => ({
              userA: 'user1',
              userB: 'user2',
              status: 'active',
            })
          },
          {
            id: 'conn2',
            data: () => ({
              userA: 'user1',
              // Missing userB
              status: 'active',
            })
          },
          {
            id: 'conn3',
            data: () => null // Null data
          }
        ]
      });

      const connections = await getPrivateConnectionsForUser('user1');

      // Should filter out invalid connections
      expect(connections).toHaveLength(1);
      expect(connections[0]).toEqual(expect.objectContaining({
        id: 'conn1',
        userA: 'user1',
        userB: 'user2',
        status: 'active',
      }));
    });
  });

  describe('DataSanitizer integration', () => {
    it('should sanitize Firebase documents with missing arrays', () => {
      const incompleteDocument = {
        id: 'test',
        name: 'Test Document',
        // members array is missing
        settings: {
          notifications: true,
          // alerts array is missing
        }
      };

      const sanitized = DataSanitizer.sanitizeFirebaseDocument(incompleteDocument);

      expect(sanitized).toEqual({
        id: 'test',
        name: 'Test Document',
        settings: {
          notifications: true,
        }
      });
    });

    it('should handle deeply nested null values', () => {
      const documentWithNulls = {
        user: {
          profile: {
            name: 'John',
            connections: null, // Null array
            settings: {
              alerts: undefined, // Undefined array
              preferences: [null, 'pref1', undefined, 'pref2'], // Mixed array
            }
          }
        }
      };

      const sanitized = DataSanitizer.sanitizeFirebaseDocument(documentWithNulls);

      expect(sanitized.user?.profile?.connections).toEqual([]);
      expect(sanitized.user?.profile?.settings?.preferences).toEqual(['pref1', 'pref2']);
    });
  });

  describe('getSafeArray utility', () => {
    it('should return empty array for null input', () => {
      expect(DataSanitizer.getSafeArray(null)).toEqual([]);
      expect(DataSanitizer.getSafeArray(undefined)).toEqual([]);
    });

    it('should return original array for valid input', () => {
      const validArray = [1, 2, 3];
      expect(DataSanitizer.getSafeArray(validArray)).toBe(validArray);
    });

    it('should convert single item to array', () => {
      const singleItem = { id: 1, name: 'test' };
      expect(DataSanitizer.getSafeArray(singleItem)).toEqual([singleItem]);
    });

    it('should handle primitive values gracefully', () => {
      expect(DataSanitizer.getSafeArray('string')).toEqual([]);
      expect(DataSanitizer.getSafeArray(123)).toEqual([]);
      expect(DataSanitizer.getSafeArray(true)).toEqual([]);
    });
  });

  describe('Real-world Firebase data scenarios', () => {
    it('should handle Firestore snapshot with missing docs array', () => {
      const mockSnapshot = {
        // docs array is missing
        empty: false,
        size: 0,
      };

      // This should not crash when processing
      const safeDocs = DataSanitizer.getSafeArray(mockSnapshot.docs);
      expect(safeDocs).toEqual([]);
    });

    it('should handle user location data with missing fields', () => {
      const incompleteLocationData = {
        latitude: 40.7128,
        longitude: -74.0060,
        // timestamp is missing
        // batteryLevel is missing
        // address is missing
      };

      const sanitized = DataSanitizer.sanitizeLocationData(incompleteLocationData);

      expect(sanitized).toEqual({
        latitude: 40.7128,
        longitude: -74.0060,
      });
    });

    it('should reject invalid location coordinates', () => {
      const invalidLocationData = {
        latitude: 'invalid',
        longitude: null,
        address: 'New York',
      };

      const sanitized = DataSanitizer.sanitizeLocationData(invalidLocationData);
      expect(sanitized).toBeNull();
    });
  });
});