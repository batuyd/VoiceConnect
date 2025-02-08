import { Volume2, VolumeX } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MediaControls } from "./media-controls";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface VoiceChannelProps {
  channel: Channel;
  isOwner: boolean;
}

interface ChannelMember {
  id: number;
  username: string;
  avatar?: string;
  isMuted: boolean;
}

export function VoiceChannel({ channel, isOwner }: VoiceChannelProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedInputDevice } = useAudioSettings();

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const maxRetries = 3;

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
    refetchInterval: 5000 // Her 5 saniyede bir üye listesini güncelle
  });

  const setupAudioStream = useCallback(async () => {
    if (!selectedInputDevice || !isJoined || !audioPermissionGranted) return;

    try {
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: selectedInputDevice },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      stream.current = mediaStream;

      if (!audioContext.current || audioContext.current.state === 'closed') {
        audioContext.current = new AudioContext();
      }

      const source = audioContext.current.createMediaStreamSource(mediaStream);
      gainNode.current = audioContext.current.createGain();
      source.connect(gainNode.current);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const audioTrack = mediaStream.getAudioTracks()[0];
        const mediaRecorder = new MediaRecorder(new MediaStream([audioTrack]), {
          mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'voice_data',
              channelId: channel.id,
              data: event.data
            }));
          }
        };

        mediaRecorder.start(100);
      }

      console.log('Audio stream setup successful');
    } catch (error) {
      console.error('Audio setup error:', error);
      toast({
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
    }
  }, [selectedInputDevice, isJoined, audioPermissionGranted, channel.id, toast, t]);

  const requestAudioPermissions = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioPermissionGranted(true);
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

  useEffect(() => {
    let mounted = true;

    const connectWebSocket = async () => {
      if (!isJoined || !user?.id || wsRef.current?.readyState === WebSocket.OPEN || retryCount >= maxRetries) {
        return;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        console.log('Connecting to WebSocket:', wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mounted) return;
          console.log('WebSocket connected');
          setWsConnected(true);
          setRetryCount(0);
          ws.send(JSON.stringify({
            type: 'join_channel',
            channelId: channel.id,
            userId: user.id
          }));
        };

        ws.onclose = () => {
          if (!mounted) return;
          console.log('WebSocket disconnected');
          setWsConnected(false);
          wsRef.current = null;

          if (isJoined && retryCount < maxRetries) {
            const timeout = Math.min(1000 * Math.pow(2, retryCount), 5000);
            retryTimeoutRef.current = setTimeout(() => {
              if (mounted) {
                setRetryCount(prev => prev + 1);
              }
            }, timeout);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (mounted) {
            toast({
              description: t('voice.connectionError'),
              variant: "destructive",
            });
          }
        };

        ws.onmessage = async (event) => {
          if (!mounted) return;
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);

            if (data.type === 'error') {
              console.error('WebSocket error:', data.message);
              toast({
                description: data.message,
                variant: "destructive",
              });
            } else if (data.type === 'member_update' || data.type === 'user_left' || data.type === 'user_joined') {
              // Üye listesini hemen güncelle
              await refetchMembers();

              // Bildirim göster
              if (data.type === 'user_left') {
                toast({
                  description: t('voice.userLeft', { username: data.username }),
                });
              } else if (data.type === 'user_joined') {
                toast({
                  description: t('voice.userJoined', { username: data.username }),
                });
              }
            } else if (data.type === 'voice_data' && data.fromUserId !== user.id) {
              const audioData = data.data;
              const audioBlob = new Blob([audioData], { type: 'audio/webm;codecs=opus' });
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);

              try {
                await audio.play();
                audio.onended = () => {
                  URL.revokeObjectURL(audioUrl);
                };
              } catch (error) {
                console.error('Error playing audio:', error);
                URL.revokeObjectURL(audioUrl);
              }
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        if (mounted) {
          toast({
            description: t('voice.connectionFailed'),
            variant: "destructive",
          });
        }
      }
    };

    connectWebSocket();

    return () => {
      mounted = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isJoined, channel.id, retryCount, user?.id, toast, t, refetchMembers]);

  useEffect(() => {
    if (isJoined && !audioPermissionGranted) {
      requestAudioPermissions().then(granted => {
        if (granted) {
          setupAudioStream();
        }
      });
    }
  }, [isJoined, audioPermissionGranted, requestAudioPermissions, setupAudioStream]);

  useEffect(() => {
    if (isJoined && audioPermissionGranted) {
      setupAudioStream();
    }
  }, [isJoined, audioPermissionGranted, setupAudioStream]);

  useEffect(() => {
    if (!gainNode.current || !audioContext.current) return;

    if (isMuted) {
      gainNode.current.disconnect();
    } else {
      gainNode.current.connect(audioContext.current.destination);
    }
  }, [isMuted]);

  const handleLeaveChannel = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_channel',
        channelId: channel.id,
        userId: user?.id
      }));
    }

    if (stream.current) {
      stream.current.getTracks().forEach(track => track.stop());
      stream.current = null;
    }

    if (audioContext.current?.state !== 'closed') {
      await audioContext.current?.close();
    }

    setIsJoined(false);
    setWsConnected(false);
    setRetryCount(0);
    setAudioPermissionGranted(false);
  }, [channel.id, user?.id]);

  useEffect(() => {
    return () => {
      handleLeaveChannel();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [handleLeaveChannel]);

  const handleJoinLeave = useCallback(async () => {
    if (isJoined) {
      await handleLeaveChannel();
    } else {
      const hasPermission = await requestAudioPermissions();
      if (hasPermission) {
        setIsJoined(true);
      }
    }
  }, [isJoined, requestAudioPermissions, handleLeaveChannel]);

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

        <Button
          variant={isJoined ? "destructive" : "default"}
          size="sm"
          onClick={handleJoinLeave}
          className="w-20"
        >
          {isJoined ? t('server.leave') : t('server.join')}
        </Button>
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