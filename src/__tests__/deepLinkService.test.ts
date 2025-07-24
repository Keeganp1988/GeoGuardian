import deepLinkService from '../services/deepLinkService';

// Mock expo-linking
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  parse: jest.fn(),
}));

// Mock navigation
const mockNavigationRef = {
  isReady: jest.fn(() => true),
  navigate: jest.fn(),
};

describe('DeepLinkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractInviteCode', () => {
    it('should extract invite code from app scheme URL', () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockReturnValue({
        path: '/invite/abc123def456',
        queryParams: {},
      });

      const result = deepLinkService.extractInviteCode('geoguardian://invite/abc123def456');
      expect(result).toBe('abc123def456');
    });

    it('should extract invite code from web URL', () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockReturnValue({
        path: '/invite/xyz789uvw012',
        queryParams: {},
      });

      const result = deepLinkService.extractInviteCode('https://geoguardian.app/invite/xyz789uvw012');
      expect(result).toBe('xyz789uvw012');
    });

    it('should extract invite code from query parameters as fallback', () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockReturnValue({
        path: '/invite',
        queryParams: { code: 'fallback123' },
      });

      const result = deepLinkService.extractInviteCode('geoguardian://invite?code=fallback123');
      expect(result).toBe('fallback123');
    });

    it('should return null for invalid URLs', () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockReturnValue({
        path: '/other-path',
        queryParams: {},
      });

      const result = deepLinkService.extractInviteCode('geoguardian://other-path');
      expect(result).toBeNull();
    });

    it('should handle parsing errors gracefully', () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const result = deepLinkService.extractInviteCode('invalid-url');
      expect(result).toBeNull();
    });
  });

  describe('navigateToInvitation', () => {
    it('should navigate to invitation screen when navigation is ready', () => {
      deepLinkService.initialize(mockNavigationRef as any);
      
      deepLinkService.navigateToInvitation('test123');
      
      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('InvitationAccept', {
        linkCode: 'test123',
      });
    });

    it('should store invite code when navigation is not ready', () => {
      const notReadyNavRef = {
        ...mockNavigationRef,
        isReady: jest.fn(() => false),
      };
      
      deepLinkService.initialize(notReadyNavRef as any);
      deepLinkService.navigateToInvitation('pending123');
      
      expect(notReadyNavRef.navigate).not.toHaveBeenCalled();
      
      // When navigation becomes ready, it should handle the pending invitation
      notReadyNavRef.isReady.mockReturnValue(true);
      deepLinkService.handlePendingInvitation();
      
      expect(notReadyNavRef.navigate).toHaveBeenCalledWith('InvitationAccept', {
        linkCode: 'pending123',
      });
    });
  });

  describe('generateInviteURL', () => {
    it('should generate correct app scheme URL', () => {
      const result = deepLinkService.generateInviteURL('test123');
      expect(result).toBe('geoguardian://invite/test123');
    });
  });

  describe('generateWebFallbackURL', () => {
    it('should generate correct web fallback URL', () => {
      const result = deepLinkService.generateWebFallbackURL('test123');
      expect(result).toBe('https://geoguardian.app/invite/test123');
    });
  });

  describe('handleURL', () => {
    it('should handle valid invite URLs', async () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockReturnValue({
        path: '/invite/handle123',
        queryParams: {},
      });

      deepLinkService.initialize(mockNavigationRef as any);
      
      await deepLinkService.handleURL('geoguardian://invite/handle123');
      
      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('InvitationAccept', {
        linkCode: 'handle123',
      });
    });

    it('should handle URLs without invite codes gracefully', async () => {
      const mockParse = require('expo-linking').parse;
      mockParse.mockReturnValue({
        path: '/other',
        queryParams: {},
      });

      deepLinkService.initialize(mockNavigationRef as any);
      
      await deepLinkService.handleURL('geoguardian://other');
      
      expect(mockNavigationRef.navigate).not.toHaveBeenCalled();
    });
  });
});