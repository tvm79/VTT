import { useState, useMemo, useCallback, useEffect } from 'react';
import { Icon } from './Icon';
import { useGameStore } from '../store/gameStore';
import type { Token } from '../../../shared/src/index';
import { socketService } from '../services/socket';
import { TOKEN_DISPOSITIONS, type TokenDisposition } from '../utils/colorUtils';
import { colors, radius, shadows, spacing, typography, zIndex } from '../ui/tokens';
import { getParticlePresets, subscribeParticlePresets } from '../particles/editor/particlePresetStore';

interface TokenPanelProps {
  token: Token;
  position: { x: number; y: number };
  onClose: () => void;
}

// Status icons for token conditions
const conditionIcons = [
  { icon: '', label: 'None' },
  { icon: 'heart', label: 'Bloodied' },
  { icon: 'heart-crack', label: 'Healing' },
  { icon: 'tint', label: 'Blessed' },
  { icon: 'heart', label: 'Charmed' },
  { icon: 'face-dizzy', label: 'Unconscious' },
  { icon: 'fire', label: 'On Fire' },
  { icon: 'shield', label: 'Shielded' },
  { icon: 'hand-fist', label: 'Attacking' },
  { icon: 'user-secret', label: 'Invisible' },
  { icon: 'moon', label: 'Asleep' },
  { icon: 'bug', label: 'Poisoned' },
  { icon: 'skull', label: 'Dead' },
  // Magical Enchantment Status Icons
  { icon: 'wand-magic-sparkles', label: 'Enchanted' },
  { icon: 'skull-crossbones', label: 'Cursed' },
  { icon: 'brain', label: 'Charmed' },
  { icon: 'eye', label: 'Dominatred' },
  { icon: 'ghost', label: 'Frightened' },
  { icon: 'bolt', label: 'Stunned' },
  { icon: 'droplet', label: 'Grappled' },
  { icon: 'chains', label: 'Restrained' },
  { icon: 'feather', label: 'Exhaustion' },
  { icon: 'flask', label: 'Petrified' },
  { icon: 'mountain', label: 'Paralyzed' },
  { icon: 'wind', label: 'Blinded' },
  { icon: 'ear-lobes', label: 'Deafened' },
  { icon: 'sick', label: 'Diseased' },
  { icon: 'circle-radiation', label: 'Radiated' },
  { icon: 'spell', label: 'Magic Weapon' },
  { icon: 'hat-wizard', label: 'Under Magic Effect' },
  { icon: 'ring', label: 'Magic Ring Active' },
  { icon: 'anchor', label: 'Grounded' },
  { icon: 'temperature-high', label: 'Burning' },
  { icon: 'temperature-low', label: 'Frozen' },
  { icon: 'cloud-bolt', label: 'Shocked' },
  { icon: 'hand-holding-droplet', label: 'Wet' },
  { icon: 'cloud-rain', label: 'Soaked' },
  { icon: 'cloud', label: 'Fogged' },
  { icon: 'vial', label: 'Poisoned' },
  { icon: 'smog', label: 'Stink' },
  { icon: 'spider', label: 'Webbed' },
  { icon: 'paw', label: 'Prone' },
  { icon: 'shoe-prints', label: 'Grounded' },
  { icon: 'arrow-up', label: 'Levitating' },
  { icon: 'dragon', label: 'Frightened' },
  { icon: 'mask', label: 'Invisible' },
  { icon: 'fingerprint', label: 'Identified' },
  { icon: 'key', label: 'Has Key' },
  { icon: 'door-open', label: 'Door Unlocked' },
  { icon: 'gem', label: 'Magic Item' },
  { icon: 'coins', label: 'Wealthy' },
];

// Enchantment/Aura presets for token visual effects
export const auraPresets = [
  { id: 'none', name: 'None', color: 'transparent', particleColor: null, particleType: null },
  { id: 'holy', name: 'Holy', color: colors.accent.warning, particleColor: '#ffff00', particleType: 'sparkle' },
  { id: 'unholy', name: 'Unholy/Dark', color: '#9900ff', particleColor: '#6600cc', particleType: 'smoke' },
  { id: 'fire', name: 'Fire', color: '#ff4400', particleColor: '#ff6600', particleType: 'flame' },
  { id: 'ice', name: 'Ice', color: '#00ccff', particleColor: '#99eeff', particleType: 'snow' },
  { id: 'lightning', name: 'Lightning', color: '#ffff00', particleColor: colors.text.primary, particleType: 'spark' },
  { id: 'poison', name: 'Poison', color: '#00ff00', particleColor: '#33ff33', particleType: 'smoke' },
  { id: 'necrotic', name: 'Necrotic', color: '#660033', particleColor: '#990066', particleType: 'smoke' },
  { id: 'radiant', name: 'Radiant', color: colors.text.primary, particleColor: '#ffffcc', particleType: 'sparkle' },
  { id: 'psychic', name: 'Psychic', color: '#ff66b2', particleColor: '#ff99cc', particleType: 'sparkle' },
  { id: 'thunder', name: 'Thunder', color: '#9999ff', particleColor: '#ccccff', particleType: 'spark' },
  { id: 'acid', name: 'Acid', color: '#99ff00', particleColor: '#ccff33', particleType: 'drip' },
  { id: 'healing', name: 'Healing', color: '#00ff66', particleColor: '#66ff99', particleType: 'sparkle' },
  { id: 'shielded', name: 'Shielded', color: '#00aaff', particleColor: '#66ccff', particleType: 'shield' },
  { id: 'ethereal', name: 'Ethereal', color: '#cc99ff', particleColor: '#eebbff', particleType: 'ghost' },
  { id: 'cursed', name: 'Cursed', color: '#330033', particleColor: '#660066', particleType: 'smoke' },
  { id: 'blessed', name: 'Blessed', color: '#ffd700', particleColor: '#ffee66', particleType: 'sparkle' },
  { id: 'invisible', name: 'Invisible', color: '#cccccc', particleColor: colors.text.primary, particleType: 'sparkle' },
];

// CSS styles for the TokenPanel
const styles = {
  panel: {
    position: 'absolute' as const,
    zIndex: zIndex.modal,
    background: colors.surface.overlay,
    borderRadius: radius.lg,
    padding: spacing[3],
    minWidth: '240px',
    maxWidth: '280px',
    boxShadow: shadows.md,
    fontFamily: typography.family.sans,
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: zIndex.modal,
    pointerEvents: 'none' as const,
  },
  modal: {
    background: colors.surface.base,
    padding: spacing[5],
    borderRadius: radius.lg,
    width: '320px',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
    boxShadow: shadows.md,
  },
  section: {
    marginBottom: spacing[3],
  },
  sectionHeader: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: spacing[2],
    paddingBottom: spacing[1],
    borderBottom: `1px solid ${colors.border.subtle}`,
  },
  tokenName: {
    fontSize: typography.size.md,
    fontWeight: 600,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.text.secondary,
    marginBottom: spacing[1],
    display: 'block',
  },
  select: {
    width: '100%',
    padding: `${spacing[2]} ${spacing[3]}`,
    background: colors.state.active,
    color: colors.text.primary,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radius.md,
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  },
  buttonGroup: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  primaryButton: {
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.15s ease',
  },
  statusButton: {
    padding: '8px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '4px',
  },
  menuButton: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '13px',
    fontWeight: 500,
    background: colors.state.hover,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radius.md,
    color: colors.text.primary,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'all 0.15s ease',
    marginBottom: '6px',
  },
  segmentedControl: {
    display: 'flex',
    gap: '2px',
    background: colors.state.active,
    borderRadius: '6px',
    padding: '2px',
  },
  segmentButton: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flex: 1,
    color: colors.text.muted,
    background: 'transparent',
  },
  dangerButton: {
    width: '100%',
    padding: '10px',
    fontSize: '12px',
    fontWeight: 500,
    background: 'transparent',
    border: `1px solid ${colors.border.accent}`,
    borderRadius: radius.md,
    color: colors.accent.danger,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  input: {
    width: '100%',
    padding: `${spacing[2]} ${spacing[3]}`,
    background: colors.state.active,
    color: colors.text.primary,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radius.md,
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  smallButton: {
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  barItem: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px',
    alignItems: 'center',
  },
};

// Modal Component
function Modal({ title, onClose, children, position }: { title: string; onClose: () => void; children: React.ReactNode; position?: { x: number; y: number } }) {
  const modalStyle = position ? {
    ...styles.modal,
    position: 'absolute' as const,
    left: position.x,
    top: position.y,
    pointerEvents: 'auto' as const,
  } : { ...styles.modal, pointerEvents: 'auto' as const };
  
  return (
    <div style={{...styles.modalOverlay, pointerEvents: 'auto'}} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ color: colors.text.primary, margin: 0, fontSize: '16px' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.text.muted,
              cursor: 'pointer',
              padding: '4px',
              fontSize: '18px',
            }}
          >
            <Icon name="times" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Bars Editor Modal
function BarsEditorModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const [barEditorState, setBarEditorState] = useState<{
    barName: string;
    current: number;
    max: number;
    color: string;
    isNew: boolean;
  } | null>(null);

  const bars: Array<{ name: string; current: number; max: number; color: string }> = 
    token.bars ? JSON.parse(token.bars) : [];
  
  const hpBar = bars.find(b => b.name === 'HP');
  const manaBar = bars.find(b => b.name === 'Mana');
  const customBars = bars.filter(b => b.name !== 'HP' && b.name !== 'Mana');

  const saveBar = (barName: string, current: number, max: number, color: string, isNew: boolean) => {
    const newBars = isNew
      ? [...bars, { name: barName, current, max, color }]
      : bars.map(b => b.name === barName ? { ...b, current, max, color } : b);
    socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
  };

  const deleteBar = (barName: string) => {
    const newBars = bars.filter(b => b.name !== barName);
    socketService.updateToken(token.id, { bars: JSON.stringify(newBars) });
  };

  return (
    <Modal title="Bars Configuration" onClose={onClose}>
      {/* HP Bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 500 }}>HP</span>
          {hpBar ? (
            <button
              onClick={() => deleteBar('HP')}
              style={{ ...styles.smallButton, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
            >
              Remove
            </button>
          ) : null}
        </div>
        {hpBar ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setBarEditorState({ barName: 'HP', current: hpBar.current, max: hpBar.max, color: hpBar.color, isNew: false })}
              style={{ ...styles.smallButton, background: hpBar.color, flex: 1, justifyContent: 'center' }}
            >
              {hpBar.current} / {hpBar.max}
            </button>
          </div>
        ) : (
          <button
            onClick={() => saveBar('HP', 10, 10, '#e94560', true)}
            style={{ ...styles.smallButton, background: 'rgba(255, 255, 255, 0.1)', color: '#fff', width: '100%' }}
          >
            <Icon name="plus" /> Add HP Bar
          </button>
        )}
      </div>

      {/* Mana Bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: '#fff', fontWeight: 500 }}>Mana</span>
          {manaBar ? (
            <button
              onClick={() => deleteBar('Mana')}
              style={{ ...styles.smallButton, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
            >
              Remove
            </button>
          ) : null}
        </div>
        {manaBar ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setBarEditorState({ barName: 'Mana', current: manaBar.current, max: manaBar.max, color: manaBar.color, isNew: false })}
              style={{ ...styles.smallButton, background: manaBar.color, flex: 1, justifyContent: 'center' }}
            >
              {manaBar.current} / {manaBar.max}
            </button>
          </div>
        ) : (
          <button
            onClick={() => saveBar('Mana', 10, 10, '#4299e1', true)}
            style={{ ...styles.smallButton, background: 'rgba(255, 255, 255, 0.1)', color: '#fff', width: '100%' }}
          >
            <Icon name="plus" /> Add Mana Bar
          </button>
        )}
      </div>

      {/* Custom Bars */}
      <div style={{ marginBottom: '16px' }}>
        <span style={{ color: '#fff', fontWeight: 500, display: 'block', marginBottom: '8px' }}>Custom Bars</span>
        {customBars.map((bar, idx) => (
          <div key={idx} style={styles.barItem}>
            <button
              onClick={() => setBarEditorState({ barName: bar.name, current: bar.current, max: bar.max, color: bar.color, isNew: false })}
              style={{ ...styles.smallButton, background: bar.color, flex: 1, justifyContent: 'center' }}
            >
              {bar.name}: {bar.current}/{bar.max}
            </button>
            <button
              onClick={() => deleteBar(bar.name)}
              style={{ ...styles.smallButton, background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setBarEditorState({ barName: '', current: 10, max: 10, color: '#48bb78', isNew: true })}
          style={{ ...styles.smallButton, background: 'rgba(255, 255, 255, 0.1)', color: '#fff', width: '100%' }}
        >
          <Icon name="plus" /> Add Custom Bar
        </button>
      </div>

      {/* Bar Editor */}
      {barEditorState && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Bar Name</label>
            <input
              type="text"
              value={barEditorState.barName}
              onChange={(e) => setBarEditorState({ ...barEditorState, barName: e.target.value })}
              style={styles.input}
              placeholder="Enter bar name..."
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Current</label>
              <input
                type="number"
                value={barEditorState.current}
                onChange={(e) => setBarEditorState({ ...barEditorState, current: parseInt(e.target.value) || 0 })}
                style={styles.input}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Max</label>
              <input
                type="number"
                value={barEditorState.max}
                onChange={(e) => setBarEditorState({ ...barEditorState, max: parseInt(e.target.value) || 1 })}
                style={styles.input}
              />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Color</label>
            <input
              type="color"
              value={barEditorState.color}
              onChange={(e) => setBarEditorState({ ...barEditorState, color: e.target.value })}
              style={{ width: '100%', height: '36px', cursor: 'pointer', border: 'none', borderRadius: '6px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setBarEditorState(null)}
              style={{ flex: 1, padding: '10px', background: 'rgba(255, 255, 255, 0.1)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                saveBar(barEditorState.barName, barEditorState.current, barEditorState.max, barEditorState.color, barEditorState.isNew);
                setBarEditorState(null);
              }}
              style={{ flex: 1, padding: '10px', background: '#48bb78', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Status Settings Modal
function StatusSettingsModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const statuses: string[] = token.status ? JSON.parse(token.status) : [];
  const tokenProps = (token.properties || {}) as Record<string, unknown>;
  const statusRadiusCustom = typeof tokenProps.statusRadius === 'number' ? tokenProps.statusRadius : 25;
  const statusSpreadCustom = typeof tokenProps.statusSpread === 'number' ? tokenProps.statusSpread : 0.75;
  const statusIconSizeCustom = typeof tokenProps.statusIconSize === 'number' ? tokenProps.statusIconSize : 14;

  const toggleStatus = useCallback((status: string) => {
    socketService.toggleTokenStatus(token.id, status);
  }, [token.id]);
  const activeStateColor = colors.accent.success;
  const inactiveStateColor = colors.text.muted;
  const activeStateBg = colors.state.selected;
  const inactiveStateBg = colors.state.hover;
  const activeStateBorder = colors.border.accent;
  const inactiveStateBorder = colors.border.subtle;
  const dangerStateColor = colors.accent.danger;

  return (
    <Modal title="Status Effects" onClose={onClose}>
      {/* Status Toggles - Icons Only */}
      <div style={styles.statusGrid}>
        {conditionIcons.slice(1).map((item) => {
          const isActive = statuses.includes(item.icon || '');
          return (
            <button
              key={item.icon}
              onClick={() => toggleStatus(item.icon || '')}
              style={{
                ...styles.statusButton,
                background: isActive ? colors.state.selected : colors.state.hover,
                border: `1px solid ${isActive ? colors.border.accent : colors.border.subtle}`,
                color: isActive ? activeStateColor : inactiveStateColor,
                boxShadow: isActive ? shadows.sm : 'none',
              }}
              title={item.label}
            >
              <Icon name={item.icon} />
            </button>
          );
        })}
      </div>

      {/* Status Icon Settings (only if there are statuses) */}
      {statuses.length > 0 && (
        <div style={{ marginTop: spacing[4], paddingTop: spacing[4], borderTop: `1px solid ${colors.border.subtle}` }}>
          <span style={{ color: colors.text.primary, fontWeight: 500, display: 'block', marginBottom: spacing[3] }}>Status Icon Settings</span>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Radius: {statusRadiusCustom}px</label>
            <input
              type="range"
              min="5"
              max="50"
              value={statusRadiusCustom}
              onChange={(e) => {
                const newProps = { ...tokenProps, statusRadius: parseInt(e.target.value) };
                socketService.updateToken(token.id, { properties: newProps });
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Spread: {Math.round(statusSpreadCustom * 100)}%</label>
            <input
              type="range"
              min="25"
              max="100"
              value={statusSpreadCustom * 100}
              onChange={(e) => {
                const newProps = { ...tokenProps, statusSpread: parseInt(e.target.value) / 100 };
                socketService.updateToken(token.id, { properties: newProps });
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Icon Size: {statusIconSizeCustom}px</label>
            <input
              type="range"
              min="8"
              max="32"
              value={statusIconSizeCustom}
              onChange={(e) => {
                const newProps = { ...tokenProps, statusIconSize: parseInt(e.target.value) };
                socketService.updateToken(token.id, { properties: newProps });
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
            <span style={{ color: colors.text.secondary, fontSize: typography.size.xs }}>Color:</span>
            <input
              type="color"
              value={(tokenProps.statusIconColor as string) || colors.accent.danger}
              onChange={(e) => {
                const newProps = { ...tokenProps, statusIconColor: e.target.value };
                socketService.updateToken(token.id, { properties: newProps });
              }}
              style={{ width: spacing[8], height: spacing[8], cursor: 'pointer', border: 'none', borderRadius: radius.sm }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

// Aura Settings Modal - Visual enchantment effects for tokens
export function AuraSettingsModal({ token, onClose, position }: { token: Token; onClose: () => void; position?: { x: number; y: number } }) {
  const tokenProps = (token.properties || {}) as Record<string, unknown>;
  
  // Aura settings from token properties
  const auraEnabled = tokenProps.auraEnabled === true;
  const auraPreset = (tokenProps.auraPreset as string) || 'none';
  const auraColor = (tokenProps.auraColor as string) || colors.accent.warning;
  const auraRadius = typeof tokenProps.auraRadius === 'number' ? tokenProps.auraRadius : 60;
  const auraOpacity = typeof tokenProps.auraOpacity === 'number' ? tokenProps.auraOpacity : 0.5;
  const auraPulse = tokenProps.auraPulse !== false;
  const particleEnabled = tokenProps.particleEnabled === true;
  const particleType = (tokenProps.particleType as string) || 'sparkle';
  const particleColor = (tokenProps.particleColor as string) || colors.accent.warning;
  const particleCount = typeof tokenProps.particleCount === 'number' ? tokenProps.particleCount : 20;

  // Get available particle presets from the store
  const [particlePresets, setParticlePresets] = useState<Array<{id: string; name: string}>>(() => 
    getParticlePresets().map(p => ({ id: p.id, name: p.name }))
  );
  
  // Subscribe to preset changes
  useEffect(() => {
    const unsubscribe = subscribeParticlePresets(() => {
      setParticlePresets(getParticlePresets().map(p => ({ id: p.id, name: p.name })));
    });
    return unsubscribe;
  }, []);

  // Get the currently selected particle preset ID
  const particlePresetId = (tokenProps.particlePresetId as string) || '';

  const updateAuraProp = (key: string, value: unknown) => {
    const newProps = { ...tokenProps, [key]: value };
    socketService.updateToken(token.id, { properties: newProps });
  };

  const applyPreset = (presetId: string) => {
    const preset = auraPresets.find(p => p.id === presetId);
    if (preset) {
      const newProps = {
        ...tokenProps,
        auraEnabled: presetId !== 'none',
        auraPreset: presetId,
        auraColor: preset.color,
        particleEnabled: presetId !== 'none',
        particleType: preset.particleType,
        particleColor: preset.particleColor,
      };
      socketService.updateToken(token.id, { properties: newProps });
    }
  };

  // Collapse state for sections - controlled by feature toggles
  // Sections auto-expand when their feature is enabled
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    aura: true,
    auraSettings: true,
    particles: true,
    filters: true,
    tint: true,
    mesh: true,
  });

  // Helper to expand section when enabling, collapse when disabling
  const expandSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: false }));
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Toggle component for sections
  const CollapsibleSection = ({ sectionKey, title, children, defaultOpen = false }: { sectionKey: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
    const isCollapsed = collapsedSections[sectionKey] ?? true;
    return (
      <div style={{ marginBottom: '12px', borderTop: `1px solid ${colors.border.subtle}`, paddingTop: '12px' }}>
        <button
          onClick={() => toggleSection(sectionKey)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: colors.text.primary,
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          <span>{title}</span>
          <span style={{
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            color: colors.text.muted,
          }}>▼</span>
        </button>
        {!isCollapsed && <div style={{ paddingTop: '8px' }}>{children}</div>}
      </div>
    );
  };

  // Toggle switch component - expands section when enabled
  const ToggleSwitch = ({ checked, onChange, section, label }: { checked: boolean; onChange: (v: boolean) => void; section?: string; label?: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
      <div
        onClick={() => {
          if (!checked && section) {
            expandSection(section);
          }
          onChange(!checked);
        }}
        style={{
          width: '40px',
          height: '22px',
          background: checked ? colors.accent.success : colors.state.hover,
          borderRadius: '11px',
          position: 'relative',
          transition: 'background 0.2s',
          border: `1px solid ${checked ? colors.accent.success : colors.border.subtle}`,
        }}
      >
        <div style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '20px' : '2px',
          width: '16px',
          height: '16px',
          background: '#fff',
          borderRadius: '50%',
          transition: 'left 0.2s',
        }} />
      </div>
      {label && <span style={{ color: colors.text.secondary, fontSize: '12px' }}>{label}</span>}
    </label>
  );

  // Render without Modal wrapper - directly like Display Settings panel to fix slider drag issue
  const panelStyle = position ? {
    position: 'absolute' as const,
    left: position.x,
    top: position.y,
    zIndex: 99999,
    pointerEvents: 'auto' as const,
  } : {};

  return (
    <div
      className="light-editor-panel gameboard-aura-editor-panel"
      style={panelStyle}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div className="gameboard-editor-heading" style={{ marginBottom: 0 }}>
          <Icon name="wand-magic-sparkles" />
          Enchantment Aura
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.text.muted,
            cursor: 'pointer',
            padding: '4px',
            fontSize: '18px',
          }}
        >
          <Icon name="times" />
        </button>
      </div>
      {/* Preset Selection - Collapsible */}
      <CollapsibleSection sectionKey="aura" title="Aura Presets">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {auraPresets.slice(0, 18).map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              style={{
                padding: '8px 4px',
                background: auraEnabled && auraPreset === preset.id ? colors.state.selected : colors.state.hover,
                border: `1px solid ${auraEnabled && auraPreset === preset.id ? colors.border.accent : colors.border.subtle}`,
                borderRadius: '6px',
                color: preset.color !== '#00000000' ? preset.color : colors.text.muted,
                fontSize: '10px',
                cursor: 'pointer',
                textShadow: preset.color !== '#00000000' ? `0 0 8px ${preset.color}` : 'none',
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {/* Aura Settings - Static (always visible) */}
      <div style={{ marginBottom: '12px', borderTop: `1px solid ${colors.border.subtle}`, paddingTop: '12px' }}>
        <div style={{ color: colors.text.primary, fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>Aura Settings</div>
        <div style={{ marginBottom: '12px' }}>
          <ToggleSwitch checked={auraEnabled} onChange={(v) => updateAuraProp('auraEnabled', v)} section="auraSettings" label={auraEnabled ? 'Enabled' : 'Disabled'} />
        </div>

      {/* Aura Color */}
      {auraEnabled && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Aura Color</label>
            <input
              type="color"
              value={auraColor}
              onChange={(e) => updateAuraProp('auraColor', e.target.value)}
              className="light-editor-panel-color"
            />
          </div>

          {/* Aura Radius */}
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Aura Radius: {auraRadius}px</label>
            <input
              type="range"
              min="20"
              max="200"
              value={auraRadius}
              onChange={(e) => updateAuraProp('auraRadius', parseInt(e.target.value))}
              className="gameboard-editor-range"
            />
          </div>

          {/* Aura Opacity */}
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Aura Opacity: {Math.round(auraOpacity * 100)}%</label>
            <input
              type="range"
              min="10"
              max="100"
              value={auraOpacity * 100}
              onChange={(e) => updateAuraProp('auraOpacity', parseInt(e.target.value) / 100)}
              className="gameboard-editor-range"
            />
          </div>

          {/* Aura Pulse */}
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Pulse Animation</label>
            <ToggleSwitch checked={auraPulse} onChange={(v) => updateAuraProp('auraPulse', v)} section="auraSettings" />
          </div>

          {/* Aura Alpha Fade */}
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Alpha Fade</label>
            <ToggleSwitch checked={(tokenProps.auraAlphaFade !== false)} onChange={(v) => updateAuraProp('auraAlphaFade', v)} section="auraSettings" />
          </div>

          {/* Aura Rotation */}
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Rotation</label>
            <ToggleSwitch checked={tokenProps.auraRotation === true} onChange={(v) => updateAuraProp('auraRotation', v)} section="auraSettings" />
          </div>
        </>
      )}
      </div>

      {/* Particle Effects Section - Static (always visible) */}
      <div style={{ marginBottom: '12px', borderTop: `1px solid ${colors.border.subtle}`, paddingTop: '12px' }}>
        <div style={{ color: colors.text.primary, fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>Particle Effects</div>
        <div style={{ marginBottom: '12px' }}>
          <ToggleSwitch checked={particleEnabled} onChange={(v) => updateAuraProp('particleEnabled', v)} section="particles" label={particleEnabled ? 'Enabled' : 'Disabled'} />
        </div>

        {particleEnabled && (
          <>
            {/* Particle Preset */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Particle Preset</label>
              <select
                value={particlePresetId}
                onChange={(e) => updateAuraProp('particlePresetId', e.target.value)}
                className="light-editor-panel-select"
              >
                <option value="">-- Select a Preset --</option>
                {particlePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Particle Color */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Particle Color</label>
              <input
                type="color"
                value={particleColor}
                onChange={(e) => updateAuraProp('particleColor', e.target.value)}
                className="light-editor-panel-color"
              />
            </div>

            {/* Particle Count */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Particle Count: {particleCount}</label>
              <input
                type="range"
                min="5"
                max="50"
                value={particleCount}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('particleCount', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>

            {/* Particle Size */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Particle Size: {(tokenProps.particleSize as number) || 10}px</label>
              <input
                type="range"
                min="2"
                max="50"
                value={(tokenProps.particleSize as number) || 10}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('particleSize', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>

            {/* Particle Rate */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Spawn Rate: {(tokenProps.particleRate as number) || 5}/s</label>
              <input
                type="range"
                min="1"
                max="20"
                value={(tokenProps.particleRate as number) || 5}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('particleRate', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>

            {/* Particle Lifetime */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Lifetime: {(tokenProps.particleLifetime as number) || 3}s</label>
              <input
                type="range"
                min="1"
                max="10"
                value={(tokenProps.particleLifetime as number) || 3}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('particleLifetime', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>
          </>
        )}
      </div>

      {/* Filter Effects Section - Static (always visible) */}
      <div style={{ marginBottom: '12px', borderTop: `1px solid ${colors.border.subtle}`, paddingTop: '12px' }}>
        <div style={{ color: colors.text.primary, fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>Filter Effects</div>
        {/* Filter Type */}
        <div style={{ marginBottom: '12px' }}>
          <label className="gameboard-editor-label">Filter Type</label>
          <select
            value={(tokenProps.tokenEffectFilter as string) || 'none'}
            onChange={(e) => updateAuraProp('tokenEffectFilter', e.target.value)}
            className="light-editor-panel-select"
          >
            <option value="none">None</option>
            <option value="blur">Blur</option>
            <option value="glow">Glow</option>
            <option value="displacement">Displacement</option>
            <option value="noise">Noise</option>
            <option value="colorMatrix">Color Matrix</option>
          </select>
        </div>

        {/* Filter Intensity */}
        {Boolean(tokenProps.tokenEffectFilter) && tokenProps.tokenEffectFilter !== 'none' && (
          <div style={{ marginBottom: '12px' }}>
            <label className="gameboard-editor-label">Filter Intensity: {((tokenProps.tokenFilterIntensity as number) || 50)}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={(tokenProps.tokenFilterIntensity as number) || 50}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); updateAuraProp('tokenFilterIntensity', parseInt(e.target.value)); }}
              className="gameboard-editor-range"
            />
          </div>
        )}

        {/* Filter Presets */}
        <div style={{ marginBottom: '12px' }}>
          <label style={styles.label}>Quick Presets</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                updateAuraProp('tokenEffectFilter', 'blur');
                updateAuraProp('tokenFilterIntensity', 30);
              }}
              style={{
                padding: '6px 10px',
                background: colors.state.hover,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: '4px',
                color: colors.accent.primary,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Ethereal
            </button>
            <button
              onClick={() => {
                updateAuraProp('tokenEffectFilter', 'glow');
                updateAuraProp('tokenFilterIntensity', 70);
              }}
              style={{
                padding: '6px 10px',
                background: colors.state.hover,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: '4px',
                color: colors.accent.warning,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Fire
            </button>
            <button
              onClick={() => {
                updateAuraProp('tokenEffectFilter', 'colorMatrix');
                updateAuraProp('tokenFilterIntensity', 60);
              }}
              style={{
                padding: '6px 10px',
                background: colors.state.hover,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: '4px',
                color: colors.accent.info,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Ice
            </button>
            <button
              onClick={() => {
                updateAuraProp('tokenEffectFilter', 'noise');
                updateAuraProp('tokenFilterIntensity', 40);
              }}
              style={{
                padding: '6px 10px',
                background: colors.state.hover,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: '4px',
                color: colors.text.secondary,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Shadow
            </button>
          </div>
        </div>
      </div>

      {/* Tint & Color Section - Static (always visible) */}
      <div style={{ marginBottom: '12px', borderTop: `1px solid ${colors.border.subtle}`, paddingTop: '12px' }}>
        <div style={{ color: colors.text.primary, fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>Tint & Color</div>
        {/* Enable Tint */}
        <div style={{ marginBottom: '12px' }}>
          <ToggleSwitch checked={Boolean(tokenProps.tokenTintEnabled)} onChange={(v) => updateAuraProp('tokenTintEnabled', v)} section="tint" label="Enable Tint" />
        </div>

        {/* Tint Color */}
        {Boolean(tokenProps.tokenTintEnabled) && (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Tint Color</label>
              <input
                type="color"
                value={(tokenProps.tokenTintColor as string) || '#ffffff'}
                onChange={(e) => updateAuraProp('tokenTintColor', e.target.value)}
                className="light-editor-panel-color"
              />
            </div>

            {/* Alpha */}
            <div className="gameboard-editor-field">
              <label className="gameboard-editor-label">Alpha: {((tokenProps.tokenAlpha as number) ?? 100)}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={(tokenProps.tokenAlpha as number) ?? 100}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('tokenAlpha', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>

            {/* Blend Mode */}
            <div style={{ marginBottom: '12px' }}>
              <label className="gameboard-editor-label">Blend Mode</label>
              <select
                value={(tokenProps.tokenBlendMode as string) || 'normal'}
                onChange={(e) => updateAuraProp('tokenBlendMode', e.target.value)}
                className="light-editor-panel-select"
              >
                <option value="normal">Normal</option>
                <option value="add">Add</option>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
                <option value="darken">Darken</option>
                <option value="lighten">Lighten</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Mesh Effects Section - Static (always visible) */}
      <div style={{ marginBottom: '12px', borderTop: `1px solid ${colors.border.subtle}`, paddingTop: '12px' }}>
        <div style={{ color: colors.text.primary, fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>Mesh Effects</div>
        {/* Mesh Type */}
        <div style={{ marginBottom: '12px' }}>
          <label className="gameboard-editor-label">Effect Type</label>
          <select
            value={(tokenProps.tokenMeshEffect as string) || 'none'}
            onChange={(e) => updateAuraProp('tokenMeshEffect', e.target.value)}
            className="light-editor-panel-select"
          >
            <option value="none">None</option>
            <option value="wave">Wave</option>
            <option value="twist">Twist</option>
            <option value="bulge">Bulge</option>
          </select>
        </div>

        {/* Mesh Intensity */}
        {Boolean(tokenProps.tokenMeshEffect) && tokenProps.tokenMeshEffect !== 'none' && (
          <>
            <div className="gameboard-editor-field">
              <label className="gameboard-editor-label">Intensity: {((tokenProps.tokenMeshIntensity as number) || 50)}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={(tokenProps.tokenMeshIntensity as number) || 50}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('tokenMeshIntensity', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>

            {/* Mesh Speed */}
            <div className="gameboard-editor-field">
              <label className="gameboard-editor-label">Animation Speed: {((tokenProps.tokenMeshSpeed as number) || 50)}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={(tokenProps.tokenMeshSpeed as number) || 50}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); updateAuraProp('tokenMeshSpeed', parseInt(e.target.value)); }}
                className="gameboard-editor-range"
              />
            </div>
          </>
        )}
      </div>

      {/* Clear All */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${colors.border.subtle}` }}>
        <button
          onClick={() => {
            const newProps = { ...tokenProps };
            delete newProps.auraEnabled;
            delete newProps.auraPreset;
            delete newProps.auraColor;
            delete newProps.auraRadius;
            delete newProps.auraOpacity;
            delete newProps.auraPulse;
            delete newProps.auraAlphaFade;
            delete newProps.auraRotation;
            delete newProps.particleEnabled;
            delete newProps.particleType;
            delete newProps.particleColor;
            delete newProps.particleCount;
            // Clear filter effects
            delete newProps.tokenEffectFilter;
            delete newProps.tokenFilterIntensity;
            // Clear tint effects
            delete newProps.tokenTintEnabled;
            delete newProps.tokenTintColor;
            delete newProps.tokenAlpha;
            delete newProps.tokenBlendMode;
            // Clear mesh effects
            delete newProps.tokenMeshEffect;
            delete newProps.tokenMeshIntensity;
            delete newProps.tokenMeshSpeed;
            socketService.updateToken(token.id, { properties: newProps });
          }}
          style={{
            width: '100%',
            padding: '10px',
            background: colors.state.hover,
            border: `1px solid ${colors.border.subtle}`,
            borderRadius: '6px',
            color: colors.accent.danger,
            cursor: 'pointer',
          }}
        >
          Clear All Enchantments
        </button>
      </div>
    </div>
  );
}

// Display Settings Modal
function DisplaySettingsModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const tokenProps = (token.properties || {}) as Record<string, unknown>;
  const isHidden = tokenProps.hiddenFromPlayers === true;
  const currentDisposition = (tokenProps.disposition as TokenDisposition) || null;

  const dispositionOptions: TokenDisposition[] = ['neutral', 'friendly', 'secret', 'hostile'];

  return (
    <Modal title="Display Settings" onClose={onClose}>
      {/* Disposition */}
      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>Disposition</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {dispositionOptions.map((disp) => {
            const dispInfo = TOKEN_DISPOSITIONS[disp];
            const isActive = currentDisposition === disp;
            return (
              <button
                key={disp}
                onClick={() => {
                  const newProps = { ...tokenProps, disposition: isActive ? null : disp };
                  socketService.updateToken(token.id, { properties: newProps });
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: '1px solid',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flex: '1 1 calc(50% - 3px)',
                  minWidth: '80px',
                  background: isActive ? `${dispInfo.color}40` : 'rgba(255, 255, 255, 0.08)',
                  borderColor: isActive ? dispInfo.color : 'rgba(255, 255, 255, 0.2)', 
                  color: isActive ? dispInfo.color : '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: dispInfo.color,
                    display: 'inline-block',
                  }}
                />
                {dispInfo.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Visibility */}
      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>Visibility to Players</label>
        <div style={styles.segmentedControl}>
          <button
            onClick={() => {
              const newProps = { ...tokenProps, hiddenFromPlayers: false };
              socketService.updateToken(token.id, { properties: newProps });
            }}
            style={{
              ...styles.segmentButton,
              background: !isHidden ? 'rgba(72, 187, 120, 0.3)' : 'transparent',
              color: !isHidden ? '#48bb78' : 'rgba(255, 255, 255, 0.5)',
            }}
          >
            Visible
          </button>
          <button
            onClick={() => {
              const newProps = { ...tokenProps, hiddenFromPlayers: true };
              socketService.updateToken(token.id, { properties: newProps });
            }}
            style={{
              ...styles.segmentButton,
              background: isHidden ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
              color: isHidden ? '#ef4444' : 'rgba(255, 255, 255, 0.5)',
            }}
          >
            Hidden
          </button>
        </div>
      </div>

      {/* Label */}
      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>Label</label>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <button
            onClick={() => socketService.updateToken(token.id, { showLabel: !token.showLabel })}
            style={{
              ...styles.primaryButton,
              flex: 1,
              justifyContent: 'center',
              background: token.showLabel ? 'rgba(72, 187, 120, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${token.showLabel ? 'rgba(72, 187, 120, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
              color: token.showLabel ? '#48bb78' : 'rgba(255, 255, 255, 0.5)',
            }}
          >
            <Icon name="tag" /> {token.showLabel ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => {
              const newLabel = prompt('Enter label text:', token.label || token.name || '');
              if (newLabel !== null) {
                socketService.updateToken(token.id, { label: newLabel, showLabel: true });
              }
            }}
            style={{
              ...styles.primaryButton,
              flex: 1,
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            <Icon name="pen" /> Edit
          </button>
        </div>
      </div>

      {/* Label Settings */}
      {token.showLabel && (
        <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={styles.label}>Position</label>
            <select
              value={(tokenProps.labelPosition as string) || 'below'}
              onChange={(e) => {
                const newProps = { ...tokenProps, labelPosition: e.target.value };
                socketService.updateToken(token.id, { properties: newProps });
              }}
              style={styles.select}
            >
              <option value="below">Below Token</option>
              <option value="top">Above Token</option>
              <option value="inside-top">Inside (Top)</option>
              <option value="inside-bottom">Inside (Bottom)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Color</label>
              <input
                type="color"
                value={(tokenProps.labelColor as string) || '#ffffff'}
                onChange={(e) => {
                  const newProps = { ...tokenProps, labelColor: e.target.value };
                  socketService.updateToken(token.id, { properties: newProps });
                }}
                style={{ width: '100%', height: '32px', cursor: 'pointer', border: 'none', borderRadius: '4px' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Size</label>
              <input
                type="range"
                min="8"
                max="32"
                value={(tokenProps.labelFontSize as number) || 14}
                onChange={(e) => {
                  const newProps = { ...tokenProps, labelFontSize: parseInt(e.target.value) };
                  socketService.updateToken(token.id, { properties: newProps });
                }}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Ownership Modal
function OwnershipModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const { players, session, user } = useGameStore();
  const currentPlayer = session?.players.find(p => p.userId === user?.id);

  return (
    <Modal title="Ownership" onClose={onClose}>
      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>Assign to Player</label>
        <select
          value={token.ownerId || ''}
          onChange={(e) => {
            socketService.updateToken(token.id, { ownerId: e.target.value || null });
          }}
          style={styles.select}
        >
          <option value="">No Owner</option>
          {players.filter(p => p.role !== 'gm').map(player => (
            <option key={player.userId} value={player.userId}>
              {player.username}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ ...styles.label, marginBottom: '8px' }}>Controlled By</label>
        {players.filter(p => p.role !== 'gm').map(player => {
          const isControlled = currentPlayer?.controlledTokens?.includes(token.id) || false;
          return (
            <button
              key={player.userId}
              onClick={() => {
                if (isControlled) {
                  socketService.removeTokenControl(player.userId, token.id);
                } else {
                  socketService.addTokenControl(player.userId, token.id);
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                marginBottom: '4px',
                fontSize: '12px',
                background: isControlled ? 'rgba(72, 187, 120, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isControlled ? 'rgba(72, 187, 120, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: '6px',
                color: isControlled ? '#48bb78' : 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                textAlign: 'left' as const,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {isControlled ? <Icon name="check" /> : <Icon name="plus" />} {player.username}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// Layer Modal
function LayerModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const layers = [
    { id: 'tokens', label: 'Tokens', icon: 'user-group' },
    { id: 'tiles', label: 'Tiles', icon: 'border-all' },
    { id: 'objects', label: 'Objects', icon: 'cog' },
  ] as const;

  return (
    <Modal title="Layer" onClose={onClose}>
      <div style={styles.segmentedControl}>
        {layers.map(layer => (
          <button
            key={layer.id}
            onClick={() => {
              socketService.setTokenLayer(token.id, layer.id);
              onClose();
            }}
            style={{
              ...styles.segmentButton,
              background: token.layer === layer.id ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
              color: token.layer === layer.id ? '#818cf8' : 'rgba(255, 255, 255, 0.5)',
              padding: '12px',
              fontSize: '13px',
            }}
          >
            <Icon name={layer.icon} /> {layer.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// Delete Confirmation Modal
function DeleteModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    if (confirmDelete) {
      socketService.deleteToken(token.id);
      onClose();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <Modal title="Delete Token" onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <Icon name="trash" style={{ fontSize: '48px', color: '#ef4444', marginBottom: '12px' }} />
        <p style={{ color: '#fff', margin: 0 }}>
          Are you sure you want to delete <strong>"{token.name || 'Unnamed Token'}"</strong>?
        </p>
        <p style={{ color: '#aaa', fontSize: '12px', marginTop: '8px' }}>
          This action cannot be undone.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onClose}
          style={{ flex: 1, padding: '12px', background: 'rgba(255, 255, 255, 0.1)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          style={{
            flex: 1,
            padding: '12px',
            background: confirmDelete ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
            border: `1px solid ${confirmDelete ? '#ef4444' : 'rgba(239, 68, 68, 0.5)'}`,
            borderRadius: '6px',
            color: '#ef4444',
            cursor: 'pointer',
          }}
        >
          {confirmDelete ? 'Click Again to Confirm' : 'Delete Token'}
        </button>
      </div>
    </Modal>
  );
}

// Main TokenPanel Component
export function TokenPanel({ token, position, onClose }: TokenPanelProps) {
  const { isGM, addCombatant, removeCombatant, isTokenInCombat } = useGameStore();
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const tokenProps = (token.properties || {}) as Record<string, unknown>;
  const bars: Array<{ name: string; current: number; max: number; color: string }> = 
    token.bars ? JSON.parse(token.bars) : [];
  const hpBar = bars.find(b => b.name === 'HP');
  const manaBar = bars.find(b => b.name === 'Mana');
  const inCombat = isTokenInCombat(token.id);
  const isHidden = tokenProps.hiddenFromPlayers === true;

  // Memoized handlers for performance
  const handleToggleStatus = useCallback((status: string) => {
    socketService.toggleTokenStatus(token.id, status);
  }, [token.id]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    socketService.updateToken(token.id, { name: e.target.value });
  }, [token.id]);

  const handleSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value);
    socketService.updateToken(token.id, { size: newSize });
  }, [token.id]);

  const handleVisibilityToggle = useCallback(() => {
    const newProps = { ...tokenProps, hiddenFromPlayers: !isHidden };
    socketService.updateToken(token.id, { properties: newProps });
  }, [token.id, tokenProps, isHidden]);

  const handleCombatToggle = useCallback(() => {
    const tokenName = token.label || token.name || 'Unknown';
    if (inCombat) {
      removeCombatant(token.id);
    } else {
      addCombatant(token.id, tokenName);
    }
  }, [token.id, token.label, token.name, inCombat, addCombatant, removeCombatant]);

  // Calculate position to keep panel in viewport
  const panelStyle = useMemo(() => {
    const panelWidth = 260;
    const panelHeight = 450;
    const padding = 20;
    
    let x = position.x * token.x;
    let y = position.y * token.y;
    
    if (x + panelWidth > window.innerWidth - padding) {
      x = window.innerWidth - panelWidth - padding;
    }
    if (y + panelHeight > window.innerHeight - padding) {
      y = window.innerHeight - panelHeight - padding;
    }
    x = Math.max(padding, x);
    y = Math.max(padding, y);
    
    return {
      ...styles.panel,
      left: x,
      top: y,
    };
  }, [position]);

  const renderModal = () => {
    switch (activeModal) {
      case 'bars':
        return <BarsEditorModal token={token} onClose={() => setActiveModal(null)} />;
      case 'status':
        return <StatusSettingsModal token={token} onClose={() => setActiveModal(null)} />;
      case 'display':
        return <DisplaySettingsModal token={token} onClose={() => setActiveModal(null)} />;
      case 'aura':
        return <AuraSettingsModal token={token} onClose={() => setActiveModal(null)} />;
      case 'ownership':
        return <OwnershipModal token={token} onClose={() => setActiveModal(null)} />;
      case 'layer':
        return <LayerModal token={token} onClose={() => setActiveModal(null)} />;
      case 'delete':
        return <DeleteModal token={token} onClose={() => setActiveModal(null)} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header - Token Name & Size */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <input
              type="text"
              value={token.name || ''}
              onChange={(e) => {
                socketService.updateToken(token.id, { name: e.target.value });
              }}
              style={{
                ...styles.input,
                fontSize: '16px',
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 0,
                padding: '4px 0',
                width: '80%',
              }}
              placeholder="Enter token name..."
            />
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '16px',
                lineHeight: 1,
              }}
            >
              <Icon name="times" />
            </button>
          </div>
          <label style={styles.label}>Token Size</label>
          <select
            value={token.size}
            onChange={handleSizeChange}
            style={styles.select}
          >
            <option value="0.5">Tiny (½ sq)</option>
            <option value="1">Small/Medium (1 sq)</option>
            <option value="2">Large (2×2 sq)</option>
            <option value="3">Huge (3×3 sq)</option>
            <option value="4">Gargantuan (4×4 sq)</option>
          </select>
        </div>

        {/* Quick Actions - Bar Toggles */}
        <div style={{ marginBottom: '12px' }}>
          <div style={styles.sectionHeader}>Quick Actions</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveModal('bars')}
              style={{
                ...styles.primaryButton,
                background: hpBar ? 'rgba(233, 69, 96, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: hpBar ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                color: hpBar ? '#e94560' : '#fff',
              }}
            >
              <Icon name="heart" /> HP {hpBar ? `${hpBar.current}/${hpBar.max}` : ''}
            </button>
            <button
              onClick={() => setActiveModal('bars')}
              style={{
                ...styles.primaryButton,
                background: manaBar ? 'rgba(66, 153, 225, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: manaBar ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                color: manaBar ? '#4299e1' : '#fff',
              }}
            >
              <Icon name="tint" /> Mana {manaBar ? `${manaBar.current}/${manaBar.max}` : ''}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={handleVisibilityToggle}
              style={{
                ...styles.primaryButton,
                background: isHidden ? 'rgba(239, 68, 68, 0.2)' : 'rgba(72, 187, 120, 0.2)',
                border: 'none',
                color: isHidden ? '#ef4444' : '#48bb78',
              }}
            >
              <Icon name="eye" /> {isHidden ? 'Hidden' : 'Visible'}
            </button>
            {isGM && (
              <button
                onClick={handleCombatToggle}
                style={{
                  ...styles.primaryButton,
                  background: inCombat ? 'rgba(239, 68, 68, 0.2)' : 'rgba(72, 187, 120, 0.2)',
                  border: 'none',
                  color: inCombat ? '#ef4444' : '#48bb78',
                }}
              >
                <Icon name="skull" /> {inCombat ? 'Remove' : 'Combat'}
              </button>
            )}
          </div>
        </div>

        {/* Quick Status Grid */}
        <div style={{ marginBottom: '12px' }}>
          <div style={styles.sectionHeader}>Status</div>
          <div style={styles.statusGrid}>
            {conditionIcons.slice(1).map((item) => {
              const statuses: string[] = token.status ? JSON.parse(token.status) : [];
              const isActive = statuses.includes(item.icon || '');
              return (
                <button
                  key={item.icon}
                  onClick={() => handleToggleStatus(item.icon || '')}
                  style={{
                    ...styles.statusButton,
                    background: isActive ? 'rgba(72, 187, 120, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${isActive ? 'rgba(72, 187, 120, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                    color: isActive ? '#48bb78' : 'rgba(255, 255, 255, 0.5)',
                  }}
                  title={item.label}
                >
                  <Icon name={item.icon} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu Buttons */}
        <div style={styles.sectionHeader}>More Options</div>
        
        <button onClick={() => setActiveModal('bars')} style={styles.menuButton}>
          <span><Icon name="heart" /> Bars</span>
          <Icon name="chevron-right" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        
        <button onClick={() => setActiveModal('status')} style={styles.menuButton}>
          <span><Icon name="smile" /> Status</span>
          <Icon name="chevron-right" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        
        <button onClick={() => setActiveModal('display')} style={styles.menuButton}>
          <span><Icon name="eye" /> Display</span>
          <Icon name="chevron-right" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        
        <button onClick={() => setActiveModal('aura')} style={styles.menuButton}>
          <span><Icon name="wand-magic-sparkles" /> Enchantment</span>
          <Icon name="chevron-right" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        
        <button onClick={() => setActiveModal('ownership')} style={styles.menuButton}>
          <span><Icon name="user-group" /> Ownership</span>
          <Icon name="chevron-right" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        
        <button onClick={() => setActiveModal('layer')} style={styles.menuButton}>
          <span><Icon name="layer-group" /> Layer</span>
          <Icon name="chevron-right" style={{ color: 'rgba(255,255,255,0.3)' }} />
        </button>
        
        <button 
          onClick={() => setActiveModal('delete')} 
          style={{ ...styles.menuButton, borderColor: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' }}
        >
          <span><Icon name="trash" /> Delete Token</span>
        </button>
      </div>

      {/* Render active modal */}
      {renderModal()}
    </>
  );
}
