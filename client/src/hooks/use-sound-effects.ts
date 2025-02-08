import { useRef } from 'react';

export function useSoundEffects() {
  const audioContext = useRef<AudioContext | null>(null);
  const cooldownRef = useRef<boolean>(false);

  const playSoundWithCooldown = (frequency: number) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;

    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }

    const oscillator = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.current.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.current.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(audioContext.current.currentTime + 0.5);

    // Reset cooldown after 1 second
    setTimeout(() => {
      cooldownRef.current = false;
    }, 1000);
  };

  const playJoinSound = () => {
    playSoundWithCooldown(440); // A4 note
  };

  const playLeaveSound = () => {
    playSoundWithCooldown(330); // E4 note
  };

  return {
    playJoinSound,
    playLeaveSound
  };
}