import { Volume2, VolumeX } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useWebRTC } from "@/hooks/use-webrtc";

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

  const { isConnected, createPeer, cleanup } = useWebRTC(channel.id);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
    refetchInterval: 5000 // Her 5 saniyede bir güncelle
  });

  const setupLocalStream = async () => {
    try {
      console.log('Setting up local stream with device:', selectedInputDevice);
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
  };

  const handleJoinLeave = async () => {
    if (isJoined) {
      console.log('Leaving voice channel');
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped track:', track.kind);
        });
        setLocalStream(null);
      }
      cleanup();
      setIsJoined(false);
      setIsMuted(false);
    } else {
      console.log('Joining voice channel');
      const stream = await setupLocalStream();
      if (stream) {
        // Initialize peer connections with existing members
        for (const member of channelMembers) {
          if (member.id !== user?.id) {
            console.log('Creating peer connection with:', member.username);
            await createPeer(member.id, true);
          }
        }
        setIsJoined(true);
      }
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted; // Toggle the current state
        console.log('Track enabled:', track.enabled);
      });
      setIsMuted(!isMuted);
    }
  };

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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}