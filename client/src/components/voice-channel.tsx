import { Volume2, VolumeX, Trash2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth"; // Added from edited code
import { useMutation, useQuery } from "@tanstack/react-query"; // Added useQuery, though not used
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"; // Added from edited code
import { MediaControls } from "./media-controls";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";

interface VoiceChannelProps {
  channel: Channel;
  isOwner: boolean;
}

export function VoiceChannel({ channel, isOwner }: VoiceChannelProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { requestPermissions, selectedInputDevice } = useAudioSettings();
  const [isConnected, setIsConnected] = useState(false);
  const { sendMessage } = useWebSocket(channel.id); //Simplified from original

  const deleteChannelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channel.id}`);
    },
    onSuccess: () => {
      if (isConnected) {
        handleDisconnect();
      }
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

  useEffect(() => {
    //Removed conditional check for wsConnected, as it's now handled in the websocket hook.
  }, []);


  const handleConnect = async () => {
    try {
      const granted = await requestPermissions();
      if (!granted) {
        toast({
          description: t('audio.permissionDenied'),
          variant: "destructive",
        });
        return;
      }

      if (!selectedInputDevice) {
        toast({
          description: t('audio.noInputDevice'),
          variant: "destructive",
        });
        return;
      }

      setIsConnected(true);
      sendMessage({
        type: 'join_voice',
        channelId: channel.id
      });
    } catch (error) {
      console.error('Error connecting to voice channel:', error);
      toast({
        description: t('audio.connectionError'),
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    sendMessage({
      type: 'leave_voice',
      channelId: channel.id
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('server.confirmDeleteChannel'))) {
      deleteChannelMutation.mutate();
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-3 flex items-center justify-between bg-gray-800">
        <div className="flex items-center space-x-2">
          {/* Removed conditional rendering of Volume2/VolumeX, always showing VolumeX */}
          <VolumeX className="h-4 w-4 text-gray-400" />
          <span>{channel.name}</span>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="ghost" // Changed to ghost
            size="sm"
            onClick={isConnected ? handleDisconnect : handleConnect}
          >
            {isConnected ? t('voice.disconnect') : t('voice.connect')}
          </Button>

          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleteChannelMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isConnected && (
        <div className="p-3 bg-gray-900">
          <MediaControls channelId={channel.id} isVoiceChannel={true} />
        </div>
      )}
    </div>
  );
}