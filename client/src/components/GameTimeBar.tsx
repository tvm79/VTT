import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { TIME, secondsToTime, formatTime, getSunState, getDayProgress, setAtmosphericFog, VISUAL_OPTIONS } from '../utils/gameTime';
import { socketService } from '../services/socket';

/**
 * GameTimeBar Component
 * 
 * Compact time controls - draggable and resizable
 */
export function GameTimeBar() {
  const { 
    gameTimeSeconds, 
    gameTimeVisible, 
    advanceTime, 
    toggleGameTime,
    isGM,
    timeBarPosition,
    timeBarSize,
    setTimeBarPosition,
    setTimeBarSize,
  } = useGameStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const [atmosphericFogEnabled, setAtmosphericFogEnabled] = useState(VISUAL_OPTIONS.atmosphericFog);

  // Only show time controls for GM
  if (!isGM) {
    return null;
  }

  // Calculate current time info
  const { hours, minutes } = secondsToTime(gameTimeSeconds);
  const formattedTime = formatTime(hours, minutes);
  const dayProgress = getDayProgress(gameTimeSeconds);
  const sunState = getSunState(dayProgress);

  // Handle drag start - only start on title bar area
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.time-control-btn') || 
        (e.target as HTMLElement).closest('.resize-handle') ||
        (e.target as HTMLElement).closest('input')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - timeBarPosition.x,
      y: e.clientY - timeBarPosition.y,
    });
  }, [timeBarPosition]);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = {
      width: timeBarSize.width,
      height: timeBarSize.height,
      x: e.clientX,
      y: e.clientY,
    };
  }, [timeBarSize]);

  // Handle mouse move
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setTimeBarPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.current.x;
        const deltaY = e.clientY - resizeStart.current.y;
        setTimeBarSize({
          width: Math.max(160, resizeStart.current.width + deltaX),
          height: Math.max(60, resizeStart.current.height + deltaY),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, setTimeBarPosition, setTimeBarSize]);

  if (!gameTimeVisible) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="time-bar-container"
      style={{
        position: 'fixed',
        left: timeBarPosition.x,
        top: timeBarPosition.y,
        width: timeBarSize.width,
        minHeight: timeBarSize.height,
        zIndex: 100,
        background: 'var(--bg-secondary, #2d3748)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        padding: '6px 8px',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        border: isDragging ? '1px solid var(--accent, #4a5568)' : '1px solid transparent',
      }}
    >
      {/* Time Display - acts as drag handle */}
      <div 
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '2px 0',
          cursor: 'grab',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: '16px', color: sunState === 'sun' ? '#fbbf24' : '#a0aec0' }}>
          {sunState === 'sun' ? '☀' : '☾'}
        </span>
        <span 
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text-primary, #fff)',
            fontFamily: 'monospace',
          }}
        >
          {formattedTime}
        </span>
      </div>

      {/* Time Control Buttons - compact */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
        }}
      >
        <button
          className="time-control-btn"
          onClick={() => advanceTime(-TIME.HOUR)}
          title="Subtract 1 hour"
          style={{...compactButtonStyle}}
        >
          ««
        </button>
        <button
          className="time-control-btn"
          onClick={() => advanceTime(-TIME.MINUTE * 10)}
          title="Subtract 10 minutes"
          style={{...compactButtonStyle}}
        >
          ‹
        </button>
        <button
          className="time-control-btn"
          onClick={() => advanceTime(TIME.MINUTE * 10)}
          title="Add 10 minutes"
          style={{...compactButtonStyle}}
        >
          ›
        </button>
        <button
          className="time-control-btn"
          onClick={() => advanceTime(TIME.HOUR)}
          title="Add 1 hour"
          style={{...compactButtonStyle}}
        >
          »»
        </button>
        <button
          onClick={toggleGameTime}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary, #718096)',
            cursor: 'pointer',
            padding: '2px 4px',
            fontSize: '10px',
          }}
          title="Close"
        >
          ✕
        </button>
      </div>

 


      {/* Resize Handle */}
      <div 
        className="resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '12px',
          height: '12px',
          cursor: 'se-resize',
          background: 'linear-gradient(135deg, transparent 50%, var(--text-secondary, #718096) 50%)',
          borderRadius: '0 0 8px 0',
        }}
      />
    </div>
  );
}

const compactButtonStyle: React.CSSProperties = {
  width: '26px',
  height: '22px',
  borderRadius: '3px',
  border: 'none',
  background: 'var(--accent, #4a5568)',
  color: 'var(--text-primary, #fff)',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const tinyButtonStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: '3px',
  border: '1px solid var(--border, #4a5568)',
  background: 'transparent',
  color: ', #718096var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '9px',
  fontWeight: 500,
  margin: '8px 0px'
};

export default GameTimeBar;
