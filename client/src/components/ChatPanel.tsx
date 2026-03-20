import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { Icon } from './Icon';
import { parseDiceFormula, rollDie, type RollResult } from '../utils/diceParser';
import { buildRollChatMessage, parseChatCommandRoll, parseDiceRollMessage, type ChatRollCardData } from '../utils/chatRolls';
import { audioPlayer } from '../utils/audioPlayer';
import { requestAuthoritativeRoll } from '../dice/rollOrchestrator';
import type { ChatMessage, SessionPlayer, DiceRollVisibility } from '../../../shared/src/index';

// Dice types supported in the chat bar - add new dice types here
// Also add corresponding SVG file to /public/dice-icons/d{N}.svg
const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;

// Generate CSS for dice icons automatically based on DICE_TYPES
function generateDiceIconCSS(): string {
  return DICE_TYPES.map(sides => `
.chat-dice-btn[data-sides="${sides}"]::before {
  mask-image: url('/dice-icons/d${sides}.svg');
  -webkit-mask-image: url('/dice-icons/d${sides}.svg');
}`).join('');
}

// PlayerCard Component - follows the spec
function PlayerCard({ 
  message, 
  avatarUrl, 
  isDiceRoll, 
  diceInfo,
  playerRole,
}: { 
  message: ChatMessage;
  avatarUrl: string | null;
  isDiceRoll: boolean;
  diceInfo: ChatRollCardData | null;
  playerRole: string;
}) {
  const { chatCardsCollapsedByDefault } = useGameStore();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(chatCardsCollapsedByDefault);
  
  const formatTime = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isDiceRoll && diceInfo) {
    const badges = [
      diceInfo.visibility !== 'public' ? diceInfo.visibility.toUpperCase() : null,
      diceInfo.isAdvantage ? 'ADV' : null,
      diceInfo.isDisadvantage ? 'DIS' : null,
      diceInfo.modifier !== 0 ? `${diceInfo.modifier > 0 ? '+' : ''}${diceInfo.modifier}` : null,
    ].filter(Boolean) as string[];

    // Dice Roll Card - Full spec implementation
    return (
      <div className="chat-message dice-roll" onClick={(e) => e.stopPropagation()}>
        {/* Header - always visible */}
        <div className="chat-message-header">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              className="chat-message-avatar" 
              alt={message.username}
            />
          ) : (
            <div className="chat-message-avatar-placeholder">
              {message.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="chat-message-identity">
            <span className="chat-message-player-name">{message.username}</span>
            <span className="chat-message-player-role">{playerRole}</span>
          </div>
          <span className="chat-message-timestamp">{formatTime(message.timestamp)}</span>
        </div>

        {/* MainValue - shown in collapsed state too */}
        <div
          className="chat-message-main-value"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setCollapsed(!collapsed);
            }
          }}
          aria-label={collapsed ? 'Expand roll card' : 'Collapse roll card'}
        >
          <span className="chat-message-main-value-text">{diceInfo.total}</span>
        </div>

        {!collapsed && (
          <>
            {/* ResourceRow - Individual dice results */}
            <div className="chat-message-resource-row">
              <div className="chat-message-resource-left">
                {diceInfo.imageUrl ? (
                  <img src={diceInfo.imageUrl} className="chat-message-resource-icon chat-message-resource-image" alt={diceInfo.resultLabel || 'Rolltable result'} />
                ) : (
                  <Icon name="dice" className="chat-message-resource-icon" />
                )}
                <span className="chat-message-resource-value">
                  {diceInfo.tableName
                    ? `${diceInfo.tableName}: ${diceInfo.resultLabel || diceInfo.summaryLabel}${diceInfo.detailText ? ` • ${diceInfo.detailText}` : ''}`
                    : diceInfo.dice.map((die) => `${die.dice}: ${die.rolls.length > 0 ? die.rolls.join(', ') : '—'}`).join(' • ')}
                </span>
              </div>
              <div className="chat-message-badges">
                {badges.map((badge) => (
                  <span key={badge} className="chat-message-badge">{badge}</span>
                ))}
              </div>
            </div>

            {/* ControlRow - Expand button */}
            <div className="chat-message-control-row">
              <span className="chat-message-control-value">
                {diceInfo.summaryLabel}
              </span>
              <button 
                className={`chat-message-expand-btn ${expanded ? 'expanded' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <Icon name="chevron-down" />
              </button>
            </div>

            {/* Expanded Content */}
            {expanded && (
              <div className="chat-message-expanded-content">
                <div className="chat-message-formula-row">
                  <span>Formula</span>
                  <strong>{diceInfo.formula}</strong>
                </div>
                <div className="chat-message-breakdown">
                  {diceInfo.dice.map((dice, idx) => (
                    <div key={`${dice.dice}-${idx}`} className="chat-message-detail-row">
                      <span className="chat-message-detail-label">{dice.dice}</span>
                      <span className="dice-detail">
                        {dice.rolls.length > 0 ? dice.rolls.map((roll, rollIdx) => {
                          const isNat20 = dice.dice.toLowerCase().includes('d20') && roll === 20;
                          const isNat1 = dice.dice.toLowerCase().includes('d20') && roll === 1;
                          let className = 'dice-result';
                        if (isNat20) className += ' nat20';
                        else if (isNat1) className += ' nat1';
                        return (
                          <span key={rollIdx} className={className}>{roll}</span>
                        );
                        }) : <span className="dice-result">—</span>}
                      </span>
                      <span className="chat-message-detail-total">{dice.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Regular message - simpler layout
  return (
    <div className="chat-message" onClick={(e) => e.stopPropagation()}>
      {avatarUrl ? (
        <img 
          src={avatarUrl} 
          className="chat-message-avatar" 
          alt={message.username}
        />
      ) : (
        <div className="chat-message-avatar-placeholder">
          {message.username.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="chat-message-identity">
        <div className="chat-message-header">
          <div className="chat-message-simple-meta">
            <span className="chat-message-player-name">{message.username}</span>
            <span className="chat-message-player-role">{playerRole}</span>
          </div>
          <span className="chat-message-timestamp">{formatTime(message.timestamp)}</span>
        </div>
        <div className="chat-message-simple-content">
          <div className="chat-message-text">{message.text}</div>
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { 
    chatMessages, 
    session, 
    chatVisible, 
    toggleChat, 
    panelFocus, 
    setPanelFocus,
    user,
    addDiceRoll,
    colorScheme,
    players,
    tokens,
    userProfileImage,
    playerProfileImages,
    setPlayerProfileImage,
    setChatMessages,
    dice3dEnabled,
  } = useGameStore();
  const [message, setMessage] = useState('');
  const [diceModifier, setDiceModifier] = useState(0);
  const [selectedDice, setSelectedDice] = useState<number[]>([]);
  const [advantage, setAdvantage] = useState<'none' | 'adv' | 'dis'>('none');
  const [rollVisibility, setRollVisibility] = useState<'public' | 'gm' | 'blind' | 'self'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getPlayerRoleLabel = (messageUserId: string): string => {
    const player = players.find((entry: SessionPlayer) => entry.userId === messageUserId);
    if (!player) {
      return 'PLAYER';
    }

    return player.role === 'gm' ? 'GM' : 'PLAYER';
  };

  // Inject dice icon CSS dynamically based on DICE_TYPES
  useEffect(() => {
    const styleId = 'dice-icon-styles';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = generateDiceIconCSS();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Load profile image from localStorage on mount (runs once when user is available)
  useEffect(() => {
    if (user?.id) {
      // Load current user's own image
      const savedImage = localStorage.getItem('vtt_profileImage');
      if (savedImage) {
        setPlayerProfileImage(user.id, savedImage);
      }
      
      // Load other players' images
      const storedOthers = JSON.parse(localStorage.getItem('vtt_playerProfileImages') || '{}');
      Object.entries(storedOthers).forEach(([userId, imageUrl]) => {
        setPlayerProfileImage(userId, imageUrl as string);
      });
    }
  }, [user?.id, session?.gmId]);

  // Sync current user's profile picture to playerProfileImages
  useEffect(() => {
    if (user?.id && userProfileImage) {
      setPlayerProfileImage(user.id, userProfileImage);
    }
  }, [user?.id, userProfileImage, setPlayerProfileImage]);

  // Get avatar URL for a chat message based on user role and tokens
  const getAvatarForMessage = (messageUserId: string): string | null => {
    const profileImage = playerProfileImages[messageUserId];
    if (profileImage) {
      return profileImage;
    }

    // Find player in session
    const player = players.find(p => p.userId === messageUserId);
    if (!player) return null;

    // If player has controlled tokens, use first token's image
    if (player.controlledTokens && player.controlledTokens.length > 0) {
      const token = tokens.find(t => t.id === player.controlledTokens[0]);
      if (token?.imageUrl) return token.imageUrl;
    }

    return null;
  };

  const mapVisibility = (visibility: 'public' | 'gm' | 'blind' | 'self'): DiceRollVisibility => visibility;

  const extractRollFormulaFromCommand = (input: string): string | null => {
    const trimmed = input.trim();
    const match = trimmed.match(/^\/(r|roll|pr|publicroll|gmr|gmroll|broll|blindroll|sr|selfroll)\s+(.+)$/i);
    if (!match) return null;
    return match[2].trim();
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) return;
    if (!message.trim() || !session) return;
    
    setIsSubmitting(true);
    
    const trimmedMessage = message.trim();
    
    // Convert rollVisibility to server flags
    const isPrivate = rollVisibility === 'gm';
    const isBlindGM = rollVisibility === 'blind';
    const isSelfRoll = rollVisibility === 'self';
    
    const rollResult = parseChatCommandRoll(trimmedMessage);

    if (dice3dEnabled) {
      const formulaFromCommand = extractRollFormulaFromCommand(trimmedMessage);
      if (formulaFromCommand) {
        audioPlayer.playDiceRoll();
        requestAuthoritativeRoll({
          formula: formulaFromCommand,
          source: 'chat',
          visibility: mapVisibility(rollVisibility),
        })
          .then((result) => {
            addDiceRoll({
              id: result.rollId,
              formula: result.formula,
              total: result.total,
              rolls: result.dice.flatMap((die) => die.rolls),
              username: result.username,
              timestamp: new Date(result.timestamp),
              isPrivate: result.visibility !== 'public',
            });
          })
          .catch((error) => {
            console.error('Authoritative chat roll failed, falling back to legacy local roll:', error);
            if (rollResult) {
              socketService.sendChatMessage(
                buildRollChatMessage(user?.username || 'Someone', rollResult),
                isPrivate || rollResult.isPrivate,
                isBlindGM,
                isSelfRoll
              );
              addDiceRoll({
                id: `roll-${Date.now()}`,
                formula: rollResult.formula,
                total: rollResult.total,
                rolls: rollResult.dice.flatMap(d => d.rolls),
                username: user?.username || 'Unknown',
                timestamp: new Date(),
                isPrivate: isPrivate || rollResult.isPrivate,
              });
            }
          })
          .finally(() => {
            setMessage('');
            setIsSubmitting(false);
          });

        return;
      }
    }

    if (rollResult) {
      audioPlayer.playDiceRoll();
      socketService.sendChatMessage(
        buildRollChatMessage(user?.username || 'Someone', rollResult),
        isPrivate || rollResult.isPrivate,
        isBlindGM,
        isSelfRoll
      );
      addDiceRoll({
        id: `roll-${Date.now()}`,
        formula: rollResult.formula,
        total: rollResult.total,
        rolls: rollResult.dice.flatMap(d => d.rolls),
        username: user?.username || 'Unknown',
        timestamp: new Date(),
        isPrivate: isPrivate || rollResult.isPrivate,
      });
    } else {
      socketService.sendChatMessage(trimmedMessage, isPrivate, isBlindGM, isSelfRoll);
    }
    
    setMessage('');
    setIsSubmitting(false);
  };

  // Handle adding a die to the selection (click)
  const handleAddDie = (sides: number) => {
    setSelectedDice([...selectedDice, sides]);
  };

  // Handle removing a die from the selection (right-click)
  const handleRemoveDie = (sides: number) => {
    const index = selectedDice.indexOf(sides);
    if (index > -1) {
      setSelectedDice(selectedDice.filter((_, i) => i !== index));
    }
  };

  // Handle rolling selected dice
  const handleRollSelectedDice = () => {
    if (selectedDice.length === 0) return;
    
    // Build formula from selected dice
    const diceCounts: Record<number, number> = {};
    selectedDice.forEach(sides => {
      diceCounts[sides] = (diceCounts[sides] || 0) + 1;
    });
    
    const formulaParts: string[] = [];
    Object.entries(diceCounts).sort(([a], [b]) => Number(a) - Number(b)).forEach(([sides, count]) => {
      formulaParts.push(`${count}d${sides}`);
    });
    
    // Add advantage/disadvantage suffix
    const advSuffix = advantage === 'adv' ? ' (adv)' : advantage === 'dis' ? ' (dis)' : '';
    
    const formula = diceModifier !== 0 
      ? formulaParts.join('+') + (diceModifier >= 0 ? '+' : '') + diceModifier + advSuffix
      : formulaParts.join('+') + advSuffix;

    if (dice3dEnabled) {
      audioPlayer.playDiceRoll();
      requestAuthoritativeRoll({
        formula,
        source: 'chat',
        visibility: mapVisibility(rollVisibility),
      })
        .then((result) => {
          addDiceRoll({
            id: result.rollId,
            formula: result.formula,
            total: result.total,
            rolls: result.dice.flatMap((die) => die.rolls),
            username: result.username,
            timestamp: new Date(result.timestamp),
            isPrivate: result.visibility !== 'public',
          });
          setSelectedDice([]);
          setAdvantage('none');
        })
        .catch((error) => {
          console.error('Authoritative quick roll failed, falling back to legacy local roll:', error);
        });
      return;
    }
    
    // Check if this is a single d20 roll with advantage/disadvantage
    const isSingleD20 = formulaParts.length === 1 && formulaParts[0] === '1d20';
    const diceModifierValue = diceModifier;
    
    let result: RollResult | null;
    
    if (isSingleD20 && advantage !== 'none' && diceModifierValue === 0) {
      // Roll with advantage or disadvantage
      const roll1 = rollDie(20);
      const roll2 = rollDie(20);
      const kept = advantage === 'adv' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
      
      result = {
        formula: `1d20${advSuffix}`,
        dice: [{
          dice: '1d20',
          rolls: [roll1, roll2],
          total: kept,
          modifier: 0,
        }],
        total: kept,
        isPrivate: rollVisibility !== 'public',
        isBlindGM: rollVisibility === 'blind',
        isSelfRoll: rollVisibility === 'self',
      };
    } else {
      // Normal roll (or with modifier)
      result = parseDiceFormula(formula);
      if (result) {
        result.isPrivate = rollVisibility !== 'public';
        result.isBlindGM = rollVisibility === 'blind';
        result.isSelfRoll = rollVisibility === 'self';
      }
    }
    
    if (result) {
      audioPlayer.playDiceRoll();
      socketService.sendChatMessage(
        buildRollChatMessage(user?.username || 'Someone', result),
        result.isPrivate,
        result.isBlindGM,
        result.isSelfRoll
      );
      
      addDiceRoll({
        id: `roll-${Date.now()}`,
        formula: result.formula,
        total: result.total,
        rolls: result.dice.flatMap(d => d.rolls),
        username: user?.username || 'Unknown',
        timestamp: new Date(),
        isPrivate: result.isPrivate,
      });
      
      // Clear selection after rolling
      setSelectedDice([]);
      setAdvantage('none');
    }
  };

  // Clear selected dice
  const handleClearDice = () => {
    setSelectedDice([]);
    setAdvantage('none');
    setDiceModifier(0);
  };

  // Clear all chat messages
  const handleClearChat = () => {
    setChatMessages([]);
  };

  // Check if message contains dice roll result (for styling)
  const isDiceRollMessage = (text: string) => {
    return text.startsWith('🎲');
  };

  if (!session) return null;

  return (
    <div 
      className={`chat-panel ${chatVisible ? '' : 'chat-hidden'}`}
      onClick={(e) => {
        // Only set focus, don't let click propagate
        e.stopPropagation();
        setPanelFocus('chat');
      }}
      style={{ '--chat-z-index': panelFocus === 'chat' ? 5000 : 50 } as React.CSSProperties}
    >
      <div className="chat-header" onClick={(e) => e.stopPropagation()}>
        <span>Chat</span>
        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
          /r /roll /gmr /broll /sr
        </span>
      </div>
      
      <div className="chat-messages">
        {chatMessages.map((msg) => {
          const avatarUrl = getAvatarForMessage(msg.userId);
          const isDiceRoll = isDiceRollMessage(msg.text);
          const diceInfo = isDiceRoll ? parseDiceRollMessage(msg.text) : null;
          
          return (
            <PlayerCard
              key={msg.id}
              message={msg}
              avatarUrl={avatarUrl}
              isDiceRoll={isDiceRoll}
              diceInfo={diceInfo}
              playerRole={getPlayerRoleLabel(msg.userId)}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Delete All Messages Button - Above Dice Tray */}
      <div className="chat-delete-container" onClick={(e) => e.stopPropagation()}>
        <button 
          className="chat-delete-btn" 
          onClick={handleClearChat}
          title="Delete all messages"
        >
          <Icon name="trash" />
        </button>
      </div>

      {/* Compact Dice Roller */}
      <div className="chat-dice-roller" onClick={(e) => e.stopPropagation()}>
        {/* Row 1: Dice buttons */}
        <div className="chat-dice-row">
          {DICE_TYPES.map(sides => {
            const count = selectedDice.filter(d => d === sides).length;
            return (
              <button
                key={sides}
                className={`chat-dice-btn ${count > 0 ? 'selected' : ''}`}
                data-sides={sides}
                onClick={() => handleAddDie(sides)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRemoveDie(sides);
                }}
                title="Click to add, right-click to remove"
              >
                {count > 0 && (
                  <span className="chat-dice-count">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        
        {/* Row 2: Modifiers and Roll */}
        <div className="chat-modifier-row">
          <div className="chat-modifier-group">
            <button
              className="chat-modifier-btn"
              onClick={() => setDiceModifier(d => d - 1)}
            >
              -
            </button>
            <span className="chat-modifier-value">
              {diceModifier >= 0 ? `+${diceModifier}` : diceModifier}
            </span>
            <button
              className="chat-modifier-btn"
              onClick={() => setDiceModifier(d => d + 1)}
            >
              +
            </button>
          </div>
          
          <div className="chat-adv-dis-group">
            <button
              className={`chat-adv-btn ${advantage === 'adv' ? 'active' : ''}`}
              onClick={() => setAdvantage(a => a === 'adv' ? 'none' : 'adv')}
              title="Advantage"
            >
              ADV
            </button>
            
            <button
              className={`chat-adv-btn ${advantage === 'dis' ? 'active' : ''}`}
              onClick={() => setAdvantage(a => a === 'dis' ? 'none' : 'dis')}
              title="Disadvantage"
            >
              DIS
            </button>
          </div>
          
          {/* Roll button */}
          <button
            className="chat-roll-btn"
            onClick={handleRollSelectedDice}
            disabled={selectedDice.length === 0}
            title="Roll dice"
          >
            ROLL
          </button>
        </div>
      </div>

      {/* Roll Visibility Selector */}
      <div className="chat-visibility-row" onClick={(e) => e.stopPropagation()}>
        <label className="chat-visibility-label">Roll to:</label>
        <select
          className="chat-visibility-select"
          value={rollVisibility}
          onChange={(e) => setRollVisibility(e.target.value as 'public' | 'gm' | 'blind' | 'self')}
        >
          <option value="public">Everyone</option>
          <option value="gm">GM Only</option>
          <option value="blind">Blind GM</option>
          <option value="self">Self Only</option>
        </select>
      </div>

      <form className="chat-input" onSubmit={handleSend} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message or /roll 2d6+3"
          maxLength={500}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
