import { useRef, useCallback } from 'react';

interface UseAudioFadeOptions {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioVolume: number;
  trackVolume: number;
  fadeEnabled: boolean;
}

export function useAudioFade({ audioRef, audioVolume, trackVolume, fadeEnabled }: UseAudioFadeOptions) {
  const fadeIntervalRef = useRef<number | null>(null);

  const stopFade = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }, []);

  const fadeIn = useCallback((fadeDuration: number) => {
    if (!audioRef.current) {
      return;
    }

    stopFade();

    if (!fadeEnabled || fadeDuration <= 0) {
      audioRef.current.volume = audioVolume * trackVolume;
      return;
    }
    
    audioRef.current.volume = 0;
    
    const steps = 20;
    const intervalTime = (fadeDuration * 1000) / steps;
    const volumeStep = (audioVolume * trackVolume) / steps;
    let currentStep = 0;

    fadeIntervalRef.current = window.setInterval(() => {
      if (!audioRef.current) return;
      currentStep++;
      audioRef.current.volume = Math.min(audioVolume * trackVolume, volumeStep * currentStep);
      
      if (currentStep >= steps) {
        stopFade();
        audioRef.current.volume = audioVolume * trackVolume;
      }
    }, intervalTime);
  }, [audioRef, audioVolume, trackVolume, fadeEnabled, stopFade]);

  const fadeOut = useCallback((callback: () => void, fadeDuration: number) => {
    if (!audioRef.current || !fadeEnabled || fadeDuration <= 0) {
      callback();
      return;
    }
    
    const steps = 20;
    const intervalTime = (fadeDuration * 1000) / steps;
    const startVolume = audioRef.current.volume;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    stopFade();
    
    fadeIntervalRef.current = window.setInterval(() => {
      if (!audioRef.current) return;
      currentStep++;
      audioRef.current.volume = Math.max(0, startVolume - (volumeStep * currentStep));
      
      if (currentStep >= steps) {
        stopFade();
        audioRef.current.volume = 0;
        callback();
      }
    }, intervalTime);
  }, [audioRef, fadeEnabled, stopFade]);

  return {
    fadeIn,
    fadeOut,
    stopFade,
  };
}
