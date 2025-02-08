import { useRef } from 'react';

export function useSoundEffects() {
  const audioContext = useRef<AudioContext | null>(null);
  const lastPlayedTime = useRef<number>(0);
  const minTimeBetweenSounds = 5000; // minimum 5 seconds between sounds

  const playSound = (frequency: number) => {
    const now = Date.now();
    if (now - lastPlayedTime.current < minTimeBetweenSounds) {
      console.log('Skipping sound effect - too soon');
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
    gainNode.gain.setValueAtTime(0.05, audioContext.current.currentTime); // Lower volume
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioContext.current.currentTime + 0.3); // Shorter duration
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