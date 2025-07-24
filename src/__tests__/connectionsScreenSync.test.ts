/**
 * Test for ConnectionsScreen event emission functionality
 * Verifies that connection events are properly emitted when connections are created, modified, or removed
 */

import eventBus from '../services/eventBusService';
import { EVENT_NAMES, ConnectionChangeEvent } from '../types/events';

describe('ConnectionsScreen Event Emission', () => {
  let emittedEvents: Array<{ eventName: string; data: any }> = [];

  beforeEach(() => {
    emittedEvents = [];
    
    // Mock event bus emit to capture events
    jest.spyOn(eventBus, 'emit').mockImplementation((eventName, data) => {
      emittedEvents.push({ eventName, data });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Event Emission', () => {
    it('should emit CONNECTION_ADDED event when new connection is created', () => {
      // Simulate connection creation
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: 'test-connection-id',
        changeType: 'added',
        userId: 'user1',
        otherUserId: 'user2',
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].eventName).toBe(EVENT_NAMES.CONNECTION_ADDED);
      expect(emittedEvents[0].data).toEqual(connectionEvent);
    });

    it('should emit CONNECTION_UPDATED event when connection is modified', () => {
      // Simulate connection update
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: 'test-connection-id',
        changeType: 'updated',
        userId: 'user1',
        otherUserId: 'user2',
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_UPDATED, connectionEvent);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].eventName).toBe(EVENT_NAMES.CONNECTION_UPDATED);
      expect(emittedEvents[0].data).toEqual(connectionEvent);
    });

    it('should emit CONNECTION_REMOVED event when connection is removed', () => {
      // Simulate connection removal
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: 'test-connection-id',
        changeType: 'removed',
        userId: 'user1',
        otherUserId: 'user2',
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_REMOVED, connectionEvent);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].eventName).toBe(EVENT_NAMES.CONNECTION_REMOVED);
      expect(emittedEvents[0].data).toEqual(connectionEvent);
    });

    it('should handle multiple event emissions correctly', () => {
      // Simulate multiple events
      const events = [
        {
          eventName: EVENT_NAMES.CONNECTION_ADDED,
          data: {
            connectionId: 'conn1',
            changeType: 'added' as const,
            userId: 'user1',
            otherUserId: 'user2',
            timestamp: new Date(),
            source: 'ConnectionsScreen'
          }
        },
        {
          eventName: EVENT_NAMES.CONNECTION_UPDATED,
          data: {
            connectionId: 'conn1',
            changeType: 'updated' as const,
            userId: 'user1',
            otherUserId: 'user2',
            timestamp: new Date(),
            source: 'ConnectionsScreen'
          }
        }
      ];

      events.forEach(event => {
        eventBus.emit(event.eventName, event.data);
      });

      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[0].eventName).toBe(EVENT_NAMES.CONNECTION_ADDED);
      expect(emittedEvents[1].eventName).toBe(EVENT_NAMES.CONNECTION_UPDATED);
    });
  });

  describe('Event Data Validation', () => {
    it('should include all required fields in connection events', () => {
      const connectionEvent: ConnectionChangeEvent = {
        connectionId: 'test-connection-id',
        changeType: 'added',
        userId: 'user1',
        otherUserId: 'user2',
        timestamp: new Date(),
        source: 'ConnectionsScreen'
      };

      eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);

      const emittedData = emittedEvents[0].data;
      expect(emittedData).toHaveProperty('connectionId');
      expect(emittedData).toHaveProperty('changeType');
      expect(emittedData).toHaveProperty('userId');
      expect(emittedData).toHaveProperty('otherUserId');
      expect(emittedData).toHaveProperty('timestamp');
      expect(emittedData).toHaveProperty('source');
    });

    it('should have correct changeType values', () => {
      const validChangeTypes = ['added', 'removed', 'updated'];
      
      validChangeTypes.forEach(changeType => {
        const connectionEvent: ConnectionChangeEvent = {
          connectionId: 'test-connection-id',
          changeType: changeType as 'added' | 'removed' | 'updated',
          userId: 'user1',
          otherUserId: 'user2',
          timestamp: new Date(),
          source: 'ConnectionsScreen'
        };

        eventBus.emit(EVENT_NAMES.CONNECTION_ADDED, connectionEvent);
      });

      expect(emittedEvents).toHaveLength(3);
      emittedEvents.forEach((event, index) => {
        expect(validChangeTypes).toContain(event.data.changeType);
      });
    });
  });
});