import { Icon } from '../Icon';

interface AudioControlsProps {
  isPlaying: boolean;
  colorScheme?: { accent?: string };
  trackVolume?: number;
  onPlayPause: () => void;
  onStop: () => void;
  onTrackVolumeChange?: (volume: number) => void;
}

export function AudioControls({
  isPlaying,
  colorScheme,
  trackVolume = 1,
  onPlayPause,
  onStop,
  onTrackVolumeChange,
}: AudioControlsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Track Volume Control - above play button */}
      {onTrackVolumeChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '12px' }}>
          <Icon name="volume-up" style={{ fontSize: '12px' }} />
          <span style={{ minWidth: '45px' }}>Track:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={trackVolume}
            onChange={(e) => onTrackVolumeChange(parseFloat(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            style={{ flex: 1, cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '11px', width: '35px' }}>
            {Math.round(trackVolume * 100)}%
          </span>
        </label>
      )}
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onPlayPause}
          style={{
            flex: 1,
            padding: '8px',
            background: isPlaying ? '#ef4444' : (colorScheme?.accent || '#6b8aff'),
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={onStop}
          style={{
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: 'none',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <Icon name="stop" />
        </button>
      </div>
    </div>
  );
}
