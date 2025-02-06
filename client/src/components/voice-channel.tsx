import { Volume2, VolumeX, Trash2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { MediaControls } from "./media-controls";

export function VoiceChannel({ channel, isOwner }: { channel: Channel; isOwner: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState([50]);

  const { data: channelMembers = [] } = useQuery({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

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

  const handleVolumeChange = (newVolume: number[]) => {
    setVolume(newVolume);
    console.log('Volume changed to:', newVolume[0]);
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Kanal Başlığı */}
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
              onClick={() => deleteChannelMutation.mutate()}
              disabled={deleteChannelMutation.isPending}
            >
              <Trash2 className="h-4 w-4 text-red-400" />
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

      {/* Katılım Sonrası İçerik */}
      {isJoined && (
        <div className="p-3 space-y-4 bg-gray-800/50">
          {/* Ses Kontrolleri */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              className={isMuted ? "text-red-400" : "text-green-400"}
            >
              {isMuted ? t('server.unmute') : t('server.mute')}
            </Button>

            {!isMuted && (
              <div className="flex items-center space-x-2">
                <Volume2 className="h-3 w-3 text-gray-400" />
                <Slider
                  value={volume}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="w-24"
                />
                <span className="text-xs text-gray-400">{volume}%</span>
              </div>
            )}
          </div>

          {/* Media Controls */}
          <div className="w-full">
            <MediaControls channelId={channel.id} isVoiceChannel={true} />
          </div>

          {/* Üye Listesi */}
          {channelMembers.length > 0 && (
            <>
              <div className="h-[1px] bg-gray-700" />
              <div className="flex flex-wrap gap-2">
                {channelMembers.map((member: any) => (
                  <div key={member.id} className="flex items-center space-x-2 p-1 rounded bg-gray-700/50">
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
        </div>
      )}
    </div>
  );
}