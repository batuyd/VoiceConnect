import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Channel } from "@shared/schema";
import { Plus, Hash, Volume2 } from "lucide-react";
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

export function ChannelList({ serverId }: { serverId: number }) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", isVoice: false });

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: [`/api/servers/${serverId}/channels`],
  });

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

  const textChannels = channels.filter(c => !c.isVoice);
  const voiceChannels = channels.filter(c => c.isVoice);

  return (
    <div className="w-64 bg-gray-800 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold">{t('server.channels')}</h2>
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
      </div>

      <div className="space-y-4">
        {textChannels.length > 0 && (
          <div>
            <h3 className="text-xs text-gray-400 mb-2">{t('server.textChannels')}</h3>
            {textChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center space-x-2 p-2 rounded hover:bg-gray-700"
              >
                <Hash className="h-4 w-4 text-gray-400" />
                <span>{channel.name}</span>
              </div>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div>
            <h3 className="text-xs text-gray-400 mb-2">{t('server.voiceChannels')}</h3>
            {voiceChannels.map((channel) => (
              <VoiceChannel key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}