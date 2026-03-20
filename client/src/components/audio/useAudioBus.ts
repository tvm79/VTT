import { useRef, useCallback, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';

// Audio channel types (master is handled separately)
export type AudioChannel = 'music' | 'environmental' | 'ui';

// Audio bus interface
interface AudioBus {
  gainNode: GainNode;
  channel: AudioChannel;
}

// Audio bus system hook
export function useAudioBus() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterBusRef = useRef<GainNode | null>(null);
  const musicBusRef = useRef<GainNode | null>(null);
  const environmentBusRef = useRef<GainNode | null>(null);
  const uiBusRef = useRef<GainNode | null>(null);

  // Get volume settings from store (default to 1 if not set for backwards compatibility)
  const masterVolume = useGameStore(state => state.masterVolume ?? 1);
  const musicVolume = useGameStore(state => state.musicVolume ?? 1);
  const environmentVolume = useGameStore(state => state.environmentVolume ?? 1);
  const uiVolume = useGameStore(state => state.uiVolume ?? 1);

  // Initialize audio context and buses
  const initializeAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
      const ctx = audioContextRef.current;

      // Create master bus (connects to destination)
      masterBusRef.current = ctx.createGain();
      masterBusRef.current.connect(ctx.destination);
      masterBusRef.current.gain.value = masterVolume;

      // Create music bus (connects to master)
      musicBusRef.current = ctx.createGain();
      musicBusRef.current.connect(masterBusRef.current);
      musicBusRef.current.gain.value = musicVolume;

      // Create environment bus (connects to master)
      environmentBusRef.current = ctx.createGain();
      environmentBusRef.current.connect(masterBusRef.current);
      environmentBusRef.current.gain.value = environmentVolume;

      // Create UI bus (connects to master)
      uiBusRef.current = ctx.createGain();
      uiBusRef.current.connect(masterBusRef.current);
      uiBusRef.current.gain.value = uiVolume;

      console.debug('[AudioBus] Audio buses initialized');
      return ctx;
    } catch (e) {
      console.error('[AudioBus] Failed to initialize audio context:', e);
      return null;
    }
  }, [masterVolume, musicVolume, environmentVolume, uiVolume]);

  // Get or create audio context
  const getAudioContext = useCallback(() => {
    return initializeAudioContext();
  }, [initializeAudioContext]);

  // Get a specific bus by channel
  const getBus = useCallback((channel: AudioChannel): GainNode | null => {
    // Ensure context is initialized
    getAudioContext();

    switch (channel) {
      case 'music':
        return musicBusRef.current;
      case 'environmental':
        return environmentBusRef.current;
      case 'ui':
        return uiBusRef.current;
      default:
        return masterBusRef.current;
    }
  }, [getAudioContext]);

  // Get master bus
  const getMasterBus = useCallback((): GainNode | null => {
    getAudioContext();
    return masterBusRef.current;
  }, [getAudioContext]);

  // Resume audio context if suspended
  const resumeContext = useCallback(async () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  }, [getAudioContext]);

  // Update volume for a specific channel
  const setChannelVolume = useCallback((channel: AudioChannel | 'master', volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));

    switch (channel) {
      case 'music':
        if (musicBusRef.current) {
          musicBusRef.current.gain.value = clampedVolume;
        }
        break;
      case 'environmental':
        if (environmentBusRef.current) {
          environmentBusRef.current.gain.value = clampedVolume;
        }
        break;
      case 'ui':
        if (uiBusRef.current) {
          uiBusRef.current.gain.value = clampedVolume;
        }
        break;
      case 'master':
      default:
        if (masterBusRef.current) {
          masterBusRef.current.gain.value = clampedVolume;
        }
        break;
    }
  }, []);

  // Sync volumes from store when they change
  useEffect(() => {
    setChannelVolume('master', masterVolume);
  }, [masterVolume, setChannelVolume]);

  useEffect(() => {
    setChannelVolume('music', musicVolume);
  }, [musicVolume, setChannelVolume]);

  useEffect(() => {
    setChannelVolume('environmental', environmentVolume);
  }, [environmentVolume, setChannelVolume]);

  useEffect(() => {
    setChannelVolume('ui', uiVolume);
  }, [uiVolume, setChannelVolume]);

  return {
    // Initialize and get context
    getAudioContext,
    resumeContext,

    // Get specific buses
    getBus,
    getMasterBus,

    // Volume control
    setChannelVolume,

    // Channel constants for reference
    channels: {
      music: 'music' as AudioChannel,
      environmental: 'environmental' as AudioChannel,
      ui: 'ui' as AudioChannel,
    },
  };
}

export default useAudioBus;
