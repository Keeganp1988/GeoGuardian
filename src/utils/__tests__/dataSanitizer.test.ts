import { DataSanitizer } from '../dataSanitizer';

describe('DataSanitizer', () => {
  describe('getSafeArray', () => {
    it('should return the array if input is valid', () => {
      const input = [1, 2, 3];
      const result = DataSanitizer.getSafeArray(input);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array for null input', () => {
      const result = DataSanitizer.getSafeArray(null);
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const result = DataSanitizer.getSafeArray(undefined);
      expect(result).toEqual([]);
    });

    it('should convert single object to array', () => {
      const input = { id: 1, name: 'test' };
      const result = DataSanitizer.getSafeArray(input as any);
      expect(result).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should return empty array for invalid input types', () => {
      expect(DataSanitizer.getSafeArray('string' as any)).toEqual([]);
      expect(DataSanitizer.getSafeArray(123 as any)).toEqual([]);
      expect(DataSanitizer.getSafeArray(true as any)).toEqual([]);
    });
  });

  describe('sanitizeFirebaseDocument', () => {
    it('should remove undefined values', () => {
      const input = {
        name: 'test',
        value: undefined,
        count: 5,
      };
      const result = DataSanitizer.sanitizeFirebaseDocument(input);
      expect(result).toEqual({
        name: 'test',
        count: 5,
      });
    });

    it('should preserve null values', () => {
      const input = {
        name: 'test',
        value: null,
        count: 5,
      };
      const result = DataSanitizer.sanitizeFirebaseDocument(input);
      expect(result).toEqual({
        name: 'test',
        value: null,
        count: 5,
      });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'test',
          age: undefined,
          active: true,
        },
        count: 5,
      };
      const result = DataSanitizer.sanitizeFirebaseDocument(input);
      expect(result).toEqual({
        user: {
          name: 'test',
          active: true,
        },
        count: 5,
      });
    });

    it('should handle arrays', () => {
      const input = {
        items: [1, 2, 3],
        tags: null,
      };
      const result = DataSanitizer.sanitizeFirebaseDocument(input);
      expect(result).toEqual({
        items: [1, 2, 3],
        tags: null,
      });
    });

    it('should return empty object for invalid input', () => {
      expect(DataSanitizer.sanitizeFirebaseDocument(null)).toEqual({});
      expect(DataSanitizer.sanitizeFirebaseDocument(undefined)).toEqual({});
      expect(DataSanitizer.sanitizeFirebaseDocument('string' as any)).toEqual({});
    });
  });

  describe('sanitizeUserInput', () => {
    it('should sanitize string values', () => {
      const input = {
        name: '<script>alert("xss")</script>',
        description: 'Normal text',
      };
      const result = DataSanitizer.sanitizeUserInput(input);
      expect(result.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(result.description).toBe('Normal text');
    });

    it('should filter allowed fields when specified', () => {
      const input = {
        name: 'test',
        age: 25,
        password: 'secret',
      };
      const result = DataSanitizer.sanitizeUserInput(input, ['name', 'age']);
      expect(result).toEqual({
        name: 'test',
        age: 25,
      });
    });

    it('should skip functions and symbols', () => {
      const input = {
        name: 'test',
        fn: () => {},
        sym: Symbol('test'),
      };
      const result = DataSanitizer.sanitizeUserInput(input);
      expect(result).toEqual({
        name: 'test',
      });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: '<b>test</b>',
          settings: {
            theme: 'dark',
          },
        },
      };
      const result = DataSanitizer.sanitizeUserInput(input);
      expect(result.user?.name).toBe('&lt;b&gt;test&lt;&#x2F;b&gt;');
      expect(result.user?.settings?.theme).toBe('dark');
    });
  });

  describe('sanitizeLocationData', () => {
    it('should validate and sanitize valid location data', () => {
      const input = {
        latitude: 40.7128,
        longitude: -74.0060,
        address: 'New York, NY',
        accuracy: 10,
        speed: 5.5,
        batteryLevel: 85,
        isCharging: false,
        timestamp: new Date(),
        circleMembers: ['user1', 'user2'],
      };
      const result = DataSanitizer.sanitizeLocationData(input);
      expect(result).toBeTruthy();
      expect(result?.latitude).toBe(40.7128);
      expect(result?.longitude).toBe(-74.0060);
      expect(result?.batteryLevel).toBe(85);
    });

    it('should return null for invalid coordinates', () => {
      const input = {
        latitude: 'invalid',
        longitude: -74.0060,
      };
      const result = DataSanitizer.sanitizeLocationData(input);
      expect(result).toBeNull();
    });

    it('should clamp battery level to 0-100 range', () => {
      const input = {
        latitude: 40.7128,
        longitude: -74.0060,
        batteryLevel: 150,
      };
      const result = DataSanitizer.sanitizeLocationData(input);
      expect(result?.batteryLevel).toBe(100);
    });

    it('should ensure non-negative speed', () => {
      const input = {
        latitude: 40.7128,
        longitude: -74.0060,
        speed: -5,
      };
      const result = DataSanitizer.sanitizeLocationData(input);
      expect(result?.speed).toBe(0);
    });

    it('should handle timestamp conversion', () => {
      const input = {
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: '2023-01-01T00:00:00Z',
      };
      const result = DataSanitizer.sanitizeLocationData(input);
      expect(result?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('withDefaults', () => {
    it('should merge input with defaults', () => {
      const input = { name: 'test' };
      const defaults = { name: 'default', age: 0, active: true };
      const result = DataSanitizer.withDefaults(input, defaults);
      expect(result).toEqual({
        name: 'test',
        age: 0,
        active: true,
      });
    });

    it('should return defaults for null input', () => {
      const defaults = { name: 'default', age: 0 };
      const result = DataSanitizer.withDefaults(null, defaults);
      expect(result).toEqual(defaults);
    });

    it('should ignore undefined values', () => {
      const input = { name: 'test', age: undefined };
      const defaults = { name: 'default', age: 25 };
      const result = DataSanitizer.withDefaults(input, defaults);
      expect(result).toEqual({
        name: 'test',
        age: 25,
      });
    });
  });

  describe('safeForEach', () => {
    it('should iterate over valid array', () => {
      const items = [1, 2, 3];
      const callback = jest.fn();
      DataSanitizer.safeForEach(items, callback);
      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenCalledWith(1, 0, items);
      expect(callback).toHaveBeenCalledWith(2, 1, items);
      expect(callback).toHaveBeenCalledWith(3, 2, items);
    });

    it('should handle null array gracefully', () => {
      const callback = jest.fn();
      DataSanitizer.safeForEach(null, callback);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle undefined array gracefully', () => {
      const callback = jest.fn();
      DataSanitizer.safeForEach(undefined, callback);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});