import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('Setting up WebSocket connection...');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
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
            queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });
            toast({
              title: t('friend.newRequest'),
              description: t('friend.requestReceived', message.data.sender.username),
            });
            break;

          case 'FRIEND_REQUEST_ACCEPTED':
            console.log('Friend request accepted:', message.data);
            queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
            queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });
            toast({
              title: t('friend.requestAccepted'),
              description: t('friend.nowFriends', message.data.username),
            });
            break;

          case 'FRIEND_REQUEST_REJECTED':
            console.log('Friend request rejected:', message.data);
            queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });
            toast({
              title: t('friend.requestRejected'),
              description: t('friend.requestRejectedDesc', message.data.username),
            });
            break;

          case 'FRIENDSHIP_REMOVED':
            console.log('Friendship removed:', message.data);
            queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
            toast({
              title: t('friend.removed'),
              description: t('friend.removedDesc', message.data.username),
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
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        connect();
      }, 5000);
    };
  }, [queryClient, toast, t]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        console.log('Cleaning up WebSocket connection');
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef.current;
}