import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { socketService } from '../services/socket';
import { Icon } from './Icon';
import { parseDiceFormula } from '../utils/diceParser';
import { buildRollChatMessage } from '../utils/chatRolls';
import { audioPlayer } from '../utils/audioPlayer';
import { requestAuthoritativeRoll } from '../dice/rollOrchestrator';
import { dispatchCommandMacro } from '../macros/dispatchCommandMacro';
import type { DiceRollVisibility } from '../../../shared/src/index';
import type { RollExecutionResult, RollTable } from '../macros/types';

interface Macro {
  id: string;
  name: string;
  formula: string;
  icon?: string;
  color?: string;
  type: 'roll' | 'chat' | 'command';
  isGlobal: boolean; // Available to all players or just GM
}

// Default macros to get started
const DEFAULT_MACROS: Macro[] = [
  { id: 'init', name: 'Initiative', formula: '1d20+3', icon: 'bolt', color: '#f59e0b', type: 'roll', isGlobal: true },
  { id: 'attack', name: 'Attack', formula: '1d20+7', icon: 'hand-fist', color: '#ef4444', type: 'roll', isGlobal: true },
  { id: 'damage', name: 'Damage', formula: '1d8+3', icon: 'fire', color: '#f97316', type: 'roll', isGlobal: true },
  { id: 'save', name: 'Save DC', formula: '1d20+5', icon: 'shield', color: '#3b82f6', type: 'roll', isGlobal: true },
  { id: 'perception', name: 'Perception', formula: '1d20+6', icon: 'eye', color: '#10b981', type: 'roll', isGlobal: true },
  {
    id: 'scene-storm',
    name: 'Storm Ambush',
    icon: 'cloud-rain',
    color: '#4f46e5',
    type: 'command',
    isGlobal: false,
    formula: JSON.stringify({
      command: 'scene',
      title: 'Storm Ambush',
      narration: 'Lightning tears across the sky as shapes rush from the tree line.',
      weather: { enabled: true, type: 'blizzard', intensity: 70, speed: 65, direction: 260 },
    }),
  },
  {
    id: 'table-omens',
    name: 'Bad Omen',
    icon: 'dice-d20',
    color: '#7c3aed',
    type: 'command',
    isGlobal: true,
    formula: JSON.stringify({
      command: 'randomTable',
      title: 'Dark Omen',
      entries: [
        { label: 'A raven drops a blood-red feather', weight: 3 },
        { label: 'A mirror fogs with an unknown name', weight: 2 },
        { label: 'Distant bells ring once, then silence', weight: 1 },
      ],
    }),
  },
  {
    id: 'combo-volley',
    name: 'Opening Volley',
    icon: 'crosshairs',
    color: '#dc2626',
    type: 'command',
    isGlobal: true,
    formula: JSON.stringify({
      command: 'rollSequence',
      title: 'Opening Volley',
      summarize: true,
      steps: [
        { label: 'Attack', formula: '1d20+7' },
        { label: 'Damage', formula: '1d8+4' },
      ],
    }),
  },
  {
    id: 'announce-ready',
    name: 'Battle Cry',
    icon: 'bullhorn',
    color: '#0ea5e9',
    type: 'command',
    isGlobal: true,
    formula: JSON.stringify({
      command: 'announce',
      title: 'Rally',
      tone: 'success',
      message: 'Steel up! Roll initiative and take your positions.',
    }),
  },
];

export function MacrosPanel() {
  const {
    macrosVisible,
    setMacrosVisible,
    macrosPanelPosition,
    setMacrosPanelPosition,
    macrosPanelSize,
    setMacrosPanelSize,
    isGM,
    user,
    addDiceRoll,
    colorScheme,
    panelFocus,
    setPanelFocus,
    dice3dEnabled,
    rollTables,
  } = useGameStore();

  const [macros, setMacros] = useState<Macro[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [showNewMacroForm, setShowNewMacroForm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    if (!isGM) return;
    // Prevent text selection during drag
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - macrosPanelPosition.x,
      y: e.clientY - macrosPanelPosition.y,
    });
  };

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMacrosPanelPosition({
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
  }, [isDragging, dragOffset, setMacrosPanelPosition]);

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isGM) return;
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
      const newWidth = Math.max(200, e.clientX - macrosPanelPosition.x);
      const newHeight = Math.max(200, e.clientY - macrosPanelPosition.y);
      setMacrosPanelSize({
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
  }, [isResizing, macrosPanelPosition, setMacrosPanelSize]);

  // Load macros from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vtt_macros');
    if (saved) {
      try {
        setMacros(JSON.parse(saved));
      } catch (e) {
        setMacros(DEFAULT_MACROS);
      }
    } else {
      setMacros(DEFAULT_MACROS);
    }
  }, []);

  // Migrate legacy inline randomTable macros to tableId-based rolltables
  useEffect(() => {
    if (macros.length === 0) return;

    let changed = false;
    const migrated = macros.map((macro) => {
      if (macro.type !== 'command') return macro;

      try {
        const parsed = JSON.parse(macro.formula);
        if (parsed?.command !== 'randomTable') return macro;
        if (typeof parsed.tableId === 'string' && parsed.tableId.trim().length > 0) return macro;
        if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return macro;

        const tableId = `rt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const table: RollTable = {
          id: tableId,
          name: parsed.title || `${macro.name} Table`,
          isGlobal: macro.isGlobal,
          rows: parsed.entries.map((row: any, index: number) => ({
            id: `row-${tableId}-${index}`,
            label: typeof row?.label === 'string' ? row.label : `Entry ${index + 1}`,
            detail: typeof row?.detail === 'string' ? row.detail : undefined,
            weight: typeof row?.weight === 'number' && row.weight > 0 ? row.weight : 1,
          })),
        };

        useGameStore.getState().addRollTable(table);

        const nextPayload = {
          command: 'randomTable',
          title: parsed.title || macro.name,
          tableId,
          visibility: parsed.visibility,
        };

        changed = true;
        return {
          ...macro,
          formula: JSON.stringify(nextPayload),
        };
      } catch {
        return macro;
      }
    });

    if (changed) {
      saveMacros(migrated);
    }
  }, [macros]);

  // Save macros to localStorage
  const saveMacros = (newMacros: Macro[]) => {
    setMacros(newMacros);
    localStorage.setItem('vtt_macros', JSON.stringify(newMacros));
  };

  // Run a macro
  const runMacro = async (macro: Macro) => {
    audioPlayer.playDiceRoll();

    const sendVisibilityChat = (text: string, visibility?: DiceRollVisibility) => {
      const isBlindGM = visibility === 'blind';
      const isSelfRoll = visibility === 'self';
      const isPrivate = visibility === 'gm' || isBlindGM || isSelfRoll;
      socketService.sendChatMessage(text, isPrivate, isBlindGM, isSelfRoll);
    };

    const rollFormula = async (formula: string, visibility: DiceRollVisibility = 'public'): Promise<RollExecutionResult | null> => {
      if (dice3dEnabled) {
        try {
          const result = await requestAuthoritativeRoll({
            formula,
            source: 'macro',
            visibility,
          });

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
            const d20Rolls = result.dice.find((d) => d.dice.toLowerCase().includes('d20'))?.rolls || [];
            if (d20Rolls.includes(20)) audioPlayer.playNatural20();
            else if (d20Rolls.includes(1)) audioPlayer.playNatural1();
            else audioPlayer.playSuccess();
          } else {
            audioPlayer.playSuccess();
          }

          return { formula: result.formula, total: result.total };
        } catch (error) {
          console.error('Authoritative macro roll failed, using local fallback:', error);
        }
      }

      const result = parseDiceFormula(formula);
      if (!result) return null;

      const message = buildRollChatMessage(user?.username || 'Someone', result);
      socketService.sendChatMessage(message, result.isPrivate, result.isBlindGM, result.isSelfRoll);

      addDiceRoll({
        id: `roll-${Date.now()}`,
        formula: result.formula,
        total: result.total,
        rolls: result.dice.flatMap(d => d.rolls),
        username: user?.username || 'Unknown',
        timestamp: new Date(),
        isPrivate: result.isPrivate,
      });

      const hasD20 = result.dice.some(d => d.dice.toLowerCase().includes('d20'));
      if (hasD20) {
        const d20Rolls = result.dice.find(d => d.dice.toLowerCase().includes('d20'))?.rolls || [];
        if (d20Rolls.includes(20)) audioPlayer.playNatural20();
        else if (d20Rolls.includes(1)) audioPlayer.playNatural1();
        else audioPlayer.playSuccess();
      } else {
        audioPlayer.playSuccess();
      }

      return { formula: result.formula, total: result.total };
    };
    
    if (macro.type === 'roll') {
      await rollFormula(macro.formula, 'public');
    } else if (macro.type === 'chat') {
      socketService.sendChatMessage(macro.formula);
    } else if (macro.type === 'command') {
      const dispatch = await dispatchCommandMacro(macro.formula, {
        isGM,
        username: user?.username || 'Someone',
        sendChatMessage: (text, options) => sendVisibilityChat(text, options?.visibility),
        rollFormula,
        weather: {
          setType: (value) => {
            if (value) useGameStore.getState().setWeatherType(value);
          },
          setIntensity: (value) => useGameStore.getState().setWeatherIntensity(value),
          setSpeed: (value) => useGameStore.getState().setWeatherSpeed(value),
          setDirection: (value) => useGameStore.getState().setWeatherDirection(value),
          setVisible: (visible) => {
            const state = useGameStore.getState();
            if (state.weatherVisible !== visible) state.toggleWeather();
          },
        },
        time: {
          setGameTime: (seconds) => useGameStore.getState().setGameTime(seconds),
          advanceTime: (delta) => useGameStore.getState().advanceTime(delta),
        },
        getRollTableById: (id) => rollTables.find((table) => table.id === id) || null,
      });

      if (!dispatch.ok && dispatch.error) {
        socketService.sendChatMessage(`Macro command failed: ${dispatch.error}`);
      }
    }
  };

  // Add new macro
  const addMacro = (macro: Omit<Macro, 'id'>) => {
    const newMacro: Macro = {
      ...macro,
      id: `macro-${Date.now()}`,
    };
    saveMacros([...macros, newMacro]);
    setShowNewMacroForm(false);
  };

  // Delete macro
  const deleteMacro = (id: string) => {
    saveMacros(macros.filter(m => m.id !== id));
  };

  // Get available macros (global + GM-only if GM)
  const availableMacros = macros.filter(m => m.isGlobal || isGM);

  const handleClose = () => {
    setMacrosVisible(false);
  };


  if (!macrosVisible) return null;

  return (
    <div
      ref={containerRef}
      className="macros-panel"
      onClick={() => setPanelFocus('macrosPanel')}
      style={{
        position: 'absolute',
        left: macrosPanelPosition.x,
        top: macrosPanelPosition.y,
        width: macrosPanelSize.width,
        height: macrosPanelSize.height,
        zIndex: panelFocus === 'macrosPanel' ? 5000 : 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header - draggable */}
      <div
        className="macros-panel-header"
        onMouseDown={handleDragStart}
        style={{ cursor: isGM ? 'move' : 'default' }}
      >
        <h3 className="macros-panel-title" style={{ margin: 0 }}>
          <Icon name="bolt" /> Macros
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isGM && (
            <button
              onClick={() => setShowNewMacroForm(!showNewMacroForm)}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              + New
            </button>
          )}
          <button className="macros-panel-close" onClick={handleClose}>
            <Icon name="times" />
          </button>
        </div>
      </div>

      {/* New Macro Form */}
      {showNewMacroForm && isGM && (
        <NewMacroForm
          onAdd={addMacro}
          onCancel={() => setShowNewMacroForm(false)}
          colorScheme={colorScheme}
          rollTables={rollTables}
        />
      )}

      {/* Macros Grid */}
      <div
        style={{
          padding: '12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        {availableMacros.map(macro => (
          <button
            key={macro.id}
            onClick={() => runMacro(macro)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (isGM) {
                setEditingMacro(macro);
              }
            }}
            style={{
              background: macro.color || '#2a2a3a',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 8px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              transition: 'transform 0.1s',
              minHeight: '60px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Icon name={macro.icon || 'dice-d20'} size="lg" />
            <span style={{ color: '#fff', fontSize: '11px', fontWeight: 500 }}>{macro.name}</span>
            {isGM && (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px' }}>
                {macro.formula}
              </span>
            )}
          </button>
        ))}

        {availableMacros.length === 0 && (
          <div style={{ gridColumn: 'span 2', textAlign: 'center', color: '#666', padding: '20px' }}>
            No macros available
          </div>
        )}
      </div>

      {/* Help text */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: `1px solid ${colorScheme?.accent || '#4a5568'}`,
          fontSize: '10px',
          color: '#666',
          textAlign: 'center',
        }}
      >
        Click to use • Right-click to edit (GM)
      </div>

      {/* Edit Macro Modal */}
      {editingMacro && (
        <EditMacroModal
          macro={editingMacro}
          rollTables={rollTables}
          onSave={(updated) => {
            saveMacros(macros.map(m => m.id === updated.id ? updated : m));
            setEditingMacro(null);
          }}
          onDelete={() => {
            deleteMacro(editingMacro.id);
            setEditingMacro(null);
          }}
          onClose={() => setEditingMacro(null)}
          colorScheme={colorScheme}
        />
      )}

      {/* Resize handle */}
      <div
        ref={resizeRef}
        className="macros-panel-resize"
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}

// New Macro Form Component
function NewMacroForm({ 
  onAdd, 
  onCancel,
  colorScheme,
  rollTables,
}: { 
  onAdd: (macro: Omit<Macro, 'id'>) => void; 
  onCancel: () => void;
  colorScheme?: any;
  rollTables: RollTable[];
}) {
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [macroType, setMacroType] = useState<'roll' | 'chat' | 'command'>('roll');
  const [icon, setIcon] = useState('dice-d20');
  const [color, setColor] = useState('#6b8aff');
  const [isGlobal, setIsGlobal] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const resolvedFormula = macroType === 'command' && selectedTableId
      ? JSON.stringify({ command: 'randomTable', title: name.trim(), tableId: selectedTableId })
      : formula.trim();

    if (!resolvedFormula) return;
    
    onAdd({
      name: name.trim(),
      formula: resolvedFormula,
      icon,
      color,
      type: macroType,
      isGlobal,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '12px',
        borderBottom: `1px solid ${colorScheme?.accent || '#4a5568'}`,
        background: '#0f0f1a',
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Macro name"
        style={{
          width: '100%',
          padding: '8px',
          marginBottom: '8px',
          background: '#2a2a3a',
          border: '1px solid #4a5568',
          borderRadius: '4px',
          color: '#fff',
        }}
      />
      <input
        type="text"
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        placeholder={macroType === 'command' ? 'Command payload JSON' : 'Formula (e.g., 1d20+5)'}
        style={{
          width: '100%',
          padding: '8px',
          marginBottom: '8px',
          background: '#2a2a3a',
          border: '1px solid #4a5568',
          borderRadius: '4px',
          color: '#fff',
        }}
      />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <select
          value={macroType}
          onChange={(e) => setMacroType(e.target.value as 'roll' | 'chat' | 'command')}
          style={{
            flex: 1,
            padding: '8px',
            background: '#2a2a3a',
            border: '1px solid #4a5568',
            borderRadius: '4px',
            color: '#fff',
          }}
        >
          <option value="roll">Dice Roll</option>
          <option value="chat">Chat Message</option>
          <option value="command">Command (JSON)</option>
        </select>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: '40px', height: '36px', border: 'none', cursor: 'pointer' }}
        />
      </div>
      {macroType === 'command' && (
        <>
          <select
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '8px', background: '#2a2a3a', border: '1px solid #4a5568', borderRadius: '4px', color: '#fff' }}
          >
            <option value="">No linked rolltable</option>
            {rollTables.map((table) => (
              <option key={table.id} value={table.id}>{table.name}</option>
            ))}
          </select>
          <div style={{ marginBottom: '8px', color: '#888', fontSize: '11px' }}>
            Choose a rolltable to auto-generate a `randomTable` command, or paste raw JSON manually.
          </div>
        </>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontSize: '12px', marginBottom: '8px' }}>
        <input
          type="checkbox"
          checked={isGlobal}
          onChange={(e) => setIsGlobal(e.target.checked)}
        />
        Available to all players
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '8px',
            background: colorScheme?.accent || '#6b8aff',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '8px',
            background: 'transparent',
            border: '1px solid #4a5568',
            borderRadius: '4px',
            color: '#888',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Edit Macro Modal
function EditMacroModal({
  macro,
  onSave,
  onDelete,
  onClose,
  colorScheme,
  rollTables,
}: {
  macro: Macro;
  onSave: (macro: Macro) => void;
  onDelete: () => void;
  onClose: () => void;
  colorScheme?: any;
  rollTables: RollTable[];
}) {
  const [name, setName] = useState(macro.name);
  const [formula, setFormula] = useState(macro.formula);
  const [macroType, setMacroType] = useState<Macro['type']>(macro.type);
  const [icon, setIcon] = useState(macro.icon || 'dice-d20');
  const [color, setColor] = useState(macro.color || '#6b8aff');
  const [isGlobal, setIsGlobal] = useState(macro.isGlobal);
  const [selectedTableId, setSelectedTableId] = useState('');

  useEffect(() => {
    try {
      const parsed = JSON.parse(formula);
      if (parsed?.command === 'randomTable' && typeof parsed.tableId === 'string') {
        setSelectedTableId(parsed.tableId);
      }
    } catch {
      setSelectedTableId('');
    }
  }, [formula]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...macro,
      name,
      formula: macroType === 'command' && selectedTableId
        ? JSON.stringify({ command: 'randomTable', title: name, tableId: selectedTableId })
        : formula,
      type: macroType,
      icon,
      color,
      isGlobal,
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: colorScheme?.surface || '#1a1a2e',
          borderRadius: '12px',
          padding: '20px',
          width: '300px',
          border: `1px solid ${colorScheme?.accent || '#4a5568'}`,
        }}
      >
        <h4 style={{ margin: '0 0 16px 0', color: '#fff' }}>Edit Macro</h4>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Macro name"
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              background: '#2a2a3a',
              border: '1px solid #4a5568',
              borderRadius: '4px',
              color: '#fff',
            }}
          />
          <input
            type="text"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder={macroType === 'command' ? 'Command JSON payload' : 'Formula'}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              background: '#2a2a3a',
              border: '1px solid #4a5568',
              borderRadius: '4px',
              color: '#fff',
            }}
          />
          <select
            value={macroType}
            onChange={(e) => setMacroType(e.target.value as Macro['type'])}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '8px',
              background: '#2a2a3a',
              border: '1px solid #4a5568',
              borderRadius: '4px',
              color: '#fff',
            }}
          >
            <option value="roll">Dice Roll</option>
            <option value="chat">Chat Message</option>
            <option value="command">Command (JSON)</option>
          </select>
          {macroType === 'command' && (
            <>
              <select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '8px', background: '#2a2a3a', border: '1px solid #4a5568', borderRadius: '4px', color: '#fff' }}
              >
                <option value="">No linked rolltable</option>
                {rollTables.map((table) => (
                  <option key={table.id} value={table.id}>{table.name}</option>
                ))}
              </select>
              <div style={{ marginBottom: '8px', color: '#888', fontSize: '11px' }}>
                Select a rolltable for `randomTable` command or keep custom JSON.
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: '40px', height: '36px', border: 'none', cursor: 'pointer' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', fontSize: '12px', flex: 1 }}>
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={(e) => setIsGlobal(e.target.checked)}
              />
              Available to all
            </label>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '8px',
                background: colorScheme?.accent || '#6b8aff',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{
                flex: 1,
                padding: '8px',
                background: '#ef4444',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '8px',
                background: 'transparent',
                border: '1px solid #4a5568',
                borderRadius: '4px',
                color: '#888',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
