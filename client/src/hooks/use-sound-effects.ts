import { useRef } from 'react';

export function useSoundEffects() {
  const audioContext = useRef<AudioContext | null>(null);
  const lastPlayedTime = useRef<number>(0);
  const minTimeBetweenSounds = 2000; // minimum 2 seconds between sounds

  const playSound = (frequency: number) => {
    const now = Date.now();
    if (now - lastPlayedTime.current < minTimeBetweenSounds) {
      return;
    }

    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    lastPlayedTime.current = now;

    const oscillator = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.current.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.current.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioContext.current.currentTime + 0.5);
  };

  const playJoinSound = () => {
    playSound(440); // A4 note
  };

  const playLeaveSound = () => {
    playSound(330); // E4 note
  };

  return {
    playJoinSound,
    playLeaveSound
  };
}