import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useRefreshFriendship } from './use-friendship-refresh';
import { useLanguage } from './use-language';

export function useFriendshipStatus() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { refreshFriendshipData } = useRefreshFriendship();

  const { data: friendRequests, isLoading: isLoadingRequests } = useQuery({
    queryKey: ['/api/friends/requests'],
    staleTime: 1000 * 60, // 1 minute
    retry: 2,
  });

  const { data: friends, isLoading: isLoadingFriends } = useQuery({
    queryKey: ['/api/friends'],
    staleTime: 1000 * 60,
    retry: 2,
  });

  const sendRequestMutation = useMutation({
    mutationFn: async (username: string) => {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      return response.json();
    },
    onSuccess: () => {
      refreshFriendshipData();
      toast({
        title: t('friend.requestSent'),
        description: t('friend.requestSentDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('error.sendRequestFailed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (friendshipId: number) => {
      const response = await fetch(`/api/friends/${friendshipId}/accept`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to accept friend request');
      }
    },
    onSuccess: () => {
      refreshFriendshipData();
    },
    onError: (error: Error) => {
      toast({
        title: t('error.acceptRequestFailed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (friendshipId: number) => {
      const response = await fetch(`/api/friends/${friendshipId}/reject`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reject friend request');
      }
    },
    onSuccess: () => {
      refreshFriendshipData();
    },
    onError: (error: Error) => {
      toast({
        title: t('error.rejectRequestFailed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    friends,
    friendRequests,
    isLoading: isLoadingRequests || isLoadingFriends,
    sendRequest: sendRequestMutation.mutate,
    acceptRequest: acceptRequestMutation.mutate,
    rejectRequest: rejectRequestMutation.mutate,
    isSending: sendRequestMutation.isPending,
    isAccepting: acceptRequestMutation.isPending,
    isRejecting: rejectRequestMutation.isPending,
  };
}
