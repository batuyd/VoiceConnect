import { useRef } from 'react';

export function useSoundEffects() {
  const audioContext = useRef<AudioContext | null>(null);

  const playJoinSound = () => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    const oscillator = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.current.destination);

    oscillator.frequency.setValueAtTime(440, audioContext.current.currentTime); // A4 note
    gainNode.gain.setValueAtTime(0.1, audioContext.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioContext.current.currentTime + 0.5);
  };

  const playLeaveSound = () => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    const oscillator = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.current.destination);

    oscillator.frequency.setValueAtTime(330, audioContext.current.currentTime); // E4 note
    gainNode.gain.setValueAtTime(0.1, audioContext.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioContext.current.currentTime + 0.5);
  };

  return {
    playJoinSound,
    playLeaveSound
  };
}
