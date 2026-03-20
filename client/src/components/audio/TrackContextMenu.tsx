import { AudioTrack } from './types';
import { Button, ContextMenu, Slider } from '../ui/primitives';

interface TrackContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  track: AudioTrack | null;
  playlistId: string;
  allPlaylists: { id: string; tracks: AudioTrack[] }[];
  defaultFadeInDuration: number;
  defaultFadeOutDuration: number;
  colorScheme?: { accent?: string };
  onUpdateFade: (trackId: string, playlistId: string, fadeIn?: number, fadeOut?: number) => void;
  onClose: () => void;
}

export function TrackContextMenu({
  visible,
  x,
  y,
  track,
  playlistId,
  allPlaylists,
  defaultFadeInDuration,
  defaultFadeOutDuration,
  colorScheme,
  onUpdateFade,
  onClose,
}: TrackContextMenuProps) {
  if (!visible || !track) return null;

  // Get the current track data from allPlaylists (to avoid stale state)
  const currentTrackData = allPlaylists
    .find(p => p.id === playlistId)
    ?.tracks.find(t => t.id === track.id) || track;

  const fadeInValue = currentTrackData.fadeInDuration ?? defaultFadeInDuration;
  const fadeOutValue = currentTrackData.fadeOutDuration ?? defaultFadeOutDuration;

  return (
    <ContextMenu
      style={{
        position: 'absolute',
        top: y,
        left: x,
        minWidth: '220px',
        borderColor: colorScheme?.accent || 'var(--color-border-accent)',
        zIndex: 999999999,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ui-field__label">
        Track Fade Settings
      </div>
      
      <Slider
        label={`Fade In: ${fadeInValue}s`}
        min="0"
        max="10"
        step="0.5"
        value={fadeInValue}
        onChange={(e) => {
          onUpdateFade(track.id, playlistId, parseFloat(e.target.value), currentTrackData.fadeOutDuration);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      
      <Slider
        label={`Fade Out: ${fadeOutValue}s`}
        min="0"
        max="10"
        step="0.5"
        value={fadeOutValue}
        onChange={(e) => {
          onUpdateFade(track.id, playlistId, currentTrackData.fadeInDuration, parseFloat(e.target.value));
        }}
        onMouseDown={(e) => e.stopPropagation()}
      />
      
      <Button
        onClick={onClose}
        variant="primary"
        className="audio-context-button"
      >
        Close
      </Button>
    </ContextMenu>
  );
}
