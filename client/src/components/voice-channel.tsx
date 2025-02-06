import { Volume2, VolumeX, Trash2, Ban, UserMinus, MoreVertical, Plus, MicOff, PlayCircle } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { MediaControls } from "./media-controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface VoiceChannelProps {
  channel: Channel;
  isOwner: boolean;
}

export function VoiceChannel({ channel, isOwner }: VoiceChannelProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState([50]);
  const audioContext = useRef<AudioContext | null>(null);
  const oscillator = useRef<OscillatorNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined
  });

  const playTestSound = () => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    // Eğer önceki ses çalıyorsa durdur
    if (oscillator.current) {
      oscillator.current.stop();
      oscillator.current.disconnect();
    }

    // Yeni osilatör ve gain node oluştur
    oscillator.current = audioContext.current.createOscillator();
    gainNode.current = audioContext.current.createGain();

    // Ses seviyesini ayarla (0-1 arası)
    gainNode.current.gain.value = volume[0] / 100;

    // Bağlantıları yap
    oscillator.current.connect(gainNode.current);
    gainNode.current.connect(audioContext.current.destination);

    // 440 Hz'de bir sinüs dalgası (La notası)
    oscillator.current.frequency.value = 440;
    oscillator.current.type = 'sine';

    // Sesi başlat ve 1 saniye sonra durdur
    oscillator.current.start();
    setTimeout(() => {
      if (oscillator.current) {
        oscillator.current.stop();
        oscillator.current.disconnect();
      }
    }, 1000);
  };

  // Bot ekleme mutation'ı
  const addBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/debug/create-bot", {
        serverId: channel.serverId
      });
      return res.json();
    },
    onSuccess: () => {
      refetchMembers();
      toast({
        description: "Test botu eklendi",
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const muteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/channels/${channel.id}/members/${userId}/mute`);
    },
    onSuccess: () => {
      refetchMembers();
      toast({
        description: "Kullanıcı susturuldu",
      });
    },
  });

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
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const kickUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/channels/${channel.id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${channel.id}/members`] });
      toast({
        description: "Kullanıcı kanaldan atıldı",
      });
    },
  });

  const banUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/channels/${channel.id}/bans`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${channel.id}/members`] });
      toast({
        description: "Kullanıcı kanaldan yasaklandı",
      });
    },
  });

  const handleVolumeChange = (newVolume: number[]) => {
    setVolume(newVolume);
    // Eğer gain node varsa ses seviyesini güncelle
    if (gainNode.current) {
      gainNode.current.gain.value = newVolume[0] / 100;
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Kanal Başlığı */}
      <div className="p-3 flex items-center justify-between bg-gray-800">
        <div className="flex items-center space-x-2">
          {isJoined ? (
            isMuted ? (
              <VolumeX className="h-4 w-4 text-gray-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-green-400" />
            )
          ) : (
            <Volume2 className="h-4 w-4 text-gray-400" />
          )}
          <span>{channel.name}</span>
        </div>

        <div className="flex items-center gap-2">
          {isOwner && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => addBotMutation.mutate()}
                disabled={addBotMutation.isPending}
                className="text-blue-400"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteChannelMutation.mutate()}
                disabled={deleteChannelMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            </>
          )}
          <Button
            variant={isJoined ? "destructive" : "default"}
            size="sm"
            onClick={() => setIsJoined(!isJoined)}
            className="w-20"
          >
            {isJoined ? t('server.leave') : t('server.join')}
          </Button>
        </div>
      </div>

      {/* Katılım Sonrası İçerik */}
      {isJoined && (
        <div className="p-3 space-y-4 bg-gray-800/50">
          {/* Ses Kontrolleri */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              className={isMuted ? "text-red-400" : "text-green-400"}
            >
              {isMuted ? "Sesi Aç" : "Sesi Kapat"}
            </Button>

            {!isMuted && (
              <div className="flex items-center space-x-2">
                <Volume2 className="h-3 w-3 text-gray-400" />
                <Slider
                  value={volume}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="w-24"
                />
                <span className="text-xs text-gray-400">{volume}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={playTestSound}
                  className="ml-2"
                >
                  <PlayCircle className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Üye Listesi */}
          {channelMembers.length > 0 && (
            <>
              <div className="h-[1px] bg-gray-700" />
              <div className="flex flex-wrap gap-2">
                {channelMembers.map((member: any) => (
                  <DropdownMenu key={member.id}>
                    <DropdownMenuTrigger asChild>
                      <div className="flex items-center space-x-2 p-2 rounded bg-gray-700/50 cursor-pointer hover:bg-gray-600/50">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.username[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{member.username}</span>
                        {member.isMuted && <VolumeX className="h-3 w-3 text-red-400" />}
                      </div>
                    </DropdownMenuTrigger>
                    {isOwner && member.id !== user?.id && (
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => muteUserMutation.mutate(member.id)}
                          className="cursor-pointer"
                        >
                          <MicOff className="h-4 w-4 mr-2" />
                          {member.isMuted ? "Susturmayı Kaldır" : "Sustur"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => kickUserMutation.mutate(member.id)}
                          className="text-red-400 cursor-pointer"
                        >
                          <UserMinus className="h-4 w-4 mr-2" />
                          Kullanıcıyı At
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => banUserMutation.mutate(member.id)}
                          className="text-red-400 cursor-pointer"
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Kullanıcıyı Yasakla
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
                ))}
              </div>
            </>
          )}
          {/* Media Controls */}
          <div className="w-full relative z-10">
            <MediaControls channelId={channel.id} isVoiceChannel={true} />
          </div>
        </div>
      )}
    </div>
  );
}