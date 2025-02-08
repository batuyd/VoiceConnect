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
  // Yeni ses efekti ayarları
  voiceEffect: 'none' | 'pitch-up' | 'pitch-down' | 'robot' | 'echo';
  setVoiceEffect: (effect: 'none' | 'pitch-up' | 'pitch-down' | 'robot' | 'echo') => void;
  noiseSuppressionLevel: 'off' | 'low' | 'medium' | 'high';
  setNoiseSuppressionLevel: (level: 'off' | 'low' | 'medium' | 'high') => void;
  audioQuality: 'low' | 'medium' | 'high';
  setAudioQuality: (quality: 'low' | 'medium' | 'high') => void;
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
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  // Yeni ses efekti state'leri
  const [voiceEffect, setVoiceEffect] = useState<'none' | 'pitch-up' | 'pitch-down' | 'robot' | 'echo'>('none');
  const [noiseSuppressionLevel, setNoiseSuppressionLevel] = useState<'off' | 'low' | 'medium' | 'high'>('medium');
  const [audioQuality, setAudioQuality] = useState<'low' | 'medium' | 'high'>('high');

  // Ses efektlerini uygulama
  const applyAudioEffects = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext({ sampleRate: 48000 });
    const source = audioContext.createMediaStreamSource(stream);
    let currentNode: AudioNode = source;

    // Pitch shifter effect
    if (voiceEffect.includes('pitch')) {
      const pitchShifter = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      pitchShifter.frequency.value = voiceEffect === 'pitch-up' ? 880 : 220;
      gainNode.gain.value = 0.5;

      currentNode.connect(gainNode);
      pitchShifter.connect(gainNode);
      currentNode = gainNode;
    }

    // Robot effect
    if (voiceEffect === 'robot') {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sawtooth';
      oscillator.frequency.value = 440;
      gainNode.gain.value = 0.5;

      oscillator.start();
      oscillator.connect(gainNode);
      currentNode.connect(gainNode);
      currentNode = gainNode;
    }

    // Echo effect
    if (voiceEffect === 'echo') {
      const delay = audioContext.createDelay(0.5);
      const feedback = audioContext.createGain();

      delay.delayTime.value = 0.15;
      feedback.gain.value = 0.4;

      currentNode.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      currentNode = delay;
    }

    // Noise suppression settings
    if (noiseSuppressionLevel !== 'off') {
      const compressor = audioContext.createDynamicsCompressor();

      switch (noiseSuppressionLevel) {
        case 'low':
          compressor.threshold.value = -50;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          break;
        case 'medium':
          compressor.threshold.value = -40;
          compressor.knee.value = 30;
          compressor.ratio.value = 16;
          break;
        case 'high':
          compressor.threshold.value = -30;
          compressor.knee.value = 20;
          compressor.ratio.value = 20;
          break;
      }

      currentNode.connect(compressor);
      currentNode = compressor;
    }

    // Final output
    const destination = audioContext.createMediaStreamDestination();
    currentNode.connect(destination);
    return destination.stream;
  }, [voiceEffect, noiseSuppressionLevel]);

  // Ses kalitesi ayarları
  const getAudioConstraints = useCallback(() => {
    const constraints: MediaTrackConstraints = {
      deviceId: selectedInputDevice,
      autoGainControl,
      echoCancellation,
      noiseSuppression,
    };

    switch (audioQuality) {
      case 'low':
        constraints.sampleRate = 22050;
        constraints.channelCount = 1;
        break;
      case 'medium':
        constraints.sampleRate = 44100;
        constraints.channelCount = 1;
        break;
      case 'high':
        constraints.sampleRate = 48000;
        constraints.channelCount = 2;
        break;
    }

    return constraints;
  }, [selectedInputDevice, autoGainControl, echoCancellation, noiseSuppression, audioQuality]);

  // Ses analizi ve gerçek zamanlı seviye güncelleme
  useEffect(() => {
    if (!selectedInputDevice || !isInitialized) return;

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let mediaStream: MediaStream | null = null;
    let animationFrame: number | null = null;
    let retryTimeout: NodeJS.Timeout | null = null;

    const updateVolume = () => {
      if (!analyser) return;
      const array = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(array);
      const values = array.reduce((a, b) => a + b) / array.length;
      setVolume([Math.min(Math.round((values / 255) * 100), 100)]);
      animationFrame = requestAnimationFrame(updateVolume);
    };

    const setupAudioAnalysis = async (retryCount = 0) => {
      try {
        if (retryCount > 3) {
          throw new Error('Maximum retry attempts reached');
        }

        const constraints = getAudioConstraints();
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        const processedStream = applyAudioEffects(mediaStream);

        audioContext = new AudioContext({ sampleRate: constraints.sampleRate });
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        microphone = audioContext.createMediaStreamSource(processedStream);
        microphone.connect(analyser);
        updateVolume();

      } catch (error) {
        console.warn('Audio analysis setup failed:', error);
        if (retryCount < 3) {
          retryTimeout = setTimeout(() => {
            setupAudioAnalysis(retryCount + 1);
          }, 2000);
        } else {
          toast({
            description: t('audio.initializationError'),
            variant: "destructive",
          });
        }
      }
    };

    setupAudioAnalysis();

    // Cleanup
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (retryTimeout) clearTimeout(retryTimeout);
      if (microphone) microphone.disconnect();
      if (audioContext) audioContext.close();
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedInputDevice, isInitialized, autoGainControl, echoCancellation, noiseSuppression, toast, t, getAudioConstraints, applyAudioEffects]);

  // Cihaz yönetimi ve otomatik yeniden bağlanma
  useEffect(() => {
    let mounted = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const initializeAudioDevices = async (retryCount = 0) => {
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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: getAudioConstraints() });
            stream.getTracks().forEach(track => track.stop());
          } catch (error) {
            console.warn('Audio permission denied:', error);
            if (retryCount < 3) {
              reconnectTimeout = setTimeout(() => {
                initializeAudioDevices(retryCount + 1);
              }, 2000);
              return;
            }
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
          if (retryCount < 3) {
            reconnectTimeout = setTimeout(() => {
              initializeAudioDevices(retryCount + 1);
            }, 2000);
            return;
          }
          console.warn('No audio devices available after permission');
          toast({
            description: t('audio.noDevicesAfterPermission'),
            variant: "destructive",
          });
          return;
        }

        setAudioDevices(audioDevices);

        // Cihaz seçimi ve varsayılan ayarlar
        if (!selectedInputDevice) {
          const defaultInput = audioDevices.find(d => d.kind === 'audioinput');
          if (defaultInput) {
            setSelectedInputDevice(defaultInput.deviceId);
          }
        }

        if (!selectedOutputDevice) {
          const defaultOutput = audioDevices.find(d => d.kind === 'audiooutput');
          if (defaultOutput) {
            setSelectedOutputDevice(defaultOutput.deviceId);
          }
        }

        setIsInitialized(true);

      } catch (error) {
        console.error('Audio initialization error:', error);
        if (retryCount < 3) {
          reconnectTimeout = setTimeout(() => {
            initializeAudioDevices(retryCount + 1);
          }, 2000);
        } else {
          toast({
            description: t('audio.initializationError'),
            variant: "destructive",
          });
        }
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
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      try {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      } catch (error) {
        console.warn('Could not remove device change listener:', error);
      }
    };
  }, [selectedInputDevice, selectedOutputDevice, toast, t, getAudioConstraints]);

  // Gelişmiş test sesi fonksiyonu
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
      const audioContext = new AudioContext({ sampleRate: 48000 });
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.5);
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
        // Yeni özellikleri ekleyelim
        voiceEffect,
        setVoiceEffect,
        noiseSuppressionLevel,
        setNoiseSuppressionLevel,
        audioQuality,
        setAudioQuality,
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