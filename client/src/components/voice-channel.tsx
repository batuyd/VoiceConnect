import { Volume2, VolumeX, Trash2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useWebRTC } from "@/hooks/use-webrtc";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";

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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const { connectionStatus, websocket, joinChannel } = useWebSocket();
  const { isConnected, peers, createPeer, cleanup } = useWebRTC(channel.id);

  const deleteChannelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channel.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${channel.serverId}/channels`] });
      toast({
        description: t('server.channelDeleted'),
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setupLocalStream = useCallback(async () => {
    try {
      console.log('Setting up local stream with device:', selectedInputDevice);

      // Önce ses izinlerini kontrol et
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      console.log('Local stream setup successful');
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Audio permission error:', error);
      toast({
        description: t('voice.permissionDenied'),
        variant: "destructive",
      });
      return null;
    }
  }, [selectedInputDevice, toast, t]);

  const handleJoinLeave = async () => {
    if (isJoined) {
      console.log('Leaving voice channel');

      // Ses akışını temizle
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped track:', track.kind);
        });
        setLocalStream(null);
      }

      // WebRTC bağlantılarını temizle
      cleanup();

      // WebSocket üzerinden kanaldan ayrıldığını bildir
      if (websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          type: 'leave_channel',
          channelId: channel.id
        }));
      }

      setIsJoined(false);
      setIsMuted(false);
    } else {
      console.log('Joining voice channel');
      const stream = await setupLocalStream();
      if (stream) {
        // WebSocket üzerinden kanala katıl
        joinChannel(channel.id);

        // Mevcut üyelerle WebRTC bağlantısı kur
        const members = await queryClient.fetchQuery({
          queryKey: [`/api/channels/${channel.id}/members`],
          queryFn: () => apiRequest("GET", `/api/channels/${channel.id}/members`)
        });

        for (const member of members) {
          if (member.id !== user?.id) {
            console.log('Creating peer connection with:', member.username);
            await createPeer(member.id, stream, true);
          }
        }

        setIsJoined(true);
      }
    }
  };

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
        console.log('Track enabled:', track.enabled);
      });
      setIsMuted(!isMuted);
    }
  }, [localStream, isMuted]);

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (isJoined) {
        cleanup();
      }
    };
  }, [isJoined, cleanup, localStream]);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
    refetchInterval: 5000
  });

  useEffect(() => {
    if (websocket) {
      const handleUserJoined = (data: any) => {
        if (data.channelId === channel.id) {
          refetchMembers();
        }
      };

      const handleUserLeft = (data: any) => {
        if (data.channelId === channel.id) {
          refetchMembers();
        }
      };

      websocket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'user_joined') {
          handleUserJoined(message.data);
        } else if (message.type === 'user_left') {
          handleUserLeft(message.data);
        }
      });
    }
  }, [websocket, channel.id, refetchMembers]);

  const currentMemberStatus = channelMembers.find(member => member.id === user?.id);
  const isCurrentUserMuted = currentMemberStatus?.isMuted || isMuted;

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
          {isConnected && <span className="w-2 h-2 rounded-full bg-green-500" />}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isJoined ? "destructive" : "default"}
            size="sm"
            onClick={handleJoinLeave}
            className="w-20"
          >
            {isJoined ? t('server.leave') : t('server.join')}
          </Button>

          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteChannelMutation.mutate()}
              disabled={deleteChannelMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isJoined && (
        <div className="p-2 space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
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
                  {peers[member.id] && <span className="w-2 h-2 rounded-full bg-green-500" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}