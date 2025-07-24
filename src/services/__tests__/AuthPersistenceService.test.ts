// Unit tests for AuthPersistenceService logic

// Mock all React Native dependencies before importing
jest.mock('react-native-keychain', () => ({
  setInternetCredentials: jest.fn(),
  getInternetCredentials: jest.fn(),
  resetInternetCredentials: jest.fn(),
  canImplyAuthentication: jest.fn(),
  getSupportedBiometryType: jest.fn(),
  ACCESS_CONTROL: {
    BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE: 'BiometryCurrentSetOrDevicePasscode'
  },
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly'
  }
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn()
}));

jest.mock('../../firebase/firebase', () => ({
  getFirebaseAuth: jest.fn()
}));

jest.mock('../../utils/errorHandling', () => ({
  ErrorHandler: {
    logError: jest.fn()
  },
  ErrorCategory: {
    AUTHENTICATION: 'AUTHENTICATION',
    UNKNOWN: 'UNKNOWN'
  },
  ErrorSeverity: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
  }
}));

import { AuthPersistenceService } from '../AuthPersistenceService';

const mockKeychain = require('react-native-keychain');
const mockAsyncStorage = require('@react-native-async-storage/async-storage');
const mockFirebase = require('../../firebase/firebase');

// Mock Firebase user
const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  refreshToken: 'mock-refresh-token',
  getIdToken: jest.fn().mockResolvedValue('mock-id-token'),
  getIdTokenResult: jest.fn().mockResolvedValue({
    expirationTime: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
  })
} as any;

describe('AuthPersistenceService', () => {
  let service: AuthPersistenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockAsyncStorage.getItem.mockImplementation((key) => {
      if (key === '@device_id') {
        return Promise.resolve('test-device-id');
      }
      return Promise.resolve(null);
    });
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
    mockAsyncStorage.getAllKeys.mockResolvedValue([]);
    mockAsyncStorage.multiRemove.mockResolvedValue();
    
    mockKeychain.setInternetCredentials.mockResolvedValue(true);
    mockKeychain.getInternetCredentials.mockResolvedValue(false);
    mockKeychain.resetInternetCredentials.mockResolvedValue(true);
    mockKeychain.canImplyAuthentication.mockResolvedValue(true);
    mockKeychain.getSupportedBiometryType.mockResolvedValue(null);

    // Setup Firebase Auth mock
    mockFirebase.getFirebaseAuth.mockReturnValue({
      currentUser: mockUser
    });

    // Create service after mocks are set up
    service = new AuthPersistenceService();
  });

  describe('storeAuthToken', () => {
    it('should store auth token securely with 7-day expiration', async () => {
      // Setup device ID mock
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === '@device_id') {
          return Promise.resolve('test-device-id');
        }
        return Promise.resolve(null);
      });

      await service.storeAuthToken(mockUser);

      expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
      expect(mockKeychain.setInternetCredentials).toHaveBeenCalledWith(
        'GeoGuardianAuth',
        'auth_token',
        expect.stringContaining('"userId":"test-user-123"'),
        expect.objectContaining({
          accessControl: mockKeychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
          accessible: mockKeychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        })
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@last_login_timestamp',
        expect.any(String)
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockKeychain.setInternetCredentials.mockRejectedValue(new Error('Keychain error'));
      mockAsyncStorage.setItem.mockRejectedValue(new Error('AsyncStorage error'));

      await expect(service.storeAuthToken(mockUser)).rejects.toThrow('Failed to store authentication token securely');
    });
  });

  describe('validateStoredAuth', () => {
    it('should return invalid for no stored token', async () => {
      mockKeychain.getInternetCredentials.mockResolvedValue(false);

      const result = await service.validateStoredAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('No stored authentication token found');
    });

    it('should return invalid for expired token', async () => {
      const expiredToken = {
        token: 'expired-token',
        userId: 'test-user-123',
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        issuedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        lastValidated: Date.now() - 1000,
        deviceId: 'test-device-id'
      };

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(expiredToken),
        service: 'GeoGuardianAuth'
      });

      const result = await service.validateStoredAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Stored authentication token has expired');
      expect(mockKeychain.resetInternetCredentials).toHaveBeenCalled();
    });

    it('should return valid for unexpired token', async () => {
      const validToken = {
        token: 'valid-token',
        userId: 'test-user-123',
        expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000, // 6 days from now
        issuedAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
        lastValidated: Date.now(),
        deviceId: 'test-device-id'
      };

      // Device ID is already mocked in beforeEach

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(validToken),
        service: 'GeoGuardianAuth'
      });

      const result = await service.validateStoredAuth();


      expect(result.isValid).toBe(true);
      expect(result.expiresAt).toBe(validToken.expiresAt);
      expect(result.needsRefresh).toBe(false);
    });

    it('should detect device ID mismatch as security breach', async () => {
      const tokenWithWrongDevice = {
        token: 'valid-token',
        userId: 'test-user-123',
        expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
        issuedAt: Date.now() - 24 * 60 * 60 * 1000,
        lastValidated: Date.now(),
        deviceId: 'different-device-id'
      };

      // Mock current device ID
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === '@device_id') {
          return Promise.resolve('test-device-id');
        }
        return Promise.resolve(null);
      });

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(tokenWithWrongDevice),
        service: 'GeoGuardianAuth'
      });

      const result = await service.validateStoredAuth();

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Device ID mismatch - security breach detected');
    });
  });

  describe('isWithinValidPeriod', () => {
    it('should return true for valid token within 7 days', async () => {
      const validToken = {
        token: 'valid-token',
        userId: 'test-user-123',
        expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days from now
        issuedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
        lastValidated: Date.now(),
        deviceId: 'test-device-id'
      };

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(validToken),
        service: 'GeoGuardianAuth'
      });

      const result = await service.isWithinValidPeriod();

      expect(result).toBe(true);
    });

    it('should return false for expired token', async () => {
      const expiredToken = {
        token: 'expired-token',
        userId: 'test-user-123',
        expiresAt: Date.now() - 1000, // Expired
        issuedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
        lastValidated: Date.now() - 1000,
        deviceId: 'test-device-id'
      };

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(expiredToken),
        service: 'GeoGuardianAuth'
      });

      const result = await service.isWithinValidPeriod();

      expect(result).toBe(false);
    });

    it('should return false when no token exists', async () => {
      mockKeychain.getInternetCredentials.mockResolvedValue(false);

      const result = await service.isWithinValidPeriod();

      expect(result).toBe(false);
    });
  });

  describe('clearStoredAuth', () => {
    it('should clear keychain and AsyncStorage data', async () => {
      mockAsyncStorage.getAllKeys.mockResolvedValue([
        '@device_id',
        '@last_login_timestamp',
        'auth_session_data',
        'firebase_token',
        'other_key'
      ]);

      await service.clearStoredAuth();

      expect(mockKeychain.resetInternetCredentials).toHaveBeenCalledWith({
        server: 'GeoGuardianAuth'
      });
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@last_login_timestamp');
    });

    it('should handle errors gracefully', async () => {
      mockKeychain.resetInternetCredentials.mockRejectedValue(new Error('Keychain error'));
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(service.clearStoredAuth()).resolves.toBeUndefined();
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should refresh token when expiring soon', async () => {
      const tokenExpiringSoon = {
        token: 'expiring-token',
        userId: 'test-user-123',
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes from now (less than 2 hour threshold)
        issuedAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
        lastValidated: Date.now(),
        deviceId: 'test-device-id'
      };

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(tokenExpiringSoon),
        service: 'GeoGuardianAuth'
      });

      // Mock Firebase auth
      const mockAuth = {
        currentUser: mockUser
      };
      
      jest.doMock('../../firebase/firebase', () => ({
        getFirebaseAuth: () => mockAuth
      }));

      const result = await service.refreshTokenIfNeeded();

      expect(result.success).toBe(true);
      expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
      expect(mockKeychain.setInternetCredentials).toHaveBeenCalled();
    });

    it('should not refresh token when not needed', async () => {
      const validToken = {
        token: 'valid-token',
        userId: 'test-user-123',
        expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000, // 5 days from now
        issuedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        lastValidated: Date.now(),
        deviceId: 'test-device-id'
      };

      mockKeychain.getInternetCredentials.mockResolvedValue({
        username: 'auth_token',
        password: JSON.stringify(validToken),
        service: 'GeoGuardianAuth'
      });

      const result = await service.refreshTokenIfNeeded();

      expect(result.success).toBe(true);
      expect(result.error).toBe('Token refresh not needed yet');
      expect(mockUser.getIdToken).not.toHaveBeenCalled();
    });
  });

  describe('handleSecurityBreach', () => {
    it('should clear all data and regenerate device ID', async () => {
      mockAsyncStorage.getAllKeys.mockResolvedValue([
        '@device_id',
        '@last_login_timestamp',
        'auth_data'
      ]);

      // Track when removeItem is called for @device_id to simulate the device ID being cleared
      let deviceIdRemoved = false;
      mockAsyncStorage.removeItem.mockImplementation((key) => {
        if (key === '@device_id') {
          deviceIdRemoved = true;
        }
        return Promise.resolve();
      });

      // Update getItem mock to return null for @device_id after it's been removed
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === '@device_id') {
          return deviceIdRemoved ? Promise.resolve(null) : Promise.resolve('test-device-id');
        }
        return Promise.resolve(null);
      });

      await service.handleSecurityBreach();

      expect(mockKeychain.resetInternetCredentials).toHaveBeenCalled();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@last_login_timestamp');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@device_id');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@device_id',
        expect.stringMatching(/^device_\d+_[a-z0-9]+$/)
      );
    });
  });

  describe('isKeychainAvailable', () => {
    it('should return true when keychain is available', async () => {
      mockKeychain.getSupportedBiometryType.mockResolvedValue('TouchID');

      const result = await service.isKeychainAvailable();

      expect(result).toBe(true);
    });

    it('should return true when biometry not supported but keychain available', async () => {
      mockKeychain.getSupportedBiometryType.mockResolvedValue(null);
      mockKeychain.canImplyAuthentication.mockResolvedValue(true);

      const result = await service.isKeychainAvailable();

      expect(result).toBe(true);
    });

    it('should return false when keychain is not available', async () => {
      mockKeychain.getSupportedBiometryType.mockRejectedValue(new Error('Not available'));
      mockKeychain.canImplyAuthentication.mockResolvedValue(false);

      const result = await service.isKeychainAvailable();

      expect(result).toBe(false);
    });
  });
});