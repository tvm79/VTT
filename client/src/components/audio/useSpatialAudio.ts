import { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { AudioSource } from '../../../../shared/src';

// DEBUG: Diagnostic logging for audio listener position
const DEBUG_AUDIO_LISTENER = false;

// Volume smoothing settings
// FADE_DURATION: Time in ms for full transition - now pulled from gameStore
const DEFAULT_FADE_DURATION = 1000;

// Runtime audio source data (not persisted)
interface AudioSourceRuntime {
  sourceId: string;
  audio: HTMLAudioElement;
  gainNode: GainNode;
  targetVolume: number; // Volume based on current distance (calculated from position)
  currentVolume: number; // Actual volume being applied (lerped toward target)
}

/**
 * Calculate the distance between two points
 */
function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate volume based on distance from source to listener
 * Uses exponential falloff for smoother audio attenuation
 * - Full volume at innerRadius
 * - Gradual exponential decay towards outer radius
 * - Zero volume at/outside radius
 */
function calculateVolume(
  distance: number,
  radius: number,
  innerRadius: number,
  baseVolume: number
): number {
  if (radius <= 0) return 0;
  if (distance >= radius) return 0;
  if (distance <= innerRadius) return baseVolume;
  
  // Exponential falloff for smoother attenuation
  const range = radius - innerRadius;
  const t = (distance - innerRadius) / range;
  
  // Use exponential curve: volume = baseVolume * (1 - t)^2
  // This creates a more gradual falloff near the source
  const falloff = Math.pow(1 - t, 2);
  return baseVolume * falloff;
}

/**
 * Linear interpolation between two values
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Calculate the exponential interpolation factor based on fade duration
 * This gives a smooth ~1 second transition regardless of frame rate
 */
function getLerpFactor(deltaTimeMs: number, fadeDurationMs: number): number {
  // Using exponential decay: factor = 1 - e^(-dt/duration)
  // This gives smooth interpolation that completes in ~duration time
  return 1 - Math.exp(-deltaTimeMs / fadeDurationMs);
}

/**
 * Hook to manage spatial audio playback with time-based volume smoothing
 */
export function useSpatialAudio() {
  const [runtimeSources, setRuntimeSources] = useState<Map<string, AudioSourceRuntime>>(new Map());
  const [listenerPosition, setListenerPosition] = useState<{ x: number; y: number } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const listenerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);

  // Get audio sources from store
  const audioSources = useGameStore(state => state.audioSources);
  const tokens = useGameStore(state => state.tokens);
  const isGM = useGameStore(state => state.isGM);
  const selectedTokenId = useGameStore(state => state.selectedTokenId);
  const audioFadeInDuration = useGameStore(state => state.audioFadeInDuration);
  const audioFadeOutDuration = useGameStore(state => state.audioFadeOutDuration);

  // DEBUG: Log token and selection state changes
  if (DEBUG_AUDIO_LISTENER) {
    console.log('[SpatialAudio] State - tokens:', tokens.length, '| selectedTokenId:', selectedTokenId, '| isGM:', isGM);
  }

  // Get the listener position (player token position)
  // CURRENT BEHAVIOR: Uses ANY visible token with ownerId (BUG - arbitrary token)
  // EXPECTED BEHAVIOR: Should use the selected token's position
  const getListenerPosition = useCallback((): { x: number; y: number } | null => {
    // DEBUG: Log the current listener selection logic
    if (DEBUG_AUDIO_LISTENER) {
      console.log('[SpatialAudio] getListenerPosition called - selectedTokenId:', selectedTokenId);
    }

    // NEW LOGIC: Use the explicitly selected token if available
    if (selectedTokenId) {
      const selectedToken = tokens.find(t => t.id === selectedTokenId);
      if (selectedToken && selectedToken.visible) {
        if (DEBUG_AUDIO_LISTENER) {
          console.log('[SpatialAudio] Using SELECTED token:', selectedToken.id, 'at', selectedToken.x, selectedToken.y);
        }
        return { x: selectedToken.x + (selectedToken.size * 50) / 2, y: selectedToken.y + (selectedToken.size * 50) / 2 };
      }
    }

    // DEBUG: Show what the OLD buggy logic was doing
    if (DEBUG_AUDIO_LISTENER) {
      console.log('[SpatialAudio] DEBUG - Old logic would pick first visible token with ownerId');
      for (const token of tokens) {
        console.log('[SpatialAudio] DEBUG token:', token.id, '| ownerId:', token.ownerId, '| visible:', token.visible);
      }
    }
    
    // Priority 1: Selected/owned player token (OLD BUGGY LOGIC)
    for (const token of tokens) {
      if (token.ownerId && token.visible) {
        if (DEBUG_AUDIO_LISTENER) {
          console.log('[SpatialAudio] OLD BEHAVIOR - Using first token with ownerId:', token.id);
        }
        return { x: token.x + (token.size * 50) / 2, y: token.y + (token.size * 50) / 2 };
      }
    }
    
    // Priority 2: First visible token (OLD BUGGY LOGIC)
    for (const token of tokens) {
      if (token.visible) {
        if (DEBUG_AUDIO_LISTENER) {
          console.log('[SpatialAudio] OLD BEHAVIOR - Using first visible token:', token.id);
        }
        return { x: token.x + (token.size * 50) / 2, y: token.y + (token.size * 50) / 2 };
      }
    }

    // No listener found
    if (DEBUG_AUDIO_LISTENER) {
      console.log('[SpatialAudio] No listener position found');
    }
    return null;
  }, [tokens, selectedTokenId]);

  // Update listener position when tokens or selection changes
  // This runs whenever tokens array changes (which happens on move) or selectedTokenId changes
  useEffect(() => {
    const position = getListenerPosition();
    if (position) {
      listenerPositionRef.current = position;
      setListenerPosition(position); // Trigger re-render
    }
  }, [getListenerPosition, tokens, selectedTokenId]);

  // Initialize audio context
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    
    return () => {
      // Cleanup on unmount
      runtimeSources.forEach(({ audio }) => {
        audio.pause();
        audio.src = '';
      });
      setRuntimeSources(new Map());
    };
  }, []);

  // Create or update audio source
  const createOrUpdateAudioSource = useCallback((source: AudioSource) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    // Skip if no audio file
    if (!source.audioFile) {
      return;
    }

    let runtime = runtimeSources.get(source.id);

    if (!runtime) {
      // Create new audio element
      const audio = new Audio(source.audioFile);
      audio.loop = source.loop;
      audio.crossOrigin = 'anonymous';

      // Create media element source and gain node for volume control
      const sourceNode = audioContextRef.current.createMediaElementSource(audio);
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0;
      
      // Connect to destination (spatial audio doesn't use the audio bus system
      // as it manages its own gain control for distance attenuation)
      sourceNode.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      runtime = {
        sourceId: source.id,
        audio,
        gainNode,
        targetVolume: 0,
        currentVolume: 0,
      };

      setRuntimeSources(prev => new Map(prev).set(source.id, runtime!));
    }

    // Update audio settings
    runtime.audio.loop = source.loop;
    
    if (source.playing && runtime.audio.paused) {
      runtime.audio.play().catch(console.error);
    } else if (!source.playing && !runtime.audio.paused) {
      runtime.audio.pause();
    }

    // Calculate target volume based on distance (don't apply directly)
    if (listenerPositionRef.current && source.playing) {
      const distance = getDistance(
        source.x,
        source.y,
        listenerPositionRef.current.x,
        listenerPositionRef.current.y
      );

      // Calculate the target volume based on distance
      runtime.targetVolume = calculateVolume(
        distance,
        source.radius,
        source.innerRadius,
        source.baseVolume
      );
    } else {
      // No listener or not playing - target is silence
      runtime.targetVolume = 0;
    }
  }, [runtimeSources]);

  // Remove audio source
  const removeAudioSource = useCallback((sourceId: string) => {
    const runtime = runtimeSources.get(sourceId);
    if (runtime) {
      runtime.audio.pause();
      runtime.audio.src = '';
      runtime.gainNode.disconnect();
      
      setRuntimeSources(prev => {
        const next = new Map(prev);
        next.delete(sourceId);
        return next;
      });
    }
  }, [runtimeSources]);

  // Animation loop for smooth volume interpolation
  // This runs continuously and lerps currentVolume toward targetVolume
  // Uses audioFadeInDuration/audioFadeOutDuration from gameStore
  const updateVolumes = useCallback(() => {
    const now = performance.now();
    const deltaTime = lastUpdateTimeRef.current ? now - lastUpdateTimeRef.current : 16;
    lastUpdateTimeRef.current = now;

    // Calculate lerp factor based on time elapsed
    // Use fade in duration when increasing, fade out when decreasing
    const fadeInDuration = audioFadeInDuration || 1000;
    const fadeOutDuration = audioFadeOutDuration || 1000;
    
    // Update all runtime sources
    runtimeSources.forEach((runtime) => {
      if (!audioContextRef.current || audioContextRef.current.state !== 'running') {
        runtime.gainNode.gain.value = runtime.targetVolume;
        runtime.currentVolume = runtime.targetVolume;
        return;
      }

      // Determine which fade duration to use based on volume direction
      const isVolumeIncreasing = runtime.targetVolume > runtime.currentVolume;
      const fadeDuration = isVolumeIncreasing ? fadeInDuration : fadeOutDuration;
      const lerpFactor = getLerpFactor(deltaTime, fadeDuration);

      // Lerp current volume toward target volume
      const newVolume = lerp(runtime.currentVolume, runtime.targetVolume, lerpFactor);
      
      // Apply to gain node (use a small minimum to avoid -infinity with exponentialRamp)
      if (newVolume > 0.001) {
        runtime.gainNode.gain.value = newVolume;
      } else {
        runtime.gainNode.gain.value = 0.001;
      }
      
      runtime.currentVolume = newVolume;
    });

    // Continue the animation loop
    animationFrameRef.current = requestAnimationFrame(updateVolumes);
  }, [runtimeSources, audioFadeInDuration, audioFadeOutDuration]);

  // Start/stop animation loop
  useEffect(() => {
    if (isGM && audioSources.length > 0) {
      // Start the animation loop
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updateVolumes);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isGM, audioSources.length, updateVolumes]);

  // Update all audio sources based on current state
  useEffect(() => {
    if (!isGM) return; // Only GM manages playback

    // Track which sources should exist
    const currentSourceIds = new Set(audioSources.map(s => s.id));

    // Remove audio sources that no longer exist
    runtimeSources.forEach((_, sourceId) => {
      if (!currentSourceIds.has(sourceId)) {
        removeAudioSource(sourceId);
      }
    });

    // Create or update audio sources
    audioSources.forEach(source => {
      createOrUpdateAudioSource(source);
    });
  }, [audioSources, isGM, runtimeSources, createOrUpdateAudioSource, removeAudioSource]);

  // Update target volumes when listener position changes (token moves or selection changes)
  // This only updates the TARGET volume, not the actual volume (which is lerped in animation loop)
  useEffect(() => {
    if (!isGM || !listenerPosition) return;

    audioSources.forEach(source => {
      createOrUpdateAudioSource(source);
    });
  }, [listenerPosition, isGM, audioSources, createOrUpdateAudioSource]);

  // Helper to get volume for a specific source (for UI display)
  const getSourceVolume = useCallback((sourceId: string): number => {
    const source = audioSources.find(s => s.id === sourceId);
    if (!source || !listenerPositionRef.current) return 0;

    const distance = getDistance(
      source.x,
      source.y,
      listenerPositionRef.current.x,
      listenerPositionRef.current.y
    );

    return calculateVolume(distance, source.radius, source.innerRadius, source.baseVolume);
  }, [audioSources]);

  return {
    getListenerPosition,
    getSourceVolume,
  };
}

export default useSpatialAudio;
