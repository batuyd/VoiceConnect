import { Volume2, VolumeX, MoreVertical, Trash2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <div className="space-y-2">
      <div className={`flex flex-col p-2 rounded ${isJoined ? "bg-emerald-900/50" : "hover:bg-gray-700"}`}>
        {/* Kanal Başlığı ve Kontroller */}
        <div className="flex items-center justify-between mb-2">
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
          <div className="flex items-center space-x-2">
            {isJoined && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMuted(!isMuted)}
                className={isMuted ? "text-red-400" : "text-green-400"}
              >
                {isMuted ? t('server.unmute') : t('server.mute')}
              </Button>
            )}
            {isOwner && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteChannelMutation.mutate()}
                disabled={deleteChannelMutation.isPending}
                className="text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant={isJoined ? "destructive" : "default"}
              size="sm"
              onClick={() => setIsJoined(!isJoined)}
            >
              {isJoined ? t('server.leave') : t('server.join')}
            </Button>
          </div>
        </div>

        {/* Ses Kontrolü - Sadece katılındığında ve susturulmadığında görünür */}
        {isJoined && !isMuted && (
          <div className="flex items-center space-x-2 px-2 mb-2">
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

        {/* Medya Kontrolleri - Sadece katılındığında görünür */}
        {isJoined && (
          <div className="mt-4 mb-2">
            <MediaControls channelId={channel.id} isVoiceChannel={true} />
          </div>
        )}

        {/* Kanal Üyeleri - Sadece katılındığında görünür */}
        {isJoined && channelMembers.length > 0 && (
          <div className="mt-2">
            <div className="h-[1px] bg-gray-700 my-2" />
            <div className="flex flex-wrap gap-2">
              {channelMembers.map((member: any) => (
                <div key={member.id} className="flex items-center space-x-2 p-1 rounded bg-gray-800/50">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback>{member.username[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{member.username}</span>
                  {member.isMuted && <VolumeX className="h-3 w-3 text-gray-400" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}