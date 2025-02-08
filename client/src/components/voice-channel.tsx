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
  isOwner: boolean;
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

  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
    refetchInterval: 2000
  });

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
        const mediaRecorder = new MediaRecorder(new MediaStream([audioTrack]));

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
            wsRef.current.send(JSON.stringify({
              type: 'voice_data',
              channelId: channel.id,
              data: event.data
            }));
          }
        };

        mediaRecorder.start(100);
      }
    } catch (error) {
      console.error('Audio setup error:', error);
      toast({
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
      setAudioPermissionGranted(false);
      setIsJoined(false);
    }
  }, [selectedInputDevice, isJoined, audioPermissionGranted, channel.id, isMuted, toast, t]);

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

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsJoined(false);
    setWsConnected(false);
    setAudioPermissionGranted(false);
    playLeaveSound();
    await refetchMembers();
  }, [channel.id, user?.id, refetchMembers, playLeaveSound]);

  const connectWebSocket = useCallback(async () => {
    if (!isJoined || !user?.id) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({
          type: 'join_channel',
          channelId: channel.id,
          userId: user.id
        }));
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (isJoined) {
          retryTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 1000);
        }
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'error':
              toast({
                description: data.message,
                variant: "destructive",
              });
              break;

            case 'member_update':
            case 'user_left':
            case 'user_joined':
              await refetchMembers();
              if (data.type === 'user_left') {
                playLeaveSound();
              } else if (data.type === 'user_joined') {
                playJoinSound();
              }
              break;

            case 'voice_data':
              if (data.fromUserId !== user.id) {
                const audioBlob = new Blob([data.data], { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                try {
                  await audio.play();
                  audio.onended = () => URL.revokeObjectURL(audioUrl);
                } catch (error) {
                  console.error('Error playing audio:', error);
                  URL.revokeObjectURL(audioUrl);
                }
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      toast({
        description: t('voice.connectionFailed'),
        variant: "destructive",
      });
    }
  }, [isJoined, channel.id, user?.id, toast, t, refetchMembers, playJoinSound, playLeaveSound]);

  const handleJoinLeave = useCallback(async () => {
    if (isJoined) {
      await handleLeaveChannel();
    } else {
      try {
        const hasPermission = await requestAudioPermissions();
        if (hasPermission) {
          setIsJoined(true);
          await connectWebSocket();
          await setupAudioStream();
          playJoinSound();
        }
      } catch (error) {
        console.error('Failed to join channel:', error);
        toast({
          description: t('voice.joinError'),
          variant: "destructive",
        });
        setIsJoined(false);
        setAudioPermissionGranted(false);
      }
    }
  }, [
    isJoined,
    requestAudioPermissions,
    handleLeaveChannel,
    connectWebSocket,
    setupAudioStream,
    playJoinSound,
    toast,
    t
  ]);

  useEffect(() => {
    if (isJoined) {
      connectWebSocket();
    }
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [isJoined, connectWebSocket]);

  useEffect(() => {
    if (!gainNode.current || !audioContext.current) return;
    if (isMuted) {
      gainNode.current.disconnect();
    } else {
      gainNode.current.connect(audioContext.current.destination);
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      handleLeaveChannel();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
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