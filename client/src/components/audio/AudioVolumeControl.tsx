import { Icon } from '../Icon';
import { Slider } from '../ui/primitives';

interface AudioVolumeControlProps {
  audioVolume: number;  // Master volume from channel system
  trackVolume?: number;
  musicVolume?: number;
  environmentVolume?: number;
  uiVolume?: number;
  colorScheme?: { accent?: string };
  onAudioVolumeChange: (volume: number) => void;
  onMusicVolumeChange?: (volume: number) => void;
  onEnvironmentVolumeChange?: (volume: number) => void;
  onUiVolumeChange?: (volume: number) => void;
  onTrackVolumeChange?: (volume: number) => void;
  showTrackVolume?: boolean;
}

export function AudioVolumeControl({
  audioVolume,
  trackVolume = 1,
  musicVolume = 1,
  environmentVolume = 1,
  uiVolume = 1,
  colorScheme,
  onAudioVolumeChange,
  onMusicVolumeChange,
  onEnvironmentVolumeChange,
  onUiVolumeChange,
  onTrackVolumeChange,
  showTrackVolume = true,
}: AudioVolumeControlProps) {
  return (
    <div className="ui-field audio-volume-stack">
      {/* Master Volume Control */}
      <label className="audio-volume-row">
        <Icon name={audioVolume === 0 ? 'volume-off' : 'volume-up'} style={{ width: '16px' }} />
        <span className="audio-volume-label">Master</span>
        <Slider
          min="0"
          max="1"
          step="0.01"
          value={audioVolume}
          onChange={(e) => onAudioVolumeChange(parseFloat(e.target.value))}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          className="audio-volume-slider"
        />
        <span className="audio-volume-value">
          {Math.round(audioVolume * 100)}%
        </span>
      </label>

      {/* Music Volume Control */}
      {onMusicVolumeChange && (
        <label className="audio-volume-row">
          <Icon name="music" style={{ width: '16px', fontSize: '12px' }} />
          <span className="audio-volume-label">Music</span>
          <Slider
            min="0"
            max="1"
            step="0.01"
            value={musicVolume}
            onChange={(e) => onMusicVolumeChange(parseFloat(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="audio-volume-slider"
          />
          <span className="audio-volume-value">
            {Math.round(musicVolume * 100)}%
          </span>
        </label>
      )}

      {/* Ambient/Environmental Volume Control */}
      {onEnvironmentVolumeChange && (
        <label className="audio-volume-row">
          <Icon name="cloud" style={{ width: '16px', fontSize: '12px' }} />
          <span className="audio-volume-label">Ambient</span>
          <Slider
            min="0"
            max="1"
            step="0.01"
            value={environmentVolume}
            onChange={(e) => onEnvironmentVolumeChange(parseFloat(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="audio-volume-slider"
          />
          <span className="audio-volume-value">
            {Math.round(environmentVolume * 100)}%
          </span>
        </label>
      )}

      {/* UI Volume Control */}
      {onUiVolumeChange && (
        <label className="audio-volume-row">
          <Icon name="info" style={{ width: '16px', fontSize: '12px' }} />
          <span className="audio-volume-label">UI</span>
          <Slider
            min="0"
            max="1"
            step="0.01"
            value={uiVolume}
            onChange={(e) => onUiVolumeChange(parseFloat(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="audio-volume-slider"
          />
          <span className="audio-volume-value">
            {Math.round(uiVolume * 100)}%
          </span>
        </label>
      )}

      {/* Track Volume Control */}
      {showTrackVolume && onTrackVolumeChange && (
        <label className="audio-volume-row">
          <Icon name="play" style={{ width: '16px', fontSize: '12px' }} />
          <span className="audio-volume-label">Track</span>
          <Slider
            min="0"
            max="1"
            step="0.05"
            value={trackVolume}
            onChange={(e) => onTrackVolumeChange(parseFloat(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            className="audio-volume-slider"
          />
          <span className="audio-volume-value">
            {Math.round(trackVolume * 100)}%
          </span>
        </label>
      )}
    </div>
  );
}
