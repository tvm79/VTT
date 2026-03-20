import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { Panel, Slider } from '../ui/primitives';

interface AudioSettingsPanelProps {
  isGM: boolean;
}

export const AudioSettingsPanel: React.FC<AudioSettingsPanelProps> = ({ isGM }) => {
  const audioFadeInDuration = useGameStore(state => state.audioFadeInDuration);
  const audioFadeOutDuration = useGameStore(state => state.audioFadeOutDuration);
  const setAudioFadeInDuration = useGameStore(state => state.setAudioFadeInDuration);
  const setAudioFadeOutDuration = useGameStore(state => state.setAudioFadeOutDuration);

  if (!isGM) {
    return null;
  }

  return (
    <Panel className="audio-settings-panel" header={<span className="ui-field__label">Audio Fade</span>}>

      {/* Fade In Slider */}
      <Slider
        label={`Fade In: ${Math.round(audioFadeInDuration || 1000)}ms`}
        min="100"
        max="5000"
        step="100"
        value={audioFadeInDuration || 1000}
        onChange={(e) => setAudioFadeInDuration(parseInt(e.target.value))}
      />

      {/* Fade Out Slider */}
      <Slider
        label={`Fade Out: ${Math.round(audioFadeOutDuration || 1000)}ms`}
        min="100"
        max="5000"
        step="100"
        value={audioFadeOutDuration || 1000}
        onChange={(e) => setAudioFadeOutDuration(parseInt(e.target.value))}
      />
    </Panel>
  );
};

export default AudioSettingsPanel;
