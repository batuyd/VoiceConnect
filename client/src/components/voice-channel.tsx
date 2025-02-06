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
  isSpeaking?: boolean;
}

export function VoiceChannel({ channel, isOwner }: VoiceChannelProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { selectedInputDevice, getAudioStream, stopAudioStream } = useAudioSettings();

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [members, setMembers] = useState<ChannelMember[]>([]);

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

          // Kanala katıldığımızı bildiriyoruz
          ws.send(JSON.stringify({
            type: 'join_channel',
            channelId: channel.id
          }));
        };

        ws.onmessage = async (event) => {
          if (!mounted) return;
          try {
            const data = JSON.parse(event.data);

            switch(data.type) {
              case 'user_joined':
                await refetchMembers();
                toast({
                  description: t('voice.userJoined', { username: data.username }),
                });
                break;

              case 'user_left':
                await refetchMembers();
                toast({
                  description: t('voice.userLeft', { username: data.username }),
                });
                break;

              case 'voice_state_update':
                setMembers(prev => prev.map(member => 
                  member.id === data.userId 
                    ? { ...member, isMuted: data.isMuted, isSpeaking: data.isSpeaking }
                    : member
                ));
                break;

              case 'error':
                toast({
                  description: data.message,
                  variant: "destructive",
                });
                break;
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
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

    // Ses akışını başlat
    const setupAudio = async () => {
      if (isJoined && !isMuted) {
        try {
          const stream = await getAudioStream();
          if (!stream) {
            toast({
              description: t('voice.microphoneAccessError'),
              variant: "destructive",
            });
            return;
          }

          // Ses durumunu WebSocket üzerinden bildir
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'voice_state',
              channelId: channel.id,
              isMuted: false,
              isSpeaking: true
            }));
          }
        } catch (error) {
          console.error('Audio setup error:', error);
          toast({
            description: t('voice.deviceAccessError'),
            variant: "destructive",
          });
        }
      }
    };

    if (isJoined && user?.id) {
      connectWebSocket();
      setupAudio();
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
      stopAudioStream();
    };
  }, [isJoined, channel.id, retryCount, user?.id, toast, t, refetchMembers, isMuted, getAudioStream, stopAudioStream]);

  const handleJoinLeave = async () => {
    if (isJoined) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'leave_channel',
          channelId: channel.id
        }));
        wsRef.current.close();
      }
      stopAudioStream();
      setIsJoined(false);
      setWsConnected(false);
      setRetryCount(0);
      setMembers([]);
    } else {
      setIsJoined(true);
    }
  };

  const handleMuteToggle = async () => {
    if (!isJoined) return;

    if (!isMuted) {
      stopAudioStream();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'voice_state',
          channelId: channel.id,
          isMuted: true,
          isSpeaking: false
        }));
      }
    } else {
      const stream = await getAudioStream();
      if (!stream) {
        toast({
          description: t('voice.microphoneAccessError'),
          variant: "destructive",
        });
        return;
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'voice_state',
          channelId: channel.id,
          isMuted: false,
          isSpeaking: true
        }));
      }
    }
    setIsMuted(!isMuted);
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
              onClick={handleMuteToggle}
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
                  {member.isSpeaking && <Volume2 className="h-3 w-3 text-green-400" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}