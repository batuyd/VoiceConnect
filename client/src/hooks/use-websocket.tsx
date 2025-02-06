import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/hooks/use-language';

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function useWebSocket(channelId: number) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const maxRetries = 3;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || retryCount >= maxRetries) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setRetryCount(0);
      ws.send(JSON.stringify({
        type: 'join_channel',
        channelId
      }));
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      wsRef.current = null;

      if (retryCount < maxRetries) {
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          connect();
        }, timeout);
      } else {
        toast({
          description: t('errors.websocketReconnectFailed'),
          variant: "destructive",
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        description: t('errors.websocketConnection'),
        variant: "destructive",
      });
    };

    wsRef.current = ws;
  }, [channelId, retryCount, toast, t]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setRetryCount(0);
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      toast({
        description: t('errors.websocketNotConnected'),
        variant: "destructive",
      });
    }
  }, [toast, t]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    sendMessage,
    connect,
    disconnect,
    retryCount
  };
}