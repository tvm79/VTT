// Audio types for the AudioPanel component

export interface AudioTrack {
  id: string;
  name: string;
  file: string;
  loop?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
}

export interface AudioPlaylist {
  id: string;
  name: string;
  icon: string;
  tracks: AudioTrack[];
  isCustom?: boolean;
  loopPlaylist?: boolean;
  shufflePlaylist?: boolean;
  repeatTrack?: boolean;
  // Audio channel routing: 'music' or 'environmental'
  channel?: 'music' | 'environmental';
}
