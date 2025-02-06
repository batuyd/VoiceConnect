import { Volume2, VolumeX, Plus } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const { selectedInputDevice } = useAudioSettings();
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const maxRetries = 5;
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

  // WebSocket connection setup
  useEffect(() => {
    let mounted = true;

    const connectWebSocket = () => {
      if (!isJoined || !user?.id || wsRef.current?.readyState === WebSocket.OPEN || retryCount >= maxRetries) {
        return;
      }

      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
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

          if (retryCount < maxRetries && isJoined) {
            const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
            retryTimeoutRef.current = setTimeout(() => {
              if (mounted) {
                setRetryCount(prev => prev + 1);
                connectWebSocket();
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

  // Audio stream setup
  useEffect(() => {
    let mounted = true;

    async function setupAudioStream() {
      if (!selectedInputDevice || !isJoined) return;

      // Clean up existing stream
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }

      try {
        // Request audio permissions first
        await navigator.mediaDevices.getUserMedia({ 
          audio: {
            deviceId: { exact: selectedInputDevice },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        }).then(async (mediaStream) => {
          if (!mounted) {
            mediaStream.getTracks().forEach(track => track.stop());
            return;
          }

          // Create new audio context and stream
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
        }).catch((error) => {
          console.error('Audio stream error:', error);
          if (mounted) {
            toast({
              description: t('voice.streamError'),
              variant: "destructive",
            });
          }
        });
      } catch (error) {
        console.error('Audio setup error:', error);
        if (mounted) {
          toast({
            description: t('voice.deviceAccessError'),
            variant: "destructive",
          });
        }
      }
    }

    setupAudioStream();

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

  // Handle mute/unmute
  useEffect(() => {
    if (!gainNode.current || !audioContext.current) return;

    if (isMuted) {
      gainNode.current.disconnect();
    } else {
      gainNode.current.connect(audioContext.current.destination);
    }
  }, [isMuted]);

  const addBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/debug/create-bot", {
        serverId: channel.serverId
      });
      return res.json();
    },
    onSuccess: () => {
      refetchMembers();
      toast({
        description: t('server.botAdded'),
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-3 flex items-center justify-between bg-gray-800">
        <div className="flex items-center space-x-2">
          {isJoined ? (
            isMuted ? (
              <VolumeX className="h-4 w-4 text-gray-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-green-400" />
            )
          ) : (
            <Volume2 className="h-4 w-4 text-gray-400" />
          )}
          <span>{channel.name}</span>
          {wsConnected && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {!wsConnected && isJoined && retryCount < maxRetries && (
            <span className="text-xs text-yellow-400">{t('voice.reconnecting')}</span>
          )}
          {!wsConnected && isJoined && retryCount >= maxRetries && (
            <span className="text-xs text-red-400">{t('voice.connectionFailed')}</span>
          )}
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
        <div className="p-3 space-y-4 bg-gray-800/50">
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
            <>
              <div className="h-[1px] bg-gray-700" />
              <div className="flex flex-wrap gap-2">
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
            </>
          )}
          <div className="w-full relative z-10">
            <MediaControls channelId={channel.id} isVoiceChannel={true} />
          </div>
        </div>
      )}
    </div>
  );
}