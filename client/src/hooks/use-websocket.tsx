import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket() {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        if (socketRef.current?.readyState === WebSocket.CLOSED) {
          socketRef.current = new WebSocket(wsUrl);
        }
      }, 5000);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'Bağlantı hatası',
        description: 'Sunucu ile bağlantı kurulamadı. Tekrar deneniyor...',
        variant: 'destructive',
      });
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        console.log('Received message:', data);

        switch (data.type) {
          case 'error':
            toast({
              title: 'Hata',
              description: data.message,
              variant: 'destructive',
            });
            break;
          case 'connection_established':
            toast({
              title: 'Bağlantı kuruldu',
              description: 'Sunucu ile bağlantı başarıyla kuruldu.',
            });
            break;
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [toast]);

  const sendMessage = (message: WebSocketMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      toast({
        title: 'Bağlantı hatası',
        description: 'Mesaj gönderilemedi. Bağlantı kapalı.',
        variant: 'destructive',
      });
    }
  };

  return {
    isConnected,
    sendMessage,
  };
}
