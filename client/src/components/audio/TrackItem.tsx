import { Icon } from '../Icon';
import { AudioTrack } from './types';

interface TrackItemProps {
  track: AudioTrack;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isCustomPlaylist: boolean;
  colorScheme?: { accent?: string };
  onSelectTrack: (track: AudioTrack) => void;
  onToggleLoop: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onContextMenu: (event: React.MouseEvent, track: AudioTrack) => void;
}

export function TrackItem({
  track,
  isCurrentTrack,
  isPlaying,
  isCustomPlaylist,
  colorScheme,
  onSelectTrack,
  onToggleLoop,
  onDeleteTrack,
  onContextMenu,
}: TrackItemProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    // Right click (button 2) triggers context menu
    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, track);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, track);
  };

  return (
    <div 
      style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
      onMouseDown={handleMouseDown}
    >
      <button
        type="button"
        onClick={() => onSelectTrack(track)}
        onContextMenu={handleContextMenu}
        style={{
          flex: 1,
          background: isCurrentTrack ? (colorScheme?.accent || '#6b8aff') : '#2a2a3a',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: '#fff',
          fontSize: '11px',
          textAlign: 'left',
        }}
      >
        {isCurrentTrack && isPlaying ? (
          <Icon name="music" />
        ) : (
          <Icon name="volume-up" />
        )}
        {track.name}
      </button>
      
      {/* Track Loop Toggle (only for custom playlists) */}
      {isCustomPlaylist && (
        <button
          onClick={() => onToggleLoop(track.id)}
          title="Loop This Track"
          style={{
            padding: '4px 6px',
            background: track.loop ? (colorScheme?.accent || '#6b8aff') : '#2a2a3a',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          <Icon name="repeat" />
        </button>
      )}
      
      {/* Delete Track Button */}
      <button
        onClick={() => onDeleteTrack(track.id)}
        title="Delete Track"
        style={{
          padding: '4px 6px',
          background: 'transparent',
          border: 'none',
          borderRadius: '4px',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <Icon name="trash" />
      </button>
    </div>
  );
}
