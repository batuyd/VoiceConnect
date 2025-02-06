import { createContext, useContext, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

type AudioSettingsContextType = {
  volume: number[];
  setVolume: (volume: number[]) => void;
  audioDevices: MediaDeviceInfo[];
  selectedInputDevice: string;
  setSelectedInputDevice: (deviceId: string) => void;
  selectedOutputDevice: string;
  setSelectedOutputDevice: (deviceId: string) => void;
  playTestSound: () => Promise<void>;
};

const AudioSettingsContext = createContext<AudioSettingsContextType | null>(null);

export function AudioSettingsProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [volume, setVolume] = useState<number[]>([50]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>("");
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function initializeAudioDevices() {
      try {
        // Cihazlara erişim izni iste
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        // Cihazları listele
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;

        const audioDevices = devices.filter(device => 
          device.kind === 'audioinput' || device.kind === 'audiooutput'
        );

        setAudioDevices(audioDevices);

        // Varsayılan cihazları seç
        const defaultInput = audioDevices.find(device => device.kind === 'audioinput');
        const defaultOutput = audioDevices.find(device => device.kind === 'audiooutput');

        if (defaultInput) setSelectedInputDevice(defaultInput.deviceId);
        if (defaultOutput) setSelectedOutputDevice(defaultOutput.deviceId);

      } catch (error) {
        console.error('Ses cihazlarına erişilemedi:', error);
        if (mounted) {
          toast({
            description: t('audio.deviceAccessError'),
            variant: "destructive",
          });
        }
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', initializeAudioDevices);
    initializeAudioDevices();

    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', initializeAudioDevices);
    };
  }, [toast, t]);

  const playTestSound = async () => {
    const audioContext = new AudioContext();
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      gainNode.gain.value = volume[0] / 100;
      oscillator.connect(gainNode);

      if (selectedOutputDevice) {
        const audioElement = new Audio();
        // @ts-ignore - setSinkId TypeScript'te henüz tanımlı değil
        if (audioElement.setSinkId) {
          await audioElement.setSinkId(selectedOutputDevice);
          const mediaStreamDestination = audioContext.createMediaStreamDestination();
          gainNode.connect(mediaStreamDestination);
          const audioStream = mediaStreamDestination.stream;
          audioElement.srcObject = audioStream;
          await audioElement.play();
        } else {
          gainNode.connect(audioContext.destination);
        }
      } else {
        gainNode.connect(audioContext.destination);
      }

      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      oscillator.start();

      setTimeout(() => {
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
        audioContext.close();
      }, 1000);
    } catch (error) {
      console.error('Test sesi çalınamadı:', error);
      toast({
        description: t('audio.testSoundError'),
        variant: "destructive",
      });
    }
  };

  return (
    <AudioSettingsContext.Provider
      value={{
        volume,
        setVolume,
        audioDevices,
        selectedInputDevice,
        setSelectedInputDevice,
        selectedOutputDevice,
        setSelectedOutputDevice,
        playTestSound,
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
}

export function useAudioSettings() {
  const context = useContext(AudioSettingsContext);
  if (!context) {
    throw new Error("useAudioSettings must be used within an AudioSettingsProvider");
  }
  return context;
}