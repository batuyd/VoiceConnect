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

  // Check audio permissions
  const checkAudioPermissions = async () => {
    try {
      console.log('Checking audio permissions...');
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices) {
        throw new Error('MediaDevices API not available');
      }

      // Request permissions first
      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      console.log('Audio permissions granted');
      return true;
    } catch (error) {
      console.error('Audio permission error:', error);
      toast({
        title: t('voice.error'),
        description: t('voice.microphonePermissionDenied'),
        variant: "destructive",
      });
      return false;
    }
  };

  const setupAudioDevices = async () => {
    try {
      console.log('Setting up audio devices...');
      const hasPermission = await checkAudioPermissions();
      if (!hasPermission) return null;

      if (!selectedInputDevice) {
        toast({
          title: t('voice.error'),
          description: t('voice.noInputDevice'),
          variant: "destructive",
        });
        return null;
      }

      // Resume or create AudioContext
      let context = audioContext.current;
      if (!context) {
        context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContext.current = context;
      }

      if (context.state === 'suspended') {
        await context.resume();
      }

      console.log('Creating audio stream...');
      const constraints = {
        audio: {
          deviceId: { exact: selectedInputDevice },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      };

      const audioStream = await navigator.mediaDevices.getUserMedia(constraints);
      const source = context.createMediaStreamSource(audioStream);
      const gain = context.createGain();

      source.connect(gain);
      if (!isMuted) {
        gain.connect(context.destination);
      }

      gainNode.current = gain;
      console.log('Audio setup complete');
      return audioStream;

    } catch (error) {
      console.error('Audio setup error:', error);
      toast({
        title: t('voice.error'),
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
      return null;
    }
  };

  const connectWebSocket = async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      console.log('Connecting to WebSocket...');
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      let pingInterval: NodeJS.Timeout;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        ws.send(JSON.stringify({
          type: 'join_channel',
          channelId: channel.id,
          userId: user?.id
        }));

        // Keep connection alive
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setWsConnected(false);
        wsRef.current = null;
        setIsJoined(false);
        clearInterval(pingInterval);
        toast({
          title: t('voice.error'),
          description: t('voice.connectionClosed'),
          variant: "destructive",
        });
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        wsRef.current = null;
        toast({
          title: t('voice.error'),
          description: t('voice.connectionError'),
          variant: "destructive",
        });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data.type);

          switch (data.type) {
            case 'member_update':
              refetchMembers();
              break;
            case 'error':
              toast({
                title: t('voice.error'),
                description: data.message,
                variant: "destructive",
              });
              if (data.code === 'AUTH_REQUIRED') {
                ws.close();
              }
              break;
            case 'pong':
              // Connection alive
              break;
            case 'channel_members':
              refetchMembers();
              break;
          }
        } catch (error) {
          console.error('Message processing error:', error);
        }
      };

      wsRef.current = ws;

    } catch (error) {
      console.error('WebSocket connection error:', error);
      toast({
        title: t('voice.error'),
        description: t('voice.connectionFailed'),
        variant: "destructive",
      });
    }
  };

  const handleJoinLeave = async () => {
    if (isJoined) {
      console.log('Leaving channel...');
      // Leave channel
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'leave_channel',
          channelId: channel.id
        }));
        wsRef.current.close();
      }
      wsRef.current = null;

      if (audioContext.current?.state !== 'closed') {
        await audioContext.current?.close();
      }
      audioContext.current = null;
      gainNode.current = null;

      setIsJoined(false);
      setWsConnected(false);
      toast({
        description: t('voice.leftChannel'),
      });
    } else {
      console.log('Joining channel...');
      // Join channel
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
        console.error('Join channel error:', error);
        toast({
          title: t('voice.error'),
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

  // Cleanup resources
  useEffect(() => {
    return () => {
      console.log('Cleaning up voice channel...');
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      if (audioContext.current?.state !== 'closed') {
        audioContext.current?.close();
      }
    };
  }, []);

  if (!user) return null;

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