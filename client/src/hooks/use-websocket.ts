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
  joinVoiceChannel: (channelId: number) => Promise<void>;
  leaveVoiceChannel: (channelId: number) => void;
  toggleMute: (channelId: number, isMuted: boolean) => void;
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
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean>(false);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const requestAudioPermission = useCallback(async () => {
    if (!navigator.mediaDevices) {
      toast({
        title: t('error.audioUnsupported'),
        description: t('error.browserNotSupported'),
        variant: 'destructive'
      });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }

      audioStreamRef.current = stream;
      setHasAudioPermission(true);
      return true;
    } catch (error: any) {
      console.error('Audio permission error:', error);

      const errorMessage = error.name === 'NotAllowedError' 
        ? t('error.microphonePermissionDenied')
        : t('error.microphoneAccessError');

      toast({
        title: t('error.audioPermission'),
        description: errorMessage,
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, t]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    const user = queryClient.getQueryData(['/api/user']);
    if (!user) {
      console.log('Not attempting WebSocket connection - user not authenticated');
      return;
    }

    try {
      console.log('Setting up WebSocket connection...');
      setConnectionStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Connecting to WebSocket URL:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection established successfully');
        setConnectionStatus('connected');
        reconnectAttemptRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
        refreshFriendshipData();
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event);
        setConnectionStatus('disconnected');
        wsRef.current = null;

        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
          setHasAudioPermission(false);
        }

        const currentUser = queryClient.getQueryData(['/api/user']);
        if (currentUser && reconnectAttemptRef.current < maxReconnectAttempts) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current++;

          console.log(`Attempting to reconnect... (Attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = setTimeout(connect, timeout);
        } else if (currentUser) {
          toast({
            title: t('error.connectionLost'),
            description: t('error.refreshPage'),
            variant: 'destructive'
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (reconnectAttemptRef.current === 0) {
          const currentUser = queryClient.getQueryData(['/api/user']);
          if (currentUser) {
            toast({
              title: t('error.connectionError'),
              description: t('error.tryAgainLater'),
              variant: 'destructive'
            });
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);

          const handlers = eventHandlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach(handler => {
              try {
                handler(message.data);
              } catch (error) {
                console.error('Error in message handler:', error);
              }
            });
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      setConnectionStatus('disconnected');
      toast({
        title: t('error.connectionError'),
        description: t('error.tryAgainLater'),
        variant: 'destructive'
      });
    }
  }, [queryClient, toast, t, refreshFriendshipData]);

  useEffect(() => {
    const user = queryClient.getQueryData(['/api/user']);
    if (user) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [connect, queryClient]);

  const joinVoiceChannel = useCallback(async (channelId: number) => {
    console.log('Attempting to join voice channel:', channelId);

    if (!hasAudioPermission) {
      console.log('Requesting audio permissions before joining voice channel');
      const granted = await requestAudioPermission();
      if (!granted) {
        console.log('Failed to get audio permissions');
        return;
      }
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Sending join voice channel request');
      wsRef.current.send(JSON.stringify({
        type: 'join_voice_channel',
        channelId
      }));
    } else {
      console.warn('Cannot join voice channel - WebSocket not connected');
    }
  }, [hasAudioPermission, requestAudioPermission]);

  const leaveVoiceChannel = useCallback((channelId: number) => {
    console.log('Leaving voice channel:', channelId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_voice_channel',
        channelId
      }));
    }
  }, []);

  const toggleMute = useCallback((channelId: number, isMuted: boolean) => {
    console.log('Toggling mute state:', { channelId, isMuted });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'toggle_mute',
        channelId,
        isMuted
      }));
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
      console.warn('Attempted to send message while WebSocket is not connected');
    }
  }, []);

  return {
    connectionStatus,
    websocket: wsRef.current,
    on,
    off,
    send,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute
  };
}