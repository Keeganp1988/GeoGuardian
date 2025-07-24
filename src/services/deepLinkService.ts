import * as Linking from 'expo-linking';
import { NavigationContainerRef } from '@react-navigation/native';
import { InviteLink } from '../firebase/services';

export interface DeepLinkHandler {
  initialize(navigationRef: NavigationContainerRef<any>): void;
  handleURL(url: string): Promise<void>;
  extractInviteCode(url: string): string | null;
  extractPasswordResetCode(url: string): string | null;
  navigateToInvitation(linkCode: string): void;
  navigateToPasswordReset(resetCode: string): void;
}

class DeepLinkService implements DeepLinkHandler {
  private navigationRef: NavigationContainerRef<any> | null = null;
  private pendingInviteCode: string | null = null;

  initialize(navigationRef: NavigationContainerRef<any>): void {
    this.navigationRef = navigationRef;
    
    // Handle initial URL if app was opened from a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[DeepLinkService] Initial URL:', url);
        this.handleURL(url);
      }
    });

    // Listen for incoming URLs while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[DeepLinkService] Incoming URL:', event.url);
      this.handleURL(event.url);
    });

    return subscription?.remove();
  }

  async handleURL(url: string): Promise<void> {
    try {
      // Check for password reset first
      const resetCode = this.extractPasswordResetCode(url);
      if (resetCode) {
        console.log('[DeepLinkService] Extracted password reset code:', resetCode);
        
        // Navigate to password reset immediately if navigation is ready
        if (this.navigationRef?.isReady()) {
          this.navigateToPasswordReset(resetCode);
        } else {
          console.log('[DeepLinkService] Navigation not ready for password reset');
        }
        return;
      }

      // Check for invite code
      const inviteCode = this.extractInviteCode(url);
      if (inviteCode) {
        console.log('[DeepLinkService] Extracted invite code:', inviteCode);
        
        // Store the invite code for later use if navigation isn't ready
        this.pendingInviteCode = inviteCode;
        
        // Try to navigate immediately if navigation is ready
        if (this.navigationRef?.isReady()) {
          this.navigateToInvitation(inviteCode);
        } else {
          console.log('[DeepLinkService] Navigation not ready, storing invite code for later');
        }
      }
    } catch (error) {
      console.error('[DeepLinkService] Error handling URL:', error);
    }
  }

  extractInviteCode(url: string): string | null {
    try {
      // Handle both app scheme and web URLs
      // App scheme: geoguardian://invite/{linkCode}
      // Web URL: https://geoguardian.app/invite/{linkCode}
      
      const parsed = Linking.parse(url);
      
      // Check if it's an invite path
      if (parsed.path?.includes('invite')) {
        // Extract the invite code from the path
        const pathParts = parsed.path.split('/');
        const inviteIndex = pathParts.indexOf('invite');
        
        if (inviteIndex !== -1 && inviteIndex + 1 < pathParts.length) {
          const linkCode = pathParts[inviteIndex + 1];
          return linkCode || null;
        }
      }
      
      // Also check query parameters as fallback
      if (parsed.queryParams?.code) {
        return parsed.queryParams.code as string;
      }
      
      return null;
    } catch (error) {
      console.error('[DeepLinkService] Error extracting invite code:', error);
      return null;
    }
  }

  extractPasswordResetCode(url: string): string | null {
    try {
      // Handle Firebase Auth password reset URLs
      // These typically come in the format:
      // https://geoguardian.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=...
      // Or custom domain: https://geoguardian.app/__/auth/action?mode=resetPassword&oobCode=...
      
      const parsed = Linking.parse(url);
      
      // Check if it's a Firebase Auth action URL
      if (parsed.path?.includes('__/auth/action') || parsed.path?.includes('auth/action')) {
        const mode = parsed.queryParams?.mode;
        const oobCode = parsed.queryParams?.oobCode;
        
        if (mode === 'resetPassword' && oobCode) {
          return oobCode as string;
        }
      }
      
      // Also handle custom password reset URLs
      // App scheme: geoguardian://reset-password/{code}
      // Web URL: https://geoguardian.app/reset-password/{code}
      if (parsed.path?.includes('reset-password')) {
        const pathParts = parsed.path.split('/');
        const resetIndex = pathParts.indexOf('reset-password');
        
        if (resetIndex !== -1 && resetIndex + 1 < pathParts.length) {
          const resetCode = pathParts[resetIndex + 1];
          return resetCode || null;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[DeepLinkService] Error extracting password reset code:', error);
      return null;
    }
  }

  navigateToInvitation(linkCode: string): void {
    if (!this.navigationRef?.isReady()) {
      console.log('[DeepLinkService] Navigation not ready, storing invite code');
      this.pendingInviteCode = linkCode;
      return;
    }

    try {
      // Navigate to the invitation acceptance screen
      this.navigationRef.navigate('InvitationAccept', { linkCode });
      
      // Clear pending invite code after successful navigation
      this.pendingInviteCode = null;
    } catch (error) {
      console.error('[DeepLinkService] Error navigating to invitation:', error);
    }
  }

  navigateToPasswordReset(resetCode: string): void {
    if (!this.navigationRef?.isReady()) {
      console.log('[DeepLinkService] Navigation not ready for password reset');
      return;
    }

    try {
      // Navigate to the password reset screen
      this.navigationRef.navigate('ResetPassword', { code: resetCode });
      console.log('[DeepLinkService] Navigated to password reset screen');
    } catch (error) {
      console.error('[DeepLinkService] Error navigating to password reset:', error);
    }
  }

  // Method to handle pending invitations when navigation becomes ready
  handlePendingInvitation(): void {
    if (this.pendingInviteCode && this.navigationRef?.isReady()) {
      console.log('[DeepLinkService] Handling pending invitation:', this.pendingInviteCode);
      this.navigateToInvitation(this.pendingInviteCode);
    }
  }

  // Generate invite URL for sharing
  generateInviteURL(linkCode: string): string {
    return `geoguardian://invite/${linkCode}`;
  }

  // Generate web fallback URL
  generateWebFallbackURL(linkCode: string): string {
    return `https://geoguardian.app/invite/${linkCode}`;
  }
}

export default new DeepLinkService();