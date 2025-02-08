import { createContext, useContext, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface RefreshFriendshipContextType {
  refreshFriendshipData: () => void;
}

const RefreshFriendshipContext = createContext<RefreshFriendshipContextType | null>(null);

export function RefreshFriendshipProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const refreshFriendshipData = () => {
    console.log('Refreshing friendship data from context...');
    queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
    queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });
  };

  return (
    <RefreshFriendshipContext.Provider value={{ refreshFriendshipData }}>
      {children}
    </RefreshFriendshipContext.Provider>
  );
}

export function useRefreshFriendship() {
  const context = useContext(RefreshFriendshipContext);
  if (!context) {
    throw new Error('useRefreshFriendship must be used within a RefreshFriendshipProvider');
  }
  return context;
}
