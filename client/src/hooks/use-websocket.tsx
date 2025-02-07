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
      // Doğrudan port numarası ile WebSocket URL'i
      const wsUrl = `ws://${window.location.hostname}:5000/ws`;
      console.log('WebSocket bağlantısı deneniyor:', wsUrl);

      // Varolan bağlantıyı temizle
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        console.log('Mevcut WebSocket bağlantısı kapatılıyor');
        socketRef.current.close();
      }

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket bağlantısı başarılı');
        setIsConnected(true);
        setRetryCount(0);

        // Ping mesajlarını göndermeye başla
        pingIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      socket.onclose = (event) => {
        console.log('WebSocket bağlantısı kapandı, kod:', event.code, 'neden:', event.reason);
        setIsConnected(false);
        clearInterval(pingIntervalRef.current);

        // Üstel geri çekilme ile yeniden bağlanma
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000);
        console.log(`${timeout}ms sonra yeniden bağlanmayı deneyecek`);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) {
            setRetryCount(prev => prev + 1);
            connectWebSocket();
          }
        }, timeout);
      };

      socket.onerror = (error) => {
        console.error('WebSocket hatası:', error);
        // Sadece bağlantı tamamen koptuğunda kullanıcıya bildir
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
          console.log('WebSocket mesajı alındı:', data);

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
              console.log('Pong yanıtı alındı - bağlantı aktif');
              break;

            default:
              console.log('Bilinmeyen mesaj türü:', data.type);
          }
        } catch (error) {
          console.error('WebSocket mesajı işlenirken hata:', error);
        }
      };
    } catch (error) {
      console.error('WebSocket bağlantısı oluşturulurken hata:', error);
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
      // Temizlik işlemleri
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingIntervalRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connectWebSocket]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket bağlantısı kapalı, mesaj gönderilemiyor');
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
      console.error('Mesaj gönderilirken hata:', error);
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