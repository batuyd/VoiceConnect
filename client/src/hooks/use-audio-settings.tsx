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
  const [volume, setVolume] = useState<number[]>(() => {
    try {
      const savedVolume = localStorage.getItem('volume');
      return savedVolume ? JSON.parse(savedVolume) : [50];
    } catch {
      return [50];
    }
  });

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>(() => {
    try {
      return localStorage.getItem('inputDevice') || "";
    } catch {
      return "";
    }
  });

  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>(() => {
    try {
      return localStorage.getItem('outputDevice') || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    let mounted = true;

    const initializeAudioDevices = async () => {
      try {
        // İlk olarak izinleri kontrol et
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // İzin alındıktan sonra stream'i kapat
        stream.getTracks().forEach(track => track.stop());

        // Cihaz listesini al
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;

        const audioDevices = devices.filter(device => 
          (device.kind === 'audioinput' || device.kind === 'audiooutput') && 
          device.deviceId !== ''
        );

        if (audioDevices.length === 0) {
          throw new Error(t('audio.noDevices'));
        }

        setAudioDevices(audioDevices);

        // Varsayılan giriş cihazını ayarla
        if (!selectedInputDevice) {
          const defaultInput = audioDevices.find(device => 
            device.kind === 'audioinput' && device.deviceId !== 'default'
          );
          if (defaultInput) {
            setSelectedInputDevice(defaultInput.deviceId);
            localStorage.setItem('inputDevice', defaultInput.deviceId);
          }
        }

        // Varsayılan çıkış cihazını ayarla
        if (!selectedOutputDevice) {
          const defaultOutput = audioDevices.find(device => 
            device.kind === 'audiooutput' && device.deviceId !== 'default'
          );
          if (defaultOutput) {
            setSelectedOutputDevice(defaultOutput.deviceId);
            localStorage.setItem('outputDevice', defaultOutput.deviceId);
          }
        }

      } catch (error: any) {
        console.error('Failed to initialize audio devices:', error);
        if (mounted) {
          toast({
            description: error.name === 'NotAllowedError' 
              ? t('audio.permissionDenied')
              : t('audio.deviceAccessError'),
            variant: "destructive",
          });
        }
      }
    };

    // Cihaz değişikliklerini dinle
    const handleDeviceChange = async () => {
      if (document.visibilityState === 'visible') {
        await initializeAudioDevices();
      }
    };

    initializeAudioDevices();

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    document.addEventListener('visibilitychange', handleDeviceChange);

    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      document.removeEventListener('visibilitychange', handleDeviceChange);
    };
  }, [toast, t]);

  // Ses ayarlarını localStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('volume', JSON.stringify(volume));
  }, [volume]);

  const playTestSound = async () => {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      gainNode.gain.value = volume[0] / 100;
      oscillator.connect(gainNode);

      if (selectedOutputDevice && 'setSinkId' in HTMLAudioElement.prototype) {
        const audioElement = new Audio();
        await (audioElement as any).setSinkId(selectedOutputDevice);
        const mediaStreamDestination = audioContext.createMediaStreamDestination();
        gainNode.connect(mediaStreamDestination);
        audioElement.srcObject = mediaStreamDestination.stream;
        await audioElement.play();
      } else {
        gainNode.connect(audioContext.destination);
      }

      oscillator.frequency.value = 440;
      oscillator.type = 'sine';
      oscillator.start();

      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 1000);

    } catch (error) {
      console.error('Failed to play test sound:', error);
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
        setSelectedInputDevice: (deviceId: string) => {
          setSelectedInputDevice(deviceId);
          localStorage.setItem('inputDevice', deviceId);
        },
        selectedOutputDevice,
        setSelectedOutputDevice: (deviceId: string) => {
          setSelectedOutputDevice(deviceId);
          localStorage.setItem('outputDevice', deviceId);
        },
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