import { Volume2, VolumeX, MoreVertical } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";

export function VoiceChannel({ channel, isOwner }: { channel: Channel; isOwner: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState([50]);

  // In a real implementation, this would be fetched from the server
  const { data: channelMembers = [] } = useQuery({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined // Only fetch when user joins the channel
  });

  const handleVolumeChange = (newVolume: number[]) => {
    setVolume(newVolume);
    // In a real implementation, this would update the actual audio volume
    console.log('Volume changed to:', newVolume[0]);
  };

  return (
    <div
      className={`flex flex-col space-y-2 p-2 rounded ${
        isJoined ? "bg-emerald-900/50" : "hover:bg-gray-700"
      }`}
    >
      <div className="flex items-center justify-between">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>{t('server.kick')}</DropdownMenuItem>
                <DropdownMenuItem>{t('server.ban')}</DropdownMenuItem>
                <DropdownMenuItem>{t('server.makeAdmin')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* Volume Control - Only visible when joined */}
      {isJoined && !isMuted && (
        <div className="flex items-center space-x-2 px-2">
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

      {/* Channel Members - Only visible when joined */}
      {isJoined && channelMembers.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="h-[1px] bg-gray-700 my-2" />
          <div className="flex flex-wrap gap-2">
            {channelMembers.map((member) => (
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
  );
}