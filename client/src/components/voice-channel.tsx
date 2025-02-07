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
  const [isConnecting, setIsConnecting] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

  const setupAudioDevices = async () => {
    try {
      if (!selectedInputDevice) {
        toast({
          description: t('voice.noInputDevice'),
          variant: "destructive",
        });
        return null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: selectedInputDevice },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const gain = context.createGain();

      source.connect(gain);
      if (!isMuted) {
        gain.connect(context.destination);
      }

      audioContext.current = context;
      gainNode.current = gain;
      return stream;

    } catch (error) {
      toast({
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
      return null;
    }
  };

  const connectWebSocket = async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({
          type: 'join_channel',
          channelId: channel.id,
          userId: user?.id
        }));
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        setIsJoined(false);
        toast({
          description: t('voice.connectionClosed'),
          variant: "destructive",
        });
      };

      ws.onerror = () => {
        wsRef.current = null;
        toast({
          description: t('voice.connectionError'),
          variant: "destructive",
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'member_update') {
            refetchMembers();
          } else if (data.type === 'error') {
            toast({
              description: data.message,
              variant: "destructive",
            });
            if (data.code === 'AUTH_REQUIRED') {
              ws.close();
            }
          }
        } catch (error) {
          // Hata durumunda sessizce devam et
        }
      };

      wsRef.current = ws;
    } catch (error) {
      toast({
        description: t('voice.connectionFailed'),
        variant: "destructive",
      });
    }
  };

  const handleJoinLeave = async () => {
    if (isJoined) {
      // Kanaldan ayrıl
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (audioContext.current?.state !== 'closed') {
        await audioContext.current?.close();
      }
      setIsJoined(false);
      setWsConnected(false);
      toast({
        description: t('voice.leftChannel'),
      });
    } else {
      // Kanala katıl
      setIsConnecting(true);
      try {
        const audioStream = await setupAudioDevices();
        if (audioStream) {
          stream.current = audioStream;
          await connectWebSocket();
          setIsJoined(true);
          toast({
            description: t('voice.joinedChannel'),
          });
        }
      } catch (error) {
        toast({
          description: t('voice.joinError'),
          variant: "destructive",
        });
      } finally {
        setIsConnecting(false);
      }
    }
  };

  const handleMuteToggle = () => {
    if (!gainNode.current || !audioContext.current) return;

    setIsMuted(!isMuted);
    if (isMuted) {
      gainNode.current.connect(audioContext.current.destination);
      toast({
        description: t('voice.unmuted'),
      });
    } else {
      gainNode.current.disconnect();
      toast({
        description: t('voice.muted'),
      });
    }
  };

  useEffect(() => {
    return () => {
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContext.current?.state !== 'closed') {
        audioContext.current?.close();
      }
    };
  }, []);

  if (!user) {
    return null;
  }

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
          disabled={isConnecting}
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}