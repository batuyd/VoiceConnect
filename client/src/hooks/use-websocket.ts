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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'FRIEND_REQUEST':
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
            // Arkadaşlık isteği kabul edildiğinde friends listesini güncelle
            queryClient.invalidateQueries({ queryKey: ['/api/friends'] });

            // Kullanıcıya toast bildirimi göster
            toast({
              title: t('friend.requestAccepted'),
              description: t('friend.nowFriends', { 
                username: message.data.username 
              }),
            });
            break;
          case 'FRIENDSHIP_REMOVED':
            // Arkadaşlık silindiğinde friends listesini güncelle
            queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient, toast, t]);

  return wsRef.current;
}