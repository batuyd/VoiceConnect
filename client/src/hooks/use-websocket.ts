import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    console.log('Setting up WebSocket connection...');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established');
    };

    ws.onmessage = (event) => {
      try {
        console.log('WebSocket message received:', event.data);
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'CONNECTED':
            console.log('WebSocket connection confirmed for user:', message.data.userId);
            break;

          case 'FRIEND_REQUEST':
            console.log('Friend request received:', message.data);
            // Friend request bildirimi geldiğinde friend requests query'sini invalidate et
            queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });

            // Kullanıcıya toast bildirimi göster
            toast({
              title: t('friend.newRequest'),
              description: t('friend.requestReceived', { 
                username: message.data.sender.username 
              }),
            });
            break;

          case 'FRIEND_REQUEST_ACCEPTED':
            console.log('Friend request accepted:', message.data);
            // Arkadaşlık isteği kabul edildiğinde friends listesini ve requests'i güncelle
            queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
            queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });

            // Kullanıcıya toast bildirimi göster
            toast({
              title: t('friend.requestAccepted'),
              description: t('friend.nowFriends', { 
                username: message.data.username 
              }),
            });
            break;

          case 'FRIEND_REQUEST_REJECTED':
            console.log('Friend request rejected:', message.data);
            // Arkadaşlık isteği reddedildiğinde requests'i güncelle
            queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });

            // Kullanıcıya toast bildirimi göster
            toast({
              title: t('friend.requestRejected'),
              description: t('friend.requestRejectedDesc', { 
                username: message.data.username 
              }),
            });
            break;

          case 'FRIENDSHIP_REMOVED':
            console.log('Friendship removed:', message.data);
            // Arkadaşlık silindiğinde friends listesini güncelle
            queryClient.invalidateQueries({ queryKey: ['/api/friends'] });

            // Kullanıcıya toast bildirimi göster
            toast({
              title: t('friend.removed'),
              description: t('friend.removedDesc', { 
                username: message.data.username 
              }),
            });
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    return () => {
      if (wsRef.current) {
        console.log('Cleaning up WebSocket connection');
        wsRef.current.close();
      }
    };
  }, [queryClient, toast, t]);

  return wsRef.current;
}