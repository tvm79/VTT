import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { Icon } from './Icon';

export function Sidebar() {
  const { players, session, user, currentBoard, tool, isGM: storeIsGM, defaultShowTokenName, defaultShowPlayerHp, defaultTokenDisposition } = useGameStore();
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(220);

  // Handle resize
  const handleResizeStart = (e: React.MouseEvent) => {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isResizing.current && !isCollapsed) {
      const deltaX = e.clientX - resizeStartX.current;
      const newWidth = Math.max(180, Math.min(400, resizeStartWidth.current + deltaX));
      setSidebarWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleLeave = () => {
    socketService.leaveSession();
  };

  const currentUserPlayer = players.find(p => p.userId === user?.id);
  const isGM = currentUserPlayer?.role === 'gm' || storeIsGM;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'token') => {
    // If no board, create one first
    if (!currentBoard && session) {
      socketService.createBoard('Main Board');
      // Wait for board to be created
      setTimeout(() => {
        handleFileUpload(e, type);
      }, 500);
      return;
    }

    const file = e.target.files?.[0];
    if (!file || !currentBoard) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.url) {
        if (type === 'background') {
          socketService.setBackground(currentBoard.id, data.url);
        } else {
          // Create token at center of board
          socketService.createToken(currentBoard.id, {
            name: file.name.replace(/\.[^/.]+$/, ''),
            imageUrl: data.url,
            x: currentBoard.width / 2,
            y: currentBoard.height / 2,
            size: 1,
            showLabel: defaultShowTokenName || undefined,
            bars: defaultShowPlayerHp ? JSON.stringify([{ name: 'HP', current: 10, max: 10, color: '#e94560' }]) : undefined,
            properties: defaultTokenDisposition ? { disposition: defaultTokenDisposition } : undefined,
          });
        }
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  // Toggle collapse
  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div 
      className="sidebar" 
      style={{ 
        width: isCollapsed ? '48px' : sidebarWidth, 
        minWidth: isCollapsed ? '48px' : '180px',
        position: 'relative',
        transition: isResizing.current ? 'none' : 'width 0.2s ease',
      }}
    >
      {/* Resize handle */}
      {!isCollapsed && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <Icon name="grip-lines-vertical" />
        </div>
      )}

      {/* Collapse toggle */}
      <button
        className="sidebar-collapse-btn"
        onClick={toggleCollapse}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <Icon name={isCollapsed ? 'chevron-left' : 'chevron-right'} />
      </button>

      {isCollapsed ? (
        /* Collapsed state */
        <div className="sidebar-collapsed">
          <button
            className="sidebar-icon-btn"
            onClick={() => setShowUpload(!showUpload)}
            title="Add Image"
          >
            <Icon name="upload" />
          </button>
          {showUpload && (
            <div className="sidebar-tooltip">
              <button 
                className="sidebar-tooltip-btn"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => handleFileUpload(e as any, 'background');
                  input.click();
                }}
              >
                <Icon name="image" /> Background
              </button>
              <button 
                className="sidebar-tooltip-btn"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => handleFileUpload(e as any, 'token');
                  input.click();
                }}
              >
                <Icon name="theater-masks" /> Token
              </button>
            </div>
          )}
          <button
            className="sidebar-icon-btn"
            onClick={handleLeave}
            title="Leave Session"
          >
            <Icon name="sign-out-alt" />
          </button>
        </div>
      ) : (
        /* Expanded state */
        <>
          <div className="sidebar-header">
            <Icon name="user-group" />
            <span>Players ({players.length})</span>
          </div>

          <div className="player-list">
            {players.map((player) => (
              <div key={player.userId} className="player-item">
                <div className="player-avatar">
                  {player.username.charAt(0).toUpperCase()}
                </div>
                <span className="player-name">{player.username}</span>
                <span className={`player-role ${player.role}`}>
                  {player.role.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {/* Upload Section - Only for GM */}
          {isGM && (
            <div className="sidebar-section">
              <button 
                className="sidebar-btn"
                onClick={() => setShowUpload(!showUpload)}
              >
                <Icon name="upload" />
                <span>{showUpload ? 'Hide' : 'Add Image'}</span>
              </button>

              {showUpload && (
                <div className="sidebar-upload-options">
                </div>
              )}
            </div>
          )}

          {session && (
            <div className="sidebar-footer">
              <button className="sidebar-btn danger" onClick={handleLeave}>
                <Icon name="sign-out-alt" />
                <span>Leave Session</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
