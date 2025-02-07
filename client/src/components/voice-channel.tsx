import { Volume2, VolumeX, Mic, MicOff, AlertCircle } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useEffect, useCallback } from "react";
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeConnections, setActiveConnections] = useState<Set<number>>(new Set());
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean | null>(null);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
  });

  const joinChannelMutation = useMutation({
    mutationFn: async (memberId: number) => {
      return await apiRequest('POST', `/api/channels/${channel.id}/members/${memberId}/join`);
    },
    onError: (error: Error) => {
      toast({
        title: t('voice.errors.joinFailed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const leaveChannelMutation = useMutation({
    mutationFn: async (memberId: number) => {
      return await apiRequest('POST', `/api/channels/${channel.id}/members/${memberId}/leave`);
    },
    onError: (error: Error) => {
      toast({
        title: t('voice.errors.leaveFailed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handlePeerConnection = useCallback(async (memberId: number) => {
    if (!user?.id || activeConnections.has(memberId)) return;

    try {
      const offer = await webRTCService.connectToPeer(memberId);
      await joinChannelMutation.mutateAsync(memberId);
      setActiveConnections(prev => {
        const newConnections = new Set(Array.from(prev));
        newConnections.add(memberId);
        return newConnections;
      });
    } catch (error) {
      if (error instanceof Error) {
        toast({
          title: t('voice.errors.connectionFailed'),
          description: error.message,
          variant: "destructive",
        });
      }
    }
  }, [user?.id, activeConnections, joinChannelMutation, toast, t]);

  const checkAudioPermissions = useCallback(async () => {
    try {
      await webRTCService.startLocalStream();
      setHasAudioPermission(true);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        setHasAudioPermission(false);
        toast({
          title: t('voice.errors.permissionDenied'),
          description: error.message,
          variant: "destructive",
        });
      }
      return false;
    }
  }, [toast, t]);

  useEffect(() => {
    let mounted = true;

    const setupVoiceChat = async () => {
      if (!isJoined || !user?.id) return;

      try {
        setIsConnecting(true);
        const hasPermission = await checkAudioPermissions();
        if (!hasPermission) {
          setIsJoined(false);
          return;
        }

        // Connect to existing members
        for (const member of channelMembers) {
          if (member.id !== user.id) {
            await handlePeerConnection(member.id);
          }
        }
      } catch (error) {
        if (!mounted) return;

        if (error instanceof Error) {
          toast({
            title: t('voice.errors.setupFailed'),
            description: error.message,
            variant: "destructive",
          });
        }
        setIsJoined(false);
      } finally {
        if (mounted) {
          setIsConnecting(false);
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
        setActiveConnections(new Set());
      }
    };
  }, [isJoined, channel.id, user?.id, channelMembers, toast, t, handlePeerConnection, checkAudioPermissions]);

  const handleJoinLeave = async () => {
    if (!user?.id) return;

    try {
      if (isJoined) {
        await leaveChannelMutation.mutateAsync(user.id);
        webRTCService.leaveRoom();
        setIsJoined(false);
        setIsMuted(false);
        setActiveConnections(new Set());
      } else {
        if (await checkAudioPermissions()) {
          setIsJoined(true);
          await refetchMembers();
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        toast({
          title: t('voice.errors.actionFailed'),
          description: error.message,
          variant: "destructive",
        });
      }
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
      if (error instanceof Error) {
        toast({
          title: t('voice.errors.muteToggleFailed'),
          description: error.message,
          variant: "destructive",
        });
      }
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
          {hasAudioPermission === false && (
            <AlertCircle className="h-4 w-4 text-red-400" title={t('voice.errors.permissionDenied')} />
          )}
        </div>

        <Button
          variant={isJoined ? "destructive" : "default"}
          size="sm"
          onClick={handleJoinLeave}
          className="w-24"
          disabled={isConnecting}
        >
          {isConnecting ? t('voice.connecting') : (isJoined ? t('server.leave') : t('server.join'))}
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
              disabled={isConnecting}
            >
              {isMuted ? (
                <MicOff className="h-4 w-4 mr-2" />
              ) : (
                <Mic className="h-4 w-4 mr-2" />
              )}
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
                  {activeConnections.has(member.id) && (
                    <div className="w-2 h-2 rounded-full bg-green-400" title={t('voice.connected')} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}