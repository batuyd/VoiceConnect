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
  requestPermissions: () => Promise<boolean>;
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
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>("");
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>("");

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Failed to get audio permissions:', error);
      toast({
        description: t('audio.deviceAccessError'),
        variant: "destructive",
      });
      return false;
    }
  };

  const updateDeviceList = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => 
        (device.kind === 'audioinput' || device.kind === 'audiooutput') && 
        device.deviceId !== ''
      );

      setAudioDevices(audioDevices);

      if (!selectedInputDevice) {
        const defaultInput = audioDevices.find(device => 
          device.kind === 'audioinput'
        );
        if (defaultInput) {
          setSelectedInputDevice(defaultInput.deviceId);
          try {
            localStorage.setItem('inputDevice', defaultInput.deviceId);
          } catch (error) {
            console.error('Failed to save input device preference:', error);
          }
        }
      }

      if (!selectedOutputDevice) {
        const defaultOutput = audioDevices.find(device => 
          device.kind === 'audiooutput'
        );
        if (defaultOutput) {
          setSelectedOutputDevice(defaultOutput.deviceId);
          try {
            localStorage.setItem('outputDevice', defaultOutput.deviceId);
          } catch (error) {
            console.error('Failed to save output device preference:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
    }
  };

  useEffect(() => {
    const handleDeviceChange = async () => {
      if (document.visibilityState === 'visible') {
        await updateDeviceList();
      }
    };

    requestPermissions().then(granted => {
      if (granted) {
        updateDeviceList();
      }
    });

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    document.addEventListener('visibilitychange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      document.removeEventListener('visibilitychange', handleDeviceChange);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('volume', JSON.stringify(volume));
    } catch (error) {
      console.error('Failed to save volume preference:', error);
    }
  }, [volume]);

  const playTestSound = async () => {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      gainNode.gain.value = volume[0] / 100;

      oscillator.connect(gainNode);

      if (selectedOutputDevice && 'setSinkId' in HTMLAudioElement.prototype) {
        const audioElement = new Audio();
        try {
          await (audioElement as any).setSinkId(selectedOutputDevice);
          const mediaStreamDestination = audioContext.createMediaStreamDestination();
          gainNode.connect(mediaStreamDestination);
          audioElement.srcObject = mediaStreamDestination.stream;
          await audioElement.play();
        } catch (error) {
          console.error('Failed to set audio output device:', error);
          gainNode.connect(audioContext.destination);
        }
      } else {
        gainNode.connect(audioContext.destination);
      }

      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 500);
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
        setSelectedInputDevice,
        selectedOutputDevice,
        setSelectedOutputDevice,
        playTestSound,
        requestPermissions,
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