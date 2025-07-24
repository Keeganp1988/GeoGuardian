// Tests for null safety utilities

import { NullSafety } from '../nullSafety';

describe('NullSafety', () => {
  describe('safeForEach', () => {
    it('should handle null array gracefully', () => {
      const callback = jest.fn();
      NullSafety.safeForEach(null, callback);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle undefined array gracefully', () => {
      const callback = jest.fn();
      NullSafety.safeForEach(undefined, callback);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should execute callback for valid array', () => {
      const callback = jest.fn();
      const array = [1, 2, 3];
      NullSafety.safeForEach(array, callback);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should handle callback errors gracefully', () => {
      const callback = jest.fn(() => {
        throw new Error('Test error');
      });
      const array = [1, 2, 3];
      
      // Should not throw
      expect(() => {
        NullSafety.safeForEach(array, callback);
      }).not.toThrow();
    });
  });

  describe('safeMap', () => {
    it('should return empty array for null input', () => {
      const callback = jest.fn();
      const result = NullSafety.safeMap(null, callback);
      expect(result).toEqual([]);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should return mapped array for valid input', () => {
      const callback = jest.fn((x: number) => x * 2);
      const array = [1, 2, 3];
      const result = NullSafety.safeMap(array, callback);
      expect(result).toEqual([2, 4, 6]);
    });

    it('should filter out null results from callback errors', () => {
      const callback = jest.fn((x: number) => {
        if (x === 2) throw new Error('Test error');
        return x * 2;
      });
      const array = [1, 2, 3];
      const result = NullSafety.safeMap(array, callback);
      expect(result).toEqual([2, 6]);
    });
  });

  describe('safeFilter', () => {
    it('should return empty array for null input', () => {
      const predicate = jest.fn();
      const result = NullSafety.safeFilter(null, predicate);
      expect(result).toEqual([]);
      expect(predicate).not.toHaveBeenCalled();
    });

    it('should filter array correctly', () => {
      const predicate = jest.fn((x: number) => x > 2);
      const array = [1, 2, 3, 4];
      const result = NullSafety.safeFilter(array, predicate);
      expect(result).toEqual([3, 4]);
    });

    it('should exclude items that cause predicate errors', () => {
      const predicate = jest.fn((x: number) => {
        if (x === 2) throw new Error('Test error');
        return x > 1;
      });
      const array = [1, 2, 3, 4];
      const result = NullSafety.safeFilter(array, predicate);
      expect(result).toEqual([3, 4]);
    });
  });

  describe('isNullOrUndefined', () => {
    it('should return true for null', () => {
      expect(NullSafety.isNullOrUndefined(null)).toBe(true);
    });

    it('should return true for undefined', () => {
      expect(NullSafety.isNullOrUndefined(undefined)).toBe(true);
    });

    it('should return false for valid values', () => {
      expect(NullSafety.isNullOrUndefined(0)).toBe(false);
      expect(NullSafety.isNullOrUndefined('')).toBe(false);
      expect(NullSafety.isNullOrUndefined(false)).toBe(false);
      expect(NullSafety.isNullOrUndefined([])).toBe(false);
    });
  });

  describe('safeValue', () => {
    it('should return fallback for null', () => {
      expect(NullSafety.safeValue(null, 'fallback')).toBe('fallback');
    });

    it('should return fallback for undefined', () => {
      expect(NullSafety.safeValue(undefined, 'fallback')).toBe('fallback');
    });

    it('should return original value when not null/undefined', () => {
      expect(NullSafety.safeValue('value', 'fallback')).toBe('value');
      expect(NullSafety.safeValue(0, 'fallback')).toBe(0);
      expect(NullSafety.safeValue(false, 'fallback')).toBe(false);
    });
  });

  describe('safeGet', () => {
    it('should return fallback for null object', () => {
      expect(NullSafety.safeGet(null, 'path', 'fallback')).toBe('fallback');
    });

    it('should return fallback for undefined object', () => {
      expect(NullSafety.safeGet(undefined, 'path', 'fallback')).toBe('fallback');
    });

    it('should return nested value for valid path', () => {
      const obj = { user: { profile: { name: 'John' } } };
      expect(NullSafety.safeGet(obj, 'user.profile.name')).toBe('John');
    });

    it('should return fallback for invalid path', () => {
      const obj = { user: { profile: { name: 'John' } } };
      expect(NullSafety.safeGet(obj, 'user.profile.age', 25)).toBe(25);
    });

    it('should return fallback for path through null', () => {
      const obj = { user: null };
      expect(NullSafety.safeGet(obj, 'user.profile.name', 'fallback')).toBe('fallback');
    });
  });

  describe('wrapArray', () => {
    it('should provide null-safe array operations', () => {
      const wrapper = NullSafety.wrapArray(null);
      
      expect(wrapper.length).toBe(0);
      expect(wrapper.isEmpty()).toBe(true);
      expect(wrapper.isValid()).toBe(false);
      
      const mapResult = wrapper.map((x: any) => x * 2);
      expect(mapResult).toEqual([]);
    });

    it('should work with valid arrays', () => {
      const array = [1, 2, 3];
      const wrapper = NullSafety.wrapArray(array);
      
      expect(wrapper.length).toBe(3);
      expect(wrapper.isEmpty()).toBe(false);
      expect(wrapper.isValid()).toBe(true);
      
      const mapResult = wrapper.map((x: number) => x * 2);
      expect(mapResult).toEqual([2, 4, 6]);
    });
  });
});