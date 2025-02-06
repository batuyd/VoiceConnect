import { Volume2, VolumeX, MoreVertical } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function VoiceChannel({ channel, isOwner }: { channel: Channel; isOwner: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  return (
    <div
      className={`flex items-center justify-between p-2 rounded ${
        isJoined ? "bg-emerald-900/50" : "hover:bg-gray-700"
      }`}
    >
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
  );
}