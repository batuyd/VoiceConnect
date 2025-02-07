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

  // State management
  const [volume, setVolume] = useState<number[]>([50]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>("");
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize audio devices
  useEffect(() => {
    let mounted = true;

    const initializeAudioDevices = async () => {
      if (!mounted) return;

      try {
        // Step 1: Request permissions
        console.log('Requesting audio permissions...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true }
        });

        // Cleanup test stream
        stream.getTracks().forEach(track => track.stop());

        // Step 2: Get device list
        console.log('Getting audio devices...');
        const devices = await navigator.mediaDevices.enumerateDevices();

        if (!mounted) return;

        // Step 3: Filter and set audio devices
        const audioDevices = devices.filter(device => 
          (device.kind === 'audioinput' || device.kind === 'audiooutput') && 
          device.deviceId
        );

        console.log(`Found ${audioDevices.length} audio devices`);
        setAudioDevices(audioDevices);

        // Step 4: Set default devices if needed
        const defaultInput = audioDevices.find(d => d.kind === 'audioinput');
        const defaultOutput = audioDevices.find(d => d.kind === 'audiooutput');

        if (defaultInput && !selectedInputDevice) {
          console.log('Setting default input device:', defaultInput.label);
          setSelectedInputDevice(defaultInput.deviceId);
        }

        if (defaultOutput && !selectedOutputDevice) {
          console.log('Setting default output device:', defaultOutput.label);
          setSelectedOutputDevice(defaultOutput.deviceId);
        }

        setIsInitialized(true);

      } catch (error: any) {
        console.error('Audio initialization error:', {
          name: error.name,
          message: error.message
        });

        let errorMessage = t('audio.deviceAccessError');

        if (error.name === 'NotAllowedError') {
          errorMessage = t('audio.permissionDenied');
        } else if (error.name === 'NotFoundError') {
          errorMessage = t('audio.noDevicesFound');
        }

        toast({
          description: errorMessage,
          variant: "destructive",
        });
      }
    };

    // Initial setup
    initializeAudioDevices();

    // Device change handler
    const handleDeviceChange = () => {
      console.log('Audio devices changed, reinitializing...');
      initializeAudioDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [toast, t]);

  // Simple test sound function
  const playTestSound = async () => {
    if (!isInitialized) {
      console.log('Audio not initialized, cannot play test sound');
      return;
    }

    try {
      console.log('Playing test sound...');
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gainNode.gain.value = volume[0] / 100;

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 500);

    } catch (error) {
      console.error('Test sound error:', error);
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