import { useState } from 'react';
import { Icon } from '../Icon';
import { AudioPlaylist, AudioTrack } from './types';
import { TrackItem } from './TrackItem';

interface PlaylistItemProps {
  playlist: AudioPlaylist;
  expanded: boolean;
  currentAudioTrack: string | null;
  isAudioPlaying: boolean;
  colorScheme?: { accent?: string };
  onToggle: () => void;
  onSelectTrack: (track: AudioTrack) => void;
  onToggleLoop: (trackId: string) => void;
  onTogglePlaylistLoop: () => void;
  onTogglePlaylistShuffle: () => void;
  onToggleRepeatTrack: () => void;
  onDeletePlaylist: () => void;
  onDeleteTrack: (trackId: string) => void;
  onAddTrack: (file: File) => void;
  onTrackContextMenu: (event: React.MouseEvent, track: AudioTrack) => void;
  onPlaylistContextMenu?: (event: React.MouseEvent, playlist: AudioPlaylist) => void;
  onDragStart: (track: AudioTrack) => void;
  onDrop: (e: React.DragEvent) => void;
  onChannelChange?: (channel: 'music' | 'environmental') => void;
  isDraggingOver?: boolean;
}

export function PlaylistItem({
  playlist,
  expanded,
  currentAudioTrack,
  isAudioPlaying,
  colorScheme,
  onToggle,
  onSelectTrack,
  onToggleLoop,
  onTogglePlaylistLoop,
  onTogglePlaylistShuffle,
  onToggleRepeatTrack,
  onDeletePlaylist,
  onDeleteTrack,
  onAddTrack,
  onTrackContextMenu,
  onPlaylistContextMenu,
  onDragStart,
  onDrop,
  onChannelChange,
  isDraggingOver = false,
}: PlaylistItemProps) {
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackFile, setNewTrackFile] = useState('');
  const [showChannelMenu, setShowChannelMenu] = useState(false);

  const handleAddTrack = () => {
    if (!newTrackName.trim() || !newTrackFile.trim()) return;
    // For file-based adding, we'd need to handle this differently
    // This is a simplified version
    setShowAddTrack(false);
    setNewTrackName('');
    setNewTrackFile('');
  };

  return (
    <div 
      style={{ marginBottom: '8px' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Playlist Header */}
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onPlaylistContextMenu) {
            onPlaylistContextMenu(e, playlist);
          }
        }}
      >
        <button
          onClick={onToggle}
          style={{
            flex: 1,
            background: expanded ? (colorScheme?.accent || '#6b8aff') : '#2a2a3a',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 'bold',
            textAlign: 'left',
          }}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
          <Icon name={playlist.icon} />
          {playlist.name}
          <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: '11px' }}>
            {playlist.tracks.length}
          </span>
        </button>
        
        {/* Playlist Controls */}
        {expanded && (
          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
            {/* Add Track via file browser */}
            <label
              title="Add audio file to playlist"
              style={{
                padding: '4px 6px',
                background: '#2a2a3a',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Icon name="plus" />
              <input
                type="file"
                accept="audio/*,.ogg,.mp3,.wav,.flac,.m4a,.aac"
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    Array.from(files).forEach(onAddTrack);
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>
            <button
              onClick={onTogglePlaylistLoop}
              title="Loop Playlist"
              style={{
                padding: '4px 6px',
                background: playlist.loopPlaylist ? (colorScheme?.accent || '#6b8aff') : '#2a2a3a',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <Icon name="repeat" />
            </button>
            <button
              onClick={onTogglePlaylistShuffle}
              title="Shuffle Playlist"
              style={{
                padding: '4px 6px',
                background: playlist.shufflePlaylist ? (colorScheme?.accent || '#6b8aff') : '#2a2a3a',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <Icon name="shuffle" />
            </button>
            <button
              onClick={onToggleRepeatTrack}
              title="Repeat Track"
              style={{
                padding: '4px 6px',
                background: playlist.repeatTrack ? (colorScheme?.accent || '#6b8aff') : '#2a2a3a',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <Icon name="redo" />
            </button>
            <button
              onClick={onDeletePlaylist}
              title="Delete Playlist"
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
        )}
      </div>
      
      {/* Playlist Tracks */}
      {expanded && (
        <div style={{ marginTop: '4px', marginLeft: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {playlist.tracks.map(track => (
            <div 
              key={track.id} 
              draggable={true}
              onDragStart={() => onDragStart(track)}
              onContextMenu={(e) => {
                e.preventDefault();
                onTrackContextMenu(e, track);
              }}
            >
              <TrackItem
                track={track}
                isCurrentTrack={currentAudioTrack === track.id}
                isPlaying={isAudioPlaying}
                isCustomPlaylist={playlist.isCustom || false}
                colorScheme={colorScheme}
                onSelectTrack={onSelectTrack}
                onToggleLoop={onToggleLoop}
                onDeleteTrack={onDeleteTrack}
                onContextMenu={onTrackContextMenu}
              />
            </div>
          ))}
          
          {/* Add Track - Only visible when dragging files over the panel */}
          {isDraggingOver && (
            <div
              onClick={() => setShowAddTrack(true)}
              style={{
                padding: '6px 10px',
                background: '#2a2a3a',
                border: '1px dashed #4a5568',
                borderRadius: '4px',
                color: '#888',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '11px',
              }}
            >
              <Icon name="plus-circle" /> Add Track
            </div>
          )}
          
          {/* Add Track Input */}
          {showAddTrack && (
            <div style={{ padding: '8px', background: '#1a1a2a', borderRadius: '4px', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="Track name..."
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: '#2a2a3a',
                  border: '1px solid #4a5568',
                  borderRadius: '4px',
                  color: '#fff',
                  marginBottom: '6px',
                  fontSize: '11px',
                }}
              />
              <input
                type="text"
                placeholder="Or enter file path manually..."
                value={newTrackFile}
                onChange={(e) => setNewTrackFile(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTrack()}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: '#2a2a3a',
                  border: '1px solid #4a5568',
                  borderRadius: '4px',
                  color: '#fff',
                  marginBottom: '6px',
                  fontSize: '11px',
                }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleAddTrack}
                  style={{
                    flex: 1,
                    padding: '4px',
                    background: colorScheme?.accent || '#6b8aff',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddTrack(false); setNewTrackName(''); setNewTrackFile(''); }}
                  style={{
                    padding: '4px 8px',
                    background: '#4a5568',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
