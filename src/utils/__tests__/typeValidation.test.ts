import { TypeValidator } from '../typeValidation';

describe('TypeValidator', () => {
  describe('Basic type guards', () => {
    describe('isString', () => {
      it('should return true for strings', () => {
        expect(TypeValidator.isString('hello')).toBe(true);
        expect(TypeValidator.isString('')).toBe(true);
      });

      it('should return false for non-strings', () => {
        expect(TypeValidator.isString(123)).toBe(false);
        expect(TypeValidator.isString(null)).toBe(false);
        expect(TypeValidator.isString(undefined)).toBe(false);
        expect(TypeValidator.isString([])).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should return true for valid numbers', () => {
        expect(TypeValidator.isNumber(123)).toBe(true);
        expect(TypeValidator.isNumber(0)).toBe(true);
        expect(TypeValidator.isNumber(-123)).toBe(true);
        expect(TypeValidator.isNumber(3.14)).toBe(true);
      });

      it('should return false for NaN and non-numbers', () => {
        expect(TypeValidator.isNumber(NaN)).toBe(false);
        expect(TypeValidator.isNumber('123')).toBe(false);
        expect(TypeValidator.isNumber(null)).toBe(false);
        expect(TypeValidator.isNumber(undefined)).toBe(false);
      });
    });

    describe('isBoolean', () => {
      it('should return true for booleans', () => {
        expect(TypeValidator.isBoolean(true)).toBe(true);
        expect(TypeValidator.isBoolean(false)).toBe(true);
      });

      it('should return false for non-booleans', () => {
        expect(TypeValidator.isBoolean(1)).toBe(false);
        expect(TypeValidator.isBoolean('true')).toBe(false);
        expect(TypeValidator.isBoolean(null)).toBe(false);
      });
    });

    describe('isArray', () => {
      it('should return true for arrays', () => {
        expect(TypeValidator.isArray([])).toBe(true);
        expect(TypeValidator.isArray([1, 2, 3])).toBe(true);
      });

      it('should return false for non-arrays', () => {
        expect(TypeValidator.isArray({})).toBe(false);
        expect(TypeValidator.isArray('array')).toBe(false);
        expect(TypeValidator.isArray(null)).toBe(false);
      });
    });

    describe('isPlainObject', () => {
      it('should return true for plain objects', () => {
        expect(TypeValidator.isPlainObject({})).toBe(true);
        expect(TypeValidator.isPlainObject({ key: 'value' })).toBe(true);
      });

      it('should return false for non-plain objects', () => {
        expect(TypeValidator.isPlainObject([])).toBe(false);
        expect(TypeValidator.isPlainObject(null)).toBe(false);
        expect(TypeValidator.isPlainObject(new Date())).toBe(false);
      });
    });

    describe('isDate', () => {
      it('should return true for valid dates', () => {
        expect(TypeValidator.isDate(new Date())).toBe(true);
        expect(TypeValidator.isDate(new Date('2023-01-01'))).toBe(true);
      });

      it('should return false for invalid dates and non-dates', () => {
        expect(TypeValidator.isDate(new Date('invalid'))).toBe(false);
        expect(TypeValidator.isDate('2023-01-01')).toBe(false);
        expect(TypeValidator.isDate(null)).toBe(false);
      });
    });
  });

  describe('validateFirebaseDocument', () => {
    it('should validate document with all required fields', () => {
      const document = {
        name: 'test',
        age: 25,
        active: true,
      };
      const result = TypeValidator.validateFirebaseDocument(document, ['name', 'age']);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required fields', () => {
      const document = {
        name: 'test',
      };
      const result = TypeValidator.validateFirebaseDocument(document, ['name', 'age']);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Required field 'age' is missing or null");
    });

    it('should fail validation for undefined values', () => {
      const document = {
        name: 'test',
        value: undefined,
      };
      const result = TypeValidator.validateFirebaseDocument(document);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Field 'value' has undefined value (not allowed in Firebase)");
    });

    it('should fail validation for non-object input', () => {
      const result = TypeValidator.validateFirebaseDocument('not an object');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Document must be a plain object');
    });
  });

  describe('Complex type guards', () => {
    describe('isUser', () => {
      it('should validate correct user object', () => {
        const user = {
          uid: 'user123',
          name: 'John Doe',
          email: 'john@example.com',
          createdAt: new Date(),
          lastSeen: new Date(),
          isOnline: true,
        };
        expect(TypeValidator.isUser(user)).toBe(true);
      });

      it('should reject invalid user object', () => {
        const invalidUser = {
          uid: 'user123',
          name: 'John Doe',
          // missing email
          createdAt: new Date(),
          lastSeen: new Date(),
          isOnline: true,
        };
        expect(TypeValidator.isUser(invalidUser)).toBe(false);
      });
    });

    describe('isLocationData', () => {
      it('should validate correct location data', () => {
        const location = {
          userId: 'user123',
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(),
          circleMembers: ['user1', 'user2'],
        };
        expect(TypeValidator.isLocationData(location)).toBe(true);
      });

      it('should reject invalid location data', () => {
        const invalidLocation = {
          userId: 'user123',
          latitude: 'invalid',
          longitude: -74.0060,
          timestamp: new Date(),
          circleMembers: ['user1', 'user2'],
        };
        expect(TypeValidator.isLocationData(invalidLocation)).toBe(false);
      });
    });
  });

  describe('validateArray', () => {
    it('should validate array with all valid items', () => {
      const array = ['hello', 'world'];
      const result = TypeValidator.validateArray(array, TypeValidator.isString);
      expect(result.isValid).toBe(true);
      expect(result.validItems).toEqual(['hello', 'world']);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle array with some invalid items', () => {
      const array = ['hello', 123, 'world'];
      const result = TypeValidator.validateArray(array, TypeValidator.isString);
      expect(result.isValid).toBe(false);
      expect(result.validItems).toEqual(['hello', 'world']);
      expect(result.errors).toContain('Item at index 1 failed validation');
    });

    it('should fail for non-array input', () => {
      const result = TypeValidator.validateArray('not an array', TypeValidator.isString);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Value is not an array');
    });
  });

  describe('validateCoordinates', () => {
    it('should validate correct coordinates', () => {
      const result = TypeValidator.validateCoordinates(40.7128, -74.0060);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid latitude', () => {
      const result = TypeValidator.validateCoordinates(91, -74.0060);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Latitude must be between -90 and 90');
    });

    it('should reject invalid longitude', () => {
      const result = TypeValidator.validateCoordinates(40.7128, 181);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Longitude must be between -180 and 180');
    });

    it('should reject non-numeric coordinates', () => {
      const result = TypeValidator.validateCoordinates('40.7128', -74.0060);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Latitude must be a valid number');
    });
  });

  describe('Email and phone validation', () => {
    describe('isValidEmail', () => {
      it('should validate correct email addresses', () => {
        expect(TypeValidator.isValidEmail('test@example.com')).toBe(true);
        expect(TypeValidator.isValidEmail('user.name@domain.co.uk')).toBe(true);
      });

      it('should reject invalid email addresses', () => {
        expect(TypeValidator.isValidEmail('invalid-email')).toBe(false);
        expect(TypeValidator.isValidEmail('test@')).toBe(false);
        expect(TypeValidator.isValidEmail('@example.com')).toBe(false);
        expect(TypeValidator.isValidEmail(123)).toBe(false);
      });
    });

    describe('isValidPhone', () => {
      it('should validate correct phone numbers', () => {
        expect(TypeValidator.isValidPhone('+1234567890')).toBe(true);
        expect(TypeValidator.isValidPhone('(555) 123-4567')).toBe(true);
        expect(TypeValidator.isValidPhone('555-123-4567')).toBe(true);
      });

      it('should reject invalid phone numbers', () => {
        expect(TypeValidator.isValidPhone('123')).toBe(false);
        expect(TypeValidator.isValidPhone('abc-def-ghij')).toBe(false);
        expect(TypeValidator.isValidPhone(123)).toBe(false);
      });
    });
  });

  describe('createSafeValidator', () => {
    it('should return value if validation passes', () => {
      const safeStringValidator = TypeValidator.createSafeValidator(
        TypeValidator.isString,
        'default'
      );
      expect(safeStringValidator('hello')).toBe('hello');
    });

    it('should return default if validation fails', () => {
      const safeStringValidator = TypeValidator.createSafeValidator(
        TypeValidator.isString,
        'default'
      );
      expect(safeStringValidator(123)).toBe('default');
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(TypeValidator.isNonEmptyString('hello')).toBe(true);
      expect(TypeValidator.isNonEmptyString('  test  ')).toBe(true);
    });

    it('should return false for empty or whitespace strings', () => {
      expect(TypeValidator.isNonEmptyString('')).toBe(false);
      expect(TypeValidator.isNonEmptyString('   ')).toBe(false);
      expect(TypeValidator.isNonEmptyString(null)).toBe(false);
      expect(TypeValidator.isNonEmptyString(123)).toBe(false);
    });
  });
});