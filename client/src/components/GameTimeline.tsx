import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { TIME, getDayProgress, getSunState, getTimePeriodDescription, setAtmosphericFog, VISUAL_OPTIONS } from '../utils/gameTime';
import { socketService } from '../services/socket';

/**
 * GameTimeline Component
 * 
 * Timeline bar with anchor selection, Y offset, and resize
 */
export function GameTimeline() {
  const { 
    gameTimeSeconds, 
    gameTimeVisible,
    setGameTime,
    isGM,
    timelinePosition,
    timelineAnchor,
    setTimelinePosition,
    setTimelineAnchor,
    setTimelineBottomOffset,
    setTimelineStretched,
    timelineHeight,
    setTimelineHeight,
    chatVisible,
    timelineStretched,
  } = useGameStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingX, setIsDraggingX] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingHeight, setIsResizingHeight] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [atmosphericFogEnabled, setAtmosphericFogEnabled] = useState(VISUAL_OPTIONS.atmosphericFog);
  const dragStartX = useRef(0);
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const headerHeight = 64;

  // Computed values
  const dayProgress = useMemo(() => getDayProgress(gameTimeSeconds), [gameTimeSeconds]);
  const sunState = useMemo(() => getSunState(dayProgress), [dayProgress]);
  const timePeriod = useMemo(() => getTimePeriodDescription(dayProgress), [dayProgress]);
  const sliderPosition = dayProgress * 100;

  // Calculate position based on anchor
  const topPosition = timelineAnchor === 'top' 
    ? headerHeight + timelinePosition.y 
    : undefined;
  const bottomPosition = timelineAnchor === 'bottom' 
    ? timelinePosition.y 
    : undefined;

  // Handle slider change - MUST be before early return
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const newTime = (value / 100) * TIME.DAY;
    setGameTime(newTime);
  }, [setGameTime]);

  // Handle drag start - horizontal only
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input[type="range"]') || 
        (e.target as HTMLElement).closest('.timeline-slider-btn') ||
        (e.target as HTMLElement).closest('input[type="number"]') ||
        (e.target as HTMLElement).closest('select')) {
      return;
    }
    e.preventDefault();
    setIsDraggingX(true);
    dragStartX.current = e.clientX - timelinePosition.x;
  }, [timelinePosition.x]);

  // Handle resize start - width
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const container = containerRef.current;
    resizeStart.current = {
      width: container ? container.offsetWidth : 300,
      height: container ? container.offsetHeight : 120,
      x: e.clientX,
      y: e.clientY,
    };
  }, []);

  // Handle resize start - height
  const handleResizeHeightStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingHeight(true);
    const container = containerRef.current;
    resizeStart.current = {
      width: container ? container.offsetWidth : 300,
      height: container ? container.offsetHeight : 120,
      x: e.clientX,
      y: e.clientY,
    };
  }, []);

  // Handle mouse move
  useEffect(() => {
    if (!isDraggingX && !isResizing && !isResizingHeight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingX) {
        const newX = e.clientX - dragStartX.current;
        // Clamp to reasonable bounds
        const clampedX = Math.max(0, Math.min(window.innerWidth - 100, newX));
        setTimelinePosition({ ...timelinePosition, x: clampedX });
      } else if (isResizing) {
        const container = containerRef.current;
        if (container) {
          const deltaX = e.clientX - resizeStart.current.x;
          const newWidth = Math.max(200, Math.min(500, resizeStart.current.width + deltaX));
          container.style.width = `${newWidth}px`;
          container.style.minWidth = `${newWidth}px`;
        }
      } else if (isResizingHeight) {
        const container = containerRef.current;
        if (container) {
          const deltaY = e.clientY - resizeStart.current.y;
          const newHeight = Math.max(30, Math.min(400, resizeStart.current.height + deltaY));
          setTimelineHeight(newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingX(false);
      setIsResizing(false);
      setIsResizingHeight(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingX, isResizing, isResizingHeight, timelinePosition, setTimelinePosition, setTimelineHeight]);

  // Handle anchor change
  const handleAnchorChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimelineAnchor(e.target.value as 'top' | 'bottom');
  }, [setTimelineAnchor]);

  // Handle Y offset change
  const handleYOffsetChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setTimelinePosition({ ...timelinePosition, y: value });
  }, [timelinePosition, setTimelinePosition]);

  // Gradient colors
  const gradientColors = useMemo(() => {
    return `linear-gradient(to right, 
      #0d1b2a 0%,
      #1b263b 15%,
      #415a77 25%,
      #ffb703 35%,
      #fb8500 45%,
      #ffd60a 55%,
      #ffb703 65%,
      #e85d04 75%,
      #9d4edd 85%,
      #1b263b 95%,
      #0d1b2a 100%
    )`;
  }, []);

  const maxYOffset = useMemo(() => {
    return timelineAnchor === 'top' ? 200 : window.innerHeight - 150;
  }, [timelineAnchor]);

  // Toggle settings visibility
  const toggleSettings = useCallback(() => {
    setShowSettings(prev => !prev);
  }, []);

  // Toggle stretch mode
  const toggleStretch = useCallback(() => {
    setTimelineStretched(!timelineStretched);
  }, [timelineStretched, setTimelineStretched]);

  // Calculate right boundary based on chat visibility
  const rightBoundary = useMemo(() => {
    if (timelineStretched) {
      // When stretched, leave space for chat panel (300px) if visible
      return chatVisible ? 300 : 0;
    }
    return undefined;
  }, [timelineStretched, chatVisible]);

  // Update bottom offset when anchor changes to bottom
  useEffect(() => {
    if (timelineAnchor === 'bottom' && !timelineStretched) {
      // Estimate timeline height ~80px
      setTimelineBottomOffset(80);
    } else {
      setTimelineBottomOffset(0);
    }
  }, [timelineAnchor, timelineStretched, setTimelineBottomOffset]);

  // Early return AFTER all hooks
  if (!isGM || !gameTimeVisible) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="time-timeline-container"
      onMouseDown={handleDragStart}
      style={{
        position: 'fixed',
        left: timelineStretched ? '0px' : timelinePosition.x,
        right: rightBoundary,
        top: topPosition,
        bottom: bottomPosition,
        zIndex: 99,
        width: timelineStretched ? 'auto' : '300px',
        minWidth: timelineStretched ? 'auto' : '200px',
        maxWidth: timelineStretched ? 'none' : '500px',
        minHeight: `${timelineHeight + (showSettings ? 40 : 0)}px`,
        height: 'auto',
        background: 'var(--bg-secondary, #2d3748)',
        borderRadius:  timelineStretched ? '0px' : '8px',
        padding: timelineStretched ? '8px 0px' : '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        cursor: isDraggingX ? 'grabbing' : 'grab',
        userSelect: 'none',
        border: isDraggingX ? '1px solid var(--accent, #4a5568)' : '1px solid transparent',
      }}
    >
      {/* Settings Toggle Button */}
      <button
        onClick={toggleSettings}
        style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          background: showSettings ? 'var(--accent, #4a5568)' : 'transparent',
          border: 'none',
          color: 'var(--text-secondary, #718096)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: '10px',
          borderRadius: '3px',
          zIndex: 10,
        }}
        title="Toggle settings"
      >
        ⚙
      </button>

      {/* Stretch Toggle Button */}
      <button
        onClick={toggleStretch}
        style={{
          position: 'absolute',
          top: '4px',
          right: '4px',
          background: timelineStretched ? 'var(--accent, #4a5568)' : 'transparent',
          border: 'none',
          color: timelineStretched ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #718096)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: '10px',
          borderRadius: '3px',
          zIndex: 10,
        }}
        title={timelineStretched ? 'Fixed width' : 'Stretch across'}
      >
        ⇔
      </button>

      {/* Settings Panel - Hidden by default */}
      {showSettings && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', padding: '0px 10px' }}>
            {/* Anchor selector */}
            <select
              value={timelineAnchor}
              onChange={handleAnchorChange}
              style={{
                background: 'var(--bg-tertiary, #1a202c)',
                color: 'var(--text-primary, #fff)',
                border: '1px solid var(--border, #4a5568)',
                borderRadius: '4px',
                padding: '2px 4px',
                margin: '0px 12px',
                fontSize: '10px',
                cursor: 'pointer',
                width: '50px',
              }}
              title="Anchor position"
            >
              <option value="top">Top</option>
              <option value="bottom">Bot</option>
            </select>
            
            {/* Y Offset slider */}
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '4px' }}>
              <input
                type="range"
                min="0"
                max={maxYOffset}
                value={timelinePosition.y}
                onChange={handleYOffsetChange}
                style={{ flex: 1, height: '4px', cursor: 'pointer' }}
                title={`Y offset: ${timelinePosition.y}px`}
              />
              <span style={{ fontSize: '9px', color: 'var(--text-secondary, #718096)', minWidth: '24px' }}>
                {timelinePosition.y}
              </span>
            </div>
          </div>
          
          {/* Atmospheric Fog checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderTop: '1px solid var(--border, #4a5568)' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '10px',
                color: 'var(--text-primary, #fff)',
              }}
            >
              <input
                type="checkbox"
                checked={atmosphericFogEnabled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAtmosphericFogEnabled(checked);
                  setAtmosphericFog(checked);
                  // Sync with server if GM
                  if (isGM) {
                    socketService.updateTimeSettings({ atmosphericFog: checked });
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              Atmospheric Fog
            </label>
          </div>
        </>
      )}

      {/* Timeline Bar */}
      <div style={{ position: 'relative', flex: 1, minHeight: '10px', padding: '0px 8px' }}>
        {/* Gradient Background */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: '8px',
            right: '8px',
            bottom: 0,
            borderRadius: '5px',
            background: gradientColors,
            opacity: 0.8,
          }}
        />

        {/* Range Input */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={sliderPosition}
          onChange={handleSliderChange}
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            transform: 'translateY(-50%)',
            width: '100%',
            height: '20px',
            margin: 0,
            cursor: 'pointer',
            opacity: 0,
            zIndex: 2,
            padding: 10,
          }}
        />

        {/* Visual Thumb */}
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: `${sliderPosition}%`,
            transform: 'translate(-50%, -50%)',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: sunState === 'sun' ? '#fbbf24' : '#a0aec0',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Quick Time Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {[
          { label: 'Dawn', progress: 0.25 },
          { label: 'Noon', progress: 0.5 },
          { label: 'Dusk', progress: 0.75 },
        ].map((marker) => (
          <button
            key={marker.label}
            onClick={() => setGameTime(marker.progress * TIME.DAY)}
            style={{
              background: 'transparent',
              border: 'none',
              color: Math.abs(dayProgress - marker.progress) < 0.05 
                ? 'var(--accent, #4a5568)' 
                : 'var(--text-secondary, #718096)',
              cursor: 'pointer',
              fontSize: '9px',
              padding: '2px',
            }}
          >
            {marker.label}
          </button>
        ))}
      </div>

      {/* Time Period Label - Pinned to bottom */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '10px',
          color: 'var(--text-secondary, #a0aec0)',
          padding: '0px 30px',
        }}
      >
        <span>12a</span>
        <span style={{ fontWeight: 600, color: sunState === 'sun' ? '#fbbf24' : '#a0aec0' }}>
          {sunState === 'sun' ? '☀' : '☾'} {timePeriod}
        </span>
        <span>12p</span>
      </div>

      {/* Height Resize Handle - Bottom Center */}
      <div 
        onMouseDown={handleResizeHeightStart}
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '40px',
          height: '8px',
          cursor: 'ns-resize',
          background: 'linear-gradient(180deg, transparent 50%, var(--text-secondary, #718096) 50%)',
          borderRadius: '0 0 4px 4px',
          zIndex: 10,
        }}
        title="Drag to resize height"
      />
    </div>
  );
}

export default GameTimeline;
