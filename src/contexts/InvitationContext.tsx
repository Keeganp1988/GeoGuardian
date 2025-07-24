import React, { createContext, useContext, useState, ReactNode } from 'react';
import { InviteLink } from '../firebase/services';

export interface InviteWithUserInfo extends InviteLink {
  inviterName: string;
  inviterAvatar?: string;
  inviterEmail?: string;
}

interface InvitationContextType {
  pendingInvitation: InviteWithUserInfo | null;
  setPendingInvitation: (invite: InviteWithUserInfo | null) => void;
  clearInvitation: () => void;
  isProcessingInvitation: boolean;
  setProcessingInvitation: (processing: boolean) => void;
}

const InvitationContext = createContext<InvitationContextType | undefined>(undefined);

export function InvitationProvider({ children }: { children: ReactNode }) {
  const [pendingInvitation, setPendingInvitation] = useState<InviteWithUserInfo | null>(null);
  const [isProcessingInvitation, setProcessingInvitation] = useState(false);

  const clearInvitation = () => {
    setPendingInvitation(null);
    setProcessingInvitation(false);
  };

  const value = {
    pendingInvitation,
    setPendingInvitation,
    clearInvitation,
    isProcessingInvitation,
    setProcessingInvitation,
  };

  return (
    <InvitationContext.Provider value={value}>
      {children}
    </InvitationContext.Provider>
  );
}

export function useInvitation() {
  const context = useContext(InvitationContext);
  if (context === undefined) {
    throw new Error('useInvitation must be used within an InvitationProvider');
  }
  return context;
}