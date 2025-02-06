import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Channel } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PlayCircle, SkipForward, Trash2, Search, Music, Video } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface MediaControlsProps {
  channelId: number;
  isVoiceChannel?: boolean;
}

interface SearchResult {
  id: string;
  title: string;
  thumbnail: string;
  type: "music" | "video";
}

export function MediaControls({ channelId, isVoiceChannel }: MediaControlsProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

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

  const searchYouTube = async (query: string) => {
    setIsSearching(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default.url,
        type: item.snippet.liveBroadcastContent === 'none' ? 'music' : 'video'
      })));
    } catch (error) {
      toast({
        description: t('media.searchError'),
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const playMediaMutation = useMutation({
    mutationFn: async ({ url, type }: { url: string, type: "music" | "video" }) => {
      const res = await apiRequest("POST", `/api/channels/${channelId}/media`, { url, type });
      return res.json();
    },
    onSuccess: (updatedChannel: Channel) => {
      queryClient.setQueryData(['/api/channels', channelId], updatedChannel);
      setSearchQuery("");
      setSearchResults([]);
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
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
      <div className="p-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              className="w-full flex items-center justify-center hover:bg-gray-700"
            >
              {isVoiceChannel ? (
                <>
                  <Music className="w-4 h-4 mr-2" />
                  {t('media.addMusic')}
                </>
              ) : (
                <>
                  <Video className="w-4 h-4 mr-2" />
                  {t('media.addVideo')}
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {isVoiceChannel ? t('media.searchMusic') : t('media.searchVideo')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Input
                  placeholder={t('media.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchYouTube(searchQuery)}
                />
                <Button
                  onClick={() => searchYouTube(searchQuery)}
                  disabled={!searchQuery || isSearching}
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {searchResults.map((result) => (
                  <div key={result.id} className="flex items-center gap-2 p-2 hover:bg-gray-700/50 rounded-lg">
                    <img
                      src={result.thumbnail}
                      alt={result.title}
                      className="w-20 h-auto rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm line-clamp-2">{result.title}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const url = `https://youtube.com/watch?v=${result.id}`;
                        playMediaMutation.mutate({ url, type: result.type });
                      }}
                    >
                      <PlayCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {channel.currentMedia && (
        <div className="border-t border-gray-700 p-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t('media.nowPlaying')}</h3>
              <p className="text-sm text-gray-400">{channel.currentMedia.title}</p>
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
        <div className="border-t border-gray-700 p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">{t('media.queue')}</h3>
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
              <div key={index} className="p-2 bg-gray-700/50 rounded">
                <p className="text-sm text-gray-300">{media.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}