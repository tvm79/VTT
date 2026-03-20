import { useState, useEffect, useRef } from 'react';
import { useGameStore, type Scene } from '../store/gameStore';
import { Icon } from './Icon';
import './DataManager.css';

export function SceneManager() {
  const {
    sceneManagerVisible,
    setSceneManagerVisible,
    sceneManagerPosition,
    setSceneManagerPosition,
    sceneManagerSize,
    setSceneManagerSize,
    scenes,
    setScenes,
    saveScene,
    overwriteScene,
    createNewScene,
    loadScene,
    deleteScene,
    currentBoard,
    isGM,
    session,
    refreshScenes,
    loadLastSceneOnStartup,
    colorScheme,
  } = useGameStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [newSceneName, setNewSceneName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showNewSceneDialog, setShowNewSceneDialog] = useState(false);
  const [newEmptySceneName, setNewEmptySceneName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showExportImport, setShowExportImport] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load scenes from localStorage on mount (global storage, persists across sessions)
  useEffect(() => {
    refreshScenes();
    // Auto-load the last scene if scenes exist
    setTimeout(() => {
      loadLastSceneOnStartup();
    }, 100);
  }, [refreshScenes, loadLastSceneOnStartup]);

  // Export scenes to JSON file
  const handleExport = () => {
    const dataStr = JSON.stringify(scenes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vtt-scenes-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import scenes from JSON file
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedScenes = JSON.parse(event.target?.result as string);
        if (!Array.isArray(importedScenes)) {
          alert('Invalid file format: expected an array of scenes');
          return;
        }
        
        // Merge with existing scenes (avoid duplicates by ID)
        const existingIds = new Set(scenes.map(s => s.id));
        const newScenes = importedScenes.filter((s: Scene) => !existingIds.has(s.id));
        const mergedScenes = [...scenes, ...newScenes];
        
        // Save to localStorage
        localStorage.setItem('vtt_scenes', JSON.stringify(mergedScenes));
        refreshScenes();
        
        alert(`Imported ${newScenes.length} new scenes!`);
      } catch (err) {
        alert('Failed to import scenes: invalid JSON');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-header-buttons')) return;
    if ((e.target as HTMLElement).closest('.scene-actions')) return;
    
    // Prevent text selection during drag
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - sceneManagerPosition.x,
      y: e.clientY - sceneManagerPosition.y,
    });
  };

  // Handle resizing
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent text selection during resize
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: sceneManagerSize.width,
      height: sceneManagerSize.height,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setSceneManagerPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
      if (isResizing) {
        const newWidth = Math.max(400, resizeStart.width + (e.clientX - resizeStart.x));
        const newHeight = Math.max(300, resizeStart.height + (e.clientY - resizeStart.y));
        setSceneManagerSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      // Restore text selection after drag/resize ends
      document.body.style.userSelect = '';
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart, setSceneManagerPosition, setSceneManagerSize]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSceneManagerVisible(false);
      }
    };
    if (sceneManagerVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sceneManagerVisible, setSceneManagerVisible]);

  const handleSaveScene = () => {
    if (newSceneName.trim() && currentBoard) {
      saveScene(newSceneName.trim());
      setNewSceneName('');
      setShowSaveDialog(false);
    }
  };

  const handleCreateNewScene = () => {
    if (newEmptySceneName.trim() && currentBoard) {
      createNewScene(newEmptySceneName.trim());
      setNewEmptySceneName('');
      setShowNewSceneDialog(false);
    }
  };

  const handleLoadScene = (sceneId: string) => {
    if (isGM) {
      loadScene(sceneId);
    }
  };

  const handleDeleteScene = (sceneId: string) => {
    deleteScene(sceneId);
    setDeleteConfirmId(null);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTokenCount = (scene: Scene) => scene.tokens?.length || 0;
  const getLightCount = (scene: Scene) => scene.lights?.length || 0;

  if (!sceneManagerVisible) return null;

  return (
    <div
      ref={panelRef}
      className="floating-panel"
      style={{
        position: 'fixed',
        left: sceneManagerPosition.x,
        top: sceneManagerPosition.y,
        width: sceneManagerSize.width,
        height: sceneManagerSize.height,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        className="floating-panel-header"
        onMouseDown={handleMouseDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon name="map" />
          <span style={{ fontWeight: 600 }}>Scene Manager</span>
        </div>
        <div className="panel-header-buttons" style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={() => setSceneManagerVisible(false)}
            style={{
              
              border: 'none',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <Icon name="times" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="floating-panel-content"
      >
        {/* Save Scene Section */}
        {isGM && currentBoard && (
          <div style={{ marginBottom: '20px' }}>
            {showSaveDialog ? (
              <div style={{
                background: colorScheme?.id === 'custom' ? colorScheme.background : '#2d3748',
                padding: '15px',
                borderRadius: '8px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}>
                <input
                  type="text"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  placeholder="Scene name..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveScene();
                    if (e.key === 'Escape') {
                      setShowSaveDialog(false);
                      setNewSceneName('');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : '#4a5568'}`,
                    background: colorScheme?.id === 'custom' ? colorScheme.surface : '#1a202c',
                    color: colorScheme?.id === 'custom' ? colorScheme.text : '#e2e8f0',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSaveScene}
                  disabled={!newSceneName.trim()}
                  style={{
                    padding: '8px 16px',
                    background: newSceneName.trim() ? (colorScheme?.id === 'custom' ? colorScheme.accent : '#48bb78') : '#4a5568',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: newSceneName.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false);
                    setNewSceneName('');
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#718096',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveDialog(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: colorScheme?.id === 'custom' ? colorScheme.accent : 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Icon name="plus" />
                Save Current Scene
              </button>
            )}
          </div>
        )}

        {/* Create New Empty Scene Section */}
        {isGM && currentBoard && (
          <div style={{ marginBottom: '20px' }}>
            {showNewSceneDialog ? (
              <div style={{
                background: colorScheme?.id === 'custom' ? colorScheme.background : '#2d3748',
                padding: '15px',
                borderRadius: '8px',
              }}>
                <div style={{ marginBottom: '10px', color: colorScheme?.id === 'custom' ? colorScheme.text : '#e2e8f0', fontSize: '13px' }}>
                  Create a new empty scene (no tokens/lights)
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={newEmptySceneName}
                    onChange={(e) => setNewEmptySceneName(e.target.value)}
                    placeholder="Scene name..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNewScene();
                      if (e.key === 'Escape') {
                        setShowNewSceneDialog(false);
                        setNewEmptySceneName('');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : '#4a5568'}`,
                      background: colorScheme?.id === 'custom' ? colorScheme.surface : '#1a202c',
                      color: colorScheme?.id === 'custom' ? colorScheme.text : '#e2e8f0',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleCreateNewScene}
                    disabled={!newEmptySceneName.trim()}
                    style={{
                      padding: '8px 16px',
                      background: newEmptySceneName.trim() ? (colorScheme?.id === 'custom' ? colorScheme.accent : '#48bb78') : '#4a5568',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: newEmptySceneName.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setShowNewSceneDialog(false);
                      setNewEmptySceneName('');
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#718096',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewSceneDialog(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : '#4a5568'}`,
                  borderRadius: '8px',
                  color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Icon name="plus" />
                Create New Empty Scene
              </button>
            )}
          </div>
        )}

        {/* Export/Import Section */}
        <div style={{ marginBottom: '20px' }}>
          {showExportImport ? (
            <div style={{
              background: colorScheme?.id === 'custom' ? colorScheme.background : '#2d3748',
              padding: '15px',
              borderRadius: '8px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleExport}
                  disabled={scenes.length === 0}
                  style={{
                    padding: '10px',
                    background: scenes.length > 0 ? (colorScheme?.id === 'custom' ? colorScheme.accent : '#4299e1') : '#4a5568',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: scenes.length > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Icon name="download" />
                  Export All Scenes ({scenes.length})
                </button>
                
                <label
                  style={{
                    padding: '10px',
                    background: colorScheme?.id === 'custom' ? colorScheme.accent : '#48bb78',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Icon name="upload" />
                  Import Scenes
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    style={{ display: 'none' }}
                  />
                </label>
                
                <button
                  onClick={() => setShowExportImport(false)}
                  style={{
                    padding: '8px',
                    background: 'transparent',
                    border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : '#4a5568'}`,
                    borderRadius: '4px',
                    color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowExportImport(true)}
              style={{
                width: '100%',
                padding: '10px',
                background: colorScheme?.id === 'custom' ? colorScheme.background : '#2d3748',
                border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : '#4a5568'}`,
                borderRadius: '8px',
                color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <Icon name="external-link-alt" />
              Export / Import Scenes
            </button>
          )}
        </div>

        {!currentBoard && (
          <div style={{
            textAlign: 'center',
            padding: '30px',
            color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0',
          }}>
            <Icon name="map" style={{ fontSize: '48px', marginBottom: '10px', opacity: 0.5 }} />
            <p>No board loaded. Create or select a board to manage scenes.</p>
          </div>
        )}

        {/* Scenes List */}
        {scenes.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ color: colorScheme?.id === 'custom' ? colorScheme.text : '#e2e8f0', margin: '0 0 10px 0', fontSize: '14px' }}>
              Saved Scenes ({scenes.length})
            </h3>
            {scenes.map((scene) => (
              <div
                key={scene.id}
                style={{
                  background: colorScheme?.id === 'custom' ? colorScheme.background : '#2d3748',
                  borderRadius: '8px',
                  padding: '12px',
                  border: `1px solid ${colorScheme?.id === 'custom' ? colorScheme.accent : '#4a5568'}`,
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px',
                }}>
                  <div>
                    <h4 style={{ color: colorScheme?.id === 'custom' ? colorScheme.text : '#e2e8f0', margin: '0 0 4px 0', fontSize: '16px' }}>
                      {scene.name}
                    </h4>
                    <p style={{ color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0', margin: 0, fontSize: '12px', opacity: 0.7 }}>
                      {formatDate(scene.createdAt)}
                    </p>
                  </div>
                  <div className="scene-actions" style={{ display: 'flex', gap: '5px' }}>
                    {deleteConfirmId === scene.id ? (
                      <>
                        <button
                          onClick={() => handleDeleteScene(scene.id)}
                          style={{
                            padding: '4px 8px',
                            background: '#e53e3e',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          style={{
                            padding: '4px 8px',
                            background: '#718096',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleLoadScene(scene.id)}
                          disabled={!isGM}
                          title={isGM ? 'Load scene' : 'Only GM can load scenes'}
                          style={{
                            padding: '4px 8px',
                            background: isGM ? (colorScheme?.id === 'custom' ? colorScheme.accent : '#4299e1') : '#4a5568',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: isGM ? 'pointer' : 'not-allowed',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Icon name="upload" />
                          Load
                        </button>
                        <button
                          onClick={() => overwriteScene(scene.id)}
                          disabled={!isGM}
                          title={isGM ? 'Overwrite scene with current board state' : 'Only GM can overwrite scenes'}
                          style={{
                            padding: '4px 8px',
                            background: isGM ? (colorScheme?.id === 'custom' ? colorScheme.accent : '#ed8936') : '#4a5568',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: isGM ? 'pointer' : 'not-allowed',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Icon name="save" />
                          Overwrite
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(scene.id)}
                          style={{
                            padding: '4px 8px',
                            background: '#e53e3e',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Scene Preview Info */}
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  fontSize: '12px',
                  color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0',
                  opacity: 0.7,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon name="user" />
                    {getTokenCount(scene)} tokens
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon name="sun" />
                    {getLightCount(scene)} lights
                  </span>
                  {scene.weatherType !== 'none' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Icon name="cloud" />
                      {scene.weatherType}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : currentBoard && (
          <div style={{
            textAlign: 'center',
            padding: '30px',
            color: colorScheme?.id === 'custom' ? colorScheme.text : '#a0aec0',
          }}>
            <p>No saved scenes yet. Save your current scene to get started!</p>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        className="floating-panel-resize"
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  );
}
