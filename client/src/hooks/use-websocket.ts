import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';
import { useRefreshFriendship } from './use-friendship-refresh';

type WebSocketEventHandler = (data: any) => void;

interface WebSocketManager {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  websocket: WebSocket | null;
  on: (event: string, handler: WebSocketEventHandler) => void;
  off: (event: string, handler: WebSocketEventHandler) => void;
  send: (message: any) => void;
}

export function useWebSocket(): WebSocketManager {
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<WebSocketEventHandler>>>(new Map());
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

    // Ensure we're using the correct protocol based on the current connection
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
      // Refresh friendship data when connection is established
      refreshFriendshipData();
    };

    ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event);
      setConnectionStatus('disconnected');

      if (reconnectAttemptRef.current < maxReconnectAttempts) {
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
        reconnectAttemptRef.current++;

        console.log(`Attempting to reconnect... (Attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
        reconnectTimeoutRef.current = setTimeout(connect, timeout);
      } else {
        toast({
          title: t('error.connectionLost'),
          description: t('error.refreshPage'),
          variant: 'destructive'
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Only show error toast if we're not already attempting to reconnect
      if (reconnectAttemptRef.current === 0) {
        toast({
          title: t('error.connectionError'),
          description: t('error.tryAgainLater'),
          variant: 'destructive'
        });
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);

        // Get all handlers for this event type
        const handlers = eventHandlersRef.current.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message.data));
        }

        // Handle friendship-related events
        switch (message.type) {
          case 'FRIEND_REQUEST':
            console.log('Friend request received:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friends.newRequest'),
              description: t('friends.requestReceived', { username: message.data.sender?.username }),
              variant: 'default'
            });
            break;

          case 'FRIEND_REQUEST_ACCEPTED':
            console.log('Friend request accepted:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friends.requestAccepted'),
              description: t('friends.nowFriends', { username: message.data.username }),
              variant: 'default'
            });
            break;

          case 'FRIEND_REQUEST_REJECTED':
            console.log('Friend request rejected:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friends.requestRejected'),
              description: t('friends.requestRejectedDesc', { username: message.data.username }),
              variant: 'default'
            });
            break;

          case 'FRIENDSHIP_REMOVED':
            console.log('Friendship removed:', message.data);
            refreshFriendshipData();
            toast({
              title: t('friends.removed'),
              description: t('friends.removedDesc', { username: message.data.username }),
              variant: 'default'
            });
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
  }, [queryClient, toast, t, refreshFriendshipData]);

  const on = useCallback((event: string, handler: WebSocketEventHandler) => {
    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, new Set());
    }
    eventHandlersRef.current.get(event)?.add(handler);
  }, []);

  const off = useCallback((event: string, handler: WebSocketEventHandler) => {
    eventHandlersRef.current.get(event)?.delete(handler);
  }, []);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    connectionStatus,
    websocket: wsRef.current,
    on,
    off,
    send
  };
}