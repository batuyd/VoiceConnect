import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Channel } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback } from "react";
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
  const [retryCount, setRetryCount] = useState(0);
  const [connectionErrors, setConnectionErrors] = useState(0);
  const maxRetries = 3;
  const maxConnectionErrors = 3;

  const connectWebSocket = useCallback(() => {
    if (ws?.readyState === WebSocket.OPEN || retryCount >= maxRetries || connectionErrors >= maxConnectionErrors) {
      console.log('MediaControls: Skipping WebSocket connection', {
        isOpen: ws?.readyState === WebSocket.OPEN,
        retryCount,
        connectionErrors
      });
      return;
    }

    console.log('MediaControls: Attempting WebSocket connection');
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('MediaControls: WebSocket connected');
        setRetryCount(0);
        setConnectionErrors(0);
        socket.send(JSON.stringify({
          type: 'join_channel',
          channelId
        }));
      };

      socket.onclose = () => {
        console.log('MediaControls: WebSocket disconnected');
        setWs(null);
        if (retryCount < maxRetries && connectionErrors < maxConnectionErrors) {
          const timeout = Math.min(1000 * Math.pow(2, retryCount), 5000);
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, timeout);
        }
      };

      socket.onerror = (error) => {
        console.error('MediaControls: WebSocket error:', error);
        setConnectionErrors(prev => prev + 1);
        if (connectionErrors >= maxConnectionErrors) {
          toast({
            description: t('media.connectionError'),
            variant: "destructive",
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'media_state' && data.channelId === channelId) {
            queryClient.setQueryData(['/api/channels', channelId], (oldData: any) => ({
              ...oldData,
              currentMedia: data.media,
              mediaQueue: data.queue || []
            }));
          }
        } catch (error) {
          console.error('MediaControls: Failed to parse WebSocket message:', error);
          setConnectionErrors(prev => prev + 1);
        }
      };

      setWs(socket);
    } catch (error) {
      console.error('MediaControls: Failed to create WebSocket connection:', error);
      setConnectionErrors(prev => prev + 1);
      if (retryCount < maxRetries && connectionErrors < maxConnectionErrors) {
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 5000);
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
        }, timeout);
      }
    }
  }, [channelId, retryCount, connectionErrors, ws, toast, t]);

  useEffect(() => {
    if (!ws && connectionErrors < maxConnectionErrors) {
      connectWebSocket();
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [connectWebSocket, ws, connectionErrors]);

  const { data: channel } = useQuery<Channel>({
    queryKey: ['/api/channels', channelId],
  });

  const searchYouTube = async (query: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error(t('media.searchError'));
      }
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      setSearchResults(data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.default.url,
        type: item.snippet.liveBroadcastContent === 'none' ? 'music' : 'video'
      })));
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : t('media.searchError'),
        variant: "destructive",
      });
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const playMediaMutation = useMutation({
    mutationFn: async ({ url, type }: { url: string, type: "music" | "video" }) => {
      const res = await apiRequest("POST", `/api/channels/${channelId}/media`, { url, type });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('media.addError'));
      }
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
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('media.skipError'));
      }
      return res.json();
    },
    onSuccess: (updatedChannel: Channel) => {
      queryClient.setQueryData(['/api/channels', channelId], updatedChannel);
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/channels/${channelId}/media/queue`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('media.clearError'));
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/channels', channelId], (oldData: any) => ({
        ...oldData,
        mediaQueue: []
      }));
      toast({
        description: t('media.queueCleared'),
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!channel) return null;

  return (
    <div className="relative z-50">
      <div className="bg-gray-700/50 rounded-lg border border-gray-600 shadow-xl">
        {/* Media Control Button */}
        <div className="p-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="secondary"
                className="w-full flex items-center justify-center hover:bg-gray-600/50"
                size="sm"
                disabled={connectionErrors >= maxConnectionErrors}
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
                    <div key={result.id} className="flex items-center gap-2 p-2 hover:bg-gray-600/50 rounded-lg">
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
                        disabled={playMediaMutation.isPending}
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

        {/* Current Media */}
        {channel.currentMedia && (
          <div className="border-t border-gray-600 p-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-200">{t('media.nowPlaying')}</h3>
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

        {/* Media Queue */}
        {channel.mediaQueue && channel.mediaQueue.length > 0 && (
          <div className="border-t border-gray-600 p-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-200">{t('media.queue')}</h3>
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
                <div key={index} className="p-2 bg-gray-600/50 rounded">
                  <p className="text-sm text-gray-300">{media.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}