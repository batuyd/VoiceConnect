import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/hooks/use-language';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

const MAX_RETRY_COUNT = 5;
const PING_INTERVAL = 30000; // 30 seconds
const PONG_TIMEOUT = 10000;  // 10 seconds timeout for pong response

export function useWebSocket() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingIntervalRef = useRef<NodeJS.Timeout>();
  const pongTimeoutRef = useRef<NodeJS.Timeout>();
  const lastPongRef = useRef<number>(Date.now());

  const connectWebSocket = useCallback(() => {
    try {
      if (retryCount >= MAX_RETRY_COUNT) {
        console.error('Maximum reconnection attempts exceeded');
        toast({
          title: t('errors.connectionError'),
          description: t('errors.maxRetriesExceeded'),
          variant: 'destructive',
        });
        return;
      }

      // Construct WebSocket URL with proper protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log(`Attempting WebSocket connection (${retryCount + 1}/${MAX_RETRY_COUNT}):`, wsUrl);

      if (socketRef.current) {
        console.log('Closing existing WebSocket connection');
        socketRef.current.close();
        socketRef.current = null;
      }

      // Create WebSocket with credentials support
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connection established');
        setIsConnected(true);
        setRetryCount(0);
        lastPongRef.current = Date.now();

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            console.log('Sending ping');
            socket.send(JSON.stringify({ type: 'ping' }));

            // Set timeout for pong response
            pongTimeoutRef.current = setTimeout(() => {
              const timeSinceLastPong = Date.now() - lastPongRef.current;
              if (timeSinceLastPong > PONG_TIMEOUT) {
                console.error('Pong timeout - closing connection');
                socket.close();
              }
            }, PONG_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      socket.onclose = (event) => {
        console.log('WebSocket connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: new Date().toISOString()
        });
        setIsConnected(false);
        clearInterval(pingIntervalRef.current);
        clearTimeout(pongTimeoutRef.current);

        if (retryCount < MAX_RETRY_COUNT) {
          const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.log(`Attempting reconnection in ${timeout}ms (${retryCount + 1}/${MAX_RETRY_COUNT})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1);
            connectWebSocket();
          }, timeout);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', {
          error,
          readyState: socket.readyState,
          url: socket.url,
          timestamp: new Date().toISOString()
        });

        if (!isConnected) {
          toast({
            title: t('errors.connectionError'),
            description: t('errors.connectionErrorDesc'),
            variant: 'destructive',
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          console.log('WebSocket message received:', {
            type: data.type,
            timestamp: new Date().toISOString(),
            data
          });

          switch (data.type) {
            case 'error':
              toast({
                title: t('errors.error'),
                description: data.message,
                variant: 'destructive',
              });
              break;

            case 'connection_established':
            case 'auth_success':
              toast({
                description: t('success.connected'),
              });
              break;

            case 'pong':
              console.log('Pong received - connection active');
              clearTimeout(pongTimeoutRef.current);
              lastPongRef.current = Date.now();
              break;

            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', {
            error,
            rawData: event.data,
            timestamp: new Date().toISOString()
          });
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', {
        error,
        retryCount,
        isConnected,
        timestamp: new Date().toISOString()
      });
      toast({
        title: t('errors.connectionError'),
        description: t('errors.connectionErrorDesc'),
        variant: 'destructive',
      });
    }
  }, [toast, t, retryCount, isConnected]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingIntervalRef.current);
      clearTimeout(pongTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connectWebSocket]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket connection closed, cannot send message');
      toast({
        title: t('errors.connectionError'),
        description: t('errors.messageNotSent'),
        variant: 'destructive',
      });
      return;
    }

    try {
      socketRef.current.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message:', {
        error,
        message,
        timestamp: new Date().toISOString()
      });
      toast({
        title: t('errors.error'),
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