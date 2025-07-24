import { getInviteWithUserInfo, validateInviteLink, useInviteLink } from '../firebase/services';

// Mock Firebase services
jest.mock('../firebase/services', () => ({
  getInviteWithUserInfo: jest.fn(),
  validateInviteLink: jest.fn(),
  useInviteLink: jest.fn(),
  getUser: jest.fn(),
}));

// Mock Firebase
jest.mock('../firebase/firebase', () => ({
  getFirebaseDb: jest.fn(),
  getUserDoc: jest.fn(),
  getCircleDoc: jest.fn(),
  COLLECTIONS: {
    INVITE_LINKS: 'inviteLinks',
    CIRCLE_MEMBERS: 'circleMembers',
    CIRCLES: 'circles',
  },
}));

describe('Invitation Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateInviteLink', () => {
    it('should validate a valid invite link', async () => {
      const mockInviteLink = {
        id: 'invite123',
        linkCode: 'abc123',
        createdBy: 'user123',
        type: 'group' as const,
        circleId: 'circle123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        isUsed: false,
      };

      (validateInviteLink as jest.Mock).mockResolvedValue(mockInviteLink);

      const result = await validateInviteLink('abc123');
      expect(result).toEqual(mockInviteLink);
    });

    it('should throw error for expired invite link', async () => {
      (validateInviteLink as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired invite link')
      );

      await expect(validateInviteLink('expired123')).rejects.toThrow(
        'Invalid or expired invite link'
      );
    });

    it('should throw error for already used invite link', async () => {
      (validateInviteLink as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired invite link')
      );

      await expect(validateInviteLink('used123')).rejects.toThrow(
        'Invalid or expired invite link'
      );
    });

    it('should throw error for non-existent invite link', async () => {
      (validateInviteLink as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired invite link')
      );

      await expect(validateInviteLink('nonexistent')).rejects.toThrow(
        'Invalid or expired invite link'
      );
    });
  });

  describe('getInviteWithUserInfo', () => {
    it('should get invite with inviter user information', async () => {
      const mockInviteWithUserInfo = {
        id: 'invite123',
        linkCode: 'abc123',
        createdBy: 'user123',
        type: 'group' as const,
        circleId: 'circle123',
        expiresAt: new Date(Date.now() + 3600000),
        isUsed: false,
        inviterName: 'John Doe',
        inviterAvatar: 'https://example.com/avatar.jpg',
        inviterEmail: 'john@example.com',
      };

      (getInviteWithUserInfo as jest.Mock).mockResolvedValue(mockInviteWithUserInfo);

      const result = await getInviteWithUserInfo('abc123');
      expect(result).toEqual(mockInviteWithUserInfo);
      expect(result.inviterName).toBe('John Doe');
      expect(result.inviterAvatar).toBe('https://example.com/avatar.jpg');
      expect(result.inviterEmail).toBe('john@example.com');
    });

    it('should handle missing inviter user gracefully', async () => {
      (getInviteWithUserInfo as jest.Mock).mockRejectedValue(
        new Error('Inviter user not found')
      );

      await expect(getInviteWithUserInfo('abc123')).rejects.toThrow(
        'Inviter user not found'
      );
    });
  });

  describe('useInviteLink', () => {
    it('should successfully accept group invitation', async () => {
      const mockResult = {
        id: 'circle123',
        type: 'group' as const,
        circleId: 'circle123',
        createdBy: 'user123',
      };

      (useInviteLink as jest.Mock).mockResolvedValue(mockResult);

      const result = await useInviteLink('abc123', 'user456');
      expect(result).toEqual(mockResult);
      expect(result.type).toBe('group');
      expect(result.circleId).toBe('circle123');
    });

    it('should successfully accept 1-on-1 invitation', async () => {
      const mockResult = {
        id: 'connection123',
        type: '1on1' as const,
        privateConnectionId: 'connection123',
        createdBy: 'user123',
        otherUserId: 'user123',
      };

      (useInviteLink as jest.Mock).mockResolvedValue(mockResult);

      const result = await useInviteLink('xyz789', 'user456');
      expect(result).toEqual(mockResult);
      expect(result.type).toBe('1on1');
      expect(result.privateConnectionId).toBe('connection123');
    });

    it('should throw error when user is already a member', async () => {
      (useInviteLink as jest.Mock).mockRejectedValue(
        new Error('Already a member of this circle')
      );

      await expect(useInviteLink('abc123', 'user456')).rejects.toThrow(
        'Already a member of this circle'
      );
    });

    it('should throw error when user is already connected (1-on-1)', async () => {
      (useInviteLink as jest.Mock).mockRejectedValue(
        new Error('Already in this 1on1 connection')
      );

      await expect(useInviteLink('xyz789', 'user456')).rejects.toThrow(
        'Already in this 1on1 connection'
      );
    });

    it('should handle network errors gracefully', async () => {
      (useInviteLink as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      await expect(useInviteLink('abc123', 'user456')).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed invite codes', async () => {
      (validateInviteLink as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired invite link')
      );

      await expect(validateInviteLink('')).rejects.toThrow(
        'Invalid or expired invite link'
      );
      await expect(validateInviteLink('invalid-format')).rejects.toThrow(
        'Invalid or expired invite link'
      );
    });

    it('should handle Firebase connection errors', async () => {
      (getInviteWithUserInfo as jest.Mock).mockRejectedValue(
        new Error('Firebase connection failed')
      );

      await expect(getInviteWithUserInfo('abc123')).rejects.toThrow(
        'Firebase connection failed'
      );
    });

    it('should handle authentication errors during invitation acceptance', async () => {
      (useInviteLink as jest.Mock).mockRejectedValue(
        new Error('User not authenticated')
      );

      await expect(useInviteLink('abc123', '')).rejects.toThrow(
        'User not authenticated'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle invitations with missing circle information', async () => {
      (getInviteWithUserInfo as jest.Mock).mockRejectedValue(
        new Error('Invalid group invite link: missing circleId')
      );

      await expect(getInviteWithUserInfo('malformed123')).rejects.toThrow(
        'Invalid group invite link: missing circleId'
      );
    });

    it('should handle invitations with missing connection information', async () => {
      (useInviteLink as jest.Mock).mockRejectedValue(
        new Error('Invalid 1on1 invite link: missing privateConnectionId')
      );

      await expect(useInviteLink('malformed456', 'user123')).rejects.toThrow(
        'Invalid 1on1 invite link: missing privateConnectionId'
      );
    });

    it('should handle concurrent invitation acceptance attempts', async () => {
      // Simulate race condition where invitation gets used between validation and acceptance
      (useInviteLink as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired invite link')
      );

      await expect(useInviteLink('concurrent123', 'user456')).rejects.toThrow(
        'Invalid or expired invite link'
      );
    });
  });
});