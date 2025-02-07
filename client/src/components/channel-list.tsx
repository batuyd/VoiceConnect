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

  const { data: friends = [] } = useQuery<User[]>({
    queryKey: ["/api/friends"],
  });

  const isOwner = server?.ownerId === user?.id;

  const createChannelMutation = useMutation({
    mutationFn: async (data: typeof newChannel) => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/channels`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/servers/${serverId}/channels`] });
      setIsOpen(false);
      setNewChannel({ name: "", isVoice: false });
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
    <div className="w-64 bg-gray-800 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold">{t('server.channels')}</h2>
        <div className="flex gap-2">
          {isOwner && (
            <>
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('server.inviteFriend')}</DialogTitle>
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
                      <Label>{t('server.selectFriend')}</Label>
                      <Select
                        value={selectedFriendId}
                        onValueChange={setSelectedFriendId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('server.selectFriend')} />
                        </SelectTrigger>
                        <SelectContent>
                          {friends.map((friend) => (
                            <SelectItem key={friend.id} value={friend.id.toString()}>
                              {friend.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button 
                      type="submit" 
                      disabled={!selectedFriendId || inviteFriendMutation.isPending}
                    >
                      {t('server.sendInvite')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('server.createChannel')}</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createChannelMutation.mutate(newChannel);
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <Label htmlFor="channelName">{t('server.channelName')}</Label>
                      <Input
                        id="channelName"
                        value={newChannel.name}
                        onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
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
                      <Label htmlFor="isVoice">{t('server.voiceChannel')}</Label>
                    </div>
                    <Button type="submit" disabled={createChannelMutation.isPending}>
                      {t('server.createChannel')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {textChannels.length > 0 && (
          <div>
            <h3 className="text-xs text-gray-400 mb-2">{t('server.textChannels')}</h3>
            <div className="space-y-1">
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
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div>
            <h3 className="text-xs text-gray-400 mb-2">{t('server.voiceChannels')}</h3>
            {voiceChannels.map((channel) => (
              <VoiceChannel 
                key={channel.id} 
                channel={channel} 
                isOwner={isOwner}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}