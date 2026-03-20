import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { 
  AudioTrack, 
  AudioPlaylist,
  useAudioEngine,
  useAudioPaths,
  useAudioBus,
  TrackItem,
  PlaylistItem,
  AudioControls,
  AudioVolumeControl,
  AudioSourceSettings,
  TrackContextMenu,
  PlaylistContextMenu,
} from './audio';
import type { AudioChannel } from './audio/useAudioBus';

// Re-export types for backwards compatibility
export type { AudioTrack, AudioPlaylist } from './audio/types';

export function AudioPanel() {
  const {
    audioPanelVisible,
    setAudioPanelVisible,
    audioPanelPosition,
    setAudioPanelPosition,
    audioPanelSize,
    setAudioPanelSize,
    isGM,
    colorScheme,
    panelFocus,
    setPanelFocus,
    // Global audio state
    currentAudioTrack,
    currentAudioFile,
    isAudioPlaying,
    audioVolume,
    setCurrentAudioTrack,
    setIsAudioPlaying,
    setAudioVolume,
    // Channel volumes
    masterVolume,
    musicVolume,
    environmentVolume,
    uiVolume,
    setMasterVolume,
    setMusicVolume,
    setEnvironmentVolume,
    setUiVolume,
    // Custom playlists from store (persisted)
    customPlaylists,
    setCustomPlaylists,
    // Global fade settings from store
    defaultFadeInDuration,
    defaultFadeOutDuration,
  } = useGameStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [expandedPlaylists, setExpandedPlaylists] = useState<string[]>([]);
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  
  // Track context menu state
  const [trackContextMenu, setTrackContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    track: AudioTrack | null;
    playlistId: string;
  }>({ visible: false, x: 0, y: 0, track: null, playlistId: '' });

  // Playlist context menu state
  const [playlistContextMenu, setPlaylistContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    playlist: AudioPlaylist | null;
  }>({ visible: false, x: 0, y: 0, playlist: null });

  // Drag state for tracks
  const [draggedTrack, setDraggedTrack] = useState<{ track: AudioTrack; sourcePlaylistId: string } | null>(null);
  
  // Track loop/shuffle/repeat settings for default playlists (in local state)
  const [defaultPlaylistSettings, setDefaultPlaylistSettings] = useState<{
    [playlistId: string]: { loopPlaylist: boolean; shufflePlaylist: boolean; repeatTrack: boolean };
  }>({});
  
  // Track loop settings for default playlists
  const [defaultTrackLoop, setDefaultTrackLoop] = useState<{ [trackId: string]: boolean }>({});
  const [trackVolume, setTrackVolume] = useState(1);

  // Current playlist channel (music or environmental)
  const [playlistChannel, setPlaylistChannel] = useState<AudioChannel>('music');
  
  // Fade settings
  const [fadeEnabled] = useState(true);
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);

  // Audio source settings collapsible state
  const [audioSourceSettingsExpanded, setAudioSourceSettingsExpanded] = useState(false);

  // Track if files are being dragged over the panel
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Ref for the audio panel container
  const audioPanelRef = useRef<HTMLDivElement>(null);

  // Audio paths hook
  const {
    resolveAudioPath,
    toAbsoluteAudioUrl,
    canPlayAudioFormat,
  } = useAudioPaths();

  // Audio engine hook
  const {
    audioRef,
    handleSelectTrack,
    handlePlayPause,
    handleStop,
    playAudioElement,
    cancelPendingPlayRequest,
    stopFade,
    updateVolume,
    cleanup: cleanupAudio,
    connectToChannelBus,
  } = useAudioEngine({
    audioVolume,
    trackVolume,
    fadeEnabled,
    defaultFadeInDuration,
    defaultFadeOutDuration,
    setCurrentAudioTrack,
    setIsAudioPlaying,
    resolveAudioPath,
    canPlayAudioFormat,
    channel: playlistChannel,
  });

  // Combine default and custom playlists
  const customPlaylistsArray = Array.isArray(customPlaylists) ? customPlaylists : [];
  const allPlaylists = useMemo(
    () => customPlaylistsArray,
    [customPlaylistsArray]
  );

  // Current track
  const currentTrack = useMemo(() => 
    allPlaylists.flatMap(p => p.tracks).find(t => t.id === currentAudioTrack),
    [allPlaylists, currentAudioTrack]
  );

  // Close context menu on Escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && trackContextMenu.visible) {
        setTrackContextMenu(prev => ({ ...prev, visible: false }));
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [trackContextMenu.visible]);

  // Update volume when it changes
  useEffect(() => {
    updateVolume();
  }, [audioVolume, trackVolume, updateVolume]);

  // Handle play/stop sync with global state
  useEffect(() => {
    if (!audioRef.current) return;

    const currentSrc = audioRef.current.currentSrc || audioRef.current.src;
    const expectedSrc = currentAudioFile ? toAbsoluteAudioUrl(currentAudioFile) : null;

    if (expectedSrc && currentSrc && currentSrc !== expectedSrc) {
      return;
    }

    if (!isAudioPlaying) {
      cancelPendingPlayRequest();
      audioRef.current.pause();
      return;
    }

    if (audioRef.current.paused) {
      playAudioElement(audioRef.current, 'state-sync').catch((error) => {
        console.error('Audio sync play error:', error);
        setIsAudioPlaying(false);
      });
    }
  }, [isAudioPlaying, currentAudioFile, setIsAudioPlaying, toAbsoluteAudioUrl, cancelPendingPlayRequest, playAudioElement]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // Drag handlers
  const handleDragStart = (e: React.MouseEvent) => {
    if (!isGM) return;

    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, textarea, label')) {
      return;
    }

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - audioPanelPosition.x,
      y: e.clientY - audioPanelPosition.y,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setAudioPanelPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, setAudioPanelPosition]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isGM) return;
    e.stopPropagation();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(250, e.clientX - audioPanelPosition.x);
      const newHeight = Math.max(200, e.clientY - audioPanelPosition.y);
      setAudioPanelSize({
        width: newWidth,
        height: newHeight,
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, audioPanelPosition, setAudioPanelSize]);

  // Playlist handlers
  const togglePlaylist = (playlistId: string) => {
    setExpandedPlaylists(prev => 
      prev.includes(playlistId) 
        ? prev.filter(id => id !== playlistId)
        : [...prev, playlistId]
    );
  };

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const newPlaylist: AudioPlaylist = {
      id: `custom-${Date.now()}`,
      name: newPlaylistName.trim(),
      icon: 'folder',
      tracks: [],
      isCustom: true,
      loopPlaylist: false,
      shufflePlaylist: false,
      repeatTrack: false,
    };
    setCustomPlaylists(prev => [...prev, newPlaylist]);
    setNewPlaylistName('');
    setShowNewPlaylistInput(false);
    setExpandedPlaylists(prev => [...prev, newPlaylist.id]);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    const playlist = allPlaylists.find(p => p.id === playlistId);
    if (playlist && playlist.tracks.some(track => track.id === currentAudioTrack)) {
      handleStop(currentTrack);
    }
    setCustomPlaylists(prev => prev.filter(p => p.id !== playlistId));
    setExpandedPlaylists(prev => prev.filter(id => id !== playlistId));
  };

  const handleDeleteTrack = (playlistId: string, trackId: string) => {
    if (currentAudioTrack === trackId) {
      handleStop(currentTrack);
    }
    setCustomPlaylists(prev => prev.map(p => 
      p.id === playlistId 
        ? { ...p, tracks: p.tracks.filter(t => t.id !== trackId) }
        : p
    ));
  };

  const handleToggleTrackLoop = (trackId: string, playlistId: string) => {
    const playlist = customPlaylists.find(p => p.id === playlistId);
    if (playlist) {
      setCustomPlaylists(prev => prev.map(p => ({
        ...p,
        tracks: p.tracks.map(t => 
          t.id === trackId ? { ...t, loop: !t.loop } : t
        )
      })));
    } else {
      setDefaultTrackLoop(prev => ({ ...prev, [trackId]: !prev[trackId] }));
    }
  };

  const handleTogglePlaylistLoop = (playlistId: string) => {
    const playlist = customPlaylists.find(p => p.id === playlistId);
    if (playlist) {
      setCustomPlaylists(prev => prev.map(p => 
        p.id === playlistId ? { ...p, loopPlaylist: !p.loopPlaylist } : p
      ));
    } else {
      setDefaultPlaylistSettings(prev => ({
        ...prev,
        [playlistId]: { 
          ...prev[playlistId], 
          loopPlaylist: !prev[playlistId]?.loopPlaylist 
        }
      }));
    }
  };

  const handleTogglePlaylistShuffle = (playlistId: string) => {
    const playlist = customPlaylists.find(p => p.id === playlistId);
    if (playlist) {
      setCustomPlaylists(prev => prev.map(p => 
        p.id === playlistId ? { ...p, shufflePlaylist: !p.shufflePlaylist } : p
      ));
    } else {
      setDefaultPlaylistSettings(prev => ({
        ...prev,
        [playlistId]: { 
          ...prev[playlistId], 
          shufflePlaylist: !prev[playlistId]?.shufflePlaylist 
        }
      }));
    }
  };

  const handleToggleRepeatTrack = (playlistId: string) => {
    const playlist = customPlaylists.find(p => p.id === playlistId);
    if (playlist) {
      setCustomPlaylists(prev => prev.map(p => 
        p.id === playlistId ? { ...p, repeatTrack: !p.repeatTrack } : p
      ));
    } else {
      setDefaultPlaylistSettings(prev => ({
        ...prev,
        [playlistId]: { 
          ...prev[playlistId], 
          repeatTrack: !prev[playlistId]?.repeatTrack 
        }
      }));
    }
  };

  // Handle playlist channel change
  const handlePlaylistChannelChange = (channel: AudioChannel) => {
    setPlaylistChannel(channel);
  };

  // Handle channel change for a specific playlist
  const handlePlaylistChannelChangeForPlaylist = (playlistId: string, channel: 'music' | 'environmental') => {
    // Update the playlist's channel property
    setCustomPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, channel } : p
    ));
    // Also update the global state if this is the currently playing playlist
    setPlaylistChannel(channel);
  };

  // Handle playlist right-click for context menu
  const handlePlaylistContextMenu = (event: React.MouseEvent, playlist: AudioPlaylist) => {
    event.preventDefault();
    // Get the panel position to calculate relative coordinates
    const panelRect = audioPanelRef.current?.getBoundingClientRect();
    if (!panelRect) return;
    
    setPlaylistContextMenu({
      visible: true,
      x: event.clientX - panelRect.left,
      y: event.clientY - panelRect.top,
      playlist,
    });
  };

  // Context menu
  const openTrackContextMenu = (
    event: React.MouseEvent,
    track: AudioTrack,
    playlistId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const trackRect = event.currentTarget.getBoundingClientRect();
    const panelRect = audioPanelRef.current?.getBoundingClientRect();
    if (!panelRect) return;

    const x = trackRect.left - panelRect.left;
    const y = trackRect.bottom - panelRect.top + 4;

    setTrackContextMenu({
      visible: true,
      x,
      y,
      track,
      playlistId,
    });
  };

  const handleUpdateTrackFade = (trackId: string, playlistId: string, fadeIn?: number, fadeOut?: number) => {
    setCustomPlaylists(prev => prev.map(p => 
      p.id === playlistId 
        ? { ...p, tracks: p.tracks.map(t => 
            t.id === trackId 
              ? { ...t, fadeInDuration: fadeIn, fadeOutDuration: fadeOut }
              : t
          )}
        : p
    ));
  };

  // Drag and drop handlers
  const handleTrackDragStart = (track: AudioTrack, playlistId: string) => {
    setDraggedTrack({ track, sourcePlaylistId: playlistId });
  };

  const handleDrop = (targetPlaylistId: string) => {
    if (!draggedTrack) return;
    
    const { track, sourcePlaylistId } = draggedTrack;
    if (sourcePlaylistId === targetPlaylistId) return;
    
    const sourcePlaylist = customPlaylists.find(p => p.id === sourcePlaylistId);
    if (!sourcePlaylist) {
      setCustomPlaylists(prev => prev.map(p => 
        p.id === targetPlaylistId 
          ? { ...p, tracks: [...p.tracks, { ...track, id: `track-${Date.now()}` }] }
          : p
      ));
      setDraggedTrack(null);
      return;
    }
    
    setCustomPlaylists(prev => prev.map(p => 
      p.id === targetPlaylistId 
        ? { ...p, tracks: [...p.tracks, track] }
        : p
    ));
    
    setCustomPlaylists(prev => prev.map(p => 
      p.id === sourcePlaylistId 
        ? { ...p, tracks: p.tracks.filter(t => t.id !== track.id) }
        : p
    ));
    
    setDraggedTrack(null);
  };

  // Upload handler - sends files to server and creates tracks
  const handleUploadToServer = async (files: FileList | null, targetPlaylistId?: string) => {
    if (!files || files.length === 0) return;
    if (!isGM) {
      alert('Only GMs can upload files to the server.');
      return;
    }

    setIsUploading(true);
    
    try {
      // Create FormData with files array
      const formData = new FormData();
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('audio/') && !file.name.match(/\.(ogg|mp3|wav|flac|m4a|aac|webm)$/i)) {
          console.warn('Skipping non-audio file:', file.name);
          continue;
        }
        formData.append('files', file);
      }

      if (formData.has('files')) {
        const response = await fetch('/api/upload-audio', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.files) {
            // Add each uploaded file as a track
            data.files.forEach((uploadedFile: { originalName: string; path: string }) => {
              const newTrack: AudioTrack = {
                id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: uploadedFile.originalName.replace(/\.[^/.]+$/, ''),
                file: uploadedFile.path,
                loop: false,
              };

              if (targetPlaylistId) {
                setCustomPlaylists(prev => prev.map(p =>
                  p.id === targetPlaylistId
                    ? { ...p, tracks: [...p.tracks, newTrack] }
                    : p
                ));
              }
            });
          }
        } else {
          console.error('Upload failed:', response.statusText);
          alert('Failed to upload audio files. Please try again.');
        }
      }
    } catch (error) {
      console.error('Upload handler error:', error);
      alert('Failed to upload audio files. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setAudioPanelVisible(false);
  };

  // Handle drag over/leave for showing drop zones
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the panel entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
      setIsDraggingOver(false);
    }
  };

  const handlePanelDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePanelDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  if (!audioPanelVisible) return null;

  return (
    <div
      ref={audioPanelRef}
      className="audio-panel"
      onClick={(e) => e.stopPropagation()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handlePanelDragOver}
      onDrop={handlePanelDrop}
      style={{
        position: 'fixed',
        left: audioPanelPosition.x,
        top: audioPanelPosition.y,
        width: audioPanelSize.width,
        minWidth: '330px',
        height: audioPanelSize.height,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      {/* Header - draggable */}
      <div
        className="audio-panel-header"
        onMouseDown={handleDragStart}
        style={{ cursor: isGM ? 'move' : 'default' }}
      >
        <h3 className="audio-panel-title">
          <Icon name="music" /> Audio
        </h3>
        <button className="audio-panel-close" onClick={handleClose}>
          <Icon name="times" />
        </button>
      </div>

      {/* Only GM can control ambient audio */}
      {!isGM ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
          <Icon name="lock" />
          <p>Only the GM can control ambient audio</p>
        </div>
      ) : (
        <>
          {/* Master Volume Control + Create Playlist */}
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: `1px solid ${colorScheme?.accent || '#4a5568'}`, 
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{ flex: 1 }}>
              <AudioVolumeControl
                audioVolume={masterVolume}
                musicVolume={musicVolume}
                environmentVolume={environmentVolume}
                uiVolume={uiVolume}
                colorScheme={colorScheme}
                onAudioVolumeChange={setMasterVolume}
                onMusicVolumeChange={setMusicVolume}
                onEnvironmentVolumeChange={setEnvironmentVolume}
                onUiVolumeChange={setUiVolume}
                showTrackVolume={false}
              />
            </div>
          </div>

          {/* New Playlist Input - shown below sliders */}
          {showNewPlaylistInput && (
            <div style={{ padding: '12px', borderTop: `1px solid ${colorScheme?.accent || '#4a5568'}`, background: 'var(--bg-secondary)' }}>
              <input
                type="text"
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCreatePlaylist}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: colorScheme?.accent || '#6b8aff',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowNewPlaylistInput(false); setNewPlaylistName(''); }}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--bg-tertiary)',
                    border: 'none',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Playlists header with + button */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: '8px', borderTop: `1px solid ${colorScheme?.accent || '#4a5568'}` }}>
            <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold' }}>Playlists</span>
            <button
              onClick={() => setShowNewPlaylistInput(true)}
              title="Create New Playlist"
              style={{
                padding: '4px 8px',
                background: 'var(--bg-tertiary)',
                border: '1px dashed var(--border)',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              <Icon name="plus" />
            </button>
          </div>

          {/* Playlists */}
          <div style={{ padding: '12px', overflowY: 'auto', flex: 1, background: 'var(--bg-primary)' }}>
            {allPlaylists.map((playlist: AudioPlaylist) => (
              <PlaylistItem
                key={playlist.id}
                playlist={playlist}
                expanded={expandedPlaylists.includes(playlist.id)}
                currentAudioTrack={currentAudioTrack}
                isAudioPlaying={isAudioPlaying}
                colorScheme={colorScheme}
                onToggle={() => togglePlaylist(playlist.id)}
                onSelectTrack={handleSelectTrack}
                onToggleLoop={(trackId) => handleToggleTrackLoop(trackId, playlist.id)}
                onTogglePlaylistLoop={() => handleTogglePlaylistLoop(playlist.id)}
                onTogglePlaylistShuffle={() => handleTogglePlaylistShuffle(playlist.id)}
                onToggleRepeatTrack={() => handleToggleRepeatTrack(playlist.id)}
                onDeletePlaylist={() => handleDeletePlaylist(playlist.id)}
                onDeleteTrack={(trackId) => handleDeleteTrack(playlist.id, trackId)}
                onChannelChange={(channel) => handlePlaylistChannelChangeForPlaylist(playlist.id, channel)}
                onPlaylistContextMenu={(e) => handlePlaylistContextMenu(e, playlist)}
                onAddTrack={(file) => {
                  // Upload file to server and add as track
                  const handleSingleFileUpload = async () => {
                    const formData = new FormData();
                    formData.append('files', file);
                    
                    try {
                      const response = await fetch('/api/upload-audio', {
                        method: 'POST',
                        body: formData,
                      });
                      
                      if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.files && data.files.length > 0) {
                          const uploadedFile = data.files[0];
                          const newTrack: AudioTrack = {
                            id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            name: uploadedFile.originalName.replace(/\.[^/.]+$/, ''),
                            file: uploadedFile.path,
                            loop: false,
                          };
                          setCustomPlaylists(prev => prev.map(p => 
                            p.id === playlist.id 
                              ? { ...p, tracks: [...p.tracks, newTrack] }
                              : p
                          ));
                        }
                      } else {
                        console.error('Upload failed:', response.statusText);
                      }
                    } catch (uploadError) {
                      console.error('Upload error:', uploadError);
                    }
                  };
                  
                  handleSingleFileUpload();
                }}
                onTrackContextMenu={(e, track) => openTrackContextMenu(e, track, playlist.id)}
                onDragStart={(track) => handleTrackDragStart(track, playlist.id)}
                onDrop={(e) => {
                  e.preventDefault();
                  
                  // Handle JSON payload from Asset Browser
                  const jsonPayload = e.dataTransfer.getData('application/json');
                  if (jsonPayload) {
                    try {
                      const assetData = JSON.parse(jsonPayload);
                      if (assetData.type === 'asset' && assetData.assetType === 'audio' && assetData.url) {
                        // Add audio from asset browser directly to playlist
                        const newTrack: AudioTrack = {
                          id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                          name: assetData.name?.replace(/\.[^/.]+$/, '') || 'Audio Track',
                          file: assetData.url,
                          loop: false,
                        };
                        setCustomPlaylists(prev => prev.map(p => 
                          p.id === playlist.id 
                            ? { ...p, tracks: [...p.tracks, newTrack] }
                            : p
                        ));
                        return;
                      }
                    } catch (err) {
                      console.warn('Invalid asset JSON payload:', err);
                    }
                  }
                  
                  // Handle file drop - upload to server
                  const files = e.dataTransfer.files;
                  if (files.length > 0) {
                    const handleFileDropUpload = async () => {
                      const formData = new FormData();
                      let hasAudioFiles = false;
                      
                      Array.from(files).forEach((file) => {
                        if (file.type.startsWith('audio/') || 
                            file.name.match(/\.(ogg|mp3|wav|flac|m4a|aac|webm)$/i)) {
                          formData.append('files', file);
                          hasAudioFiles = true;
                        }
                      });
                      
                      if (hasAudioFiles) {
                        try {
                          const response = await fetch('/api/upload-audio', {
                            method: 'POST',
                            body: formData,
                          });
                          
                          if (response.ok) {
                            const data = await response.json();
                            if (data.success && data.files) {
                              data.files.forEach((uploadedFile: { originalName: string; path: string }) => {
                                const newTrack: AudioTrack = {
                                  id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                  name: uploadedFile.originalName.replace(/\.[^/.]+$/, ''),
                                  file: uploadedFile.path,
                                  loop: false,
                                };
                                setCustomPlaylists(prev => prev.map(p => 
                                  p.id === playlist.id 
                                    ? { ...p, tracks: [...p.tracks, newTrack] }
                                    : p
                                ));
                              });
                            }
                          } else {
                            console.error('Upload failed:', response.statusText);
                          }
                        } catch (uploadError) {
                          console.error('Upload error:', uploadError);
                        }
                      }
                    };
                    
                    handleFileDropUpload();
                    return;
                  }
                  handleDrop(playlist.id);
                }}
                isDraggingOver={isDraggingOver}
              />
            ))}
          </div>

          {/* Track Controls */}
          {currentAudioTrack && (
            <div style={{ 
              padding: '12px 16px', 
              borderTop: `1px solid ${colorScheme?.accent || '#4a5568'}`, 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px', 
              background: 'var(--bg-secondary)' 
            }}>
              <AudioControls
                isPlaying={isAudioPlaying}
                colorScheme={colorScheme}
                trackVolume={trackVolume}
                onPlayPause={() => handlePlayPause(currentTrack, isAudioPlaying)}
                onStop={() => handleStop(currentTrack)}
                onTrackVolumeChange={setTrackVolume}
              />
            </div>
          )}

          {/* Audio Source Settings */}
          <AudioSourceSettings
            isGM={isGM}
            isUploading={isUploading}
            colorScheme={colorScheme}
            onUpload={(files) => handleUploadToServer(files)}
            isExpanded={audioSourceSettingsExpanded}
            onToggleExpand={() => setAudioSourceSettingsExpanded(!audioSourceSettingsExpanded)}
          />

          {/* Now Playing */}
          {currentTrack && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${colorScheme?.accent || '#4a5568'}`, textAlign: 'center' }}>
              <span style={{ color: '#888', fontSize: '11px' }}>Now Playing:</span>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>{currentTrack.name}</div>
            </div>
          )}
        </>
      )}

      {/* Resize handle */}
      <div
        className="audio-panel-resize"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '15px',
          height: '15px',
          cursor: 'se-resize',
          background: 'transparent',
        }}
      />
      
      {/* Track Context Menu */}
      <TrackContextMenu
        visible={trackContextMenu.visible}
        x={trackContextMenu.x}
        y={trackContextMenu.y}
        track={trackContextMenu.track}
        playlistId={trackContextMenu.playlistId}
        allPlaylists={allPlaylists}
        defaultFadeInDuration={defaultFadeInDuration}
        defaultFadeOutDuration={defaultFadeOutDuration}
        colorScheme={colorScheme}
        onUpdateFade={handleUpdateTrackFade}
        onClose={() => setTrackContextMenu({ ...trackContextMenu, visible: false })}
      />

      {/* Playlist Context Menu */}
      <PlaylistContextMenu
        visible={playlistContextMenu.visible}
        x={playlistContextMenu.x}
        y={playlistContextMenu.y}
        playlist={playlistContextMenu.playlist}
        colorScheme={colorScheme}
        onChannelChange={(channel) => {
          if (playlistContextMenu.playlist) {
            handlePlaylistChannelChangeForPlaylist(playlistContextMenu.playlist.id, channel);
          }
          setPlaylistContextMenu({ ...playlistContextMenu, visible: false });
        }}
        onClose={() => setPlaylistContextMenu({ ...playlistContextMenu, visible: false })}
      />
    </div>
  );
}
