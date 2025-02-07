import { Volume2, VolumeX } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { webRTCService } from "@/lib/webrtc-service";
import { apiRequest } from "@/lib/queryClient";

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

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

  const joinChannelMutation = useMutation({
    mutationFn: async (memberId: number) => {
      return await apiRequest('POST', `/api/channels/${channel.id}/members/${memberId}/join`);
    }
  });

  const leaveChannelMutation = useMutation({
    mutationFn: async (memberId: number) => {
      return await apiRequest('POST', `/api/channels/${channel.id}/members/${memberId}/leave`);
    }
  });

  useEffect(() => {
    let mounted = true;

    const setupVoiceChat = async () => {
      if (!isJoined || !user?.id) return;

      try {
        // Start local stream
        await webRTCService.startLocalStream();

        // Connect to existing members
        for (const member of channelMembers) {
          if (member.id !== user.id) {
            const offer = await webRTCService.connectToPeer(member.id);
            await joinChannelMutation.mutateAsync(member.id);
          }
        }
      } catch (error) {
        console.error('Failed to setup voice chat:', error);
        if (mounted) {
          toast({
            description: t('voice.setupError'),
            variant: "destructive",
          });
        }
      }
    };

    if (isJoined && user?.id) {
      setupVoiceChat();
    }

    return () => {
      mounted = false;
      if (isJoined) {
        webRTCService.leaveRoom();
      }
    };
  }, [isJoined, channel.id, user?.id, channelMembers, toast, t, joinChannelMutation, leaveChannelMutation]);

  const handleJoinLeave = async () => {
    if (!user?.id) return;

    if (isJoined) {
      await leaveChannelMutation.mutateAsync(user.id);
      webRTCService.leaveRoom();
      setIsJoined(false);
      setIsMuted(false);
    } else {
      setIsJoined(true);
      refetchMembers();
    }
  };

  const handleMuteToggle = async () => {
    if (!isJoined) return;

    try {
      if (!isMuted) {
        await webRTCService.stopLocalStream();
      } else {
        await webRTCService.startLocalStream();
      }
      setIsMuted(!isMuted);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      toast({
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
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