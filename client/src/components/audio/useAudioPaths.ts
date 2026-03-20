import { useCallback } from 'react';

// Helper function to get MIME type from file extension
const getAudioMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'webm': 'audio/webm',
  };
  return mimeTypes[ext] || 'audio/*';
};

// Resolve audio path - tracks now store full public paths like /uploads/audio/...
export function useAudioPaths() {
  // Resolve audio path - track.file already contains the correct public URL
  const resolveAudioPath = useCallback((file: string): string => {
    const trimmedFile = file.trim();

    // If it's already a full URL (http, https, blob, data), use as-is
    if (/^(https?:|blob:|data:)/i.test(trimmedFile)) {
      return trimmedFile;
    }

    // If it's an absolute path from server root, use as-is
    if (trimmedFile.startsWith('/')) {
      return encodeURI(trimmedFile);
    }

    // For legacy compatibility: if it's a relative path, assume it's in uploads
    // This handles old data that may have only filenames
    return encodeURI(`/uploads/audio/ambience/${trimmedFile}`);
  }, []);

  const toAbsoluteAudioUrl = useCallback((file: string): string => {
    return new URL(resolveAudioPath(file), window.location.origin).href;
  }, [resolveAudioPath]);

  // Helper function to check if browser can play the audio format
  const canPlayAudioFormat = (filename: string): boolean => {
    const audio = document.createElement('audio');
    const mimeType = getAudioMimeType(filename);
    const canPlay = audio.canPlayType(mimeType);
    return canPlay === 'probably' || canPlay === 'maybe';
  };

  return {
    // Functions
    resolveAudioPath,
    toAbsoluteAudioUrl,
    getAudioMimeType,
    canPlayAudioFormat,
  };
}
