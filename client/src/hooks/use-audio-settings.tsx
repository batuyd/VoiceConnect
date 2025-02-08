import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
  isTestingAudio: boolean;
};

const AudioSettingsContext = createContext<AudioSettingsContextType | null>(null);

export function AudioSettingsProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [volume, setVolume] = useState<number[]>([50]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>("");
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTestingAudio, setIsTestingAudio] = useState(false);

  // Real-time volume feedback with improved cleanup
  useEffect(() => {
    if (!selectedInputDevice || !isInitialized) return;

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let mediaStream: MediaStream | null = null;
    let animationFrame: number | null = null;

    const updateVolume = () => {
      if (!analyser) return;
      const array = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(array);
      const values = array.reduce((a, b) => a + b) / array.length;
      setVolume([Math.min(Math.round((values / 255) * 100), 100)]);
      animationFrame = requestAnimationFrame(updateVolume);
    };

    const setupAudioAnalysis = async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedInputDevice }
        });

        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(mediaStream);
        microphone.connect(analyser);
        updateVolume();
      } catch (error) {
        console.warn('Could not initialize audio analysis:', error);
        toast({
          description: t('audio.initializationError'),
          variant: "destructive",
        });
      }
    };

    setupAudioAnalysis();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (microphone) microphone.disconnect();
      if (audioContext) audioContext.close();
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedInputDevice, isInitialized, toast, t]);

  useEffect(() => {
    let mounted = true;

    const initializeAudioDevices = async () => {
      if (!mounted) return;

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn('Audio devices not supported');
          toast({
            description: t('audio.notSupported'),
            variant: "destructive",
          });
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudioDevices = devices.some(device =>
          device.kind === 'audioinput' || device.kind === 'audiooutput'
        );

        if (hasAudioDevices) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true }
            });
            stream.getTracks().forEach(track => track.stop());
          } catch (error) {
            console.warn('Audio permission denied:', error);
            toast({
              description: t('audio.permissionDenied'),
              variant: "destructive",
            });
            return;
          }
        } else {
          console.warn('No audio devices found');
          toast({
            description: t('audio.noDevices'),
            variant: "destructive",
          });
          return;
        }

        if (!mounted) return;

        const availableDevices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = availableDevices.filter(device =>
          (device.kind === 'audioinput' || device.kind === 'audiooutput') &&
          device.deviceId
        );

        if (audioDevices.length === 0) {
          console.warn('No audio devices available after permission');
          toast({
            description: t('audio.noDevicesAfterPermission'),
            variant: "destructive",
          });
          return;
        }

        setAudioDevices(audioDevices);

        const defaultInput = audioDevices.find(d => d.kind === 'audioinput');
        const defaultOutput = audioDevices.find(d => d.kind === 'audiooutput');

        if (defaultInput) {
          setSelectedInputDevice(defaultInput.deviceId);
        }

        if (defaultOutput) {
          setSelectedOutputDevice(defaultOutput.deviceId);
        }

        setIsInitialized(true);

      } catch (error) {
        console.error('Audio initialization error:', error);
        toast({
          description: t('audio.initializationError'),
          variant: "destructive",
        });
      }
    };

    initializeAudioDevices();

    const handleDeviceChange = async () => {
      console.log('Audio devices changed, reinitializing...');
      await initializeAudioDevices();
    };

    try {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    } catch (error) {
      console.warn('Device change events not supported:', error);
    }

    return () => {
      mounted = false;
      try {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      } catch (error) {
        console.warn('Could not remove device change listener:', error);
      }
    };
  }, [toast, t]);

  const playTestSound = useCallback(async () => {
    if (!isInitialized) {
      toast({
        description: t('audio.notInitialized'),
        variant: "destructive",
      });
      return;
    }

    setIsTestingAudio(true);

    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      gainNode.gain.value = volume[0] / 100;

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume[0] / 100, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);

      oscillator.start();

      await new Promise(resolve => setTimeout(resolve, 500));

      oscillator.stop();
      await audioContext.close();

    } catch (error) {
      console.error('Test sound error:', error);
      toast({
        description: t('audio.testSoundError'),
        variant: "destructive",
      });
    } finally {
      setIsTestingAudio(false);
    }
  }, [isInitialized, volume, toast, t]);

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
        isTestingAudio,
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