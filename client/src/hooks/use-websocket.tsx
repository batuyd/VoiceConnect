import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/hooks/use-language';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingIntervalRef = useRef<NodeJS.Timeout>();

  const connectWebSocket = useCallback(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Attempting WebSocket connection to:', wsUrl);

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        setRetryCount(0);

        // Start sending ping messages
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event);
        setIsConnected(false);
        clearInterval(pingIntervalRef.current);

        // Exponential backoff for reconnection attempts
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000);
        console.log(`Attempting to reconnect in ${timeout}ms`);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (socketRef.current?.readyState === WebSocket.CLOSED) {
            setRetryCount(prev => prev + 1);
            connectWebSocket();
          }
        }, timeout);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          console.log('Received WebSocket message:', data);

          switch (data.type) {
            case 'error':
              toast({
                title: t('errors.error'),
                description: data.message,
                variant: 'destructive',
              });
              break;

            case 'connection_established':
              toast({
                description: t('success.connected'),
              });
              break;

            case 'friend_request':
              toast({
                title: t('friends.newRequest'),
                description: t('friends.requestFrom', { username: data.from.username }),
              });
              break;

            case 'friend_request_accepted':
              toast({
                description: t('friends.requestAccepted', { username: data.by.username }),
              });
              break;

            case 'pong':
              // Received pong from server, connection is alive
              break;

            default:
              console.log('Unhandled message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      toast({
        title: t('errors.connectionError'),
        description: t('errors.connectionErrorDesc'),
        variant: 'destructive',
      });
    }
  }, [toast, t, retryCount]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingIntervalRef.current);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        toast({
          title: t('errors.error'),
          description: t('errors.messageNotSent'),
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: t('errors.connectionError'),
        description: t('errors.messageNotSent'),
        variant: 'destructive',
      });
    }
  }, [toast, t]);

  return {
    isConnected,
    sendMessage,
  };
}