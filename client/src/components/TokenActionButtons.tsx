import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faHeart,           // Bars (health)
  faStar,            // Status
  faEye,             // Display
  faKey,             // Ownership
  faTrash,           // Delete
  faSkull,           // Combat
  faWandMagicSparkles, // Aura/Enchantment
} from '@fortawesome/free-solid-svg-icons';
import { useGameStore } from '../store/gameStore';

// Action buttons configuration with FontAwesome icons
const actionButtons = [
  { id: 'bars', icon: faHeart, label: 'Bars', color: '#e94560' },
  { id: 'status', icon: faStar, label: 'Status', color: '#f59e0b' },
  { id: 'display', icon: faEye, label: 'Display', color: '#3b82f6' },
  { id: 'aura', icon: faWandMagicSparkles, label: 'Enchantment', color: '#9333ea' },
  { id: 'ownership', icon: faKey, label: 'Ownership', color: '#8b5cf6' },
  { id: 'combat', icon: faSkull, label: 'Combat', color: '#ef4444' },
  { id: 'delete', icon: faTrash, label: 'Delete', color: '#dc2626' },
];

// Inject keyframe animation styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes tweenIn {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0);
    }
    50% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.2);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
  
  @keyframes buttonTweenIn {
    0% {
      opacity: 0;
      transform: scale(0);
    }
    60% {
      opacity: 1;
      transform: scale(1.2);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }
`;
document.head.appendChild(styleSheet);

interface TokenActionButtonsProps {
  tokenId: string;
  appRef: React.MutableRefObject<PIXI.Application | null>;
  effectiveGridSize: number;
  onOpenModal?: (modal: string, buttonPosition?: { x: number; y: number }) => void;
  isVisible: boolean;
}

export function TokenActionButtons({ tokenId, appRef, effectiveGridSize, onOpenModal, isVisible }: TokenActionButtonsProps) {
  const { tokens } = useGameStore();
  
  // Get the token from store
  const token = tokens.find(t => t.id === tokenId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderKey, setRenderKey] = useState(0);
  
  // Force re-render when visibility changes to update position immediately
  useEffect(() => {
    if (isVisible) {
      setRenderKey(k => k + 1);
    }
  }, [isVisible]);
  
  // Update position - scale wheel relative to token size
  useEffect(() => {
    const app = appRef.current;
    if (!app || !token || !containerRef.current) return;
    
    const container = containerRef.current;
    
    const updatePosition = () => {
      // Token position is in stage-local coordinates
      const size = effectiveGridSize * token.size;
      const tokenCenterX = token.x + size / 2;
      const tokenCenterY = token.y + size / 2;
      
      // Apply stage transform (pan and zoom)
      const stage = app.stage;
      const scale = stage.scale.x;
      const stageX = stage.x;
      const stageY = stage.y;
      
      // Calculate final screen position
      const finalX = tokenCenterX * scale + stageX;
      const finalY = tokenCenterY * scale + stageY;
      
      // Apply to container
      container.style.left = `${finalX}px`;
      container.style.top = `${finalY}px`;
      
      // Scale the wheel proportionally to the token's screen size
      // Token screen size = size * scale
      // We want the wheel to be a fixed ratio of the token size
      const tokenScreenSize = size * scale;
      
      // Wheel should be 2x the token size
      const wheelRatio = 2.0;
      const targetWheelSize = tokenScreenSize * wheelRatio;
      
      // Current container is 180x180, so scale to match target
      const scaleFactor = targetWheelSize / 180;
      
      container.style.transform = `translate(-50%, -50%) scale(${scaleFactor})`;
    };
    
    // Update immediately
    updatePosition();
    
    // Use requestAnimationFrame for smooth updates
    let animationId: number;
    const tick = () => {
      updatePosition();
      animationId = requestAnimationFrame(tick);
    };
    animationId = requestAnimationFrame(tick);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [token, effectiveGridSize, renderKey]);
  
  if (!token) return null;
  
  // Handle button click - calculate absolute screen position
  const handleButtonClick = (btnId: string, relativeX: number, relativeY: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Calculate the absolute screen position of the button
    const app = appRef.current;
    if (app && token) {
      const size = effectiveGridSize * token.size;
      const tokenCenterX = token.x + size / 2;
      const tokenCenterY = token.y + size / 2;
      
      // Apply stage transform (pan and zoom)
      const stage = app.stage;
      const scale = stage.scale.x;
      const stageX = stage.x;
      const stageY = stage.y;
      
      // Calculate the scaling factor used in updatePosition
      const tokenScreenSize = size * scale;
      const wheelRatio = 1.5;
      const targetWheelSize = tokenScreenSize * wheelRatio;
      const scaleFactor = targetWheelSize / 180;
      
      // The button position relative to the token center needs to account for scaleFactor
      // relativeX and relativeY are in the 180x180 container space, centered at 90,90
      const buttonRelX = (relativeX - 90) * scaleFactor;
      const buttonRelY = (relativeY - 90) * scaleFactor;
      
      // Calculate absolute screen position
      const buttonScreenX = (tokenCenterX * scale + stageX) + buttonRelX;
      const buttonScreenY = (tokenCenterY * scale + stageY) + buttonRelY;
      
      if (onOpenModal) {
        onOpenModal(btnId, { x: buttonScreenX, y: buttonScreenY });
      }
    } else if (onOpenModal) {
      onOpenModal(btnId);
    }
  };
  
  return (
    <div
      key={renderKey}
      ref={containerRef}
      className="token-wheel"
      style={{
        left: 0,
        top: 0,
      }}
    >
      <div className="token-wheel-container">
        {actionButtons.map((btn, index) => {
          const angle = (index * (360 / actionButtons.length) - 90) * (Math.PI / 180);
          const radius = 70;
          const x = Math.cos(angle) * radius + 90;
          const y = Math.sin(angle) * radius + 90;
          
          return (
            <button
              key={btn.id}
              onClick={(e) => handleButtonClick(btn.id, x, y, e)}
              className="token-wheel-button"
              style={{
                left: x - 20,
                top: y - 20,
                borderColor: btn.color,
                // Staggered tween animation for each button
                animation: isVisible ? `buttonTweenIn 0.3s ease-out forwards ${0.05 + index * 0.03}s` : 'none',
                opacity: isVisible ? 0 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.15)';
                e.currentTarget.style.boxShadow = `0 0 15px ${btn.color}`;
                e.currentTarget.style.zIndex = '10000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px var(--token-wheel-shadow)';
                e.currentTarget.style.zIndex = '9999';
              }}
              title={btn.label}
            >
              <FontAwesomeIcon icon={btn.icon} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
