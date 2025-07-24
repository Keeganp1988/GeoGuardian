import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { PermissionManager, permissionManager } from '../permissionManager';
import { eventBus, EVENT_NAMES } from '../eventBusService';

// Mock dependencies
jest.mock('expo-location');
jest.mock('expo-notifications');
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));
jest.mock('../eventBusService', () => ({
  eventBus: {
    emit: jest.fn(),
    on: jest.fn(),
  },
  EVENT_NAMES: {
    PERMISSION_STATUS_CHANGED: 'permission:status-changed',
    PERMISSION_CHANGED: 'permission:changed',
  },
}));

const mockLocation = Location as jest.Mocked<typeof Location>;
const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockEventBus = eventBus as jest.Mocked<typeof eventBus>;

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new (PermissionManager as any)(); // Access private constructor for testing
    jest.clearAllMocks();
    
    // Setup default mocks
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'denied',
    } as any);
    
    mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'denied',
    } as any);
    
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'denied',
    } as any);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PermissionManager.getInstance();
      const instance2 = PermissionManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should export a singleton instance', () => {
      expect(permissionManager).toBeInstanceOf(PermissionManager);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await manager.initialize();
      expect(mockLocation.getForegroundPermissionsAsync).toHaveBeenCalled();
      expect(mockLocation.getBackgroundPermissionsAsync).toHaveBeenCalled();
      expect(mockNotifications.getPermissionsAsync).toHaveBeenCalled();
    });

    it('should not initialize twice', async () => {
      await manager.initialize();
      await manager.initialize();
      
      // Should only call once due to isInitialized check
      expect(mockLocation.getForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors gracefully', async () => {
      mockLocation.getForegroundPermissionsAsync.mockRejectedValue(new Error('Permission check failed'));
      
      await expect(manager.initialize()).rejects.toThrow('Permission check failed');
    });
  });

  describe('Permission Checking', () => {
    it('should check all permissions correctly', async () => {
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);
      
      mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        granted: false,
        canAskAgain: true,
        status: 'denied',
      } as any);
      
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);

      const permissions = await manager.checkAllPermissions();

      expect(permissions.location.foreground.granted).toBe(true);
      expect(permissions.location.background.granted).toBe(false);
      expect(permissions.motion.granted).toBe(true); // Default for iOS
      expect(permissions.notifications.granted).toBe(true);
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_STATUS_CHANGED,
        permissions
      );
    });

    it('should handle permission check errors', async () => {
      mockLocation.getForegroundPermissionsAsync.mockRejectedValue(new Error('Check failed'));
      
      await expect(manager.checkAllPermissions()).rejects.toThrow('Check failed');
    });
  });

  describe('Initial Permission Requests', () => {
    it('should request all initial permissions successfully', async () => {
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);
      
      mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);
      
      mockNotifications.requestPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);

      const permissions = await manager.requestInitialPermissions();

      expect(permissions.location.foreground.granted).toBe(true);
      expect(permissions.location.background.granted).toBe(true);
      expect(permissions.notifications.granted).toBe(true);
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_STATUS_CHANGED,
        permissions
      );
    });

    it('should not request background permission if foreground is denied', async () => {
      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
        granted: false,
        canAskAgain: true,
        status: 'denied',
      } as any);
      
      mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        granted: false,
        canAskAgain: true,
        status: 'denied',
      } as any);

      const permissions = await manager.requestInitialPermissions();

      expect(mockLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(mockLocation.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
      expect(mockLocation.getBackgroundPermissionsAsync).toHaveBeenCalled();
      
      expect(permissions.location.foreground.granted).toBe(false);
      expect(permissions.location.background.granted).toBe(false);
    });

    it('should handle request errors gracefully', async () => {
      mockLocation.requestForegroundPermissionsAsync.mockRejectedValue(new Error('Request failed'));
      
      await expect(manager.requestInitialPermissions()).rejects.toThrow('Request failed');
    });
  });

  describe('Motion Permissions', () => {
    it('should handle iOS motion permissions', async () => {
      (Platform as any).OS = 'ios';
      
      const permissions = await manager.checkAllPermissions();
      
      expect(permissions.motion.granted).toBe(true);
      expect(permissions.motion.status).toBe('granted');
    });

    it('should handle Android motion permissions', async () => {
      (Platform as any).OS = 'android';
      
      const permissions = await manager.checkAllPermissions();
      
      expect(permissions.motion.granted).toBe(true);
      expect(permissions.motion.status).toBe('granted');
    });
  });

  describe('Location Services', () => {
    it('should check if location services are enabled', async () => {
      mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
      
      const isEnabled = await manager.isLocationServicesEnabled();
      
      expect(isEnabled).toBe(true);
      expect(mockLocation.hasServicesEnabledAsync).toHaveBeenCalled();
    });

    it('should handle location services check errors', async () => {
      mockLocation.hasServicesEnabledAsync.mockRejectedValue(new Error('Services check failed'));
      
      const isEnabled = await manager.isLocationServicesEnabled();
      
      expect(isEnabled).toBe(false);
    });
  });

  describe('App State Handling', () => {
    it('should check permissions when app becomes active', async () => {
      // Initialize with some permissions
      await manager.initialize();
      
      // Mock different permissions for the second check
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);

      await manager.onAppBecomeActive();

      expect(mockLocation.getForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_CHANGED,
        expect.objectContaining({
          previous: expect.any(Object),
          current: expect.any(Object),
        })
      );
    });

    it('should not emit change event if permissions are the same', async () => {
      await manager.initialize();
      
      // Clear previous emit calls
      mockEventBus.emit.mockClear();
      
      await manager.onAppBecomeActive();

      // Should emit status changed but not permission changed
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_STATUS_CHANGED,
        expect.any(Object)
      );
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_CHANGED,
        expect.any(Object)
      );
    });

    it('should handle app active check errors gracefully', async () => {
      mockLocation.getForegroundPermissionsAsync.mockRejectedValue(new Error('Check failed'));
      
      // Should not throw
      await expect(manager.onAppBecomeActive()).resolves.toBeUndefined();
    });
  });

  describe('Permission Guidance', () => {
    it('should provide location permission guidance', () => {
      const guidance = manager.getPermissionGuidance('location');
      expect(guidance).toContain('Location access is required');
    });

    it('should provide motion permission guidance', () => {
      const guidance = manager.getPermissionGuidance('motion');
      expect(guidance).toContain('Motion access is needed');
    });

    it('should provide notifications permission guidance', () => {
      const guidance = manager.getPermissionGuidance('notifications');
      expect(guidance).toContain('Notifications help keep you informed');
    });

    it('should provide default guidance for unknown permission types', () => {
      const guidance = manager.getPermissionGuidance('unknown' as any);
      expect(guidance).toContain('This permission is needed');
    });
  });

  describe('Current Permissions', () => {
    it('should return null before initialization', () => {
      const permissions = manager.getCurrentPermissions();
      expect(permissions).toBeNull();
    });

    it('should return current permissions after initialization', async () => {
      await manager.initialize();
      
      const permissions = manager.getCurrentPermissions();
      expect(permissions).not.toBeNull();
      expect(permissions).toHaveProperty('location');
      expect(permissions).toHaveProperty('motion');
      expect(permissions).toHaveProperty('notifications');
    });
  });

  describe('Permission Change Detection', () => {
    it('should detect foreground location permission changes', async () => {
      // Initialize with denied permission
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        granted: false,
        canAskAgain: true,
        status: 'denied',
      } as any);
      
      await manager.initialize();
      
      // Change to granted permission
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);
      
      mockEventBus.emit.mockClear();
      
      await manager.onAppBecomeActive();
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_CHANGED,
        expect.objectContaining({
          previous: expect.objectContaining({
            location: expect.objectContaining({
              foreground: expect.objectContaining({ granted: false })
            })
          }),
          current: expect.objectContaining({
            location: expect.objectContaining({
              foreground: expect.objectContaining({ granted: true })
            })
          })
        })
      );
    });

    it('should detect background location permission changes', async () => {
      // Initialize with denied permission
      mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        granted: false,
        canAskAgain: true,
        status: 'denied',
      } as any);
      
      await manager.initialize();
      
      // Change to granted permission
      mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);
      
      mockEventBus.emit.mockClear();
      
      await manager.onAppBecomeActive();
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_CHANGED,
        expect.any(Object)
      );
    });

    it('should detect notification permission changes', async () => {
      // Initialize with denied permission
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        granted: false,
        canAskAgain: true,
        status: 'denied',
      } as any);
      
      await manager.initialize();
      
      // Change to granted permission
      mockNotifications.getPermissionsAsync.mockResolvedValue({
        granted: true,
        canAskAgain: false,
        status: 'granted',
      } as any);
      
      mockEventBus.emit.mockClear();
      
      await manager.onAppBecomeActive();
      
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EVENT_NAMES.PERMISSION_CHANGED,
        expect.any(Object)
      );
    });
  });
});