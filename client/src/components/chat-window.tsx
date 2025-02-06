import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Channel, MessageWithReactions } from "@shared/schema";
import { Send, Smile } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Common emoji list
const commonEmojis = ["👍", "❤️", "😄", "🎉", "🤔", "👀", "🔥", "💯", "✨", "🙌"];

export function ChatWindow({ channel }: { channel: Channel }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const { data: messages = [] } = useQuery<MessageWithReactions[]>({
    queryKey: [`/api/channels/${channel.id}/messages`],
    refetchInterval: 3000, // Poll for new messages every 3 seconds
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest(
        "POST",
        `/api/channels/${channel.id}/messages`,
        { content }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${channel.id}/messages`] });
    },
  });

  const addReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/messages/${messageId}/reactions`,
        { emoji }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${channel.id}/messages`] });
      toast({
        description: t('chat.reactionAdded'),
      });
    },
  });

  const removeReactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: number; emoji: string }) => {
      await apiRequest(
        "DELETE",
        `/api/messages/${messageId}/reactions/${emoji}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${channel.id}/messages`] });
      toast({
        description: t('chat.reactionRemoved'),
      });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate(message);
    setMessage("");
  };

  return (
    <div className="flex-1 bg-gray-800 flex flex-col">
      {/* Channel Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center">
        <h2 className="font-semibold">#{channel.name}</h2>
      </div>

      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center mt-4">
            {t('chat.welcome')} #{channel.name}
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="group">
              <div className="flex items-start space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={message.user.avatar} />
                  <AvatarFallback>{message.user.username[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold">{message.user.username}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1">{message.content}</p>

                  {/* Reactions */}
                  {message.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(
                        message.reactions.reduce((acc: { [key: string]: number }, reaction) => {
                          acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
                          return acc;
                        }, {})
                      ).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            const hasReacted = message.reactions.some(
                              r => r.emoji === emoji && r.user.id === message.user.id
                            );
                            if (hasReacted) {
                              removeReactionMutation.mutate({ messageId: message.id, emoji });
                            } else {
                              addReactionMutation.mutate({ messageId: message.id, emoji });
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-sm"
                        >
                          {emoji} {count}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Emoji Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Smile className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-2">
                    <div className="grid grid-cols-5 gap-1">
                      {commonEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            addReactionMutation.mutate({ messageId: message.id, emoji });
                          }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-700">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`${t('chat.messagePlaceholder')} #${channel.name}`}
            className="flex-1"
          />
          <Button type="submit" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}