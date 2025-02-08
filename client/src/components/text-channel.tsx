import { Hash, Trash2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MediaControls } from "./media-controls";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TextChannelProps {
  channel: Channel;
  isOwner: boolean;
  onSelect: () => void;
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
      toast({
        description: t('server.channelDeleted'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('server.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between p-2 rounded hover:bg-gray-700 ${
        isSelected ? "bg-gray-700" : ""
      }`}>
        <button
          onClick={onSelect}
          className="flex items-center space-x-2 flex-1"
        >
          <Hash className="h-4 w-4 text-gray-400" />
          <span>{channel.name}</span>
        </button>
        {isOwner && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('server.deleteChannelTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('server.deleteChannelDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteChannelMutation.mutate()}
                  disabled={deleteChannelMutation.isPending}
                >
                  {t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {isSelected && <MediaControls channelId={channel.id} isVoiceChannel={false} />}
    </div>
  );
}