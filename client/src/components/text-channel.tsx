import { Hash, Trash2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MediaControls } from "./media-controls";
import { useToast } from "@/hooks/use-toast";

interface TextChannelProps {
  channel: Channel;
  isOwner: boolean;
  onSelect: (channel: Channel | null) => void;
  isSelected: boolean;
}

export function TextChannel({ channel, isOwner, onSelect, isSelected }: TextChannelProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const deleteChannelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channel.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${channel.serverId}/channels`] });
      onSelect(null); // Kanal silindiğinde seçimi kaldır
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

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(isSelected ? null : channel);
  };

  return (
    <div className="space-y-2">
      <div 
        className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-700 ${
          isSelected ? "bg-gray-700" : ""
        }`}
        onClick={handleClick}
      >
        <div className="flex items-center space-x-2 flex-1">
          <Hash className="h-4 w-4 text-gray-400" />
          <span>{channel.name}</span>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              deleteChannelMutation.mutate();
            }}
            disabled={deleteChannelMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isSelected && <MediaControls channelId={channel.id} isVoiceChannel={false} />}
    </div>
  );
}