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

  const resetConnectionState = useCallback(() => {
    setWsConnected(false);
    setIsConnecting(false);
    retryCount.current = 0;
    setConnectionErrors(0);
  }, []);

  const requestAudioPermissions = useCallback(async () => {
    try {
      console.log('Requesting audio permissions...');
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

  const cleanupAudioResources = useCallback(async () => {
    console.log('Cleaning up audio resources');
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (stream.current) {
      stream.current.getTracks().forEach(track => track.stop());
      stream.current = null;
    }

    if (audioContext.current?.state !== 'closed') {
      await audioContext.current?.close();
      audioContext.current = null;
    }

    gainNode.current = null;
  }, []);

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
      await cleanupAudioResources();

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
      audioContext.current = new AudioContext();

      const source = audioContext.current.createMediaStreamSource(mediaStream);
      gainNode.current = audioContext.current.createGain();
      gainNode.current.gain.value = isMuted ? 0 : 1;
      source.connect(gainNode.current);
      gainNode.current.connect(audioContext.current.destination);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('Starting media recorder');
        const audioTrack = mediaStream.getAudioTracks()[0];
        const recorder = new MediaRecorder(new MediaStream([audioTrack]), {
          mimeType: 'audio/webm'
        });

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
            wsRef.current.send(JSON.stringify({
              type: 'voice_data',
              channelId: channel.id,
              data: event.data
            }));
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
      await handleLeaveChannel();
    }
  }, [selectedInputDevice, isJoined, audioPermissionGranted, wsConnected, channel.id, isMuted, toast, t, cleanupAudioResources]);

  const handleLeaveChannel = useCallback(async () => {
    console.log('Leaving channel:', channel.id);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_channel',
        channelId: channel.id
      }));
    }

    await cleanupAudioResources();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsJoined(false);
    resetConnectionState();
    setAudioPermissionGranted(false);

    if (isJoined) {
      playLeaveSound();
    }
  }, [channel.id, playLeaveSound, isJoined, cleanupAudioResources, resetConnectionState]);

  const connectWebSocket = useCallback(async () => {
    if (!isJoined || !user?.id || isConnecting || retryCount.current >= maxRetries || !channel.id || connectionErrors >= maxConnectionErrors) {
      console.log('Cannot connect WebSocket:', {
        isJoined,
        userId: user?.id,
        isConnecting,
        retryCount: retryCount.current,
        channelId: channel.id,
        connectionErrors
      });
      return;
    }

    try {
      setIsConnecting(true);

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Trying to connect WebSocket to:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionErrors(0);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);

          switch (data.type) {
            case 'error':
              toast({
                description: data.message,
                variant: "destructive",
              });
              setConnectionErrors(prev => prev + 1);
              if (connectionErrors >= maxConnectionErrors) {
                toast({
                  description: t('voice.tooManyErrors'),
                  variant: "destructive",
                });
              }
              await handleLeaveChannel();
              break;

            case 'connection_success':
              console.log('Connection success confirmed');
              setWsConnected(true);
              setIsConnecting(false);
              retryCount.current = 0;
              ws.send(JSON.stringify({
                type: 'join_channel',
                channelId: channel.id,
                userId: user.id
              }));
              break;

            case 'join_success':
              console.log('Successfully joined channel');
              await setupAudioStream();
              await refetchMembers();
              break;

            case 'user_joined':
            case 'user_left':
              await refetchMembers();
              if (data.type === 'user_joined') {
                playJoinSound();
              } else {
                playLeaveSound();
              }
              break;

            case 'voice_data':
              if (data.fromUserId !== user.id && data.data) {
                try {
                  const audioBlob = new Blob([data.data], { type: 'audio/webm' });
                  const audioUrl = URL.createObjectURL(audioBlob);
                  const audio = new Audio(audioUrl);
                  await audio.play();
                  audio.onended = () => URL.revokeObjectURL(audioUrl);
                } catch (error) {
                  console.error('Error playing received audio:', error);
                }
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          setConnectionErrors(prev => prev + 1);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        wsRef.current = null;
        setIsConnecting(false);

        if (isJoined && retryCount.current < maxRetries && connectionErrors < maxConnectionErrors) {
          console.log('Attempting to reconnect WebSocket...');
          retryCount.current++;
          const timeout = Math.min(1000 * Math.pow(2, retryCount.current), 5000);
          setTimeout(() => {
            connectWebSocket();
          }, timeout);
        } else if (retryCount.current >= maxRetries || connectionErrors >= maxConnectionErrors) {
          handleLeaveChannel();
          toast({
            description: t('voice.connectionLost'),
            variant: "destructive",
          });
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionErrors(prev => prev + 1);
        toast({
          description: t('voice.connectionFailed'),
          variant: "destructive",
        });
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setIsConnecting(false);
      setConnectionErrors(prev => prev + 1);
      toast({
        description: t('voice.connectionFailed'),
        variant: "destructive",
      });
    }
  }, [
    isJoined,
    channel.id,
    user?.id,
    isConnecting,
    connectionErrors,
    toast,
    t,
    refetchMembers,
    setupAudioStream,
    handleLeaveChannel,
    playJoinSound,
    playLeaveSound
  ]);

  const handleJoinLeave = useCallback(async () => {
    if (isJoined) {
      await handleLeaveChannel();
    } else {
      const hasPermission = await requestAudioPermissions();
      if (hasPermission) {
        setIsJoined(true);
        playJoinSound();
        await connectWebSocket();
      }
    }
  }, [
    isJoined,
    handleLeaveChannel,
    requestAudioPermissions,
    playJoinSound,
    connectWebSocket
  ]);

  useEffect(() => {
    if (isJoined && !wsConnected && connectionErrors < maxConnectionErrors) {
      connectWebSocket();
    }
  }, [isJoined, wsConnected, connectionErrors, connectWebSocket]);

  useEffect(() => {
    if (!gainNode.current) return;
    gainNode.current.gain.value = isMuted ? 0 : 1;
  }, [isMuted]);

  useEffect(() => {
    return () => {
      handleLeaveChannel();
    };
  }, [handleLeaveChannel]);

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