import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useRefreshFriendship } from './use-friendship-refresh';
import { useLanguage } from './use-language';
import { useWebSocket } from './use-websocket';
import React from 'react';

export function useFriendshipStatus() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { refreshFriendshipData } = useRefreshFriendship();
  const socket = useWebSocket();

  const { data: friendRequests, isLoading: isLoadingRequests } = useQuery({
    queryKey: ['/api/friends/requests'],
    staleTime: 1000 * 60,
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
        title: t('friends.addSuccess'),
        description: t('friends.addSuccessDescription'),
        variant: 'default'
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.addError'),
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to accept friend request');
      }

      return response.json();
    },
    onSuccess: () => {
      refreshFriendshipData();
      toast({
        title: t('friends.requestAcceptSuccess'),
        description: t('friends.requestAcceptSuccessDescription'),
        variant: 'default'
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.requestAcceptError'),
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to reject friend request');
      }

      return response.json();
    },
    onSuccess: () => {
      refreshFriendshipData();
      toast({
        title: t('friends.requestRejectSuccess'),
        description: t('friends.requestRejectSuccessDescription'),
        variant: 'default'
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.requestRejectError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (friendId: number) => {
      const response = await fetch(`/api/friends/remove/${friendId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove friend');
      }
    },
    onSuccess: () => {
      refreshFriendshipData();
      toast({
        title: t('friends.removeSuccess'),
        description: t('friends.removeSuccessDescription'),
        variant: 'default'
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.removeError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // WebSocket event handlers
  React.useEffect(() => {
    if (socket) {
      const handleFriendRequest = (data: any) => {
        refreshFriendshipData();
        toast({
          title: t('friends.newRequest'),
          description: t('friends.requestReceived', data),
          variant: 'default'
        });
      };

      const handleFriendRequestAccepted = (data: any) => {
        refreshFriendshipData();
        toast({
          title: t('friends.requestAccepted'),
          description: t('friends.nowFriends', data),
          variant: 'default'
        });
      };

      const handleFriendRequestRejected = (data: any) => {
        refreshFriendshipData();
        toast({
          title: t('friends.requestRejected'),
          description: t('friends.requestRejectedDesc', data),
          variant: 'default'
        });
      };

      const handleFriendshipRemoved = (data: any) => {
        refreshFriendshipData();
        toast({
          title: t('friends.removed'),
          description: t('friends.removedDesc', data),
          variant: 'default'
        });
      };

      socket.on('FRIEND_REQUEST', handleFriendRequest);
      socket.on('FRIEND_REQUEST_ACCEPTED', handleFriendRequestAccepted);
      socket.on('FRIEND_REQUEST_REJECTED', handleFriendRequestRejected);
      socket.on('FRIENDSHIP_REMOVED', handleFriendshipRemoved);

      return () => {
        socket.off('FRIEND_REQUEST', handleFriendRequest);
        socket.off('FRIEND_REQUEST_ACCEPTED', handleFriendRequestAccepted);
        socket.off('FRIEND_REQUEST_REJECTED', handleFriendRequestRejected);
        socket.off('FRIENDSHIP_REMOVED', handleFriendshipRemoved);
      };
    }
  }, [socket, refreshFriendshipData, t, toast]);

  return {
    friends,
    friendRequests,
    isLoading: isLoadingRequests || isLoadingFriends,
    sendRequest: sendRequestMutation.mutate,
    acceptRequest: acceptRequestMutation.mutate,
    rejectRequest: rejectRequestMutation.mutate,
    removeFriend: removeFriendMutation.mutate,
    isSending: sendRequestMutation.isPending,
    isAccepting: acceptRequestMutation.isPending,
    isRejecting: rejectRequestMutation.isPending,
    isRemoving: removeFriendMutation.isPending,
  };
}