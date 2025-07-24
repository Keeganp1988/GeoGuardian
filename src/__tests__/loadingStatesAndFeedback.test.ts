/**
 * Tests for Loading States and User Feedback Components
 * Task 8: Add Loading States and User Feedback
 */

import eventBus from '../services/eventBusService';
import { EVENT_NAMES, LoadingStateEvent, SuccessEvent, ErrorEvent } from '../types/events';

describe('Loading States and User Feedback', () => {
  beforeEach(() => {
    // Clear all event listeners before each test
    eventBus.removeAllListenersForAllEvents();
  });

  afterEach(() => {
    // Clean up after each test
    eventBus.removeAllListenersForAllEvents();
  });

  describe('Loading State Events', () => {
    it('should emit loading state events correctly', (done) => {
      const mockLoadingEvent: LoadingStateEvent = {
        isLoading: true,
        operation: 'sync',
        message: 'Syncing data...',
        timestamp: new Date(),
        source: 'TestSource'
      };

      eventBus.on<LoadingStateEvent>(EVENT_NAMES.LOADING_STATE_CHANGED, (event) => {
        expect(event.isLoading).toBe(true);
        expect(event.operation).toBe('sync');
        expect(event.message).toBe('Syncing data...');
        expect(event.source).toBe('TestSource');
        done();
      });

      eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, mockLoadingEvent);
    });

    it('should handle loading state changes for different operations', (done) => {
      const operations: LoadingStateEvent['operation'][] = ['sync', 'connection_create', 'connection_join', 'connection_update'];
      let receivedEvents = 0;

      eventBus.on<LoadingStateEvent>(EVENT_NAMES.LOADING_STATE_CHANGED, (event) => {
        expect(operations).toContain(event.operation);
        receivedEvents++;
        
        if (receivedEvents === operations.length) {
          done();
        }
      });

      operations.forEach(operation => {
        eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
          isLoading: true,
          operation,
          timestamp: new Date(),
          source: 'TestSource'
        });
      });
    });
  });

  describe('Success Events', () => {
    it('should emit success events correctly', (done) => {
      const mockSuccessEvent: SuccessEvent = {
        operation: 'connection_added',
        message: 'Connection created successfully!',
        contactName: 'John Doe',
        timestamp: new Date(),
        source: 'TestSource'
      };

      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        expect(event.operation).toBe('connection_added');
        expect(event.message).toBe('Connection created successfully!');
        expect(event.contactName).toBe('John Doe');
        expect(event.source).toBe('TestSource');
        done();
      });

      eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, mockSuccessEvent);
    });

    it('should handle different success operations', (done) => {
      const operations: SuccessEvent['operation'][] = ['connection_added', 'connection_updated', 'sync_completed'];
      let receivedEvents = 0;

      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        expect(operations).toContain(event.operation);
        receivedEvents++;
        
        if (receivedEvents === operations.length) {
          done();
        }
      });

      operations.forEach(operation => {
        eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
          operation,
          message: `${operation} completed successfully`,
          timestamp: new Date(),
          source: 'TestSource'
        });
      });
    });
  });

  describe('Error Events', () => {
    it('should emit error events correctly', (done) => {
      const mockErrorEvent: ErrorEvent = {
        operation: 'sync',
        error: 'Network connection failed',
        retryable: true,
        timestamp: new Date(),
        source: 'TestSource'
      };

      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        expect(event.operation).toBe('sync');
        expect(event.error).toBe('Network connection failed');
        expect(event.retryable).toBe(true);
        expect(event.source).toBe('TestSource');
        done();
      });

      eventBus.emit(EVENT_NAMES.ERROR_EVENT, mockErrorEvent);
    });

    it('should handle different error operations', (done) => {
      const operations: ErrorEvent['operation'][] = ['sync', 'connection_create', 'connection_join', 'connection_update'];
      let receivedEvents = 0;

      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        expect(operations).toContain(event.operation);
        expect(typeof event.retryable).toBe('boolean');
        receivedEvents++;
        
        if (receivedEvents === operations.length) {
          done();
        }
      });

      operations.forEach((operation, index) => {
        eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
          operation,
          error: `${operation} failed`,
          retryable: index % 2 === 0, // Alternate between retryable and non-retryable
          timestamp: new Date(),
          source: 'TestSource'
        });
      });
    });
  });

  describe('Event Bus Integration', () => {
    it('should handle multiple event types simultaneously', (done) => {
      let loadingReceived = false;
      let successReceived = false;
      let errorReceived = false;

      const checkCompletion = () => {
        if (loadingReceived && successReceived && errorReceived) {
          done();
        }
      };

      eventBus.on<LoadingStateEvent>(EVENT_NAMES.LOADING_STATE_CHANGED, () => {
        loadingReceived = true;
        checkCompletion();
      });

      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, () => {
        successReceived = true;
        checkCompletion();
      });

      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, () => {
        errorReceived = true;
        checkCompletion();
      });

      // Emit all event types
      eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
        isLoading: true,
        operation: 'sync',
        timestamp: new Date(),
        source: 'TestSource'
      });

      eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
        operation: 'sync_completed',
        message: 'Success!',
        timestamp: new Date(),
        source: 'TestSource'
      });

      eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
        operation: 'sync',
        error: 'Test error',
        retryable: true,
        timestamp: new Date(),
        source: 'TestSource'
      });
    });

    it('should properly clean up event subscriptions', () => {
      const subscription1 = eventBus.on(EVENT_NAMES.LOADING_STATE_CHANGED, () => {});
      const subscription2 = eventBus.on(EVENT_NAMES.SUCCESS_EVENT, () => {});
      const subscription3 = eventBus.on(EVENT_NAMES.ERROR_EVENT, () => {});

      expect(eventBus.getTotalSubscriptionCount()).toBe(3);

      subscription1.unsubscribe();
      expect(eventBus.getTotalSubscriptionCount()).toBe(2);

      subscription2.unsubscribe();
      subscription3.unsubscribe();
      expect(eventBus.getTotalSubscriptionCount()).toBe(0);
    });
  });

  describe('Event Validation', () => {
    it('should validate loading state event structure', (done) => {
      eventBus.on<LoadingStateEvent>(EVENT_NAMES.LOADING_STATE_CHANGED, (event) => {
        expect(event).toHaveProperty('isLoading');
        expect(event).toHaveProperty('operation');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('source');
        expect(typeof event.isLoading).toBe('boolean');
        expect(typeof event.operation).toBe('string');
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      eventBus.emit(EVENT_NAMES.LOADING_STATE_CHANGED, {
        isLoading: false,
        operation: 'sync',
        timestamp: new Date(),
        source: 'TestSource'
      });
    });

    it('should validate success event structure', (done) => {
      eventBus.on<SuccessEvent>(EVENT_NAMES.SUCCESS_EVENT, (event) => {
        expect(event).toHaveProperty('operation');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('source');
        expect(typeof event.operation).toBe('string');
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      eventBus.emit(EVENT_NAMES.SUCCESS_EVENT, {
        operation: 'connection_added',
        timestamp: new Date(),
        source: 'TestSource'
      });
    });

    it('should validate error event structure', (done) => {
      eventBus.on<ErrorEvent>(EVENT_NAMES.ERROR_EVENT, (event) => {
        expect(event).toHaveProperty('operation');
        expect(event).toHaveProperty('error');
        expect(event).toHaveProperty('retryable');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('source');
        expect(typeof event.operation).toBe('string');
        expect(typeof event.error).toBe('string');
        expect(typeof event.retryable).toBe('boolean');
        expect(event.timestamp).toBeInstanceOf(Date);
        done();
      });

      eventBus.emit(EVENT_NAMES.ERROR_EVENT, {
        operation: 'connection_create',
        error: 'Test error message',
        retryable: true,
        timestamp: new Date(),
        source: 'TestSource'
      });
    });
  });
});