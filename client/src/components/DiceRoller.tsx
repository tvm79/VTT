import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { Icon } from './Icon';
import { parseDiceFormula, getRollDescription, rollDie, type RollResult, type DiceRoll } from '../utils/diceParser';
import { buildRollChatMessage } from '../utils/chatRolls';
import { audioPlayer } from '../utils/audioPlayer';
import { requestAuthoritativeRoll } from '../dice/rollOrchestrator';

export function DiceRoller() {
  const { 
    diceRollerVisible, 
    setDiceRollerVisible, 
    diceRollerPosition,
    setDiceRollerPosition,
    diceRollerSize,
    setDiceRollerSize,
    user, 
    isGM,
    diceRollHistory,
    addDiceRoll,
    colorScheme,
    panelFocus,
    setPanelFocus,
    dice3dEnabled,
  } = useGameStore();
  
  const [customFormula, setCustomFormula] = useState('');
  const [lastResult, setLastResult] = useState<RollResult | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [advantage, setAdvantage] = useState<'none' | 'advantage' | 'disadvantage'>('none');
  const [showHistory, setShowHistory] = useState(false);
  const [showCustomFormula, setShowCustomFormula] = useState(false);
  const [selectedDice, setSelectedDice] = useState<{ sides: number; count: number }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const resultRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Dice types supported - add new dice types here
// Also add corresponding SVG file to /public/dice-icons/d{N}.svg
const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;

// Generate CSS for dice icons automatically based on DICE_TYPES
function generateDiceIconCSS(): string {
  return DICE_TYPES.map(sides => `
.dice-btn[data-sides="${sides}"]::before {
  mask-image: url('/dice-icons/d${sides}.svg');
  -webkit-mask-image: url('/dice-icons/d${sides}.svg');
}`).join('');
}

  // Inject dice icon CSS dynamically based on DICE_TYPES
  useEffect(() => {
    const styleId = 'dice-roller-icon-styles';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = generateDiceIconCSS();
  }, []);

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    // Prevent text selection during drag
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - diceRollerPosition.x,
      y: e.clientY - diceRollerPosition.y,
    });
  };

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDiceRollerPosition({
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
  }, [isDragging, dragOffset, setDiceRollerPosition]);

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent text selection during resize
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsResizing(true);
  };

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(400, e.clientX - diceRollerPosition.x);
      const newHeight = Math.max(300, e.clientY - diceRollerPosition.y);
      setDiceRollerSize({
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
  }, [isResizing, diceRollerPosition, setDiceRollerSize]);

  // Handle dice selection (click to add, can click multiple times)
  const handleDiceSelect = (sides: number) => {
    setSelectedDice(prev => {
      const existing = prev.find(d => d.sides === sides);
      if (existing) {
        return prev.map(d => 
          d.sides === sides ? { ...d, count: d.count + 1 } : d
        );
      }
      return [...prev, { sides, count: 1 }];
    });
  };

  // Handle dice deselection (right-click to remove)
  const handleDiceDeselect = (sides: number) => {
    setSelectedDice(prev => {
      const existing = prev.find(d => d.sides === sides);
      if (existing && existing.count > 1) {
        return prev.map(d => 
          d.sides === sides ? { ...d, count: d.count - 1 } : d
        );
      }
      return prev.filter(d => d.sides !== sides);
    });
  };

  // Clear selected dice
  const clearSelectedDice = () => {
    setSelectedDice([]);
  };

  // Roll selected dice - uses the same logic as rollSingleDie
  const rollSelectedDice = async () => {
    if (selectedDice.length === 0) return;
    
    setIsRolling(true);
    audioPlayer.playDiceRoll();
    
    // Animate
    await animateRoll();
    
    // Check if rolling a single d20 with advantage/disadvantage
    const isSingleD20 = selectedDice.length === 1 && selectedDice[0].sides === 20 && selectedDice[0].count === 1;
    const formula = selectedDice.map(d => `${d.count}d${d.sides}`).join('+');
    const advText = (isSingleD20 && advantage !== 'none') ? ` (${advantage === 'advantage' ? 'adv' : 'dis'})` : '';

    if (dice3dEnabled) {
      try {
        const result = await requestAuthoritativeRoll({
          formula: formula + advText,
          source: 'dicePanel',
          visibility: 'public',
        });

        const mappedResult: RollResult = {
          formula: result.formula,
          dice: result.dice.map((die) => ({
            dice: die.dice,
            rolls: die.rolls,
            total: die.total,
            modifier: die.modifier,
          })),
          total: result.total,
          isPrivate: result.visibility === 'gm',
          isBlindGM: result.visibility === 'blind',
          isSelfRoll: result.visibility === 'self',
        };

        setLastResult(mappedResult);
        addDiceRoll({
          id: result.rollId,
          formula: result.formula,
          total: result.total,
          rolls: result.dice.flatMap((die) => die.rolls),
          username: result.username,
          timestamp: new Date(result.timestamp),
          isPrivate: result.visibility !== 'public',
        });

        const hasD20 = result.dice.some((d) => d.dice.toLowerCase().includes('d20'));
        if (hasD20) {
          const maxRoll = Math.max(...result.dice.flatMap((d) => d.rolls));
          if (maxRoll === 20) audioPlayer.playNatural20();
          else if (maxRoll === 1) audioPlayer.playNatural1();
          else audioPlayer.playSuccess();
        } else {
          audioPlayer.playSuccess();
        }
      } catch (error) {
        console.error('Authoritative dice panel roll failed, using local fallback:', error);
      }

      setIsRolling(false);
      clearSelectedDice();
      return;
    }
    
    // Build formula and roll each die
    const allDice: DiceRoll[] = [];
    let total = 0;
    
    if (isSingleD20 && advantage !== 'none') {
      // Single d20 with advantage/disadvantage: roll 2 d20, keep ONE (highest or lowest)
      const roll1 = rollDie(20);
      const roll2 = rollDie(20);
      let kept: number;
      let formulaSuffix: string;
      
      if (advantage === 'advantage') {
        kept = Math.max(roll1, roll2);
        formulaSuffix = ' (adv)';
      } else {
        kept = Math.min(roll1, roll2);
        formulaSuffix = ' (dis)';
      }
      
      allDice.push({
        dice: `1d20`,
        rolls: [roll1, roll2],
        total: kept,
        modifier: 0,
      });
      total = kept;
      
      // Play sound based on result
      if (kept === 20) audioPlayer.playNatural20();
      else if (kept === 1) audioPlayer.playNatural1();
      else audioPlayer.playSuccess();
    } else {
      // Normal roll (no advantage) or not a single d20
      for (const dice of selectedDice) {
        for (let i = 0; i < dice.count; i++) {
          const roll = rollDie(dice.sides);
          allDice.push({
            dice: `1d${dice.sides}`,
            rolls: [roll],
            total: roll,
            modifier: 0,
          });
          total += roll;
        }
      }
      
      // Play sound
      const hasD20 = allDice.some(d => d.dice.toLowerCase().includes('d20'));
      if (hasD20) {
        const maxRoll = Math.max(...allDice.flatMap(d => d.rolls));
        if (maxRoll === 20) audioPlayer.playNatural20();
        else if (maxRoll === 1) audioPlayer.playNatural1();
        else audioPlayer.playSuccess();
      } else {
        audioPlayer.playSuccess();
      }
    }
    
    const result: RollResult = {
      formula: formula + advText,
      dice: allDice,
      total: total,
      isPrivate: false,
      isBlindGM: false,
      isSelfRoll: false,
    };
    
    setLastResult(result);
    addDiceRoll({
      id: `roll-${Date.now()}`,
      formula: result.formula,
      total: result.total,
      rolls: result.dice.flatMap(d => d.rolls),
      username: user?.username || 'Unknown',
      timestamp: new Date(),
      isPrivate: false,
    });
    
    sendRollToChat(result);
    
    setIsRolling(false);
    clearSelectedDice();
  };

  // Roll a single die with animation
  const rollSingleDie = async (sides: number, modifier: number = 0) => {
    setIsRolling(true);
    audioPlayer.playDiceRoll();
    
    // Animate
    await animateRoll();
    
    // Roll
    let result: RollResult;
    if (advantage === 'none') {
      const roll = rollDie(sides);
      result = {
        formula: `1d${sides}${modifier >= 0 ? '+' : ''}${modifier || ''}`,
        dice: [{
          dice: `1d${sides}`,
          rolls: [roll],
          total: roll,
          modifier: modifier,
        }],
        total: roll + modifier,
        isPrivate: false,
        isBlindGM: false,
        isSelfRoll: false,
      };
      
      // Play sound based on result
      if (sides === 20) {
        if (roll === 20) audioPlayer.playNatural20();
        else if (roll === 1) audioPlayer.playNatural1();
        else audioPlayer.playSuccess();
      }
      
    } else if (advantage === 'advantage') {
      const roll1 = rollDie(sides);
      const roll2 = rollDie(sides);
      const kept = Math.max(roll1, roll2);
      result = {
        formula: `1d${sides} (adv)`,
        dice: [{
          dice: `1d${sides}`,
          rolls: [roll1, roll2],
          total: kept,
          modifier: modifier,
        }],
        total: kept + modifier,
        isPrivate: false,
        isBlindGM: false,
        isSelfRoll: false,
      };
      
      // Play sound based on result
      if (sides === 20 && kept === 20) audioPlayer.playNatural20();
      else if (sides === 20 && kept === 1) audioPlayer.playNatural1();
      else audioPlayer.playSuccess();
      
    } else {
      const roll1 = rollDie(sides);
      const roll2 = rollDie(sides);
      const kept = Math.min(roll1, roll2);
      result = {
        formula: `1d${sides} (dis)`,
        dice: [{
          dice: `1d${sides}`,
          rolls: [roll1, roll2],
          total: kept,
          modifier: modifier,
        }],
        total: kept + modifier,
        isPrivate: false,
        isBlindGM: false,
        isSelfRoll: false,
      };
      
      // Play sound based on result
      if (sides === 20 && kept === 20) audioPlayer.playNatural20();
      else if (sides === 20 && kept === 1) audioPlayer.playNatural1();
      else audioPlayer.playSuccess();
    }
    
    setLastResult(result);
    addDiceRoll({
      id: `roll-${Date.now()}`,
      formula: result.formula,
      total: result.total,
      rolls: result.dice[0]?.rolls || [],
      username: user?.username || 'Unknown',
      timestamp: new Date(),
      isPrivate: false,
    });
    
    // Send to chat
    sendRollToChat(result);
    
    setIsRolling(false);
  };

  // Roll custom formula
  const rollCustom = async () => {
    if (!customFormula.trim()) return;
    
    setIsRolling(true);
    audioPlayer.playDiceRoll();
    await animateRoll();
    
    // Check for advantage/disadvantage with single d20 (allow modifiers like +5)
    const cleanFormula = customFormula.trim().toLowerCase().replace(/\s/g, '');
    // Match d20 or 1d20 with optional modifier (+/- followed by digits)
    const isSingleD20 = /^(1)?d20([+-]\d+)?$/.test(cleanFormula);
    
    // Extract modifier if present
    let modifier = 0;
    const modMatch = cleanFormula.match(/1d20([+-])(\d+)/);
    if (modMatch) {
      modifier = modMatch[1] === '+' ? parseInt(modMatch[2]) : -parseInt(modMatch[2]);
    }
    
    let result: RollResult | null;

    if (dice3dEnabled) {
      try {
        const authoritativeFormula = (advantage !== 'none' && isSingleD20)
          ? `1d20${modifier >= 0 ? '+' : ''}${modifier || ''} (${advantage === 'advantage' ? 'adv' : 'dis'})`
          : customFormula.trim();

        const authoritativeResult = await requestAuthoritativeRoll({
          formula: authoritativeFormula,
          source: 'dicePanel',
          visibility: 'public',
        });

        result = {
          formula: authoritativeResult.formula,
          dice: authoritativeResult.dice.map((die) => ({
            dice: die.dice,
            rolls: die.rolls,
            total: die.total,
            modifier: die.modifier,
          })),
          total: authoritativeResult.total,
          isPrivate: authoritativeResult.visibility === 'gm',
          isBlindGM: authoritativeResult.visibility === 'blind',
          isSelfRoll: authoritativeResult.visibility === 'self',
        };

        setLastResult(result);
        addDiceRoll({
          id: authoritativeResult.rollId,
          formula: authoritativeResult.formula,
          total: authoritativeResult.total,
          rolls: authoritativeResult.dice.flatMap((die) => die.rolls),
          username: authoritativeResult.username,
          timestamp: new Date(authoritativeResult.timestamp),
          isPrivate: authoritativeResult.visibility !== 'public',
        });

        const hasD20 = authoritativeResult.dice.some((d) => d.dice.toLowerCase().includes('d20'));
        if (hasD20) {
          const d20Rolls = authoritativeResult.dice.find((d) => d.dice.toLowerCase().includes('d20'))?.rolls || [];
          if (d20Rolls.includes(20)) audioPlayer.playNatural20();
          else if (d20Rolls.includes(1)) audioPlayer.playNatural1();
          else audioPlayer.playSuccess();
        } else {
          audioPlayer.playSuccess();
        }
      } catch (error) {
        console.error('Authoritative custom roll failed, using local fallback:', error);
        result = parseDiceFormula(customFormula);
      }

      setIsRolling(false);
      return;
    }
    
    if (advantage === 'none' || !isSingleD20) {
      // Normal roll or not a single d20 (advantage doesn't apply)
      result = parseDiceFormula(customFormula);
    } else if (advantage === 'advantage') {
      // Roll two d20, keep highest
      const roll1 = rollDie(20);
      const roll2 = rollDie(20);
      const kept = Math.max(roll1, roll2);
      const finalTotal = kept + modifier;
      result = {
        formula: `1d20${modifier >= 0 ? '+' : ''}${modifier || ''} (adv)`,
        dice: [{
          dice: `1d20`,
          rolls: [roll1, roll2],
          total: kept,
          modifier: modifier,
        }],
        total: finalTotal,
        isPrivate: false,
        isBlindGM: false,
        isSelfRoll: false,
      };
      
      // Play sound based on result
      if (kept === 20) audioPlayer.playNatural20();
      else if (kept === 1) audioPlayer.playNatural1();
      else audioPlayer.playSuccess();
    } else {
      // disadvantage - Roll two d20, keep lowest
      const roll1 = rollDie(20);
      const roll2 = rollDie(20);
      const kept = Math.min(roll1, roll2);
      const finalTotal = kept + modifier;
      result = {
        formula: `1d20${modifier >= 0 ? '+' : ''}${modifier || ''} (dis)`,
        dice: [{
          dice: `1d20`,
          rolls: [roll1, roll2],
          total: kept,
          modifier: modifier,
        }],
        total: finalTotal,
        isPrivate: false,
        isBlindGM: false,
        isSelfRoll: false,
      };
      
      // Play sound based on result
      if (kept === 20) audioPlayer.playNatural20();
      else if (kept === 1) audioPlayer.playNatural1();
      else audioPlayer.playSuccess();
    }
    
    if (result) {
      setLastResult(result);
      addDiceRoll({
        id: `roll-${Date.now()}`,
        formula: result.formula,
        total: result.total,
        rolls: result.dice.flatMap(d => d.rolls),
        username: user?.username || 'Unknown',
        timestamp: new Date(),
        isPrivate: result.isPrivate,
      });
      sendRollToChat(result);
      
      // Play sound based on total
      if (advantage !== 'none' && isSingleD20) {
        // Sound already played above for advantage/disadvantage
      } else {
        const hasD20 = result.dice.some(d => d.dice.toLowerCase().includes('d20'));
        if (hasD20) {
          const d20Rolls = result.dice.find(d => d.dice.toLowerCase().includes('d20'))?.rolls || [];
          if (d20Rolls.includes(20)) audioPlayer.playNatural20();
          else if (d20Rolls.includes(1)) audioPlayer.playNatural1();
          else audioPlayer.playSuccess();
        } else {
          audioPlayer.playSuccess();
        }
      }
    }
    
    setIsRolling(false);
  };

  // Unified roll function - handles both selected dice and custom formula
  const handleRoll = async () => {
    // If custom formula is shown and has value, roll custom
    if (showCustomFormula && customFormula.trim()) {
      await rollCustom();
    } else if (selectedDice.length > 0) {
      // Otherwise roll selected dice
      await rollSelectedDice();
    }
  };

  // Animate the roll
  const animateRoll = () => {
    return new Promise(resolve => {
      let count = 0;
      const interval = setInterval(() => {
        setLastResult({
          formula: '',
          dice: [],
          total: Math.floor(Math.random() * 20) + 1,
          isPrivate: false,
          isBlindGM: false,
          isSelfRoll: false,
        });
        count++;
        if (count > 10) {
          clearInterval(interval);
          resolve(null);
        }
      }, 50);
    });
  };

  // Send roll result to chat
  const sendRollToChat = (result: RollResult) => {
    const message = buildRollChatMessage(user?.username || 'Someone', result);
    socketService.sendChatMessage(message, result.isPrivate, result.isBlindGM, result.isSelfRoll);
  };

  // Get dice color based on result
  const getResultColor = (result: number, sides: number) => {
    if (sides === 20) {
      if (result === 20) return '#22c55e'; // Natural 20 - green
      if (result === 1) return '#ef4444';  // Natural 1 - red
    }
    return colorScheme?.accent || '#6b8aff';
  };

  // Check if it's specifically a natural 20 or natural 1
  const isNatural20 = lastResult && !isRolling && lastResult.dice.some(d => d.rolls.includes(20));
  const isNatural1 = lastResult && !isRolling && lastResult.dice.some(d => d.rolls.includes(1));

  // Render dice button with count indicator
  const renderDiceButton = (sides: number, label: string) => {
    const selected = selectedDice.find(d => d.sides === sides);
    const count = selected?.count || 0;
    
    return (
      <button
        key={sides}
        className="dice-btn"
        data-sides={sides}
        onClick={() => handleDiceSelect(sides)}
        onContextMenu={(e) => {
          e.preventDefault();
          handleDiceDeselect(sides);
        }}
        disabled={isRolling}
        style={{ 
          color: 'var(--accent)',
          position: 'relative',
        }}
      >
        <span className="dice-btn-label">{label}</span>
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              background: colorScheme?.accent || '#6b8aff',
              color: '#fff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  const handleClose = () => {
    setDiceRollerVisible(false);
  };

  // Build formula from selected dice for display
  const selectedFormula = selectedDice
    .map(d => `${d.count}d${d.sides}`)
    .join(' + ');

  if (!diceRollerVisible) return null;

  return (
    <div
      ref={containerRef}
      className="dice-roller"
      onClick={() => setPanelFocus('diceRoller')}
      style={{
        position: 'absolute',
        left: diceRollerPosition.x,
        top: diceRollerPosition.y,
        width: diceRollerSize.width,
        height: diceRollerSize.height,
        zIndex: panelFocus === 'diceRoller' ? 5000 : 100,
        background: colorScheme?.surface || '#1a1a2e',
        borderRadius: '16px',
        overflow: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header - draggable */}
      <div
        className="dice-roller-header"
        onMouseDown={handleDragStart}
        style={{ cursor: 'move' }}
      >
        <h2 className="dice-roller-title" style={{ margin: 0 }}>
          <Icon name="dice-d20" /> Dice Roller
        </h2>
        <button className="dice-roller-close" onClick={handleClose}>
          <Icon name="times" />
        </button>
      </div>

      {/* Advantage/Disadvantage */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          padding: '12px',
          borderBottom: `1px solid ${colorScheme?.accent || '#4a5568'}`,
        }}
      >
        {(['none', 'advantage', 'disadvantage'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setAdvantage(type)}
            style={{
              padding: '6px 12px',
              background: advantage === type ? '#4a5568' : 'transparent',
              border: `1px solid ${advantage === type ? '#fff' : '#4a5568'}`,
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              textTransform: 'capitalize',
              fontWeight: advantage === type ? 'bold' : 'normal',
              fontSize: '12px',
            }}
          >
            {type === 'none' ? 'Normal' : type}
          </button>
        ))}
      </div>

      {/* Dice Buttons Grid - 8 buttons: 6 dice + custom toggle + roll */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          padding: '16px',
        }}
      >
        {DICE_TYPES.slice(0, 6).map(sides => renderDiceButton(sides, `d${sides}`))}
        {/* Custom formula toggle button */}
        <button
          onClick={() => setShowCustomFormula(!showCustomFormula)}
          style={{
            padding: '12px',
            background: showCustomFormula ? (colorScheme?.accent || '#6b8aff') : '#2d3748',
            border: '2px solid ' + (showCustomFormula ? (colorScheme?.accent || '#6b8aff') : '#4a5568'),
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '18px' }}>✏️</span>
          <span>Custom</span>
        </button>
        {/* Unified Roll button */}
        <button
          onClick={handleRoll}
          disabled={isRolling || (selectedDice.length === 0 && !customFormula.trim())}
          style={{
            padding: '12px',
            background: (selectedDice.length > 0 || (showCustomFormula && customFormula.trim())) 
              ? (colorScheme?.accent || '#6b8aff') 
              : '#4a5568',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: (selectedDice.length > 0 || (showCustomFormula && customFormula.trim())) ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontSize: '14px',
            opacity: isRolling ? 0.7 : 1,
          }}
        >
          {isRolling ? '...' : 'ROLL'}
        </button>
      </div>

      {/* Custom Formula Input - hidden by default */}
      {showCustomFormula && (
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '0 16px 16px',
        }}
      >
        <input
          type="text"
          value={customFormula}
          onChange={(e) => setCustomFormula(e.target.value)}
          placeholder="Custom roll (e.g., 2d6+3)"
          onKeyDown={(e) => e.key === 'Enter' && handleRoll()}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#0f0f1a',
            border: `1px solid ${colorScheme?.accent || '#4a5568'}`,
            borderRadius: '8px',
            color: '#fff',
            fontSize: '16px',
          }}
        />
      </div>
      )}

      {/* Quick clear button when dice are selected */}
      {selectedDice.length > 0 && !showCustomFormula && (
        <div style={{ padding: '0 16px 8px', textAlign: 'center' }}>
          <button
            onClick={clearSelectedDice}
            style={{
              padding: '6px 16px',
              background: 'transparent',
              border: '1px solid #4a5568',
              borderRadius: '4px',
              color: '#888',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear ({selectedFormula})
          </button>
        </div>
      )}

      {/* Last Result Display */}
      {lastResult && (
        <div
          ref={resultRef}
          style={{
            background: '#0f0f1a',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            margin: '0 16px 16px',
            border: `2px solid ${getResultColor(lastResult.total, 20)}`,
          }}
        >
          <div style={{ color: '#888', fontSize: '14px', marginBottom: '8px' }}>
            {lastResult.formula || 'Rolling...'}
          </div>
          <div
            className={isRolling ? 'dice-result-rolling' : ''}
            style={{
              fontSize: '48px',
              fontWeight: 'bold',
              color: isNatural20 ? '#22c55e' : isNatural1 ? '#ef4444' : getResultColor(lastResult.total, 20),
              textShadow: `0 0 20px ${isNatural20 ? '#22c55e' : isNatural1 ? '#ef4444' : getResultColor(lastResult.total, 20)}40`,
            }}
          >
            {isRolling ? '...' : lastResult.total}
          </div>
          {lastResult.dice.length > 0 && !isRolling && (
            <div style={{ color: '#888', fontSize: '12px', marginTop: '8px' }}>
              {lastResult.dice.map((d, i) => (
                <span key={i}>
                  {d.rolls.length > 1 && `(${d.rolls.join(', ')})`}
                  {d.modifier !== 0 && ` ${d.modifier > 0 ? '+' : ''}${d.modifier}`}
                  {i < lastResult.dice.length - 1 && ' + '}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Roll Presets */}
      <div style={{ padding: '0 16px 16px' }}>
        <h4 style={{ color: '#888', margin: '0 0 12px 0', fontSize: '12px', textTransform: 'uppercase' }}>
          Quick Rolls
        </h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {[
            { label: 'd20+5', formula: '1d20+5' },
            { label: 'd20-1', formula: '1d20-1' },
            { label: '2d6', formula: '2d6' },
            { label: '2d6+3', formula: '2d6+3' },
            { label: '4d6', formula: '4d6' },
            { label: '8d6', formula: '8d6' },
            { label: '1d8+3', formula: '1d8+3' },
            { label: '1d10+2', formula: '1d10+2' },
          ].map(({ label, formula }) => (
            <button
              key={formula}
              onClick={() => {
                setCustomFormula(formula);
                setTimeout(() => rollCustom(), 0);
              }}
              disabled={isRolling}
              style={{
                padding: '6px 12px',
                background: '#2a2a3a',
                border: '1px solid #4a5568',
                borderRadius: '4px',
                color: '#fff',
                cursor: isRolling ? 'not-allowed' : 'pointer',
                fontSize: '12px',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Roll History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        style={{
          width: 'calc(100% - 32px)',
          margin: '0 16px 16px',
          padding: '12px',
          background: 'transparent',
          border: `1px solid ${colorScheme?.accent || '#4a5568'}`,
          borderRadius: '8px',
          color: '#888',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Icon name={showHistory ? 'chevron-up' : 'chevron-down'} />
        {showHistory ? 'Hide' : 'Show'} Roll History ({diceRollHistory.length})
      </button>

      {/* Roll History */}
      {showHistory && (
        <div
          style={{
            margin: '0 16px 16px',
            maxHeight: '200px',
            overflow: 'auto',
            background: '#0f0f1a',
            borderRadius: '8px',
            padding: '8px',
          }}
        >
          {diceRollHistory.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
              No rolls yet
            </div>
          ) : (
            [...diceRollHistory].reverse().map((roll, index) => (
              <div
                key={roll.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px',
                  borderBottom: index < diceRollHistory.length - 1 ? '1px solid #2a2a3a' : 'none',
                }}
              >
                <div>
                  <span style={{ color: '#888', fontSize: '12px' }}>{roll.username}</span>
                  <span style={{ color: '#fff', marginLeft: '8px', fontSize: '14px' }}>{roll.formula}</span>
                </div>
                <span style={{ color: colorScheme?.accent || '#6b8aff', fontWeight: 'bold', fontSize: '16px' }}>
                  {roll.total}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Resize handle */}
      <div
        ref={resizeRef}
        className="dice-roller-resize"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}
