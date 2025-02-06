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

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

  useEffect(() => {
    let mounted = true;

    async function setupAudioStream() {
      if (!selectedInputDevice || !isJoined) return;

      try {
        // Temizle mevcut stream'i
        if (stream.current) {
          stream.current.getTracks().forEach(track => track.stop());
        }

        // Yeni audio context ve stream oluştur
        if (!audioContext.current) {
          audioContext.current = new AudioContext();
        }

        stream.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: selectedInputDevice },
            echoCancellation: true,
            noiseSuppression: true,
          }
        });

        if (!mounted) return;

        const source = audioContext.current.createMediaStreamSource(stream.current);
        gainNode.current = audioContext.current.createGain();

        source.connect(gainNode.current);
        if (!isMuted) {
          gainNode.current.connect(audioContext.current.destination);
        }

      } catch (error) {
        console.error('Ses akışı başlatılamadı:', error);
        if (mounted) {
          toast({
            description: t('voice.streamError'),
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

  // Ses durumunu değiştir
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
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => addBotMutation.mutate()}
              disabled={addBotMutation.isPending}
              className="text-blue-400"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant={isJoined ? "destructive" : "default"}
            size="sm"
            onClick={() => setIsJoined(!isJoined)}
            className="w-20"
          >
            {isJoined ? t('server.leave') : t('server.join')}
          </Button>
        </div>
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