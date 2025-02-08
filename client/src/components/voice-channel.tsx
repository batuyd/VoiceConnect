import { Volume2, VolumeX } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useSoundEffects } from "@/hooks/use-sound-effects";

interface VoiceChannelProps {
  channel: Channel;
}

interface ChannelMember {
  id: number;
  username: string;
  avatar?: string;
  isMuted: boolean;
}

export function VoiceChannel({ channel }: VoiceChannelProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedInputDevice } = useAudioSettings();
  const { playJoinSound, playLeaveSound } = useSoundEffects();

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionErrors, setConnectionErrors] = useState(0);

  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const retryCount = useRef(0);
  const maxRetries = 3;
  const maxConnectionErrors = 3;

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
    refetchInterval: 2000
  });

  const cleanupAudioResources = useCallback(async () => {
    console.log('Cleaning up audio resources');
    try {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      if (stream.current) {
        stream.current.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.error('Error stopping track:', error);
          }
        });
        stream.current = null;
      }

      if (audioContext.current?.state !== 'closed') {
        try {
          await audioContext.current?.close();
        } catch (error) {
          console.error('Error closing audio context:', error);
        }
      }
      audioContext.current = null;
      gainNode.current = null;
    } catch (error) {
      console.error('Error in cleanupAudioResources:', error);
    }
  }, []);

  const handleLeaveChannel = useCallback(async () => {
    console.log('Leaving channel:', channel.id);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'leave_channel',
          channelId: channel.id
        }));
      } catch (error) {
        console.error('Error sending leave message:', error);
      }
    }

    await cleanupAudioResources();

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      wsRef.current = null;
    }

    setIsJoined(false);
    setWsConnected(false);
    setIsConnecting(false);
    setAudioPermissionGranted(false);
    retryCount.current = 0;
    setConnectionErrors(0);

    playLeaveSound();
  }, [channel.id, playLeaveSound, cleanupAudioResources]);

  const setupAudioStream = useCallback(async () => {
    if (!selectedInputDevice || !isJoined || !audioPermissionGranted || !wsConnected || !channel.id) {
      console.log('Cannot setup audio stream:', {
        selectedInputDevice,
        isJoined,
        audioPermissionGranted,
        wsConnected,
        channelId: channel.id
      });
      return;
    }

    try {
      console.log('Setting up audio stream with device:', selectedInputDevice);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: selectedInputDevice },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      stream.current = mediaStream;

      if (!audioContext.current) {
        audioContext.current = new AudioContext();
      }

      const source = audioContext.current.createMediaStreamSource(mediaStream);
      gainNode.current = audioContext.current.createGain();
      gainNode.current.gain.value = isMuted ? 0 : 1;
      source.connect(gainNode.current);

      console.log('Audio context setup complete');

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('Starting media recorder');
        const recorder = new MediaRecorder(mediaStream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
            try {
              wsRef.current.send(JSON.stringify({
                type: 'voice_data',
                channelId: channel.id,
                data: event.data
              }));
            } catch (error) {
              console.error('Error sending voice data:', error);
            }
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start(100);
        console.log('Media recorder started');
      }
    } catch (error) {
      console.error('Audio setup error:', error);
      toast({
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
      setConnectionErrors(prev => prev + 1);
    }
  }, [selectedInputDevice, isJoined, audioPermissionGranted, wsConnected, channel.id, isMuted, toast, t]);

  const connectWebSocket = useCallback(async () => {
    if (!isJoined || !user?.id || isConnecting || retryCount.current >= maxRetries || connectionErrors >= maxConnectionErrors) {
      console.log('Skipping WebSocket connection:', {
        isJoined,
        userId: user?.id,
        isConnecting,
        retryCount: retryCount.current,
        connectionErrors
      });
      return;
    }

    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        return;
      }

      setIsConnecting(true);
      console.log('Starting WebSocket connection');

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      let joinTimeout: NodeJS.Timeout;

      ws.onopen = () => {
        console.log('WebSocket connected, joining channel:', channel.id);
        setWsConnected(true);
        setIsConnecting(false);
        setConnectionErrors(0);
        retryCount.current = 0;

        joinTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'join_channel',
              channelId: channel.id
            }));
          }
        }, 500);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        clearTimeout(joinTimeout);
        setWsConnected(false);
        wsRef.current = null;

        if (isJoined && retryCount.current < maxRetries && connectionErrors < maxConnectionErrors) {
          const timeout = Math.min(1000 * Math.pow(2, retryCount.current), 5000);
          retryCount.current++;
          setTimeout(connectWebSocket, timeout);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        clearTimeout(joinTimeout);
        setConnectionErrors(prev => prev + 1);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          switch (data.type) {
            case 'join_success':
              console.log('Join success, setting up audio stream');
              await setupAudioStream();
              await refetchMembers();
              break;

            case 'user_joined':
              await refetchMembers();
              playJoinSound();
              break;

            case 'user_left':
              await refetchMembers();
              playLeaveSound();
              break;

            case 'voice_data':
              if (data.fromUserId !== user?.id && data.data) {
                const audioBlob = new Blob([data.data], { type: 'audio/webm;codecs=opus' });
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);

                try {
                  await audio.play();
                  audio.onended = () => URL.revokeObjectURL(audioUrl);
                } catch (error) {
                  console.error('Error playing received audio:', error);
                }
              }
              break;

            case 'error':
              console.error('WebSocket error message:', data.message);
              toast({
                description: data.message,
                variant: "destructive",
              });
              setConnectionErrors(prev => prev + 1);
              break;

            default:
              console.warn('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setIsConnecting(false);
      setConnectionErrors(prev => prev + 1);
    }
  }, [
    channel.id,
    isJoined,
    user?.id,
    isConnecting,
    connectionErrors,
    setupAudioStream,
    refetchMembers,
    playJoinSound,
    playLeaveSound,
    toast,
  ]);

  const requestAudioPermissions = useCallback(async () => {
    try {
      console.log('Requesting audio permissions');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setAudioPermissionGranted(true);
      console.log('Audio permissions granted');
      return true;
    } catch (error) {
      console.error('Audio permission error:', error);
      toast({
        description: t('voice.permissionDenied'),
        variant: "destructive",
      });
      return false;
    }
  }, [toast, t]);

  const handleJoinLeave = useCallback(async () => {
    if (isJoined) {
      await handleLeaveChannel();
    } else {
      const hasPermission = await requestAudioPermissions();
      if (hasPermission) {
        setIsJoined(true);
        playJoinSound();
      }
    }
  }, [isJoined, handleLeaveChannel, requestAudioPermissions, playJoinSound]);

  useEffect(() => {
    if (isJoined && !wsConnected && !isConnecting) {
      connectWebSocket();
    }
  }, [isJoined, wsConnected, isConnecting, connectWebSocket]);

  useEffect(() => {
    if (gainNode.current) {
      gainNode.current.gain.value = isMuted ? 0 : 1;
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      if (isJoined) {
        handleLeaveChannel();
      }
    };
  }, [isJoined, handleLeaveChannel]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-2 rounded hover:bg-gray-700">
        <div className="flex items-center space-x-2">
          {isJoined ? (
            isMuted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-green-400" />
            )
          ) : (
            <Volume2 className="h-4 w-4 text-gray-400" />
          )}
          <span>{channel.name}</span>
          {wsConnected && <span className="w-2 h-2 rounded-full bg-green-500" />}
        </div>

        {!isConnecting && (
          <Button
            variant={isJoined ? "destructive" : "default"}
            size="sm"
            onClick={handleJoinLeave}
            className="w-20"
            disabled={connectionErrors >= maxConnectionErrors}
          >
            {isJoined ? t('server.leave') : t('server.join')}
          </Button>
        )}
      </div>

      {isJoined && (
        <div className="p-2 space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              className={isMuted ? "text-red-400" : "text-green-400"}
            >
              {isMuted ? t('voice.unmute') : t('voice.mute')}
            </Button>
          </div>

          {channelMembers.length > 0 && (
            <div className="space-y-2">
              {channelMembers.map((member) => (
                <div key={member.id} className="flex items-center space-x-2 p-2 rounded bg-gray-700/50">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback>{member.username[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{member.username}</span>
                  {member.isMuted && <VolumeX className="h-3 w-3 text-red-400" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}