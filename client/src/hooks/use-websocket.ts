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
  joinChannel: (channelId: number) => void;
}

// Basit bir kontrol: Eğer localStorage'da accessToken varsa giriş yapılmış gibi kabul ediyoruz
function isAuthenticated(): boolean {
  return !!localStorage.getItem("accessToken");
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
    // Kullanıcı giriş yapmadıysa WebSocket başlatma
    if (!isAuthenticated()) {
      console.log("⚠️ Kullanıcı giriş yapmadı, WebSocket başlatılmadı!");
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket zaten bağlı');
      return;
    }

    try {
      console.log('🔄 WebSocket bağlantısı kuruluyor...');
      setConnectionStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:5000/ws`;
      console.log('🌐 Bağlanılan WebSocket URL:', wsUrl);

      const socket = new WebSocket(wsUrl);

      wsRef.current = socket;

      socket.onopen = () => {
        console.log('✅ WebSocket bağlantısı başarıyla kuruldu');
        setConnectionStatus('connected');
        reconnectAttemptRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
        refreshFriendshipData();
      };

      socket.onclose = (event) => {
        console.log('❌ WebSocket bağlantısı kapandı:', event);
        setConnectionStatus('disconnected');
        wsRef.current = null;

        if (event.code !== 1000 && reconnectAttemptRef.current < maxReconnectAttempts) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;
          console.log(`⏳ Tekrar bağlanmaya çalışılıyor... (Deneme ${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(connect, timeout);
        } else if (event.code !== 1000) {
          toast({
            title: t('error.connectionLost'),
            description: t('error.refreshPage'),
            variant: 'destructive'
          });
        }
      };

      socket.onerror = (error) => {
        console.error('⚠️ WebSocket bağlantı hatası:', error);
        if (reconnectAttemptRef.current === 0) {
          toast({
            title: t('error.connectionError'),
            description: t('error.tryAgainLater'),
            variant: 'destructive'
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📩 WebSocket mesajı alındı:', message);

          if (message.type === 'error' && message.data?.message) {
            console.error('⚠️ WebSocket hata mesajı:', message.data);
            toast({
              title: t('error.websocketError'),
              description: message.data.message,
              variant: 'destructive'
            });
            return;
          }

          const handlers = eventHandlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach(handler => {
              try {
                handler(message.data);
              } catch (error) {
                console.error('❌ Mesaj işleyici hatası:', error);
              }
            });
          }

          switch (message.type) {
            case 'CONNECTED':
              console.log('✅ Kullanıcı bağlantısı onaylandı, ID:', message.data.userId);
              break;

            case 'FRIEND_REQUEST':
            case 'FRIEND_REQUEST_ACCEPTED':
            case 'FRIEND_REQUEST_REJECTED':
            case 'FRIENDSHIP_REMOVED':
              refreshFriendshipData();
              const notifications = {
                'FRIEND_REQUEST': {
                  title: t('friends.newRequest'),
                  description: t('friends.requestReceived', { username: message.data.sender?.username })
                },
                'FRIEND_REQUEST_ACCEPTED': {
                  title: t('friends.requestAccepted'),
                  description: t('friends.nowFriends', { username: message.data.username })
                },
                'FRIEND_REQUEST_REJECTED': {
                  title: t('friends.requestRejected'),
                  description: t('friends.requestRejectedDesc', { username: message.data.username })
                },
                'FRIENDSHIP_REMOVED': {
                  title: t('friends.removed'),
                  description: t('friends.removedDesc', { username: message.data.username })
                }
              };
              const notification = notifications[message.type as keyof typeof notifications];
              if (notification) {
                toast({
                  title: notification.title,
                  description: notification.description,
                  variant: 'default'
                });
              }
              break;

            case 'channel_joined':
              console.log('✅ Kanal başarıyla katılındı:', message.data);
              queryClient.invalidateQueries({ queryKey: [`/api/channels/${message.data.channelId}`] });
              break;
          }
        } catch (error) {
          console.error('❌ WebSocket mesaj işleme hatası:', error);
        }
      };
    } catch (error) {
      console.error('❌ WebSocket bağlantı hatası:', error);
      setConnectionStatus('disconnected');
    }
  }, [queryClient, toast, t, refreshFriendshipData]);

  const joinChannel = useCallback((channelId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'join_channel',
        channelId
      }));
    } else {
      console.warn('⚠️ Kanal katılım başarısız: WebSocket bağlı değil');
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

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ Mesaj gönderme başarısız: WebSocket bağlı değil');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      connect();
    }
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
    send,
    joinChannel
  };
}