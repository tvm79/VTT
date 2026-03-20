import { AudioPlaylist } from './types';
import { Button, ContextMenu } from '../ui/primitives';

interface PlaylistContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  playlist: AudioPlaylist | null;
  colorScheme?: { accent?: string };
  onChannelChange: (channel: 'music' | 'environmental') => void;
  onClose: () => void;
}

export function PlaylistContextMenu({
  visible,
  x,
  y,
  playlist,
  colorScheme,
  onChannelChange,
  onClose,
}: PlaylistContextMenuProps) {
  if (!visible || !playlist) return null;

  const currentChannel = playlist.channel || 'music';

  return (
    <ContextMenu
      style={{
        position: 'absolute',
        top: y,
        left: x,
        borderColor: colorScheme?.accent || 'var(--color-border-accent)',
        zIndex: 999999999,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ui-field__label">
        Playlist Output Channel
      </div>
      
      <div className="ui-field">
        <label className="ui-field__helper">
          Select output channel:
        </label>
        <div className="ui-field">
          <Button
            onClick={() => onChannelChange('music')}
            variant={currentChannel === 'music' ? 'primary' : 'secondary'}
            className="audio-context-button"
          >
            🎵 Music
          </Button>
          <Button
            onClick={() => onChannelChange('environmental')}
            variant={currentChannel === 'environmental' ? 'primary' : 'secondary'}
            className="audio-context-button"
          >
            🌿 Ambient/Environmental
          </Button>
        </div>
      </div>
      
      <Button
        onClick={onClose}
        variant="ghost"
        className="audio-context-button"
      >
        Close
      </Button>
    </ContextMenu>
  );
}
