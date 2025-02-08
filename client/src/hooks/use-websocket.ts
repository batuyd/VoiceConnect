import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';
import { useRefreshFriendship } from './use-friendship-refresh';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { refreshFriendshipData } = useRefreshFriendship();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const maxReconnectAttempts = 5;
  const reconnectAttemptRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('Setting up WebSocket connection...');
    setConnectionStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established');
      setConnectionStatus('connected');
      reconnectAttemptRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
      setConnectionStatus('disconnected');

      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
        reconnectAttemptRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Attempting to reconnect WebSocket... (Attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
          connect();
        }, timeout);
      } else {
        toast({
          title: t('error.connectionLost'),
          description: t('error.refreshPage')
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: t('error.connectionError'),
        description: t('error.tryAgainLater')
      });
    };

    ws.onmessage = (event) => {
      try {
        console.log('WebSocket message received:', event.data);
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'CONNECTED':
            console.log('WebSocket connection confirmed for user:', message.data.userId);
            refreshFriendshipData();
            break;

          case 'FRIEND_REQUEST':
            console.log('Friend request received:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friend.newRequest'),
              description: t('friend.requestReceived', { username: message.data.sender.username })
            });
            break;

          case 'FRIEND_REQUEST_SENT':
            console.log('Friend request sent confirmation:', message.data);
            refreshFriendshipData();
            break;

          case 'FRIEND_REQUEST_ACCEPTED':
            console.log('Friend request accepted:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friend.requestAccepted'),
              description: t('friend.nowFriends', { username: message.data.username })
            });
            break;

          case 'FRIEND_REQUEST_REJECTED':
            console.log('Friend request rejected:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friend.requestRejected'),
              description: t('friend.requestRejectedDesc', { username: message.data.username })
            });
            break;

          case 'FRIENDSHIP_REMOVED':
            console.log('Friendship removed:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friend.removed'),
              description: t('friend.removedDesc', { username: message.data.username })
            });
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };
  }, [queryClient, toast, t, refreshFriendshipData]);

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

  return {
    connectionStatus,
    websocket: wsRef.current
  };
}