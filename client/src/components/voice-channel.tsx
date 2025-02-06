import { Volume2, VolumeX } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MediaControls } from "./media-controls";
import { useAudioSettings } from "@/hooks/use-audio-settings";

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

  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const maxRetries = 3;

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

  useEffect(() => {
    let mounted = true;

    const connectWebSocket = () => {
      if (!isJoined || !user?.id || wsRef.current?.readyState === WebSocket.OPEN || retryCount >= maxRetries) {
        return;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);

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

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'error') {
              console.error('WebSocket error:', data.message);
              toast({
                description: data.message,
                variant: "destructive",
              });
            } else if (data.type === 'member_update') {
              refetchMembers();
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        wsRef.current = ws;
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

    // Only try to connect if we're joined and have a user
    if (isJoined && user?.id) {
      connectWebSocket();
    }

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
    let mounted = true;

    const setupAudioStream = async () => {
      if (!selectedInputDevice || !isJoined) return;

      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            deviceId: { exact: selectedInputDevice },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (!mounted) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        if (!audioContext.current) {
          audioContext.current = new AudioContext();
        }

        stream.current = mediaStream;
        const source = audioContext.current.createMediaStreamSource(mediaStream);
        gainNode.current = audioContext.current.createGain();

        source.connect(gainNode.current);
        if (!isMuted) {
          gainNode.current.connect(audioContext.current.destination);
        }
      } catch (error) {
        console.error('Audio setup error:', error);
        if (mounted) {
          toast({
            description: t('voice.deviceAccessError'),
            variant: "destructive",
          });
        }
      }
    };

    if (isJoined) {
      setupAudioStream();
    }

    return () => {
      mounted = false;
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }
      if (gainNode.current) {
        gainNode.current.disconnect();
      }
      if (audioContext.current?.state !== 'closed') {
        audioContext.current?.close();
      }
    };
  }, [selectedInputDevice, isJoined, isMuted, toast, t]);

  useEffect(() => {
    if (!gainNode.current || !audioContext.current) return;

    if (isMuted) {
      gainNode.current.disconnect();
    } else {
      gainNode.current.connect(audioContext.current.destination);
    }
  }, [isMuted]);

  const handleJoinLeave = () => {
    if (isJoined) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsJoined(false);
      setWsConnected(false);
      setRetryCount(0);
    } else {
      setIsJoined(true);
    }
  };

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