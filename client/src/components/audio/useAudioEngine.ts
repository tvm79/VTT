import { useRef, useCallback, useEffect } from 'react';
import { AudioTrack } from './types';
import { useAudioFade } from './useAudioFade';
import { useAudioBus, AudioChannel } from './useAudioBus';

interface UseAudioEngineOptions {
  audioVolume: number;
  trackVolume: number;
  fadeEnabled?: boolean;
  defaultFadeInDuration: number;
  defaultFadeOutDuration: number;
  setCurrentAudioTrack: (trackId: string | null, file: string | null) => void;
  setIsAudioPlaying: (playing: boolean) => void;
  resolveAudioPath: (file: string) => string;
  canPlayAudioFormat: (filename: string) => boolean;
  channel?: AudioChannel;
}

export function useAudioEngine({
  audioVolume,
  trackVolume,
  fadeEnabled = true,
  defaultFadeInDuration,
  defaultFadeOutDuration,
  setCurrentAudioTrack,
  setIsAudioPlaying,
  resolveAudioPath,
  canPlayAudioFormat,
  channel = 'music',
}: UseAudioEngineOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const playRequestIdRef = useRef(0);
  const isTrackSelectionInProgressRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const channelGainRef = useRef<GainNode | null>(null);

  // Get audio bus functions
  const { getAudioContext, getBus, resumeContext } = useAudioBus();

  const { fadeIn, fadeOut, stopFade } = useAudioFade({
    audioRef,
    audioVolume,
    trackVolume,
    fadeEnabled,
  });

  // Connect audio element to the appropriate channel bus
  const connectToChannelBus = useCallback((audioElement: HTMLAudioElement) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) {
        console.warn('[AudioEngine] No audio context available');
        return;
      }

      // Resume context if suspended
      resumeContext();

      // Disconnect previous source if exists
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }

      // Create or reuse source node
      let sourceNode = sourceNodeRef.current;
      if (!sourceNode || sourceNode.mediaElement !== audioElement) {
        sourceNode = ctx.createMediaElementSource(audioElement);
        sourceNodeRef.current = sourceNode;
      }

      // Get or create channel gain node
      let channelGain = channelGainRef.current;
      if (!channelGain) {
        channelGain = ctx.createGain();
        channelGain.gain.value = 1;
        channelGainRef.current = channelGain;
      }

      // Get the target bus based on channel
      const targetBus = getBus(channel);
      if (targetBus) {
        sourceNode.connect(channelGain);
        channelGain.connect(targetBus);
        console.debug('[AudioEngine] Connected to channel bus:', channel);
      } else {
        // Fallback to destination if no bus available
        sourceNode.connect(channelGain);
        channelGain.connect(ctx.destination);
        console.warn('[AudioEngine] No channel bus found, using destination');
      }
    } catch (error) {
      console.error('[AudioEngine] Failed to connect to channel bus:', error);
    }
  }, [channel, getAudioContext, getBus, resumeContext]);

  const cancelPendingPlayRequest = () => {
    playRequestIdRef.current += 1;
  };

  const isAbortError = (error: unknown): boolean => {
    return typeof error === 'object'
      && error !== null
      && 'name' in error
      && (error as { name?: string }).name === 'AbortError';
  };

  const playAudioElement = async (audio: HTMLAudioElement, reason: string): Promise<boolean> => {
    const requestId = ++playRequestIdRef.current;
    console.debug('[AudioPanel] play requested', { reason, src: audio.src });

    try {
      await audio.play();
      return requestId === playRequestIdRef.current;
    } catch (error) {
      if (requestId !== playRequestIdRef.current || isAbortError(error)) {
        console.debug('[AudioPanel] play aborted', { reason, src: audio.src, error });
        return false;
      }

      throw error;
    }
  };

  const handleSelectTrack = useCallback((track: AudioTrack) => {
    // Check if browser can play this audio format
    if (!canPlayAudioFormat(track.file)) {
      const ext = track.file.split('.').pop()?.toUpperCase() || 'audio';
      alert(`Your browser does not support ${ext} audio format. Please try MP3, WAV, or another supported format.`);
      return;
    }
    
    const audioPath = resolveAudioPath(track.file);
    console.debug('[AudioPanel] selecting track', {
      trackId: track.id,
      trackFile: track.file,
      resolvedAudioPath: audioPath,
    });

    isTrackSelectionInProgressRef.current = true;
    setCurrentAudioTrack(track.id, track.file);
    
    // Stop current audio
    if (audioRef.current) {
      cancelPendingPlayRequest();
      stopFade();
      audioRef.current.onerror = null;
      audioRef.current.pause();
    }
    
    // Create new audio element
    const nextAudio = new Audio();
    nextAudio.preload = 'auto';
    nextAudio.src = audioPath;
    audioRef.current = nextAudio;

    // Connect to the appropriate channel bus
    connectToChannelBus(nextAudio);
    
    // Add error handling
    let loadFailed = false;

    nextAudio.onerror = () => {
      if (audioRef.current !== nextAudio) {
        return;
      }

      loadFailed = true;
      console.error('Audio load error:', nextAudio.error, {
        trackFile: track.file,
        resolvedAudioPath: audioPath,
      });
      const trackExt = track.file.split('.').pop()?.toUpperCase() || 'audio';
      if (nextAudio.readyState !== 4) {
        alert(`Failed to load audio file. Your browser may not support ${trackExt} format. Try using MP3 or WAV instead.`);
      }
      isTrackSelectionInProgressRef.current = false;
      setIsAudioPlaying(false);
    };
    
    // Set loop based on track settings
    nextAudio.loop = track.loop || false;
    nextAudio.volume = 0; // Start at 0 for fade in
    
    // Use track-specific fade in duration, or global default
    const trackFadeIn = track.fadeInDuration ?? defaultFadeInDuration;
    
    nextAudio.load();

    // Try to play and catch errors
    playAudioElement(nextAudio, 'track-select')
      .then((started) => {
        if (!started || audioRef.current !== nextAudio) {
          return;
        }

        fadeIn(trackFadeIn);
        isTrackSelectionInProgressRef.current = false;
        setIsAudioPlaying(true);
      })
      .catch((err) => {
        if (audioRef.current !== nextAudio) {
          return;
        }

        console.error('Audio play error:', err, {
          trackFile: track.file,
          resolvedAudioPath: audioPath,
        });
        const trackExt = track.file.split('.').pop()?.toUpperCase() || 'audio';

        if (!loadFailed && nextAudio.readyState !== 4) {
          alert(`Failed to play audio file. Your browser may not support ${trackExt} format. Try using MP3 or WAV instead.`);
        }

        isTrackSelectionInProgressRef.current = false;
        setIsAudioPlaying(false);
      });
  }, [defaultFadeInDuration, setCurrentAudioTrack, setIsAudioPlaying, resolveAudioPath, canPlayAudioFormat, fadeIn, stopFade]);

  const handlePlayPause = useCallback((currentTrack: AudioTrack | undefined, isAudioPlaying: boolean) => {
    if (!audioRef.current) return;
    
    // Get current track's fade settings
    const trackFadeIn = currentTrack?.fadeInDuration ?? defaultFadeInDuration;
    const trackFadeOut = currentTrack?.fadeOutDuration ?? defaultFadeOutDuration;
    
    if (isAudioPlaying) {
      // Pause with fade out
      cancelPendingPlayRequest();
      fadeOut(() => {
        audioRef.current?.pause();
        setIsAudioPlaying(false);
      }, trackFadeOut);
    } else {
      // Resume with fade in
      const currentAudio = audioRef.current;
      if (!currentAudio) return;

      playAudioElement(currentAudio, 'resume')
        .then((started) => {
          if (!started || audioRef.current !== currentAudio) {
            return;
          }

          fadeIn(trackFadeIn);
          setIsAudioPlaying(true);
        })
        .catch((error) => {
          console.error('Audio play error:', error);
          setIsAudioPlaying(false);
        });
    }
  }, [defaultFadeInDuration, defaultFadeOutDuration, setIsAudioPlaying, fadeIn, fadeOut]);

  const handleStop = useCallback((currentTrack: AudioTrack | undefined) => {
    if (audioRef.current) {
      // Get current track's fade settings
      const trackFadeOut = currentTrack?.fadeOutDuration ?? defaultFadeOutDuration;
      
      // Stop with fade out
      cancelPendingPlayRequest();
      fadeOut(() => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
        setIsAudioPlaying(false);
        setCurrentAudioTrack(null, null);
      }, trackFadeOut);
    } else {
      setIsAudioPlaying(false);
      setCurrentAudioTrack(null, null);
    }
  }, [defaultFadeOutDuration, setIsAudioPlaying, setCurrentAudioTrack, fadeOut]);

  // Update volume (master volume * track volume)
  const updateVolume = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioVolume * trackVolume;
    }
  }, [audioVolume, trackVolume]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    stopFade();
    cancelPendingPlayRequest();
    // Disconnect audio nodes
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      sourceNodeRef.current = null;
    }
    if (channelGainRef.current) {
      try {
        channelGainRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      channelGainRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [stopFade]);

  return {
    // Refs
    audioRef,
    isTrackSelectionInProgressRef,
    
    // Functions
    handleSelectTrack,
    handlePlayPause,
    handleStop,
    playAudioElement,
    cancelPendingPlayRequest,
    stopFade,
    updateVolume,
    cleanup,
    connectToChannelBus,
  };
}
