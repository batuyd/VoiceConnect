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
  const [permissionRequested, setPermissionRequested] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeAudioDevices = async () => {
      try {
        if (!permissionRequested) {
          // Request permission by attempting to get the stream
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            }
          });
          // Stop all tracks after getting permission
          stream.getTracks().forEach(track => track.stop());
          setPermissionRequested(true);
        }

        // Get the full device list
        const updatedDevices = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;

        const audioDevices = updatedDevices.filter(device => 
          device.kind === 'audioinput' || device.kind === 'audiooutput'
        );

        if (audioDevices.length === 0) {
          throw new Error(t('audio.noDevices'));
        }

        setAudioDevices(audioDevices);

        // Set default devices if not already set
        if (!selectedInputDevice || !selectedOutputDevice) {
          const defaultInput = audioDevices.find(device => 
            device.kind === 'audioinput' && device.deviceId !== 'default'
          );
          const defaultOutput = audioDevices.find(device => 
            device.kind === 'audiooutput' && device.deviceId !== 'default'
          );

          if (defaultInput) setSelectedInputDevice(defaultInput.deviceId);
          if (defaultOutput) setSelectedOutputDevice(defaultOutput.deviceId);
        }

      } catch (error) {
        console.error('Failed to access audio devices:', error);
        if (mounted) {
          toast({
            description: t('audio.deviceAccessError'),
            variant: "destructive",
          });
        }
      }
    };

    // Initialize devices and set up device change listener
    initializeAudioDevices();

    const handleDeviceChange = async () => {
      if (document.visibilityState === 'visible') {
        await initializeAudioDevices();
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    document.addEventListener('visibilitychange', handleDeviceChange);

    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      document.removeEventListener('visibilitychange', handleDeviceChange);
    };
  }, [toast, t, permissionRequested, selectedInputDevice, selectedOutputDevice]);

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
        oscillator.disconnect();
        gainNode.disconnect();
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