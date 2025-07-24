import authStateManager, { AuthStateUpdate } from '../services/AuthStateManager';

describe('AuthStateManager', () => {
  beforeEach(() => {
    // Clean up before each test
    authStateManager.cleanup();
  });

  afterEach(() => {
    // Clean up after each test
    authStateManager.cleanup();
  });

  describe('State Batching', () => {
    it('should batch multiple state updates within 100ms window', (done) => {
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: { uid: 'test-user' }, timestamp: Date.now() },
        { type: 'isAuthenticated', value: true, timestamp: Date.now() },
        { type: 'isLocalDBReady', value: true, timestamp: Date.now() }
      ];

      let callCount = 0;
      const unsubscribe = authStateManager.subscribe((batchedUpdates) => {
        callCount++;
        expect(batchedUpdates).toHaveLength(3);
        expect(batchedUpdates).toEqual(updates);
        unsubscribe();
        done();
      });

      authStateManager.batchStateUpdates(updates);
    });

    it('should flush pending updates immediately when requested', () => {
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: null, timestamp: Date.now() },
        { type: 'isAuthenticated', value: false, timestamp: Date.now() }
      ];

      let receivedUpdates: AuthStateUpdate[] = [];
      const unsubscribe = authStateManager.subscribe((batchedUpdates) => {
        receivedUpdates = batchedUpdates;
      });

      authStateManager.batchStateUpdates(updates);
      authStateManager.flushPendingUpdates();

      expect(receivedUpdates).toEqual(updates);
      unsubscribe();
    });

    it('should handle multiple batches correctly', (done) => {
      const batch1: AuthStateUpdate[] = [
        { type: 'isInitializing', value: true, timestamp: Date.now() }
      ];
      const batch2: AuthStateUpdate[] = [
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() },
        { type: 'isInitializing', value: false, timestamp: Date.now() }
      ];

      let batchCount = 0;
      const unsubscribe = authStateManager.subscribe((updates) => {
        batchCount++;
        if (batchCount === 1) {
          expect(updates).toEqual(batch1);
          // Add second batch after first is processed with sufficient delay
          setTimeout(() => {
            authStateManager.batchStateUpdates(batch2);
          }, 150); // Wait longer than batch window
        } else if (batchCount === 2) {
          expect(updates).toEqual(batch2);
          unsubscribe();
          done();
        }
      });

      authStateManager.batchStateUpdates(batch1);
      
      // Add timeout to prevent hanging
      setTimeout(() => {
        if (batchCount < 2) {
          unsubscribe();
          done(new Error('Test timed out waiting for second batch'));
        }
      }, 5000);
    }, 10000);
  });

  describe('Debouncing', () => {
    it('should debounce rapid auth state changes with 50ms delay', (done) => {
      let callCount = 0;
      const callback = () => {
        callCount++;
        // Call done when callback is executed
        setTimeout(() => {
          expect(callCount).toBe(1);
          done();
        }, 10);
      };

      // Call multiple times rapidly
      authStateManager.debounceAuthStateChange(callback, 50);
      authStateManager.debounceAuthStateChange(callback, 50);
      authStateManager.debounceAuthStateChange(callback, 50);

      // Add timeout to prevent hanging
      setTimeout(() => {
        if (callCount === 0) {
          done(new Error('Callback was never called'));
        }
      }, 200);
    }, 10000);

    it('should execute immediately when in transition mode', () => {
      let callCount = 0;
      const callback = () => {
        callCount++;
      };

      authStateManager.beginAuthTransition();
      authStateManager.debounceAuthStateChange(callback, 50);

      // Should execute immediately in transition mode
      expect(callCount).toBe(1);
      authStateManager.completeAuthTransition();
    });

    it('should use default 50ms delay when no delay specified', (done) => {
      let callCount = 0;
      const startTime = Date.now();
      const callback = () => {
        callCount++;
        const elapsed = Date.now() - startTime;
        expect(callCount).toBe(1);
        expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
        done();
      };

      authStateManager.debounceAuthStateChange(callback);

      // Add timeout to prevent hanging
      setTimeout(() => {
        if (callCount === 0) {
          done(new Error('Callback was never called'));
        }
      }, 200);
    }, 10000);
  });

  describe('Transition Management', () => {
    it('should track transition state correctly', () => {
      expect(authStateManager.isInTransition()).toBe(false);

      authStateManager.beginAuthTransition();
      expect(authStateManager.isInTransition()).toBe(true);

      authStateManager.completeAuthTransition();
      expect(authStateManager.isInTransition()).toBe(false);
    });

    it('should auto-complete transition after 2 second timeout', (done) => {
      authStateManager.beginAuthTransition();
      expect(authStateManager.isInTransition()).toBe(true);

      // Should auto-complete after 2 seconds
      setTimeout(() => {
        expect(authStateManager.isInTransition()).toBe(false);
        done();
      }, 2100); // Slightly more than 2 seconds
    }, 3000); // Increase test timeout

    it('should flush pending updates when completing transition', () => {
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() }
      ];

      let receivedUpdates: AuthStateUpdate[] = [];
      const unsubscribe = authStateManager.subscribe((batchedUpdates) => {
        receivedUpdates = batchedUpdates;
      });

      authStateManager.beginAuthTransition();
      authStateManager.batchStateUpdates(updates);
      
      // Updates should not be flushed yet
      expect(receivedUpdates).toEqual([]);

      authStateManager.completeAuthTransition();
      
      // Updates should be flushed when transition completes
      expect(receivedUpdates).toEqual(updates);
      unsubscribe();
    });
  });

  describe('Configuration', () => {
    it('should use correct default configuration', () => {
      const config = authStateManager.getConfig();
      expect(config.debounceDelay).toBe(50);
      expect(config.batchWindow).toBe(100);
      expect(config.maxTransitionTime).toBe(2000);
      expect(config.enableSmoothing).toBe(true);
    });

    it('should allow configuration updates', () => {
      const newConfig = {
        debounceDelay: 75,
        batchWindow: 150
      };

      authStateManager.updateConfig(newConfig);
      const config = authStateManager.getConfig();
      
      expect(config.debounceDelay).toBe(75);
      expect(config.batchWindow).toBe(150);
      expect(config.maxTransitionTime).toBe(2000); // Should remain unchanged
      expect(config.enableSmoothing).toBe(true); // Should remain unchanged
    });
  });

  describe('Error Handling', () => {
    it('should handle listener errors gracefully', () => {
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: null, timestamp: Date.now() }
      ];

      // Add a listener that throws an error
      const unsubscribe1 = authStateManager.subscribe(() => {
        throw new Error('Test error');
      });

      // Add a normal listener
      let receivedUpdates: AuthStateUpdate[] = [];
      const unsubscribe2 = authStateManager.subscribe((batchedUpdates) => {
        receivedUpdates = batchedUpdates;
      });

      // Should not throw and should still call the normal listener
      expect(() => {
        authStateManager.batchStateUpdates(updates);
        authStateManager.flushPendingUpdates();
      }).not.toThrow();

      expect(receivedUpdates).toEqual(updates);
      
      unsubscribe1();
      unsubscribe2();
    });

    it('should handle cleanup correctly', () => {
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() }
      ];

      authStateManager.beginAuthTransition();
      authStateManager.batchStateUpdates(updates);

      expect(authStateManager.isInTransition()).toBe(true);

      authStateManager.cleanup();

      expect(authStateManager.isInTransition()).toBe(false);
      
      // Should not crash when trying to flush after cleanup
      expect(() => {
        authStateManager.flushPendingUpdates();
      }).not.toThrow();
    });
  });

  describe('Integration Requirements', () => {
    it('should meet requirement 1.1: prevent rapid up/down movement during auth', (done) => {
      // Simulate rapid auth state changes that would cause jitter
      const rapidUpdates = [
        { type: 'isInitializing', value: true, timestamp: Date.now() },
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() + 10 },
        { type: 'isAuthenticated', value: true, timestamp: Date.now() + 20 },
        { type: 'isLocalDBReady', value: true, timestamp: Date.now() + 30 },
        { type: 'isInitializing', value: false, timestamp: Date.now() + 40 }
      ];

      let batchCount = 0;
      const unsubscribe = authStateManager.subscribe((updates) => {
        batchCount++;
        // Should receive all updates in a single batch to prevent jitter
        expect(updates).toHaveLength(5);
        expect(batchCount).toBe(1);
        unsubscribe();
        done();
      });

      authStateManager.batchStateUpdates(rapidUpdates);
    });

    it('should meet requirement 1.3: batch multiple state updates', () => {
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() },
        { type: 'isAuthenticated', value: true, timestamp: Date.now() },
        { type: 'isLocalDBReady', value: true, timestamp: Date.now() }
      ];

      let batchedUpdates: AuthStateUpdate[] = [];
      const unsubscribe = authStateManager.subscribe((batch) => {
        batchedUpdates = batch;
      });

      authStateManager.batchStateUpdates(updates);
      authStateManager.flushPendingUpdates();

      // Should receive all updates in a single batch
      expect(batchedUpdates).toHaveLength(3);
      expect(batchedUpdates).toEqual(updates);
      unsubscribe();
    });

    it('should meet requirement 3.1: only necessary components re-render', () => {
      // This is tested by ensuring batching works correctly
      const updates: AuthStateUpdate[] = [
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() },
        { type: 'isAuthenticated', value: true, timestamp: Date.now() }
      ];

      let renderCount = 0;
      const unsubscribe = authStateManager.subscribe(() => {
        renderCount++;
      });

      // Multiple rapid updates should result in only one render when batched
      authStateManager.batchStateUpdates([updates[0]]);
      authStateManager.batchStateUpdates([updates[1]]);
      authStateManager.flushPendingUpdates();

      expect(renderCount).toBe(1); // All updates batched into one render
      unsubscribe();
    });

    it('should meet requirement 3.2: debounce rapid state updates', (done) => {
      let callCount = 0;
      const callback = () => {
        callCount++;
      };

      // Simulate rapid Firebase auth state changes
      authStateManager.debounceAuthStateChange(callback, 50);
      authStateManager.debounceAuthStateChange(callback, 50);
      authStateManager.debounceAuthStateChange(callback, 50);

      setTimeout(() => {
        // Should only be called once due to debouncing
        expect(callCount).toBe(1);
        done();
      }, 100);
    });

    it('should meet requirement 3.4: prevent cascading re-renders during DB init', () => {
      // Simulate database initialization sequence
      const dbInitUpdates: AuthStateUpdate[] = [
        { type: 'isInitializing', value: true, timestamp: Date.now() },
        { type: 'user', value: { uid: 'test' }, timestamp: Date.now() + 10 },
        { type: 'isLocalDBReady', value: false, timestamp: Date.now() + 20 },
        { type: 'isLocalDBReady', value: true, timestamp: Date.now() + 100 },
        { type: 'isInitializing', value: false, timestamp: Date.now() + 110 }
      ];

      let batchCount = 0;
      const unsubscribe = authStateManager.subscribe(() => {
        batchCount++;
      });

      authStateManager.batchStateUpdates(dbInitUpdates);
      authStateManager.flushPendingUpdates();

      // Should result in only one batch to prevent cascading re-renders
      expect(batchCount).toBe(1);
      unsubscribe();
    });
  });
});