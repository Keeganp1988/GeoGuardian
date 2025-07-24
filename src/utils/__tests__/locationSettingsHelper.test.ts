import { Platform, Linking } from 'react-native';
import { LocationSettingsHelperImpl, locationSettingsHelper } from '../locationSettingsHelper';

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
    openSettings: jest.fn(),
  },
}));

const mockLinking = Linking as jest.Mocked<typeof Linking>;

describe('LocationSettingsHelper', () => {
  let helper: LocationSettingsHelperImpl;

  beforeEach(() => {
    helper = new LocationSettingsHelperImpl();
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('iOS Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    describe('openLocationSettings', () => {
      it('should open iOS location settings using app-settings URL scheme', async () => {
        mockLinking.canOpenURL.mockResolvedValue(true);
        mockLinking.openURL.mockResolvedValue(true);

        const result = await helper.openLocationSettings();

        expect(mockLinking.canOpenURL).toHaveBeenCalledWith('app-settings:');
        expect(mockLinking.openURL).toHaveBeenCalledWith('app-settings:');
        expect(result).toBe(true);
      });

      it('should fallback to app settings if app-settings URL cannot be opened', async () => {
        mockLinking.canOpenURL.mockResolvedValue(false);
        mockLinking.openSettings.mockResolvedValue(undefined);

        const result = await helper.openLocationSettings();

        expect(mockLinking.canOpenURL).toHaveBeenCalledWith('app-settings:');
        expect(mockLinking.openURL).not.toHaveBeenCalled();
        expect(mockLinking.openSettings).toHaveBeenCalled();
        expect(result).toBe(true);
      });

      it('should handle errors and fallback to app settings', async () => {
        mockLinking.canOpenURL.mockRejectedValue(new Error('URL check failed'));
        mockLinking.openSettings.mockResolvedValue(undefined);

        const result = await helper.openLocationSettings();

        expect(mockLinking.openSettings).toHaveBeenCalled();
        expect(result).toBe(true);
      });
    });

    describe('canOpenLocationSettings', () => {
      it('should return true for iOS', () => {
        const result = helper.canOpenLocationSettings();
        expect(result).toBe(true);
      });
    });
  });

  describe('Android Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    describe('openLocationSettings', () => {
      it('should open Android location settings using deep link', async () => {
        mockLinking.canOpenURL
          .mockResolvedValueOnce(true) // First URL check succeeds
          .mockResolvedValueOnce(false); // Second URL check not needed
        mockLinking.openURL.mockResolvedValue(true);

        const result = await helper.openLocationSettings();

        expect(mockLinking.canOpenURL).toHaveBeenCalledWith(
          'android-app://com.android.settings/.Settings$LocationSettingsActivity'
        );
        expect(mockLinking.openURL).toHaveBeenCalledWith(
          'android-app://com.android.settings/.Settings$LocationSettingsActivity'
        );
        expect(result).toBe(true);
      });

      it('should fallback to general location settings if specific deep link fails', async () => {
        // Reset mocks completely for this test
        mockLinking.canOpenURL.mockReset();
        mockLinking.openURL.mockReset();
        
        mockLinking.canOpenURL
          .mockResolvedValueOnce(false) // First URL check fails
          .mockResolvedValueOnce(true); // Second URL check succeeds
        mockLinking.openURL.mockResolvedValue(true);

        const result = await helper.openLocationSettings();

        // Should succeed with fallback
        expect(result).toBe(true);
        expect(mockLinking.canOpenURL).toHaveBeenCalledTimes(2);
        expect(mockLinking.openURL).toHaveBeenCalledTimes(1);
      });

      it('should fallback to app settings if all deep links fail', async () => {
        // Reset mocks completely for this test
        mockLinking.canOpenURL.mockReset();
        mockLinking.openURL.mockReset();
        mockLinking.openSettings.mockReset();
        
        mockLinking.canOpenURL.mockResolvedValue(false);
        mockLinking.openSettings.mockResolvedValue(undefined);

        const result = await helper.openLocationSettings();

        // Should succeed with app settings fallback
        expect(result).toBe(true);
        expect(mockLinking.openSettings).toHaveBeenCalled();
      });

      it('should handle errors and fallback to app settings', async () => {
        mockLinking.canOpenURL.mockRejectedValue(new Error('URL check failed'));
        mockLinking.openSettings.mockResolvedValue(undefined);

        const result = await helper.openLocationSettings();

        expect(mockLinking.openSettings).toHaveBeenCalled();
        expect(result).toBe(true);
      });
    });

    describe('canOpenLocationSettings', () => {
      it('should return true for Android', () => {
        const result = helper.canOpenLocationSettings();
        expect(result).toBe(true);
      });
    });
  });

  describe('Unsupported Platform', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    describe('openLocationSettings', () => {
      it('should fallback to app settings for unsupported platforms', async () => {
        mockLinking.openSettings.mockResolvedValue(undefined);

        const result = await helper.openLocationSettings();

        expect(mockLinking.openSettings).toHaveBeenCalled();
        expect(result).toBe(true);
      });
    });

    describe('canOpenLocationSettings', () => {
      it('should return false for unsupported platforms', () => {
        const result = helper.canOpenLocationSettings();
        expect(result).toBe(false);
      });
    });
  });

  describe('openAppSettings', () => {
    it('should open app settings successfully', async () => {
      mockLinking.openSettings.mockResolvedValue(undefined);

      const result = await helper.openAppSettings();

      expect(mockLinking.openSettings).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle errors when opening app settings', async () => {
      mockLinking.openSettings.mockRejectedValue(new Error('Settings failed'));

      const result = await helper.openAppSettings();

      expect(mockLinking.openSettings).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(locationSettingsHelper).toBeInstanceOf(LocationSettingsHelperImpl);
    });

    it('should return the same instance on multiple imports', () => {
      const instance1 = locationSettingsHelper;
      const instance2 = locationSettingsHelper;
      expect(instance1).toBe(instance2);
    });
  });
});
