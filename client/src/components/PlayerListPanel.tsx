import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';

export function PlayerListPanel() {
  const { players, session, colorScheme, user, setPlayers, token, panelFocus, setPanelFocus, playerColor, playerListPanelPosition, setPlayerListPanelPosition, playerListPanelSize, setPlayerListPanelSize } = useGameStore();

  if (!session) return null;

  const currentUserId = user?.id;

  // Find the GM player - could be in players array with role='gm' or match gmId
  const gmPlayer = players.find(p => p.role === 'gm' || p.userId === session.gmId);
  
  // If GM not in players array, use session.gmId directly (for GM who created the session)
  const isUserGM = session.gmId === currentUserId;
  
  // Function to handle color change
  const handleColorChange = async (userId: string, newColor: string) => {
    // Update the player's color in the local store
    let updatedPlayers = players.map(p => 
      p.userId === userId ? { ...p, playerColor: newColor } : p
    );
    
    // If user not in players array (e.g., GM who created session), add them
    if (!updatedPlayers.find(p => p.userId === userId)) {
      updatedPlayers = [...updatedPlayers, {
        userId: userId,
        username: 'GM',
        role: 'gm' as const,
        joinedAt: new Date(),
        playerColor: newColor,
        controlledTokens: [],
        isOnline: true,
      }];
    }
    
    setPlayers(updatedPlayers);
    
    // Also update the global playerColor in the store if this is the current user
    if (userId === user?.id) {
      useGameStore.getState().setPlayerColor(newColor);
      localStorage.setItem('vtt_playerColor', newColor);
    }
    
    // Save to database
    try {
      const response = await fetch(`/api/auth/sessions/${session.id}/player-color`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ userId, playerColor: newColor }),
      });
      
      if (!response.ok) {
        console.error('Failed to save player color');
      }
    } catch (error) {
      console.error('Error saving player color:', error);
    }
  };

  // Get the current user's color - use store color first, then session player color
  const currentUserPlayer = players.find(p => p.userId === user?.id);
  const currentUserColor = playerColor || currentUserPlayer?.playerColor || '#ed8936';

  // Open color picker when clicking the color circle
  const handleColorCircleClick = (player: { userId: string; playerColor?: string }) => {
    // Use the browser's color picker
    const input = document.createElement('input');
    input.type = 'color';
    input.value = player.playerColor || '#ff0000';
    input.onchange = (e) => {
      const newColor = (e.target as HTMLInputElement).value;
      handleColorChange(player.userId, newColor);
    };
    input.click();
  };

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    // Prevent text selection during drag
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - playerListPanelPosition.x,
      y: e.clientY - playerListPanelPosition.y,
    });
  };

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPlayerListPanelPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      // Restore text selection after drag ends
      document.body.style.userSelect = '';
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, setPlayerListPanelPosition]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent text selection during resize
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: playerListPanelSize.width,
      height: playerListPanelSize.height,
    });
  };

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(180, resizeStart.width + (e.clientX - resizeStart.x));
      const newHeight = Math.max(90, resizeStart.height + (e.clientY - resizeStart.y));
      setPlayerListPanelSize({ width: newWidth, height: newHeight });
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
  }, [isResizing, resizeStart, setPlayerListPanelSize]);

  return (
    <div 
      className="player-list-panel"
      onClick={() => setPanelFocus('playerList')}
      style={{
        position: 'absolute',
        left: playerListPanelPosition.x,
        top: playerListPanelPosition.y,
        width: playerListPanelSize.width,
        height: 'fit-content',
        background: colorScheme?.id === 'custom' 
          ? `rgba(${parseInt(colorScheme.surface.slice(1, 3), 16)}, ${parseInt(colorScheme.surface.slice(3, 5), 16)}, ${parseInt(colorScheme.surface.slice(5, 7), 16)}, ${colorScheme.surfaceAlpha ?? 0.9})` 
          : undefined,
        borderColor: colorScheme?.id === 'custom'
          ? `rgba(${parseInt(colorScheme.accent.slice(1, 3), 16)}, ${parseInt(colorScheme.accent.slice(3, 5), 16)}, ${parseInt(colorScheme.accent.slice(5, 7), 16)}, ${colorScheme.surfaceAlpha ?? 0.9})`
          : undefined,

        '--player-list-z-index': panelFocus === 'playerList' ? 5000 : 50,
      } as React.CSSProperties}
    >
      <div 
        className="player-list-header"
        onMouseDown={handleDragStart}
        style={{ cursor: 'move' }}
      >
        <Icon name="user-group" />
        <span>Players ({players.length + (session.gmId ? 1 : 0)})</span>
        <span className="room-code">{session.roomCode}</span>
      </div>
      <div className="player-list">
        {/* Show GM if user is the GM or GM exists in players array */}
        {(isUserGM || gmPlayer) && (
          <div className="player-item gm">
            <div 
              className="player-color-picker"
              style={{ backgroundColor: gmPlayer?.playerColor || '#ff0000' }}
              onClick={() => handleColorCircleClick({ userId: session.gmId, playerColor: gmPlayer?.playerColor || '#ff0000' })}
              title="Click to change GM color"
            />
            <span className="player-name">
              GM
              <span className={`online-status ${gmPlayer?.isOnline !== false ? 'online' : 'offline'}`} title={gmPlayer?.isOnline !== false ? 'Online' : 'Offline'}>
                {gmPlayer?.isOnline !== false ? '●' : '○'}
              </span>
            </span>
            <span className="player-badge">GM</span>
          </div>
        )}
        {/* Show all players in session (excluding GM to avoid duplication) */}
        {players.filter(p => p.role !== 'gm' && p.userId !== session.gmId).map((player) => (
          <div 
            key={player.userId} 
            className={`player-item ${player.userId === currentUserId ? 'current' : ''}`}
          >
            <div 
              className="player-color-picker"
              style={{ backgroundColor: player.userId === currentUserId ? currentUserColor : player.playerColor }}
              onClick={() => handleColorCircleClick(player)}
              title="Click to change player color"
            />
            <span className="player-name">
              {player.username || 'Unknown'}
              <span className={`online-status ${player.isOnline !== false ? 'online' : 'offline'}`} title={player.isOnline !== false ? 'Online' : 'Offline'}>
                {player.isOnline !== false ? '●' : '○'}
              </span>
            </span>
            {player.role === 'gm' && <span className="player-badge">GM</span>}
          </div>
        ))}
        {players.length === 0 && !session.gmId && (
          <div className="player-list-empty">No other players</div>
        )}
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '16px',
          height: '16px',
          cursor: 'se-resize',
          background: 'linear-gradient(135deg, transparent 50%, var(--accent, #666) 50%)',
          borderRadius: '0 0 4px 0',
        }}
        title="Resize"
      />
    </div>
  );
}
