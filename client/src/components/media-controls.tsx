import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Channel } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PlayCircle, SkipForward, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface MediaControlsProps {
  channelId: number;
}

export function MediaControls({ channelId }: MediaControlsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [mediaUrl, setMediaUrl] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);

  // WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'join_channel',
        channelId
      }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'media_state' && data.channelId === channelId) {
        queryClient.setQueryData(['/api/channels', channelId], (oldData: any) => ({
          ...oldData,
          currentMedia: data.media,
          mediaQueue: data.queue
        }));
      }
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [channelId]);

  const { data: channel } = useQuery<Channel>({
    queryKey: ['/api/channels', channelId],
  });

  const playMediaMutation = useMutation({
    mutationFn: async ({ url, type }: { url: string, type: "music" | "video" }) => {
      const res = await apiRequest("POST", `/api/channels/${channelId}/media`, { url, type });
      return res.json();
    },
    onSuccess: (updatedChannel: Channel) => {
      queryClient.setQueryData(['/api/channels', channelId], updatedChannel);
      setMediaUrl("");
      toast({
        description: t('media.addedToQueue'),
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const skipMediaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/channels/${channelId}/media/skip`);
      return res.json();
    },
    onSuccess: (updatedChannel: Channel) => {
      queryClient.setQueryData(['/api/channels', channelId], updatedChannel);
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channelId}/media/queue`);
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/channels', channelId], (oldData: any) => ({
        ...oldData,
        mediaQueue: []
      }));
    },
  });

  if (!channel) return null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder={t('media.urlPlaceholder')}
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
        />
        <Button
          onClick={() => {
            const type = mediaUrl.includes("youtube.com") ? "video" : "music";
            playMediaMutation.mutate({ url: mediaUrl, type });
          }}
          disabled={!mediaUrl || playMediaMutation.isPending}
        >
          <PlayCircle className="w-4 h-4 mr-2" />
          {t('media.play')}
        </Button>
      </div>

      {channel.currentMedia && (
        <div className="bg-secondary p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{t('media.nowPlaying')}</h3>
              <p className="text-sm">{channel.currentMedia.title}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipMediaMutation.mutate()}
              disabled={skipMediaMutation.isPending}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {channel.mediaQueue && channel.mediaQueue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('media.queue')}</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => clearQueueMutation.mutate()}
              disabled={clearQueueMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {channel.mediaQueue.map((media, index) => (
              <div key={index} className="bg-secondary/50 p-2 rounded">
                <p className="text-sm">{media.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
