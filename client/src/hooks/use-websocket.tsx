import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

type WebSocketEventHandler = (data: any) => void;

interface WebSocketManager {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  websocket: WebSocket | null;
  send: (message: any) => void;
  on: (event: string, handler: WebSocketEventHandler) => void;
  off: (event: string, handler: WebSocketEventHandler) => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 5000;
const PING_INTERVAL = 30000;
const PONG_TIMEOUT = 10000;

export function useWebSocket(): WebSocketManager {
  const wsRef = useRef<WebSocket | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<WebSocketEventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingIntervalRef = useRef<NodeJS.Timeout>();
  const pongTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const lastPongRef = useRef<number>(Date.now());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current);
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log(`Attempting WebSocket connection (${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection established');
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        lastPongRef.current = Date.now();

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));

            // Set pong timeout
            pongTimeoutRef.current = setTimeout(() => {
              const timeSinceLastPong = Date.now() - lastPongRef.current;
              if (timeSinceLastPong > PONG_TIMEOUT) {
                console.log('Pong timeout - reconnecting');
                ws.close();
              }
            }, PONG_TIMEOUT);
          }
        }, PING_INTERVAL);
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed', event.code, event.reason);
        setConnectionStatus('disconnected');
        cleanup();
        wsRef.current = null;

        // Don't reconnect on authentication failure
        if (event.code === 1008) {
          toast({
            title: t('error.authenticationFailed'),
            description: t('error.pleaseLogin'),
            variant: 'destructive'
          });
          return;
        }

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), RECONNECT_INTERVAL);
          console.log(`Scheduling reconnect in ${timeout}ms`);
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
        if (connectionStatus !== 'connected') {
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

          if (message.type === 'pong') {
            lastPongRef.current = Date.now();
            if (pongTimeoutRef.current) {
              clearTimeout(pongTimeoutRef.current);
            }
            return;
          }

          // Get all handlers for this event type
          const handlers = eventHandlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach(handler => handler(message.data));
          }

          // Handle specific events that require global state updates
          switch (message.type) {
            case 'user_status_change':
              queryClient.invalidateQueries({ queryKey: ['/api/users'] });
              break;
            case 'friend_request':
            case 'friend_request_accepted':
            case 'friend_request_rejected':
              queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
              queryClient.invalidateQueries({ queryKey: ['/api/friends/requests'] });
              break;
            case 'channel_update':
              queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
              break;
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setConnectionStatus('disconnected');
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), RECONNECT_INTERVAL);
        reconnectTimeoutRef.current = setTimeout(connect, timeout);
      }
    }
  }, [cleanup, connectionStatus, queryClient, t, toast]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        return false;
      }
    } else {
      console.warn('WebSocket is not connected, message not sent:', message);
      return false;
    }
  }, []);

  const on = useCallback((event: string, handler: WebSocketEventHandler) => {
    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, new Set());
    }
    eventHandlersRef.current.get(event)?.add(handler);
  }, []);

  const off = useCallback((event: string, handler: WebSocketEventHandler) => {
    eventHandlersRef.current.get(event)?.delete(handler);
  }, []);

  return {
    connectionStatus,
    websocket: wsRef.current,
    send,
    on,
    off
  };
}