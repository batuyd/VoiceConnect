import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Channel, Server, User } from "@shared/schema";
import { Plus, Hash, Volume2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { VoiceChannel } from "./voice-channel";
import { TextChannel } from "./text-channel";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";

export function ChannelList({ 
  serverId,
  onChannelSelect,
  selectedChannel
}: { 
  serverId: number;
  onChannelSelect: (channel: Channel | null) => void;
  selectedChannel: Channel | null;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", isVoice: false });
  const [selectedFriendId, setSelectedFriendId] = useState<string>("");

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: [`/api/servers/${serverId}/channels`],
  });

  const { data: server } = useQuery<Server>({
    queryKey: [`/api/servers/${serverId}`],
  });

  console.log("server:", server);
  console.log("user:", user);

  const { data: friends = [] } = useQuery<User[]>({
    queryKey: ["/api/friends"],
  });

  const isOwner = server?.ownerId === user?.id;
  console.log("isOwner:", isOwner);

  const createChannelMutation = useMutation({
    mutationFn: async (data: typeof newChannel) => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/channels`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create channel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/channels`] });
      setIsOpen(false);
      setNewChannel({ name: "", isVoice: false });
      toast({
        title: t('server.channelCreated'),
        description: t('server.channelCreatedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('server.channelError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inviteFriendMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/invites`, { userId });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('server.inviteSent'),
        description: t('server.inviteSentDesc'),
      });
      setIsInviteOpen(false);
      setSelectedFriendId("");
    },
    onError: (error: Error) => {
      toast({
        title: t('server.inviteError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const textChannels = channels.filter(c => !c.isVoice);
  const voiceChannels = channels.filter(c => c.isVoice);

  return (
    <div className="w-64 bg-gray-800/50 backdrop-blur-sm border-r border-gray-700">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="font-semibold text-gray-100">{t('server.channels')}</h2>
        <div className="flex gap-2">
          {isOwner && (
            <>
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-gray-700/50">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-800 border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-gray-100">{t('server.createChannel')}</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newChannel.name.trim()) {
                        toast({
                          title: t('server.error'),
                          description: t('server.channelNameRequired'),
                          variant: "destructive",
                        });
                        return;
                      }
                      createChannelMutation.mutate(newChannel);
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label htmlFor="channelName" className="text-gray-200">{t('server.channelName')}</Label>
                      <Input
                        id="channelName"
                        value={newChannel.name}
                        onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={t('server.channelNamePlaceholder')}
                        className="bg-gray-700 border-gray-600 text-gray-100"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isVoice"
                        checked={newChannel.isVoice}
                        onCheckedChange={(checked) => 
                          setNewChannel(prev => ({ ...prev, isVoice: checked }))
                        }
                      />
                      <Label htmlFor="isVoice" className="text-gray-200">{t('server.voiceChannel')}</Label>
                    </div>
                    <Button 
                      type="submit" 
                      disabled={createChannelMutation.isPending || !newChannel.name.trim()}
                      className="w-full"
                    >
                      {t('server.createChannel')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-gray-700/50">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-800 border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-gray-100">{t('server.inviteFriend')}</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (selectedFriendId) {
                        inviteFriendMutation.mutate(parseInt(selectedFriendId));
                      }
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label className="text-gray-200">{t('server.selectFriend')}</Label>
                      <Select
                        value={selectedFriendId}
                        onValueChange={setSelectedFriendId}
                      >
                        <SelectTrigger className="bg-gray-700 border-gray-600 text-gray-100">
                          <SelectValue placeholder={t('server.selectFriend')} />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700">
                          {friends.map((friend) => (
                            <SelectItem 
                              key={friend.id} 
                              value={friend.id.toString()}
                              className="text-gray-100 focus:bg-gray-700"
                            >
                              {friend.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button 
                      type="submit" 
                      disabled={!selectedFriendId || inviteFriendMutation.isPending}
                      className="w-full"
                    >
                      {t('server.sendInvite')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4 p-2">
        <AnimatePresence>
          {textChannels.length > 0 && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="text-xs font-semibold text-gray-400 px-2 mb-2">{t('server.textChannels')}</h3>
              <div className="space-y-0.5">
                {textChannels.map((channel) => (
                  <TextChannel
                    key={channel.id}
                    channel={channel}
                    isOwner={isOwner}
                    onSelect={() => onChannelSelect(channel)}
                    isSelected={selectedChannel?.id === channel.id}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {voiceChannels.length > 0 && (
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              <h3 className="text-xs font-semibold text-gray-400 px-2 mb-2">{t('server.voiceChannels')}</h3>
              <div className="space-y-0.5">
                {voiceChannels.map((channel) => (
                  <VoiceChannel 
                    key={channel.id} 
                    channel={channel} 
                    isOwner={isOwner}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}