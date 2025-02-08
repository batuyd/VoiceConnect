import { Volume2, VolumeX } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useWebSocket } from "@/hooks/use-websocket";

interface VoiceChannelProps {
  channel: Channel;
  isOwner: boolean;
}

interface ChannelMember {
  id: number;
  username: string;
  avatar?: string;
  isMuted: boolean;
}

export function VoiceChannel({ channel, isOwner }: VoiceChannelProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isConnected, sendMessage } = useWebSocket();

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const { data: channelMembers = [], refetch: refetchMembers } = useQuery<ChannelMember[]>({
    queryKey: [`/api/channels/${channel.id}/members`],
    enabled: isJoined,
    refetchInterval: 5000
  });

  const requestAudioPermissions = useCallback(async () => {
    try {
      console.log('Requesting audio permissions...');
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(track => track.stop());
      setAudioPermissionGranted(true);
      return true;
    } catch (error) {
      console.error('Audio permission error:', error);
      toast({
        description: t('voice.permissionDenied'),
        variant: "destructive",
      });
      return false;
    }
  }, [toast, t]);

  const setupAudioStream = useCallback(async () => {
    if (!audioPermissionGranted || !isJoined || !isConnected) {
      return;
    }

    try {
      // Cleanup existing resources
      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }

      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      if (audioContext.current?.state !== 'closed') {
        await audioContext.current?.close();
      }

      // Create new audio stream
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      });

      stream.current = mediaStream;

      const audioTrack = mediaStream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track available');
      }

      mediaRecorderRef.current = new MediaRecorder(new MediaStream([audioTrack]), {
        mimeType: 'audio/webm;codecs=opus',
        bitsPerSecond: 32000
      });

      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0 && isConnected && !isMuted) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (isConnected) {
              const base64data = (reader.result as string).split(',')[1];
              sendMessage({
                type: 'voice_data',
                channelId: channel.id,
                data: base64data
              });
            }
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorderRef.current.start(50);
    } catch (error) {
      console.error('Audio setup error:', error);
      toast({
        description: t('voice.deviceAccessError'),
        variant: "destructive",
      });
    }
  }, [audioPermissionGranted, isJoined, isConnected, channel.id, isMuted, toast, t, sendMessage]);

  useEffect(() => {
    if (isJoined && !audioPermissionGranted) {
      requestAudioPermissions();
    }
  }, [isJoined, audioPermissionGranted, requestAudioPermissions]);

  useEffect(() => {
    if (isConnected && audioPermissionGranted && isJoined) {
      setupAudioStream();
    }
  }, [isConnected, audioPermissionGranted, isJoined, setupAudioStream]);

  const handleJoinLeave = useCallback(async () => {
    if (isJoined) {
      sendMessage({
        type: 'leave_channel',
        channelId: channel.id,
        userId: user?.id
      });

      if (stream.current) {
        stream.current.getTracks().forEach(track => track.stop());
        stream.current = null;
      }

      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      if (audioContext.current?.state !== 'closed') {
        await audioContext.current?.close();
      }

      setIsJoined(false);
      setAudioPermissionGranted(false);
    } else {
      const hasPermission = await requestAudioPermissions();
      if (hasPermission) {
        setIsJoined(true);
        sendMessage({
          type: 'join_channel',
          channelId: channel.id,
          userId: user?.id
        });
      }
    }
  }, [isJoined, channel.id, user?.id, requestAudioPermissions, sendMessage]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between p-2 rounded hover:bg-gray-700">
        <div className="flex items-center space-x-2">
          {isJoined ? (
            isMuted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-green-400" />
            )
          ) : (
            <Volume2 className="h-4 w-4 text-gray-400" />
          )}
          <span>{channel.name}</span>
          {isConnected && isJoined && <span className="w-2 h-2 rounded-full bg-green-500" />}
        </div>

        <Button
          variant={isJoined ? "destructive" : "default"}
          size="sm"
          onClick={handleJoinLeave}
          className="w-20"
        >
          {isJoined ? t('server.leave') : t('server.join')}
        </Button>
      </div>

      {isJoined && (
        <div className="p-2 space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              className={isMuted ? "text-red-400" : "text-green-400"}
            >
              {isMuted ? t('voice.unmute') : t('voice.mute')}
            </Button>
          </div>

          {channelMembers.length > 0 && (
            <div className="space-y-2">
              {channelMembers.map((member) => (
                <div key={member.id} className="flex items-center space-x-2 p-2 rounded bg-gray-700/50">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback>{member.username[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{member.username}</span>
                  {member.isMuted && <VolumeX className="h-3 w-3 text-red-400" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}