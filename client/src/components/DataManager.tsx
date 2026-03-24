import { useState, useEffect, useRef, CSSProperties } from 'react';
// TEST: Is this file being loaded?
(window as any).__DATAMANAGER_LOADED = true;
console.log('>>> DataManager.tsx loaded, __DATAMANAGER_LOADED:', (window as any).__DATAMANAGER_LOADED);
import { Icon } from './Icon';
import { JournalPanel } from './JournalPanel';
import { CharacterSheetPanel } from './CharacterSheetPanel';
import { Compendium } from './Compendium';
import { Characters } from './Characters';
import { CharacterCreatorWizard } from './CharacterCreatorWizard';
import { Journals } from './Journals';
import { FloatingPanelsLayer } from './FloatingPanelsLayer';
import { RollableText } from './RollableText';
import { FilterPanel, type FilterState } from './FilterPanel';
import { useGameStore, type ActiveSheet } from '../store/gameStore';
import { normalizeEntry, inferType } from '../dataNormalizer';
import { extractMonsterChallengeRating, getChallengeRatingColor } from '../utils/challengeRatingColors';
import { getSpellSchoolColor, getSpellSchoolIcon, extractSpellSchool } from '../utils/spellSchoolColors';
import { getEditorAutocompleteSuggestions, getEditorSelectOptions } from './dataManagerEditorOptions';
import {
  getArrayEntryPreviewLabel,
  getCreatureCrOptions,
  getOrderedObjectEntries,
  getSizeFieldOptions,
  getSpellLevelOptions,
  getSpellObjectPreferredOrder,
  isPrimitiveEditorArray,
} from './dataManagerEditorFieldUtils';
import { addArrayItemAtPath, duplicateArrayItemAtPath, moveArrayItemAtPath, removeArrayIndexAtPath, setValueAtPath } from './dataManagerPathUtils';
import './DataManager.css';

interface DataModule {
  id: string;
  name: string;
  system: string;
  version?: string;
  description?: string;
  itemCount: number;
}

interface SessionModule {
  id: string;
  sessionId: string;
  moduleId: string;
  enabled: boolean;
  module: DataModule;
}

interface AvailableFile {
  filename: string;
  type: string;
  size: number;
  itemCount: number;
}

interface FiveEToolsDatasetOption {
  key: string;
  category: string;
  categoryLabel: string;
  source: string;
  sourceLabel: string;
  label: string;
  defaultName: string;
  type: string;
}

interface ImageFetcherPublicConfig {
  flags?: {
    enabled?: boolean;
    providers?: Record<string, boolean>;
    searchApiEnabled?: boolean;
  };
}

interface Journal {
  id: string;
  sessionId: string;
  title: string;
  type: string;
  content: string;
  layout: string;
  color?: string;
  icon?: string;
  tags: string[];
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ImageFetcherCandidate {
  url: string;
  provider: string;
  kind: 'token' | 'portrait' | 'art';
  confidence: number;
  trusted?: boolean;
  license?: string;
  attribution?: string;
  reason?: string;
  sourceUrl?: string;
}

interface ImageFetcherResolveResponse {
  success: boolean;
  providers: string[];
  candidateCount: number;
  candidates: ImageFetcherCandidate[];
  bestCandidate?: ImageFetcherCandidate | null;
}

function getItemCardVisual(type?: string, crValue?: unknown, schoolValue?: unknown): { icon: string; accent: string; schoolIcon?: string } {
  const normalized = (type || '').toLowerCase();

  if (normalized.includes('spell')) {
    const schoolIcon = getSpellSchoolIcon(schoolValue);
    return { icon: 'scroll', accent: getSpellSchoolColor(schoolValue, '#8b5cf6'), schoolIcon: schoolIcon || undefined };
  }
  if (normalized.includes('monster') || normalized.includes('creature')) {
    return { icon: 'skull', accent: getChallengeRatingColor(crValue, '#f97316') };
  }
  if (normalized.includes('npc') || normalized.includes('character')) return { icon: 'user', accent: '#14b8a6' };
  if (normalized.includes('weapon') || normalized.includes('attack')) return { icon: 'hand-fist', accent: '#ef4444' };
  if (normalized.includes('armor') || normalized.includes('shield')) return { icon: 'shield', accent: '#0ea5e9' };
  if (normalized.includes('item') || normalized.includes('equipment')) return { icon: 'shield', accent: '#22c55e' };
  if (normalized.includes('class') || normalized.includes('background')) return { icon: 'book', accent: '#3b82f6' };
  if (normalized.includes('feat') || normalized.includes('trait')) return { icon: 'star', accent: '#f59e0b' };
  if (normalized.includes('race') || normalized.includes('species')) return { icon: 'user-group', accent: '#06b6d4' };
  if (normalized.includes('map') || normalized.includes('scene')) return { icon: 'map', accent: '#84cc16' };

  return { icon: 'file', accent: '#e94560' };
}

const LOCAL_FALLBACK_IMAGE_BY_TYPE: Record<string, string> = {
  monster: '/icons/monster.svg',
  creature: '/icons/monster.svg',
  npc: '/icons/monster.svg',
  spell: '/dice-icons/d20.svg',
  item: '/dice-icons/d12.svg',
  class: '/dice-icons/d10.svg',
  feat: '/dice-icons/d8.svg',
  species: '/dice-icons/d6.svg',
  race: '/dice-icons/d6.svg',
  background: '/dice-icons/d4.svg',
  condition: '/dice-icons/d100.svg',
};

function normalizeImageType(type: string): string {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'creature' || normalized === 'npc') return 'monster';
  if (normalized === 'race') return 'species';
  return normalized || 'item';
}

function getFallbackImageForType(type: string): string {
  return LOCAL_FALLBACK_IMAGE_BY_TYPE[normalizeImageType(type)] || '/icons/monster.svg';
}

function getEntryDisplayImage(item: any, preferToken = false): string {
  const itemType = String(item?.type || '').toLowerCase();
  const system = item?.system && typeof item.system === 'object' ? item.system : {};
  const primary = preferToken
    ? item?.imgToken || system?.imgToken || item?.img || system?.img
    : item?.img || system?.img || item?.imgToken || system?.imgToken;
  if (typeof primary === 'string' && primary.trim()) return primary;

  const fallback =
    item?.imgFallback ||
    system?.imgFallback ||
    getFallbackImageForType(itemType);

  if (typeof fallback === 'string' && fallback.trim()) return fallback;
  return '/icons/monster.svg';
}

function getUIControlFromValue(value: any): string {
  if (typeof value === 'boolean') return 'toggle';
  if (typeof value === 'number') return 'numericInput';
  if (Array.isArray(value)) return 'list';
  if (value && typeof value === 'object') return 'groupedFields';
  return 'textInput';
}

const META_SYSTEM_KEYS = new Set([
  'id', 'name', 'type', 'slug', 'book', 'source', 'publisher',
  'description', 'desc', 'summary', 'raw', 'createdAt', 'updatedAt',
]);

function sanitizeSystemData(system: any): Record<string, any> {
  if (!system || typeof system !== 'object') return {};
  const entries = Object.entries(system).filter(([key, value]) => {
    if (META_SYSTEM_KEYS.has(key)) return false;
    if (value === undefined || value === null || value === '') return false;
    return true;
  });
  return Object.fromEntries(entries);
}

function normalizeSystemKeys(input: any): Record<string, any> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [rawKey, value] of Object.entries(input)) {
    const key = rawKey.trim().replace(/[:\s]+$/g, '');
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    out[camelKey] = value;
  }
  return out;
}

function toLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseDelimitedValue(value: string): string[] {
  return value
    .split(/[,;]\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function format5eInlineText(input: string): string {
  if (!input) return '';
  const attackMap: Record<string, string> = {
    mw: 'Melee Weapon Attack',
    rw: 'Ranged Weapon Attack',
    ms: 'Melee Spell Attack',
    rs: 'Ranged Spell Attack',
  };

  return input
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1')
    .replace(/@UUID\[[^\]]+\]/g, '')
    .replace(/\{@damage\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1 damage')
    .replace(/\{@dice\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@dc\s+([^}|]+)(?:\|[^}]*)?\}/gi, 'DC $1')
    .replace(/\{@hit\s+([+-]?\d+)(?:\|[^}]*)?\}/gi, (_m, n) => {
      const num = Number(n);
      if (Number.isNaN(num)) return String(n);
      return num >= 0 ? `+${num}` : `${num}`;
    })
    .replace(/\{@atk\s+([^}|]+)(?:\|[^}]*)?\}/gi, (_m, kind) => attackMap[String(kind).toLowerCase()] || '')
    .replace(/\{@[a-z0-9]+\s+([^}|]+)(?:\|([^}]+))?\}/gi, (_m, value, label) => {
      const preferred = String(label || value || '')
        .split('|')
        .map((v) => v.trim())
        .find(Boolean);
      return preferred || '';
    })
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toInlineText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return format5eInlineText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => toInlineText(entry)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if (typeof value.entry === 'string') return toInlineText(value.entry);
    if (Array.isArray(value.entries)) {
      const body = value.entries.map((entry: any) => toInlineText(entry)).filter(Boolean).join(' ');
      if (value.name) return `${toInlineText(value.name)}. ${body}`.trim();
      return body;
    }
    if (Array.isArray(value.items)) {
      return value.items.map((entry: any) => toInlineText(entry)).filter(Boolean).join(', ');
    }
    if (value.name && typeof value.name === 'string') return format5eInlineText(value.name);

    const parts = Object.entries(value)
      .map(([nestedKey, nestedValue]) => {
        const nestedText = toInlineText(nestedValue);
        return nestedText ? `${toLabel(nestedKey)}: ${nestedText}` : '';
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  return String(value);
}

function renderEntriesList(entries: any[]): JSX.Element {
  return (
    <>
      {entries.map((entry, idx) => {
        if (typeof entry === 'string') {
          return <p key={`entry-${idx}`}><RollableText text={toInlineText(entry)} /></p>;
        }
        if (entry && typeof entry === 'object') {
          if ((entry as any).type === 'list' && Array.isArray((entry as any).items)) {
            return (
              <ul key={`entry-${idx}`}>
                {(entry as any).items.map((item: any, itemIdx: number) => (
                  <li key={`entry-${idx}-item-${itemIdx}`}><RollableText text={toInlineText(item)} /></li>
                ))}
              </ul>
            );
          }
          if (Array.isArray((entry as any).entries)) {
            return (
              <div key={`entry-${idx}`}>
                {(entry as any).name && <strong>{toInlineText((entry as any).name)}. </strong>}
                {renderEntriesList((entry as any).entries)}
              </div>
            );
          }
          return <p key={`entry-${idx}`}><RollableText text={toInlineText(entry)} /></p>;
        }
        return <p key={`entry-${idx}`}><RollableText text={String(entry)} /></p>;
      })}
    </>
  );
}

function getActionGroupIcon(groupKeyOrTitle: string): string {
  const normalized = String(groupKeyOrTitle || '').trim().toLowerCase();
  if (['action', 'actions'].includes(normalized)) return 'hand-fist';
  if (['bonus', 'bonusaction', 'bonusactions', 'bonus action', 'bonus actions'].includes(normalized)) return 'bolt';
  if (['reaction', 'reactions'].includes(normalized)) return 'shield';
  if (['trait', 'traits'].includes(normalized)) return 'star';
  if (['legendary', 'legendaryaction', 'legendaryactions', 'legendary action', 'legendary actions'].includes(normalized)) return 'crown';
  if (normalized.includes('bonus')) return 'bolt';
  if (normalized.includes('reaction')) return 'shield';
  if (normalized.includes('trait')) return 'star';
  if (normalized.includes('legendary')) return 'crown';
  if (normalized.includes('action')) return 'hand-fist';
  return 'file';
}

function renderMonsterSection(title: string, items: any[] | undefined, groupKey?: string): JSX.Element | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const groupIcon = getActionGroupIcon(groupKey || title);
  return (
    <div className="panel-section">
      <h4 className="panel-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name={groupIcon} />
        {title}
      </h4>
      <div className="monster-feature-list">
        {items.map((item, idx) => (
          <div key={`${title}-${idx}`} className="monster-feature-item">
            {item?.name ? <strong>{item.name}. </strong> : null}
            {Array.isArray(item?.entries) ? renderEntriesList(item.entries) : toInlineText(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSpeed(speed: any): string | null {
  if (!speed) return null;
  if (typeof speed === 'string') return speed;
  if (typeof speed === 'object') {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(speed)) {
      if (k === 'canHover') continue;
      if (typeof v === 'number') parts.push(`${k} ${v} ft.`);
      else if (typeof v === 'object' && (v as any)?.number) parts.push(`${k} ${(v as any).number} ft.`);
      else if (typeof v === 'string') parts.push(`${k} ${v}`);
    }
    return parts.join(', ');
  }
  return null;
}

function formatAc(ac: any): string | null {
  if (Array.isArray(ac) && ac.length > 0) {
    const first = ac[0];
    if (typeof first === 'number') return String(first);
    if (typeof first === 'object') {
      const acVal = (first as any).ac ?? '';
      const from = Array.isArray((first as any).from) ? ` (${(first as any).from.join(', ')})` : '';
      return `${acVal}${from}`.trim();
    }
  }
  if (typeof ac === 'number' || typeof ac === 'string') return String(ac);
  return null;
}

function formatHp(hp: any): string | null {
  if (!hp) return null;
  if (typeof hp === 'object') {
    const avg = (hp as any).average ?? '';
    const formula = (hp as any).formula ? ` (${(hp as any).formula})` : '';
    const special = (hp as any).special ? ` ${(hp as any).special}` : '';
    return `${avg}${formula}${special}`.trim();
  }
  return String(hp);
}

function formatAbilityMod(score: any): string {
  const n = Number(score ?? 10);
  const mod = Math.floor((n - 10) / 2);
  return `${n} (${mod >= 0 ? '+' : ''}${mod})`;
}

function formatSizeDisplay(value: any): string {
  if (value === null || value === undefined) return '';
  const map: Record<string, string> = {
    t: 'Tiny', tiny: 'Tiny',
    s: 'Small', small: 'Small',
    m: 'Medium', medium: 'Medium',
    l: 'Large', large: 'Large',
    h: 'Huge', huge: 'Huge',
    g: 'Gargantuan', gargantuan: 'Gargantuan',
  };

  if (Array.isArray(value)) {
    return value.map((entry) => formatSizeDisplay(entry)).filter(Boolean).join(', ');
  }

  const normalized = String(value).trim().toLowerCase();
  return map[normalized] || String(value);
}

function formatAlignmentDisplay(value: any): string {
  if (value === null || value === undefined) return '';
  const map: Record<string, string> = {
    l: 'Lawful', n: 'Neutral', c: 'Chaotic',
    g: 'Good', e: 'Evil', u: 'Unaligned', a: 'Any Alignment',
    lg: 'Lawful Good', ln: 'Lawful Neutral', le: 'Lawful Evil',
    ng: 'Neutral Good', nn: 'Neutral', ne: 'Neutral Evil',
    cg: 'Chaotic Good', cn: 'Chaotic Neutral', ce: 'Chaotic Evil',
  };

  if (Array.isArray(value)) {
    return value.map((entry) => formatAlignmentDisplay(entry)).filter(Boolean).join(', ');
  }

  const raw = String(value).trim();
  const normalized = raw.toLowerCase();
  if (map[normalized]) return map[normalized];

  // Handle compact forms like "L G" or "C E"
  const compact = normalized.replace(/[^a-z]/g, '');
  if (map[compact]) return map[compact];

  return toLabel(raw);
}

function renderMonsterSummary(system: any): JSX.Element | null {
  if (!system) return null;
  const hasMonsterSignals = ['str', 'dex', 'con', 'int', 'wis', 'cha', 'trait', 'action', 'cr', 'ac', 'hp'].some((k) => system[k] !== undefined);
  if (!hasMonsterSignals) return null;

  const typeText = typeof system.type === 'string' ? system.type : system.type?.type;
  const alignmentText = formatAlignmentDisplay(system.alignment);

  return (
    <>
      <div className="panel-section">
        <h4 className="panel-section-title">Monster Stats</h4>
        <div className="monster-meta-line">
          {[formatSizeDisplay(system.size), typeText, alignmentText].filter(Boolean).join(' • ')}
        </div>
        <div className="monster-core-grid">
          {formatAc(system.ac) && <div><span>Armor Class</span><span>{formatAc(system.ac)}</span></div>}
          {formatHp(system.hp) && <div><span>Hit Points</span><span>{formatHp(system.hp)}</span></div>}
          {formatSpeed(system.speed) && <div><span>Speed</span><span>{formatSpeed(system.speed)}</span></div>}
          {system.cr !== undefined && <div><span>Challenge</span><span>{String(system.cr)}</span></div>}
          {system.languages && <div><span>Languages</span><span>{toInlineText(system.languages)}</span></div>}
          {(system.senses || system.passive) && (
            <div>
              <span>Senses</span>
              <span>{[toInlineText(system.senses), system.passive ? `passive ${system.passive}` : null].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>
        <div className="monster-abilities">
          {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((ability) => (
            <div key={ability}>
              <strong>{ability.toUpperCase()}</strong>
              <span>{formatAbilityMod(system[ability])}</span>
            </div>
          ))}
        </div>
      </div>
      {renderMonsterSection('Traits', system.trait || system.traits, 'trait')}
      {renderMonsterSection('Actions', system.action || system.actions, 'action')}
      {renderMonsterSection('Bonus Actions', system.bonus || system.bonusActions, 'bonus')}
      {renderMonsterSection('Reactions', system.reaction || system.reactions, 'reaction')}
      {renderMonsterSection('Legendary Actions', system.legendary || system.legendaryActions, 'legendary')}
    </>
  );
}

function renderValueByType(key: string, value: any, uiControl: string): JSX.Element {
  if (key === 'size') {
    return <span className="field-value"><RollableText text={formatSizeDisplay(value)} /></span>;
  }

  if (key === 'alignment') {
    return <span className="field-value"><RollableText text={formatAlignmentDisplay(value)} /></span>;
  }

  if (uiControl === 'toggle') {
    return <span className="field-value">{value ? 'Yes' : 'No'}</span>;
  }

  if (uiControl === 'dropdown' || uiControl === 'numericInput') {
    return <span className="field-value">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      return (
        <div className="field-value">
              {value.map((entry: any, idx: number) => (
                <div key={`${key}-obj-${idx}`} className="panel-array-object">
                  {entry.name && <strong>{toInlineText(entry.name)}</strong>}
                  {Array.isArray(entry.entries)
                    ? renderEntriesList(entry.entries)
                    : <RollableText text={toInlineText(entry)} />}
                </div>
              ))}
        </div>
      );
    }
    return (
      <ul className="panel-value-list">
        {value.map((item, idx) => <li key={`${key}-${idx}`}><RollableText text={toInlineText(item)} /></li>)}
      </ul>
    );
  }

  if (typeof value === 'string') {
    const isListLikeKey = /(proficien|language|equipment|feature|traits?|senses|resistances|immunities)/i.test(key);
    if (isListLikeKey && (value.includes(',') || value.includes(';'))) {
      const values = parseDelimitedValue(value);
      if (values.length > 1) {
        return (
          <ul className="panel-value-list">
            {values.map((item, idx) => <li key={`${key}-${idx}`}><RollableText text={toInlineText(item)} /></li>)}
          </ul>
        );
      }
    }
    return <span className="field-value"><RollableText text={toInlineText(value)} /></span>;
  }

  if (typeof value === 'object') {
    return (
      <div className="field-value">
        {Object.entries(value).map(([nestedKey, nestedValue]) => (
          <div key={`${key}-${nestedKey}`}>
            {toLabel(nestedKey)}: <RollableText text={toInlineText(nestedValue)} />
          </div>
        ))}
      </div>
    );
  }

  return <span className="field-value">{String(value)}</span>;
}

function renderTextContent(text: string): JSX.Element {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, idx) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        const isList = lines.every((line) => /^[-*•]\s+/.test(line));
        if (isList) {
          return (
            <ul key={`list-${idx}`}>
              {lines.map((line, liIdx) => (
                <li key={`li-${idx}-${liIdx}`}><RollableText text={toInlineText(line.replace(/^[-*•]\s+/, ''))} /></li>
              ))}
            </ul>
          );
        }
        return <p key={`p-${idx}`}><RollableText text={toInlineText(block)} /></p>;
      })}
    </>
  );
}

function stripHtmlToText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSpellSchool(value: any): string | null {
  if (!value) return null;
  const map: Record<string, string> = {
    a: 'Abjuration', c: 'Conjuration', d: 'Divination', e: 'Enchantment',
    v: 'Evocation', i: 'Illusion', n: 'Necromancy', t: 'Transmutation',
    abj: 'Abjuration', con: 'Conjuration', div: 'Divination', enc: 'Enchantment',
    evo: 'Evocation', ill: 'Illusion', nec: 'Necromancy', trs: 'Transmutation',
  };
  const key = String(value).toLowerCase();
  return map[key] || titleCase(String(value));
}

function formatSpellTime(system: any): string | null {
  if (Array.isArray(system.time) && system.time[0]) {
    const t = system.time[0];
    if (t.number && t.unit) return `${t.number} ${titleCase(String(t.unit))}`;
  }
  if (system.activation?.type) {
    const n = system.activation?.value ? `${system.activation.value} ` : '';
    return `${n}${titleCase(String(system.activation.type))}`.trim();
  }
  return null;
}

function formatSpellRange(system: any): string | null {
  if (system.range?.value !== undefined && system.range?.units) {
    return `${system.range.value} ${String(system.range.units).replace('ft', 'ft')}`.trim();
  }
  if (system.range?.distance?.amount !== undefined && system.range?.distance?.type) {
    return `${system.range.distance.amount} ${String(system.range.distance.type).replace('feet', 'ft')}`.trim();
  }
  if (system.range?.type) return titleCase(String(system.range.type));
  return null;
}

function formatSpellTarget(system: any): string | null {
  const affects = system.target?.affects;
  if (affects && (affects.count || affects.type)) {
    const count = affects.count ? `${affects.count} ` : '';
    return `${count}${titleCase(String(affects.type || ''))}`.trim();
  }
  return null;
}

function formatSpellDuration(system: any): string | null {
  if (Array.isArray(system.duration) && system.duration[0]?.type) {
    return titleCase(String(system.duration[0].type));
  }
  if (system.duration?.units) {
    const map: Record<string, string> = {
      inst: 'Instantaneous',
      round: 'Round',
      minute: 'Minute',
      hour: 'Hour',
      day: 'Day',
      perm: 'Permanent',
    };
    const base = map[String(system.duration.units)] || titleCase(String(system.duration.units));
    return system.duration.value ? `${system.duration.value} ${base}` : base;
  }
  return null;
}

function formatSpellScaling(system: any): string | null {
  const scaling = system.scalingLevelDice?.scaling;
  if (scaling && typeof scaling === 'object') {
    return Object.entries(scaling).map(([lvl, dice]) => `Lv ${lvl}: ${dice}`).join(' | ');
  }
  if (system.scaling?.formula) return String(system.scaling.formula);
  return null;
}

function formatSpellComponents(system: any): string | null {
  const components = system.components;
  if (components && typeof components === 'object') {
    const parts: string[] = [];
    if ((components as any).v) parts.push('V');
    if ((components as any).s) parts.push('S');
    if ((components as any).m) parts.push('M');
    if ((components as any).verbal || (components as any).vocal) parts.push('V');
    if ((components as any).somatic) parts.push('S');
    if ((components as any).material) parts.push('M');

    const materialText = typeof (components as any).m === 'string'
      ? String((components as any).m)
      : typeof (components as any).material === 'string'
        ? String((components as any).material)
        : typeof (components as any).m?.text === 'string'
          ? String((components as any).m.text)
          : '';

    if (parts.length > 0) {
      const short = Array.from(new Set(parts)).join(', ');
      return materialText ? `${short} (${materialText})` : short;
    }
  }
  if (Array.isArray(system.properties)) {
    const map: Record<string, string> = { vocal: 'V', somatic: 'S', material: 'M' };
    const values = system.properties.map((p: string) => map[p] || p).filter(Boolean);
    if (values.length > 0) return values.join(', ');
  }
  return null;
}

function getItemDescription(item: any): string {
  const base = item.description || item.summary;
  if (typeof base === 'string' && base.trim()) return base;
  const htmlDescription = item.system?.description?.value;
  if (typeof htmlDescription === 'string' && htmlDescription.trim()) {
    return stripHtmlToText(htmlDescription);
  }
  return '';
}

function updateItemSystem(item: any, patch: Record<string, any>) {
  return {
    ...item,
    system: {
      ...(item.system || {}),
      ...patch,
    },
  };
}

function updateItemSystemField(item: any, key: string, value: any) {
  return updateItemSystem(item, { [key]: value });
}

function isPlainDataObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatSpellLevel(level: any): string {
  const numericLevel = Number(level ?? 0);
  if (!Number.isFinite(numericLevel) || numericLevel <= 0) return 'Cantrip';

  const suffix = numericLevel % 10 === 1 && numericLevel % 100 !== 11
    ? 'st'
    : numericLevel % 10 === 2 && numericLevel % 100 !== 12
      ? 'nd'
      : numericLevel % 10 === 3 && numericLevel % 100 !== 13
        ? 'rd'
        : 'th';

  return `${numericLevel}${suffix}-Level`;
}

function isSpellConcentration(system: any): boolean {
  if (Array.isArray(system?.duration)) {
    return system.duration.some((entry: any) => entry?.concentration);
  }
  return Boolean(system?.duration?.concentration);
}

function isSpellRitual(system: any): boolean {
  return Boolean(system?.meta?.ritual || system?.ritual);
}

function getSpellPrimaryEntries(item: any): any[] {
  if (Array.isArray(item?.system?.entries)) return item.system.entries;
  if (Array.isArray(item?.entries)) return item.entries;
  return [];
}

function getSpellEditorSections(system: Record<string, any>): Array<{ title: string; description?: string; keys: string[] }> {
  const spellSections = [
    {
      title: 'Spell Core',
      description: 'Core spellbook identity and casting information.',
      keys: ['level', 'school', 'time', 'range', 'components', 'duration'],
    },
    {
      title: 'Rules Text',
      description: 'Primary spell text and scaling details.',
      keys: ['entries', 'entriesHigherLevel', 'scalingLevelDice', 'scaling'],
    },
    {
      title: 'Mechanics',
      description: 'Damage, saves, targeting, and gameplay tags.',
      keys: ['target', 'damageInflict', 'savingThrow', 'miscTags', 'areaTags', 'spellCastEffect', 'spellImpactEffect'],
    },
    {
      title: 'References',
      description: 'Source flags and linked publication metadata.',
      keys: ['srd', 'basicRules', 'referenceSources', 'reprintedAs', 'page'],
    },
    {
      title: 'Advanced Spell Data',
      description: 'Additional imported spell properties.',
      keys: Object.keys(system).filter((key) => ![
        'level', 'school', 'time', 'range', 'components', 'duration',
        'entries', 'entriesHigherLevel', 'scalingLevelDice', 'scaling',
        'target', 'damageInflict', 'savingThrow', 'miscTags', 'areaTags',
        'spellCastEffect', 'spellImpactEffect',
        'srd', 'basicRules', 'referenceSources', 'reprintedAs', 'page',
      ].includes(key)),
    },
  ].filter((section) => section.keys.length > 0);
  
  console.log('[DEBUG] getSpellSections called for spell, sections:', spellSections.map(s => s.title).join(', '));
  return spellSections;
}

function getPanelLayoutType(type: string): string {
  const normalized = String(type || '').toLowerCase();
  if (["monster", "creature", "npc"].includes(normalized)) return 'creature';
  if (normalized === 'spell') return 'spell';
  if (normalized === 'race' || normalized === 'species') return 'species';
  if (['weapon', 'armor', 'equipment'].includes(normalized)) return 'item';
  return normalized || 'item';
}

function normalizeEditorSystemForSave(itemType: string, system: Record<string, any>): Record<string, any> {
  const layoutType = getPanelLayoutType(itemType);
  const next = { ...(system || {}) };

  if (layoutType === 'creature') {
    const actionKeys = ['action', 'actions', 'bonus', 'bonusActions', 'reaction', 'reactions', 'trait', 'traits', 'legendary', 'legendaryActions'];
    actionKeys.forEach((key) => {
      if (!Array.isArray(next[key])) return;
      next[key] = next[key]
        .map((entry: any) => {
          if (entry == null) return null;
          if (typeof entry === 'string') {
            return { name: 'Action', entries: [entry] };
          }
          if (typeof entry === 'object') {
            const normalizedEntries = Array.isArray(entry.entries)
              ? entry.entries
              : entry.entries == null
                ? []
                : [String(entry.entries)];
            return {
              ...entry,
              name: String(entry.name || 'Action').trim(),
              entries: normalizedEntries,
            };
          }
          return { name: 'Action', entries: [String(entry)] };
        })
        .filter(Boolean);
    });
  }

  if (layoutType === 'spell') {
    ['entries', 'entriesHigherLevel'].forEach((key) => {
      if (!Array.isArray(next[key])) return;
      next[key] = next[key]
        .map((entry: any) => {
          if (entry == null) return null;
          if (typeof entry === 'string') return entry;
          if (typeof entry === 'object') return entry;
          return String(entry);
        })
        .filter((entry: any) => entry !== null && entry !== undefined && !(typeof entry === 'string' && entry.trim() === ''));
    });
  }

  return next;
}

function isMissingRequiredValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function getRequiredFieldHints(item: any): Record<string, string> {
  const normalized = normalizeViewerItem(item);
  const itemType = String(normalized.type || '').toLowerCase();
  const layoutType = getPanelLayoutType(itemType);

  const required: Record<string, string> = {
    'name': 'Name is required.',
    'type': 'Type is required.',
  };

  if (layoutType === 'spell') {
    required['system.level'] = 'Spell level is required.';
    required['system.school'] = 'Spell school is required.';
    required['system.entries'] = 'Spell rules text is required.';
  }

  if (layoutType === 'creature') {
    required['system.ac'] = 'Armor Class is required.';
    required['system.hp'] = 'Hit Points are required.';
    required['system.cr'] = 'Challenge rating is required.';
  }

  if (layoutType === 'class') {
    required['system.hitDie'] = 'Class hit die is required.';
  }

  if (layoutType === 'feat') {
    required['system.entries'] = 'Feat description is required.';
  }

  if (layoutType === 'background') {
    required['system.entries'] = 'Background description is required.';
  }

  if (layoutType === 'species') {
    required['system.size'] = 'Race/species size is required.';
  }

  if (layoutType === 'condition') {
    required['system.entries'] = 'Condition rules text is required.';
  }

  return required;
}

const SIZE_LABEL_MAP: Record<string, string> = {
  t: 'Tiny',
  tiny: 'Tiny',
  s: 'Small',
  small: 'Small',
  m: 'Medium',
  medium: 'Medium',
  l: 'Large',
  large: 'Large',
  h: 'Huge',
  huge: 'Huge',
  g: 'Gargantuan',
  gargantuan: 'Gargantuan',
};

function getReadableSizeLabel(input: string): string {
  const normalized = String(input || '').trim().toLowerCase();
  return SIZE_LABEL_MAP[normalized] || input;
}

function getEntityEditorSections(
  itemType: string,
  system: Record<string, any>,
): Array<{ title: string; description?: string; keys: string[] }> {
  const layoutType = getPanelLayoutType(itemType);
  console.log('[DEBUG getEntityEditorSections] itemType:', itemType, 'layoutType:', layoutType, 'system keys:', Object.keys(system));

  const buildSections = (configuredSections: Array<{ title: string; description?: string; keys: string[] }>) => {
    const coveredKeys = new Set(configuredSections.flatMap((section) => section.keys));
    const remainingKeys = Object.keys(system).filter((key) => !coveredKeys.has(key));
    console.log('[DEBUG buildSections] configuredSections keys:', configuredSections.map(s => s.keys), 'remainingKeys:', remainingKeys);

    return [
      ...configuredSections,
      {
        title: 'Advanced Data',
        description: 'Additional imported properties for this entry.',
        keys: remainingKeys,
      },
    ].filter((section) => section.keys.length > 0);
  };

  switch (layoutType) {
    case 'spell':
      return buildSections([
        {
          title: 'Spell Details',
          description: 'Core spell identity, school, and component profile.',
          keys: ['level', 'school', 'components', 'preparation', 'sourceClass', 'ability'],
        },
        {
          title: 'Casting',
          description: 'How the spell is cast, at what range, and for how long.',
          keys: ['activation', 'time', 'range', 'duration', 'concentration', 'ritual'],
        },
        {
          title: 'Targets & Area',
          description: 'Targeting profile and area details.',
          keys: ['target', 'targets', 'area'],
        },
        {
          title: 'Usage',
          description: 'Resource consumption and limited-use behavior.',
          keys: ['uses', 'consume', 'cost'],
        },
        {
          title: 'Text & Effects',
          description: 'Rules text, higher-level scaling, and additional effects.',
          keys: ['entries', 'entriesHigherLevel', 'scaling', 'scalingLevelDice', 'damage', 'save'],
        },
      ]);
    case 'class':
      return buildSections([
        {
          title: 'Class Core',
          description: 'Hit die and defining class abilities.',
          keys: ['hitDie', 'primaryAbility', 'spellcastingAbility'],
        },
        {
          title: 'Proficiencies',
          description: 'Saving throws, armor, weapons, and tools.',
          keys: ['savingThrows', 'armorProficiencies', 'weaponProficiencies', 'toolProficiencies', 'skillProficiencies'],
        },
        {
          title: 'Class Features',
          description: 'Feature lists, subclasses, and starting equipment.',
          keys: ['classFeatures', 'subclasses', 'startingEquipment', 'multiclassing', 'entries'],
        },
      ]);
    case 'feat':
      return buildSections([
        {
          title: 'Feat Basics',
          description: 'Prerequisites and repeatability.',
          keys: ['prerequisites', 'repeatable'],
        },
        {
          title: 'Benefits',
          description: 'Mechanical and narrative feat benefits.',
          keys: ['benefits', 'abilityBonuses', 'entries'],
        },
      ]);
    case 'background':
      return buildSections([
        {
          title: 'Background Basics',
          description: 'Proficiencies, languages, and starting gear.',
          keys: ['skillProficiencies', 'toolProficiencies', 'languages', 'equipment'],
        },
        {
          title: 'Background Feature',
          description: 'Feature text and ability-related information.',
          keys: ['feature', 'abilityScores', 'entries'],
        },
      ]);
    case 'species':
      return buildSections([
        {
          title: 'Species Core',
          description: 'Size, speed, languages, and ability bonuses.',
          keys: ['size', 'speed', 'languages', 'abilityBonuses'],
        },
        {
          title: 'Traits',
          description: 'Species traits and special rules.',
          keys: ['traits', 'darkvision', 'resist', 'immune', 'conditionImmune', 'entries'],
        },
      ]);
    case 'condition':
      return buildSections([
        {
          title: 'Condition Rules',
          description: 'Rules text and effect details.',
          keys: ['entries', 'effects', 'duration', 'applies'],
        },
      ]);
    case 'item':
      return buildSections([
        {
          title: 'Item Basics',
          description: 'Rarity, attunement, value, and core equipment stats.',
          keys: ['rarity', 'requiresAttunement', 'attunement', 'value', 'weight', 'weaponCategory', 'damage', 'damageType', 'ac', 'strength'],
        },
        {
          title: 'Item Properties',
          description: 'Properties, charges, and rule text.',
          keys: ['properties', 'charges', 'benefits', 'entries', 'weaponAttackEffect', 'weaponHitEffect'],
        },
      ]);
    default:
      return buildSections([
        {
          title: 'Properties',
          description: 'Structured data fields for this entry.',
          keys: Object.keys(system),
        },
      ]);
  }
}

function normalizeViewerItem(item: any): any {
  if (!item || typeof item !== 'object') return item;

  const normalized = normalizeEntry(item);
  const directSystem = normalizeSystemKeys(item.system && typeof item.system === 'object' ? item.system : {});
  const dataSystem = normalizeSystemKeys(item.data && typeof item.data === 'object' ? item.data : {});
  const mergedSystem = sanitizeSystemData({
    ...normalized.system,
    ...directSystem,
    ...dataSystem,
  });

  return {
    ...item,
    ...normalized,
    type: normalized.type || item.type || inferType(item),
    description: normalized.description ?? item.description ?? item.desc ?? item.summary ?? getItemDescription(item),
    book: normalized.book ?? item.book ?? item.source ?? item.system?.source?.custom ?? item.system?.source?.rules,
    img: normalized.img ?? item.img ?? item.system?.img ?? item.image,
    imgToken: normalized.imgToken ?? item.imgToken ?? item.system?.imgToken ?? item.tokenImage,
    imgSource: normalized.imgSource ?? item.imgSource ?? item.system?.imgSource,
    imgFallback: normalized.imgFallback ?? item.imgFallback ?? item.system?.imgFallback,
    system: mergedSystem,
  };
}

function renderSystemFields(item: any, mode: 'summary' | 'full' = 'full'): JSX.Element | null {
  const normalizedItem = normalizeViewerItem(item);
  const itemData = normalizedItem?.system || {};
  const itemType = (normalizedItem?.type || '').toLowerCase();
  const isMonster = itemType === 'monster';
  const keys = Object.keys(itemData).filter((key) => !META_SYSTEM_KEYS.has(key));
  if (keys.length === 0) return null;

  const hiddenMonsterKeys = new Set([
    'size', 'type', 'alignment', 'ac', 'hp', 'speed', 'cr', 'languages', 'senses', 'passive',
    'str', 'dex', 'con', 'int', 'wis', 'cha',
    'trait', 'traits', 'action', 'actions', 'bonus', 'bonusActions', 'reaction', 'reactions', 'legendary', 'legendaryActions',
  ]);
  const hiddenSpellKeys = new Set([
    'activation', 'time', 'range', 'target', 'components', 'duration', 'scalingLevelDice', 'scaling', 'school',
  ]);

  return (
    <>
      {isMonster ? renderMonsterSummary(itemData) : null}
      {keys.map((key) => {
        if (isMonster && hiddenMonsterKeys.has(key)) {
          return null;
        }
        if (mode === 'summary' && itemType === 'spell' && hiddenSpellKeys.has(key)) {
          return null;
        }
        const value = itemData[key];
        if (value === undefined || value === null) return null;
        const uiControl = getUIControlFromValue(value);
        
        return (
          <div key={key} className="detail-field">
            <span className="field-label">{toLabel(key)}:</span>
            {renderValueByType(key, value, uiControl)}
          </div>
        );
      })}
    </>
  );
}

interface DataManagerProps {
  sheetLayerOnly?: boolean;
  requestedSheet?: ActiveSheet | null;
  onSheetHandled?: () => void;
}

export function DataManager({ sheetLayerOnly = false, requestedSheet = null, onSheetHandled }: DataManagerProps) {
  const {
    dndManagerPosition,
    setDndManagerPosition,
    dndManagerSize,
    setDndManagerSize,
    dndManagerVisible,
    setDndManagerVisible,
    isGM,
    session,
    colorScheme,
    floatingPanels,
    addFloatingPanel,
    updateFloatingPanel,
    removeFloatingPanel,
    panelFocus,
    setPanelFocus,
    dataManagerSelectedCreatureId,
    dataManagerSelectedCreatureSearchName,
    clearSelectedCreatureInDataManager,
  } = useGameStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Floating sheet drag handling state
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null);
  const [resizingPanel, setResizingPanel] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Module state
  const [modules, setModules] = useState<DataModule[]>([]);
  const [sessionModules, setSessionModules] = useState<SessionModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'compendium' | 'modules' | 'import' | 'journals' | 'characters'>('compendium');
  
  // Card size state for the slider
  const [cardSizeScale, setCardSizeScale] = useState<number>(1);
  
  // Browse state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, _setSearchType] = useState('all');
  const [_searchResults, setSearchResults] = useState<any[]>([]);
  const [_searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [activeBrowseTab, setActiveBrowseTab] = useState<string>('spell');
  
  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});
  
  // Available files state
  const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AvailableFile | null>(null);
  const [importName, setImportName] = useState('');
  const [importSystem, setImportSystem] = useState('');
  const [importVersion, setImportVersion] = useState('');
  const [importDescription, setImportDescription] = useState('');
  
  // Import state
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleSystem, setNewModuleSystem] = useState('');
  const [newModuleVersion, setNewModuleVersion] = useState('');
  const [newModuleDescription, setNewModuleDescription] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importType, setImportType] = useState('item');
  const [imageBackfillLimit, setImageBackfillLimit] = useState('250');
  const [imageBackfillRunning, setImageBackfillRunning] = useState(false);
  const [imageBackfillResult, setImageBackfillResult] = useState<string | null>(null);
  const [imageFetcherConfig, setImageFetcherConfig] = useState<ImageFetcherPublicConfig | null>(null);
  const [fiveEToolsOptions, setFiveEToolsOptions] = useState<FiveEToolsDatasetOption[]>([]);
  const [fiveEToolsCategory, setFiveEToolsCategory] = useState<string>('');
  const [fiveEToolsDataset, setFiveEToolsDataset] = useState<string>('');
  const [fiveEToolsName, setFiveEToolsName] = useState<string>('5eTools Spells');
  const [fiveEToolsSystem, setFiveEToolsSystem] = useState<string>('dnd5e');
  const [fiveEToolsVersion, setFiveEToolsVersion] = useState<string>('5etools');
  const [fiveEToolsDescription, setFiveEToolsDescription] = useState<string>('Imported from 5eTools');
  
  // Journal state
  const [journals, setJournals] = useState<Journal[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [isEditingJournal, setIsEditingJournal] = useState(false);
  const [journalFilterType, setJournalFilterType] = useState('all');
  const [journalTypes] = useState([
    { value: 'general', label: 'General', icon: 'file-alt' },
    { value: 'player', label: 'Player', icon: 'user' },
    { value: 'location', label: 'Location', icon: 'map-marker-alt' },
    { value: 'world', label: 'World', icon: 'globe' },
    { value: 'lore', label: 'Lore', icon: 'book' },
    { value: 'quest', label: 'Quest', icon: 'scroll' },
    { value: 'npc', label: 'NPC', icon: 'users' },
    { value: 'item', label: 'Item', icon: 'gem' },
  ]);
  const [journalLayouts] = useState([
    { value: 'standard', label: 'Standard' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'grid', label: 'Grid' },
    { value: 'map', label: 'Map Notes' },
    { value: 'character', label: 'Character Sheet' },
    { value: 'codex', label: 'Codex' },
  ]);
  
  // Character Sheet state
  const [characters, setCharacters] = useState<any[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<any | null>(null);
  const [showCharacterWizard, setShowCharacterWizard] = useState(false);
  
  // Fetch characters

  const handleDragStart = (e: React.MouseEvent) => {
    if (!isGM) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - dndManagerPosition.x,
      y: e.clientY - dndManagerPosition.y,
    });
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDndManagerPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, setDndManagerPosition]);

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isGM) return;
    e.stopPropagation();
    // Prevent text selection during resize
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, e.clientX - dndManagerPosition.x);
      const newHeight = Math.max(400, e.clientY - dndManagerPosition.y);
      setDndManagerSize({
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
  }, [isResizing, dndManagerPosition, setDndManagerSize]);

  // SheetLayer owns active sheet opening so token interactions work even with DataManager closed.
  useEffect(() => {
    if (!sheetLayerOnly || !requestedSheet || !session) return;

    const openActiveSheet = async () => {
      try {
        if (requestedSheet.type !== 'creature') {
          return;
        }

        if (requestedSheet.id) {
          const res = await fetch(`/api/data/compendium/entry/${requestedSheet.id}`);
          if (!res.ok) {
            console.error('Failed to fetch creature:', res.statusText);
            return;
          }

          const data = await res.json();
          const creature = normalizeViewerItem(data);
          if (creature) {
            const existing = floatingPanels.find((panel) => panel.item.id === creature.id);
            if (existing) {
              setPanelFocus(existing.id);
            } else {
              openItemPanel(creature);
            }
          }
          return;
        }

        if (requestedSheet.searchName) {
          const normalizedSearchName = requestedSheet.searchName.trim().toLowerCase();
          const res = await fetch(`/api/data/compendium/search?q=${encodeURIComponent(requestedSheet.searchName)}&limit=10`);
          if (!res.ok) {
            console.error('Failed to search linked sheets:', res.statusText);
            return;
          }

          const data = await res.json();
          const entries = Array.isArray(data.results) ? data.results : [];
          const matchingCreatureEntry = entries.find((entry: any) => {
            const normalizedType = String(entry?.type || '').toLowerCase();
            const normalizedName = String(entry?.name || '').trim().toLowerCase();
            return ['monster', 'npc', 'creature'].includes(normalizedType) && normalizedName === normalizedSearchName;
          }) || entries.find((entry: any) => {
            const normalizedType = String(entry?.type || '').toLowerCase();
            return ['monster', 'npc', 'creature'].includes(normalizedType);
          });

          if (matchingCreatureEntry) {
            const creature = normalizeViewerItem(matchingCreatureEntry);
            if (creature) {
              const existing = floatingPanels.find((panel) => panel.item.id === creature.id);
              if (existing) {
                setPanelFocus(existing.id);
              } else {
                openItemPanel(creature);
              }
            }
            return;
          }

          const characterRes = await fetch(`/api/data/sessions/${session.id}/characters`);
          if (characterRes.ok) {
            const sessionCharacters = await characterRes.json();
            if (Array.isArray(sessionCharacters)) {
              const matchingCharacter = sessionCharacters.find((character: any) => {
                const normalizedName = String(character?.name || '').trim().toLowerCase();
                return normalizedName === normalizedSearchName;
              }) || sessionCharacters.find((character: any) => {
                const normalizedName = String(character?.name || '').trim().toLowerCase();
                return normalizedName.includes(normalizedSearchName) || normalizedSearchName.includes(normalizedName);
              });

              if (matchingCharacter) {
                openCharacterPanel(matchingCharacter);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error opening active sheet:', error);
      } finally {
        onSheetHandled?.();
      }
    };

    openActiveSheet();
  }, [sheetLayerOnly, requestedSheet, session, floatingPanels, onSheetHandled, setPanelFocus, addFloatingPanel]);

  // Handle selecting a creature in DataManager (used when the manager is explicitly opened)
  useEffect(() => {
    if (sheetLayerOnly) return;
    if (!dataManagerSelectedCreatureId && !dataManagerSelectedCreatureSearchName) return;
    if (!session) return;
    
    const selectCreature = async () => {
      try {
        let creature = null;
        
        if (dataManagerSelectedCreatureId) {
          // Fetch creature by ID
          const res = await fetch(`/api/data/compendium/entry/${dataManagerSelectedCreatureId}`);
          if (res.ok) {
            const data = await res.json();
            creature = normalizeViewerItem(data);
            console.log('[DEBUG] Selected creature by ID:', creature?.name);
          }
        } else if (dataManagerSelectedCreatureSearchName) {
          // Search for creature by name
          const res = await fetch(`/api/data/compendium/search?q=${encodeURIComponent(dataManagerSelectedCreatureSearchName)}&type=monster&limit=5`);
          if (res.ok) {
            const data = await res.json();
            const entries = data.data || [];
            if (entries.length > 0) {
              creature = normalizeViewerItem(entries[0]);
              console.log('[DEBUG] Selected creature by name:', creature?.name);
            }
          }
        }
        
        if (creature) {
          // Set the creature as selected item in DataManager
          setSelectedItem(creature);
          console.log('[DEBUG] Set selectedItem in DataManager:', creature.name);
        }
        
        // Clear the selection state
        clearSelectedCreatureInDataManager();
      } catch (error) {
        console.error('Error selecting creature in DataManager:', error);
        clearSelectedCreatureInDataManager();
      }
    };
    
    selectCreature();
  }, [sheetLayerOnly, dataManagerSelectedCreatureId, dataManagerSelectedCreatureSearchName, session, setSelectedItem, clearSelectedCreatureInDataManager]);

  // Panel drag handling
  useEffect(() => {
    if (!draggingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateFloatingPanel(draggingPanel, { position: { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } });
    };

    const handleMouseUp = () => {
      // Restore text selection after drag ends
      document.body.style.userSelect = '';
      console.log('[PanelDrag] Ended dragging panel');
      setDraggingPanel(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPanel, dragOffset]);

  // Panel resize handling
  useEffect(() => {
    if (!resizingPanel) return;

    const panel = floatingPanels.find(p => p.id === resizingPanel);
    if (!panel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, e.clientX - panel.position.x);
      const newHeight = Math.max(200, e.clientY - panel.position.y);
      updateFloatingPanel(resizingPanel, { size: { width: newWidth, height: newHeight } });
    };

    const handleMouseUp = () => {
      setResizingPanel(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingPanel, floatingPanels]);

  const handleClose = () => {
    setDndManagerVisible(false);
  };

  const handleImportClick = () => {
    setActiveTab('import');
    fetchAvailableFiles();
  };

  const handleModulesClick = () => {
    setActiveTab('modules');
  };

  // Fetch modules and session modules
  useEffect(() => {
    if (sheetLayerOnly) return;
    if (dndManagerVisible && session) {
      fetchModules();
      fetchSessionModules();
      fetchJournals();
      fetchCharacters();
    }
  }, [sheetLayerOnly, dndManagerVisible, session]);

  // Fetch available files when import is needed
  useEffect(() => {
    if (sheetLayerOnly) return;
    if (activeTab === 'import') {
      fetchAvailableFiles();
    }
  }, [sheetLayerOnly, activeTab]);

  // Fetch items when browse tab changes
  useEffect(() => {
    if (sheetLayerOnly) return;
    if (activeTab === 'compendium' && session) {
      fetchItemsByType(activeBrowseTab);
    }
  }, [sheetLayerOnly, activeTab, activeBrowseTab, session]);

  const fetchModules = async () => {
    try {
      const res = await fetch('/api/data/modules');
      const data = await res.json();
      setModules(data);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    }
  };

  const fetchSessionModules = async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/data/sessions/${session.id}/modules`);
      const data = await res.json();
      setSessionModules(data);
    } catch (error) {
      console.error('Failed to fetch session modules:', error);
    }
  };

  const fetchJournals = async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/data/sessions/${session.id}/journals`);
      const data = await res.json();
      setJournals(data);
    } catch (error) {
      console.error('Failed to fetch journals:', error);
    }
  };

  const createJournal = async (journal: Partial<Journal>) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/data/sessions/${session.id}/journals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(journal),
      });
      const newJournal = await res.json();
      setJournals([newJournal, ...journals]);
      return newJournal;
    } catch (error) {
      console.error('Failed to create journal:', error);
    }
  };

  const updateJournal = async (id: string, updates: Partial<Journal>) => {
    try {
      const res = await fetch(`/api/data/journals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const updated = await res.json();
      setJournals(journals.map(j => j.id === id ? updated : j));
      return updated;
    } catch (error) {
      console.error('Failed to update journal:', error);
    }
  };

  const deleteJournal = async (id: string) => {
    try {
      await fetch(`/api/data/journals/${id}`, { method: 'DELETE' });
      setJournals(journals.filter(j => j.id !== id));
    } catch (error) {
      console.error('Failed to delete journal:', error);
    }
  };

  const fetchCharacters = async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/data/sessions/${session.id}/characters`);
      const data = await res.json();
      setCharacters(data);
    } catch (error) {
      console.error('Failed to fetch characters:', error);
    }
  };

  const createCharacter = () => {
    setShowCharacterWizard(true);
  };

  const updateCharacter = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/data/characters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const updated = await res.json();
      setCharacters(characters.map(c => c.id === id ? updated : c));
      if (selectedCharacter?.id === id) {
        setSelectedCharacter(updated);
      }
    } catch (error) {
      console.error('Failed to update character:', error);
    }
  };

  const deleteCharacter = async (id: string) => {
    try {
      await fetch(`/api/data/characters/${id}`, { method: 'DELETE' });
      setCharacters(characters.filter(c => c.id !== id));
      if (selectedCharacter?.id === id) {
        setSelectedCharacter(null);
      }
    } catch (error) {
      console.error('Failed to delete character:', error);
    }
  };

  // Handle dropping items onto character sheets
  useEffect(() => {
    if (!sheetLayerOnly) return;

    const handleAddItemToCharacter = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { characterId, itemData } = customEvent.detail;
      try {
        await fetch(`/api/data/characters/${characterId}/inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: itemData.id, itemData }),
        });
        // Refresh the character data
        const res = await fetch(`/api/data/characters/${characterId}`);
        const updated = await res.json();
        setCharacters(characters.map(c => c.id === characterId ? updated : c));
        if (selectedCharacter?.id === characterId) {
          setSelectedCharacter(updated);
        }
      } catch (error) {
        console.error('Failed to add item to character:', error);
      }
    };

    window.addEventListener('addItemToCharacter', handleAddItemToCharacter);
    return () => window.removeEventListener('addItemToCharacter', handleAddItemToCharacter);
  }, [sheetLayerOnly, characters, selectedCharacter]);

  const fetchAvailableFiles = async () => {
    try {
      const res = await fetch('/api/data/files');
      const data = await res.json();
      setAvailableFiles(data.files || []);
    } catch (error) {
      console.error('Failed to fetch available files:', error);
    }
  };

  const handleFileImport = async () => {
    if (!selectedFile || !importName || !importSystem) return;
    setLoading(true);
    try {
      // Use the new compendium import endpoint for normalized structure
      const res = await fetch('/api/data/import/compendium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.filename,
          name: importName,
          system: importSystem,
          version: importVersion || null,
          description: importDescription || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully imported ${data.imported} items from ${selectedFile.filename}!`);
        setSelectedFile(null);
        setImportName('');
        setImportSystem('');
        setImportVersion('');
        setImportDescription('');
        fetchModules();
        setActiveTab('modules');
      }
    } catch (error) {
      console.error('Failed to import file:', error);
      alert('Failed to import file');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const selected = fiveEToolsOptions.find((opt) => opt.key === fiveEToolsDataset);
    if (selected) setFiveEToolsName(selected.defaultName);
  }, [fiveEToolsDataset, fiveEToolsOptions]);

  const fiveEToolsCategories = Array.from(
    new Map(
      fiveEToolsOptions.map((opt) => [opt.category, { value: opt.category, label: opt.categoryLabel }]),
    ).values(),
  );

  const fiveEToolsSources = fiveEToolsOptions.filter((opt) => opt.category === fiveEToolsCategory);

  useEffect(() => {
    const load5eToolsDatasets = async () => {
      if (activeTab !== 'import') return;
      try {
        const res = await fetch('/api/data/import/5etools/datasets');
        const data = await res.json();
        const datasets: FiveEToolsDatasetOption[] = Array.isArray(data?.datasets) ? data.datasets : [];
        setFiveEToolsOptions(datasets);
        if (datasets.length > 0 && !fiveEToolsCategory) {
          const first = datasets[0];
          setFiveEToolsCategory(first.category);
          setFiveEToolsDataset(first.key);
          setFiveEToolsName(first.defaultName);
        }
      } catch (error) {
        console.error('Failed to load 5eTools datasets:', error);
      }
    };

    load5eToolsDatasets();
  }, [activeTab]);

  const handle5eToolsImport = async () => {
    if (!fiveEToolsDataset || !fiveEToolsName || !fiveEToolsSystem) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data/import/5etools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: fiveEToolsDataset,
          name: fiveEToolsName,
          system: fiveEToolsSystem,
          version: fiveEToolsVersion || null,
          description: fiveEToolsDescription || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || '5eTools import failed');
      }
      alert(`Successfully imported ${data.imported} of ${data.fetched} entries from 5eTools (${fiveEToolsDataset}).`);
      fetchModules();
      setActiveTab('modules');
    } catch (error) {
      console.error('Failed to import from 5eTools:', error);
      alert('Failed to import from 5eTools');
    } finally {
      setLoading(false);
    }
  };

  const quickImport = async () => {
    if (!importJson) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: importSystem || 'Quick Import',
          system: importType,
        }),
      });
      const data = await res.json();
      const items = JSON.parse(importJson);
      await fetch(`/api/data/modules/${data.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Array.isArray(items) ? items : [items],
          type: importType,
        }),
      });
      alert('Import successful!');
      setImportJson('');
      fetchModules();
      setActiveTab('modules');
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed');
    } finally {
      setLoading(false);
    }
  };

  const refreshImageFetcherConfig = async () => {
    try {
      const res = await fetch('/api/data/compendium/images/fetcher-config');
      const data = await res.json();
      if (res.ok) setImageFetcherConfig(data || null);
    } catch (error) {
      console.error('Failed to load image fetcher config:', error);
    }
  };

  const runImageBackfill = async (type: string | null) => {
    setImageBackfillRunning(true);
    setImageBackfillResult(null);
    try {
      const limit = Math.min(Math.max(Number(imageBackfillLimit) || 250, 1), 2000);
      const res = await fetch('/api/data/compendium/images/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, limit }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Backfill failed');
      }
      setImageBackfillResult(`Backfill complete: scanned ${data.scanned}, updated ${data.updated} (${data.type}).`);
      fetchItemsByType(activeBrowseTab);
    } catch (error: any) {
      setImageBackfillResult(error?.message || 'Backfill failed');
    } finally {
      setImageBackfillRunning(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'import') {
      refreshImageFetcherConfig();
    }
  }, [activeTab]);

  const _handleSearch = async () => {
    if (!session) return;
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (searchType !== 'all') params.append('type', searchType);
      params.append('limit', '50');
      
      // Use new compendium API for normalized structure
      const res = await fetch(`/api/data/compendium/search?${params}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  // Browse state - items by type
  const [typeItems, setTypeItems] = useState<any[]>([]);
  const [loadingTypeItems, setLoadingTypeItems] = useState(false);
  const [panelEditSearch, setPanelEditSearch] = useState<Record<string, string>>({});
  const [panelShowAdvancedRaw, setPanelShowAdvancedRaw] = useState<Record<string, boolean>>({});
  const [panelImageCandidates, setPanelImageCandidates] = useState<Record<string, ImageFetcherCandidate[]>>({});
  const [panelImageBestCandidate, setPanelImageBestCandidate] = useState<Record<string, ImageFetcherCandidate | null>>({});
  const [panelImageLoading, setPanelImageLoading] = useState<Record<string, boolean>>({});
  const [panelImageError, setPanelImageError] = useState<Record<string, string | null>>({});
  
  // Open panels state - for multiple draggable item panels
interface OpenPanel {
    id: string;
    item: any;
    originalItem?: any;
    position: { x: number; y: number };
    size: { width: number; height: number };
    isEditing: boolean;
    isDirty?: boolean;
    isSaving?: boolean;
    saveError?: string | null;
    lastSavedAt?: number | null;
    collapsedSections?: Record<string, boolean>;
    activeTab?: string;
    actionSearch?: string;
    actionFilter?: string;
  }

  const getPanelSectionCollapsed = (panel: typeof floatingPanels[0], sectionKey: string): boolean => {
    return Boolean(panel.collapsedSections?.[sectionKey]);
  };

  const setPanelSectionCollapsed = (panelId: string, sectionKey: string, collapsed: boolean) => {
    const panel = floatingPanels.find((p) => p.id === panelId);
    if (!panel) return;
    const next = { ...(panel.collapsedSections || {}) };
    if (collapsed) next[sectionKey] = true;
    else delete next[sectionKey];
    updateFloatingPanel(panelId, { collapsedSections: next });
  };

  const togglePanelSectionCollapsed = (panelId: string, sectionKey: string) => {
    const panel = floatingPanels.find((p) => p.id === panelId);
    if (!panel) return;
    const isCollapsed = getPanelSectionCollapsed(panel, sectionKey);
    setPanelSectionCollapsed(panelId, sectionKey, !isCollapsed);
  };

  const scrollToPanelSection = (panelId: string, sectionKey: string) => {
    const sectionId = `panel-${panelId}-section-${sectionKey}`;
    const target = document.getElementById(sectionId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderCollapsibleEditSection = (
    panel: typeof floatingPanels[0],
    sectionKey: string,
    title: string,
    description: string | undefined,
    children: JSX.Element | JSX.Element[] | null,
  ) => {
    if (!children) return null;
    const collapsed = getPanelSectionCollapsed(panel, sectionKey);
    const sectionId = `panel-${panel.id}-section-${sectionKey}`;

    return (
      <div id={sectionId} key={sectionKey} className={`panel-edit-section ${collapsed ? 'collapsed' : ''}`}>
        <div
          className="panel-edit-section-header panel-edit-section-toggle"
          role="button"
          tabIndex={0}
          onClick={() => togglePanelSectionCollapsed(panel.id, sectionKey)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              togglePanelSectionCollapsed(panel.id, sectionKey);
            }
          }}
        >
          <div>
            <h4>{title}</h4>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            type="button"
            className="panel-inline-btn panel-inline-btn-ghost"
            title={collapsed ? 'Expand section' : 'Collapse section'}
            onClick={(event) => {
              event.stopPropagation();
              togglePanelSectionCollapsed(panel.id, sectionKey);
            }}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} />
          </button>
        </div>
        {!collapsed ? <div className="panel-edit-section-body">{children}</div> : null}
      </div>
    );
  };

  const fetchItemsByType = async (type: string, filterState?: FilterState) => {
    if (!session) return;
    setLoadingTypeItems(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      params.append('limit', '100');
      
      // Add filter parameters
      const activeFilters = filterState || filters;
      if (activeFilters.level) params.append('level', activeFilters.level);
      if (activeFilters.school) params.append('school', activeFilters.school);
      if (activeFilters.sourceClass) params.append('sourceClass', activeFilters.sourceClass);
      if (activeFilters.concentration) params.append('concentration', String(activeFilters.concentration));
      if (activeFilters.ritual) params.append('ritual', String(activeFilters.ritual));
      if (activeFilters.verbal) params.append('verbal', String(activeFilters.verbal));
      if (activeFilters.somatic) params.append('somatic', String(activeFilters.somatic));
      if (activeFilters.material) params.append('material', String(activeFilters.material));
      if (activeFilters.source) params.append('source', activeFilters.source);
      if (activeFilters.classSource) params.append('classSource', activeFilters.classSource);
      if (activeFilters.raceSource) params.append('raceSource', activeFilters.raceSource);
      if (activeFilters.crMin) params.append('crMin', activeFilters.crMin);
      if (activeFilters.crMax) params.append('crMax', activeFilters.crMax);
      if (activeFilters.creatureType) params.append('creatureType', activeFilters.creatureType);
      if (activeFilters.size) params.append('size', activeFilters.size);
      if (activeFilters.speedFly) params.append('speedFly', String(activeFilters.speedFly));
      if (activeFilters.speedSwim) params.append('speedSwim', String(activeFilters.speedSwim));
      if (activeFilters.speedBurrow) params.append('speedBurrow', String(activeFilters.speedBurrow));
      if (activeFilters.speedClimb) params.append('speedClimb', String(activeFilters.speedClimb));
      
      // Item filters
      if (activeFilters.itemType) params.append('itemType', activeFilters.itemType);
      if (activeFilters.rarity) params.append('rarity', activeFilters.rarity);
      if (activeFilters.attunement) params.append('attunement', activeFilters.attunement);
      if (activeFilters.tattooType) params.append('tattooType', activeFilters.tattooType);
      if (activeFilters.priceMin) params.append('priceMin', activeFilters.priceMin);
      if (activeFilters.priceMax) params.append('priceMax', activeFilters.priceMax);
      if (activeFilters.magical) params.append('magical', String(activeFilters.magical));
      
      // Class filters
      if (activeFilters.hasSpellcasting) params.append('hasSpellcasting', String(activeFilters.hasSpellcasting));
      
      // Race filters
      if (activeFilters.hasDarkvision) params.append('hasDarkvision', String(activeFilters.hasDarkvision));
      
      // Map 'race' to 'species' for API query since races are normalized to 'species' in the database
      // Also try both types to handle both normalized and non-normalized imports
      const apiTypes = type === 'race' ? ['species', 'race'] : [type];
      
      let allItems: any[] = [];
      for (const apiType of apiTypes) {
        const res = await fetch(`/api/data/compendium/${apiType}?${params}`);
        if (res.ok) {
          const data = await res.json();
          const items = (data.data || []).map((entry: any) => normalizeViewerItem(entry));
          allItems = [...allItems, ...items];
        }
      }
      setTypeItems(allItems);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoadingTypeItems(false);
    }
  };

  const handleToggleModule = async (moduleId: string) => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/data/sessions/${session.id}/modules/${moduleId}/toggle`, {
        method: 'POST',
      });
      const data = await res.json();
      
      // Update local state
      setSessionModules(prev => {
        const existing = prev.find(sm => sm.moduleId === moduleId);
        if (existing) {
          return prev.map(sm => sm.moduleId === moduleId ? data : sm);
        } else {
          return [...prev, data];
        }
      });
    } catch (error) {
      console.error('Failed to toggle module:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshModule = async (moduleId: string, datasetHint?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data/modules/${moduleId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datasetHint ? { dataset: datasetHint } : {}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || data?.error || 'Module refresh failed');
      }

      alert(`Refreshed ${data.imported} of ${data.fetched} entries from ${data.dataset}.`);
      await fetchModules();
      if (session) {
        await fetchSessionModules();
      }
      if (activeTab === 'compendium') {
        await fetchItemsByType(activeBrowseTab, filters);
      }
    } catch (error) {
      console.error('Failed to refresh module:', error);
      alert('Failed to refresh module');
    } finally {
      setLoading(false);
    }
  };

  // Panel management handlers
  const getFloatingPanelPosition = (panelWidth: number, panelHeight: number) => {
    const offset = floatingPanels.length * 30;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let baseX: number;
    let baseY: number;

    if (containerRect && dndManagerVisible && containerRect.left > 450) {
      baseX = Math.max(50, containerRect.left - panelWidth + offset);
      baseY = Math.max(50, containerRect.top + offset);
    } else {
      baseX = Math.min(viewportWidth - panelWidth - 24, Math.max(50, (viewportWidth / 2) + 50 + offset));
      baseY = Math.min(viewportHeight - panelHeight - 24, Math.max(50, (viewportHeight / 2) - 200 + offset * 2));
    }

    return { x: baseX, y: baseY };
  };

  const openItemPanel = (item: any) => {
    const parsedItem = normalizeViewerItem(item);
    const layoutType = getPanelLayoutType(String(parsedItem.type || ''));

    // Check if already open
    const existing = floatingPanels.find(p => p.item.id === parsedItem.id);
    if (existing) return;
    const size = layoutType === 'creature'
      ? { width: 760, height: 620 }
      : { width: 620, height: 680 };
    
    const newPanel: OpenPanel = {
      id: `panel-${Date.now()}`,
      item: parsedItem,
      originalItem: JSON.parse(JSON.stringify(parsedItem)),
      position: getFloatingPanelPosition(size.width, size.height),
      isEditing: false,
      isDirty: false,
      isSaving: false,
      saveError: null,
      lastSavedAt: null,
      collapsedSections: {},
      activeTab: ['spell', 'item'].includes(layoutType) ? 'description' : undefined,
      actionSearch: '',
      actionFilter: 'all',
      size,
    };
    addFloatingPanel(newPanel);
  };

  const openCharacterPanel = (character: any) => {
    if (!character?.id) return;

    const existing = floatingPanels.find(
      (panel) => panel.item.id === character.id && String(panel.item.type || '').toLowerCase() === 'character'
    );
    if (existing) {
      setPanelFocus(existing.id);
      return;
    }

    const size = { width: 680, height: 760 };
    addFloatingPanel({
      id: `panel-${Date.now()}`,
      item: { ...character, type: 'character' },
      position: getFloatingPanelPosition(size.width, size.height),
      isEditing: false,
      isDirty: false,
      isSaving: false,
      saveError: null,
      lastSavedAt: null,
      collapsedSections: {},
      size,
    });
  };

  const isCompendiumPanel = (panel: typeof floatingPanels[0]) => String(panel.item?.type || '').toLowerCase() !== 'character';

  const hasUnsavedChanges = (panel: typeof floatingPanels[0]) => Boolean(panel.isDirty && isCompendiumPanel(panel));

  const getDraftValidationErrors = (item: any): string[] => {
    const normalized = normalizeViewerItem(item);
    const itemType = String(normalized.type || '').toLowerCase();
    const errors: string[] = [];

    if (!String(normalized.name || '').trim()) {
      errors.push('Name is required.');
    }
    if (!itemType) {
      errors.push('Type is required.');
    }

    const system = normalized.system || {};
    const layoutType = getPanelLayoutType(itemType);

    if (layoutType === 'spell') {
      if (system.level === undefined || system.level === null || system.level === '') errors.push('Spell level is required.');
      if (!system.school) errors.push('Spell school is required.');
      if (!Array.isArray(system.entries) || system.entries.length === 0) errors.push('Spell rules text (entries) is required.');
    }

    if (layoutType === 'creature') {
      if (system.ac === undefined || system.ac === null || system.ac === '') errors.push('Armor Class is required.');
      if (system.hp === undefined || system.hp === null || system.hp === '') errors.push('Hit Points are required.');
      if (system.cr === undefined || system.cr === null || system.cr === '') errors.push('Challenge rating is required.');
    }

    if (layoutType === 'class' && !system.hitDie) {
      errors.push('Class hit die is required.');
    }

    if (layoutType === 'feat' && (!Array.isArray(system.entries) || system.entries.length === 0)) {
      errors.push('Feat description is required.');
    }

    if (layoutType === 'background' && (!Array.isArray(system.entries) || system.entries.length === 0)) {
      errors.push('Background description is required.');
    }

    if (layoutType === 'species' && !system.size) {
      errors.push('Race/species size is required.');
    }

    if (layoutType === 'condition' && (!Array.isArray(system.entries) || system.entries.length === 0)) {
      errors.push('Condition rules text is required.');
    }

    return errors;
  };

  const buildCompendiumUpdatePayload = (item: any) => {
    const normalized = normalizeViewerItem(item);
    const itemType = String(normalized.type || '').toLowerCase();
    const normalizedSystem = normalizeEditorSystemForSave(itemType, sanitizeSystemData(normalized.system || {}));
    return {
      id: normalized.id,
      type: itemType,
      name: String(normalized.name || '').trim(),
      book: normalized.book || normalized.source || null,
      source: normalized.source || normalized.book || null,
      slug: normalized.slug || null,
      description: normalized.description || null,
      img: normalized.img || null,
      imgToken: normalized.imgToken || null,
      imgSource: normalized.imgSource || null,
      imgFallback: normalized.imgFallback || getFallbackImageForType(itemType),
      system: normalizedSystem,
    };
  };

  const savePanelItem = async (panelId: string) => {
    const panel = floatingPanels.find((p) => p.id === panelId);
    if (!panel || !isCompendiumPanel(panel)) return;

    const validationErrors = getDraftValidationErrors(panel.item);
    if (validationErrors.length > 0) {
      updateFloatingPanel(panelId, { saveError: validationErrors[0], isSaving: false });
      return;
    }

    updateFloatingPanel(panelId, { isSaving: true, saveError: null });

    try {
      const payload = buildCompendiumUpdatePayload(panel.item);
      const res = await fetch(`/api/data/compendium/entry/${panel.item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Failed to save (${res.status})`);
      }

      const saved = normalizeViewerItem(await res.json());
      updateFloatingPanel(panelId, {
        item: saved,
        originalItem: JSON.parse(JSON.stringify(saved)),
        isDirty: false,
        isSaving: false,
        saveError: null,
        lastSavedAt: Date.now(),
        isEditing: false,
      });

      fetchItemsByType(activeBrowseTab);
    } catch (error: any) {
      updateFloatingPanel(panelId, {
        isSaving: false,
        saveError: error?.message || 'Failed to save entry',
      });
    }
  };

  const focusAdjacentSection = (panelId: string, direction: 'next' | 'prev') => {
    const selector = `[id^="panel-${panelId}-section-"]`;
    const sections = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if (sections.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const activeIdx = sections.findIndex((section) => section.contains(active));
    const currentIdx = activeIdx >= 0 ? activeIdx : 0;
    const nextIdx = direction === 'next'
      ? Math.min(sections.length - 1, currentIdx + 1)
      : Math.max(0, currentIdx - 1);
    sections[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sections[nextIdx]?.focus?.();
  };

  const discardPanelChanges = (panelId: string, exitEditMode = true) => {
    const panel = floatingPanels.find((p) => p.id === panelId);
    if (!panel || !isCompendiumPanel(panel)) return;

    const fallback = normalizeViewerItem(panel.item);
    const restored = normalizeViewerItem(panel.originalItem || fallback);

    updateFloatingPanel(panelId, {
      item: restored,
      originalItem: JSON.parse(JSON.stringify(restored)),
      isDirty: false,
      saveError: null,
      isEditing: exitEditMode ? false : panel.isEditing,
    });
  };

  const requestImageEndpoint = async (path: string, payload: any): Promise<Response | null> => {
    const candidates = [`/api/data${path}`, `/api${path}`, path];
    for (const url of candidates) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status !== 404) return res;
    }
    return null;
  };

  const getLocalResolvedCandidates = (normalized: any): ImageFetcherCandidate[] => {
    const entryType = String(normalized?.type || '').toLowerCase();
    if (!['monster', 'creature', 'npc'].includes(entryType)) return [];
    const source = String(normalized?.source || normalized?.book || 'MM').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'MM';
    const encodedName = encodeURIComponent(String(normalized?.name || 'Unknown').trim());
    const url = `https://5e.tools/img/bestiary/tokens/${source}/${encodedName}.webp`;
    return [{
      url,
      provider: '5etools',
      kind: 'token',
      confidence: 0.9,
      trusted: true,
      attribution: '5etools',
      reason: 'Local deterministic token resolver fallback',
      sourceUrl: url,
    }];
  };

  const resolvePanelImageCandidates = async (panel: typeof floatingPanels[0]) => {
    const normalized = normalizeViewerItem(panel.item);
    if (!normalized?.id || !normalized?.name || !normalized?.type) return;

    setPanelImageLoading((prev) => ({ ...prev, [panel.id]: true }));
    setPanelImageError((prev) => ({ ...prev, [panel.id]: null }));

    try {
      const payload = {
        type: normalized.type,
        name: normalized.name,
        source: normalized.source || normalized.book || null,
        normalized,
        raw: panel.item,
      };
      const res = await requestImageEndpoint('/compendium/images/resolve', payload);
      if (!res) {
        const localCandidates = getLocalResolvedCandidates(normalized);
        setPanelImageCandidates((prev) => ({ ...prev, [panel.id]: localCandidates }));
        setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: localCandidates[0] || null }));
        setPanelImageError((prev) => ({
          ...prev,
          [panel.id]: localCandidates.length > 0
            ? 'Image resolver endpoints are unavailable; using local fallback candidates.'
            : 'Image resolver endpoints are unavailable on the server.',
        }));
        return;
      }

      const data: ImageFetcherResolveResponse = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error((data as any)?.error || 'Failed to resolve image candidates');
      }

      setPanelImageCandidates((prev) => ({ ...prev, [panel.id]: data.candidates || [] }));
      setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: data.bestCandidate || null }));
    } catch (error: any) {
      setPanelImageError((prev) => ({
        ...prev,
        [panel.id]: error?.message || 'Failed to resolve image candidates',
      }));
    } finally {
      setPanelImageLoading((prev) => ({ ...prev, [panel.id]: false }));
    }
  };

  const approvePanelImageCandidate = async (panel: typeof floatingPanels[0], candidate: ImageFetcherCandidate) => {
    const normalized = normalizeViewerItem(panel.item);
    if (!normalized?.id) return;

    setPanelImageLoading((prev) => ({ ...prev, [panel.id]: true }));
    setPanelImageError((prev) => ({ ...prev, [panel.id]: null }));

    try {
      const payload = {
        entryId: normalized.id,
        candidate,
        kind: candidate.kind,
      };
      const res = await requestImageEndpoint('/compendium/images/approve', payload);
      if (!res) {
        const nextItem = {
          ...panel.item,
          img: candidate.kind === 'token' ? (panel.item.img || candidate.url) : candidate.url,
          imgToken: candidate.kind === 'token' ? candidate.url : panel.item.imgToken,
          imgSource: candidate.provider,
        };
        updatePanelItem(panel.id, nextItem);
        setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: candidate }));
        setPanelImageError((prev) => ({
          ...prev,
          [panel.id]: 'Approve endpoint unavailable; applied candidate locally. Save panel to persist.',
        }));
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to approve image candidate');
      }

      const nextItem = {
        ...panel.item,
        img: candidate.kind === 'token' ? (panel.item.img || candidate.url) : candidate.url,
        imgToken: candidate.kind === 'token' ? candidate.url : panel.item.imgToken,
        imgSource: candidate.provider,
      };
      updatePanelItem(panel.id, nextItem);
      setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: candidate }));
    } catch (error: any) {
      setPanelImageError((prev) => ({
        ...prev,
        [panel.id]: error?.message || 'Failed to approve image candidate',
      }));
    } finally {
      setPanelImageLoading((prev) => ({ ...prev, [panel.id]: false }));
    }
  };

  const rejectPanelImageCandidates = async (panel: typeof floatingPanels[0]) => {
    const normalized = normalizeViewerItem(panel.item);
    if (!normalized?.id) return;

    setPanelImageLoading((prev) => ({ ...prev, [panel.id]: true }));
    setPanelImageError((prev) => ({ ...prev, [panel.id]: null }));

    try {
      const payload = { entryId: normalized.id, reason: 'Rejected in DataManager edit view' };
      const res = await requestImageEndpoint('/compendium/images/reject', payload);
      if (!res) {
        setPanelImageCandidates((prev) => ({ ...prev, [panel.id]: [] }));
        setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: null }));
        setPanelImageError((prev) => ({
          ...prev,
          [panel.id]: 'Reject endpoint unavailable; cleared candidates locally.',
        }));
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to reject image candidates');
      }

      setPanelImageCandidates((prev) => ({ ...prev, [panel.id]: [] }));
      setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: null }));
    } catch (error: any) {
      setPanelImageError((prev) => ({
        ...prev,
        [panel.id]: error?.message || 'Failed to reject image candidates',
      }));
    } finally {
      setPanelImageLoading((prev) => ({ ...prev, [panel.id]: false }));
    }
  };

  const autoResolveAndApplyBestImage = async (panel: typeof floatingPanels[0]) => {
    const normalized = normalizeViewerItem(panel.item);
    if (!normalized?.id || !normalized?.name || !normalized?.type) return;

    setPanelImageLoading((prev) => ({ ...prev, [panel.id]: true }));
    setPanelImageError((prev) => ({ ...prev, [panel.id]: null }));

    try {
      const payload = {
        type: normalized.type,
        name: normalized.name,
        source: normalized.source || normalized.book || null,
        normalized,
        raw: panel.item,
      };

      const res = await requestImageEndpoint('/compendium/images/resolve', payload);
      let candidates: ImageFetcherCandidate[] = [];
      let bestCandidate: ImageFetcherCandidate | null = null;

      if (!res) {
        candidates = getLocalResolvedCandidates(normalized);
        bestCandidate = candidates[0] || null;
      } else {
        const data: ImageFetcherResolveResponse = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error((data as any)?.error || 'Failed to resolve image candidates');
        }
        candidates = data.candidates || [];
        bestCandidate = data.bestCandidate || null;
      }

      setPanelImageCandidates((prev) => ({ ...prev, [panel.id]: candidates }));
      setPanelImageBestCandidate((prev) => ({ ...prev, [panel.id]: bestCandidate }));

      if (bestCandidate) {
        const approveRes = await requestImageEndpoint('/compendium/images/approve', {
          entryId: normalized.id,
          candidate: bestCandidate,
          kind: bestCandidate.kind,
        });

        const nextItem = {
          ...panel.item,
          img: bestCandidate.kind === 'token' ? (panel.item.img || bestCandidate.url) : bestCandidate.url,
          imgToken: bestCandidate.kind === 'token' ? bestCandidate.url : panel.item.imgToken,
          imgSource: bestCandidate.provider,
        };

        if (approveRes) {
          const approveData = await approveRes.json();
          if (!approveRes.ok || !approveData?.success) {
            throw new Error(approveData?.error || 'Failed to approve best image candidate');
          }
        }

        updatePanelItem(panel.id, nextItem);
        return;
      }

      const fallback = getFallbackImageForType(String(normalized.type || ''));
      const nextFallbackItem = {
        ...panel.item,
        img: fallback,
        imgToken: getPanelLayoutType(String(normalized.type || '')) === 'creature' ? fallback : panel.item.imgToken,
        imgSource: 'fallback',
        imgFallback: panel.item.imgFallback || fallback,
      };
      updatePanelItem(panel.id, nextFallbackItem);
      setPanelImageError((prev) => ({
        ...prev,
        [panel.id]: 'No suitable image candidates found. Applied fallback image.',
      }));
    } catch (error: any) {
      setPanelImageError((prev) => ({
        ...prev,
        [panel.id]: error?.message || 'Failed to auto resolve/apply image',
      }));
    } finally {
      setPanelImageLoading((prev) => ({ ...prev, [panel.id]: false }));
    }
  };

  const autoResolveBestImageForItem = async (item: any) => {
    const normalized = normalizeViewerItem(item);
    if (!normalized?.id || !normalized?.name || !normalized?.type) return;

    try {
      const payload = {
        type: normalized.type,
        name: normalized.name,
        source: normalized.source || normalized.book || null,
        normalized,
        raw: item,
      };

      const res = await requestImageEndpoint('/compendium/images/resolve', payload);
      let bestCandidate: ImageFetcherCandidate | null = null;

      if (!res) {
        const localCandidates = getLocalResolvedCandidates(normalized);
        bestCandidate = localCandidates[0] || null;
      } else {
        const data: ImageFetcherResolveResponse = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error((data as any)?.error || 'Failed to resolve image candidates');
        }
        bestCandidate = data.bestCandidate || null;
      }

      let nextItem: any;

      if (bestCandidate) {
        const approveRes = await requestImageEndpoint('/compendium/images/approve', {
          entryId: normalized.id,
          candidate: bestCandidate,
          kind: bestCandidate.kind,
        });

        if (approveRes) {
          const approveData = await approveRes.json();
          if (!approveRes.ok || !approveData?.success) {
            throw new Error(approveData?.error || 'Failed to approve best image candidate');
          }
        }

        nextItem = {
          ...normalized,
          img: bestCandidate.kind === 'token' ? (normalized.img || bestCandidate.url) : bestCandidate.url,
          imgToken: bestCandidate.kind === 'token' ? bestCandidate.url : normalized.imgToken,
          imgSource: bestCandidate.provider,
          imgFallback: normalized.imgFallback || getFallbackImageForType(String(normalized.type || '')),
        };
      } else {
        const fallback = getFallbackImageForType(String(normalized.type || ''));
        const isCreature = getPanelLayoutType(String(normalized.type || '')) === 'creature';
        nextItem = {
          ...normalized,
          img: fallback,
          imgToken: isCreature ? fallback : normalized.imgToken,
          imgSource: 'fallback',
          imgFallback: normalized.imgFallback || fallback,
        };
      }

      const saveRes = await fetch(`/api/data/compendium/entry/${normalized.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCompendiumUpdatePayload(nextItem)),
      });

      if (!saveRes.ok) {
        const message = await saveRes.text();
        throw new Error(message || `Failed to save image update (${saveRes.status})`);
      }

      const saved = normalizeViewerItem(await saveRes.json());
      setTypeItems((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)));

      if (selectedItem?.id === saved.id) {
        setSelectedItem(saved);
      }

      const existingPanel = floatingPanels.find((panel) => panel.item.id === saved.id);
      if (existingPanel) {
        updateFloatingPanel(existingPanel.id, {
          item: saved,
          isDirty: existingPanel.isEditing ? existingPanel.isDirty : false,
        });
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to auto retrieve best image');
    }
  };

  const closePanel = (panelId: string) => {
    const panel = floatingPanels.find((p) => p.id === panelId);
    if (panel && hasUnsavedChanges(panel)) {
      const shouldClose = confirm('You have unsaved changes. Close this panel and discard edits?');
      if (!shouldClose) return;
    }
    removeFloatingPanel(panelId);
  };

  const togglePanelEdit = (panelId: string) => {
    const panel = floatingPanels.find(p => p.id === panelId);
    if (panel) {
      if (panel.isEditing && hasUnsavedChanges(panel)) {
        const shouldLeaveEdit = confirm('You have unsaved changes. Leave edit mode and discard changes?');
        if (!shouldLeaveEdit) return;
        discardPanelChanges(panelId, true);
        return;
      }
      updateFloatingPanel(panelId, { isEditing: !panel.isEditing });
    }
  };

  const updatePanelItem = (panelId: string, updatedItem: any) => {
    const panel = floatingPanels.find((p) => p.id === panelId);
    if (!panel) return;

    const normalizedUpdated = normalizeViewerItem(updatedItem);
    const isDirty = panel.originalItem
      ? JSON.stringify(normalizedUpdated) !== JSON.stringify(panel.originalItem)
      : Boolean(panel.isDirty);

    updateFloatingPanel(panelId, {
      item: normalizedUpdated,
      isDirty,
      saveError: null,
    });
  };

  const updatePanelItemPath = (panelId: string, item: any, path: Array<string | number>, value: any) => {
    updatePanelItem(panelId, setValueAtPath(item, path, value));
  };

  const addPanelArrayItem = (panelId: string, item: any, path: Array<string | number>, templateSource?: any) => {
    updatePanelItem(panelId, addArrayItemAtPath(item, path, templateSource));
  };

  const movePanelArrayItem = (panelId: string, item: any, path: Array<string | number>, fromIndex: number, toIndex: number) => {
    updatePanelItem(panelId, moveArrayItemAtPath(item, path, fromIndex, toIndex));
  };

  const duplicatePanelArrayItem = (panelId: string, item: any, path: Array<string | number>, index: number) => {
    updatePanelItem(panelId, duplicateArrayItemAtPath(item, path, index));
  };

  const removePanelArrayItem = (panelId: string, item: any, path: Array<string | number>, index: number) => {
    updatePanelItem(panelId, removeArrayIndexAtPath(item, path, index));
  };

  const duplicateItem = (item: any) => {
    // Create a duplicate with a new ID
    const offset = floatingPanels.length * 30;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const normalizedDuplicated = normalizeViewerItem(item);
    const layoutType = getPanelLayoutType(String(normalizedDuplicated.type || ''));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let baseX: number;
    let baseY: number;
    
    if (containerRect && containerRect.left > 450) {
      baseX = Math.max(50, containerRect.left - 420 + offset);
      baseY = Math.max(50, containerRect.top + offset);
    } else {
      baseX = Math.min(viewportWidth - 420, Math.max(50, (viewportWidth / 2) + 50 + offset));
      baseY = Math.max(50, (viewportHeight / 2) - 200 + offset * 2);
    }
    
    const duplicatedItem = {
      ...normalizedDuplicated,
      id: `${normalizedDuplicated.id}-copy-${Date.now()}`,
      name: `${normalizedDuplicated.name} (Copy)`,
    };
    
    const newPanel: OpenPanel = {
      id: `panel-${Date.now()}`,
      item: duplicatedItem,
      originalItem: JSON.parse(JSON.stringify(duplicatedItem)),
      position: { x: baseX + 30, y: baseY + 30 },
      activeTab: ['spell', 'item'].includes(layoutType) ? 'description' : undefined,
      actionSearch: '',
      actionFilter: 'all',
      size: layoutType === 'creature'
        ? { width: 760, height: 620 }
        : { width: 620, height: 680 },
      isEditing: true, // Open in edit mode for duplication
      isDirty: true,
      isSaving: false,
      saveError: null,
      lastSavedAt: null,
      collapsedSections: {},
    };
    addFloatingPanel(newPanel);
  };

  const deleteItem = async (item: any) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    
    try {
      const res = await fetch(`/api/data/compendium/entry/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Delete failed (${res.status})`);
      }
      // Refresh the items list
      fetchItemsByType(activeBrowseTab);
      // Close any open panel for this item
      removeFloatingPanel(floatingPanels.find(p => p.item.id === item.id)?.id || '');
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete item');
    }
  };

  const handlePanelDragStart = (e: React.MouseEvent, panelId: string) => {
    const panel = floatingPanels.find(p => p.id === panelId);
    if (!panel) return;
    
    // Prevent text selection during drag - this fixes the bug where dragging 
    // a panel across the canvas would select text elements in the drag path
    e.preventDefault();
    document.body.style.userSelect = 'none';
    
    setDraggingPanel(panelId);
    setDragOffset({
      x: e.clientX - panel.position.x,
      y: e.clientY - panel.position.y,
    });
    
    console.log('[PanelDrag] Started dragging panel:', panelId);
  };

  const _handleCreateModule = async () => {
    if (!newModuleName || !newModuleSystem) return;
    setLoading(true);
    try {
      const res = await fetch('/api/data/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newModuleName,
          system: newModuleSystem,
          version: newModuleVersion || null,
          description: newModuleDescription || null,
        }),
      });
      const data = await res.json();
      setModules(prev => [...prev, data]);
      setNewModuleName('');
      setNewModuleSystem('');
      setNewModuleVersion('');
      setNewModuleDescription('');
      setActiveTab('modules');
    } catch (error) {
      console.error('Failed to create module:', error);
    } finally {
      setLoading(false);
    }
  };

  const _handleImport = async (moduleId: string) => {
    if (!importJson) return;
    setLoading(true);
    try {
      const items = JSON.parse(importJson);
      const res = await fetch(`/api/data/modules/${moduleId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Array.isArray(items) ? items : [items],
          type: importType,
        }),
      });
      const data = await res.json();
      alert(`Imported ${data.imported} items!`);
      setImportJson('');
      fetchModules();
    } catch (error) {
      console.error('Failed to import:', error);
      alert('Failed to import. Check JSON format.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Delete this module and all its data?')) return;
    setLoading(true);
    try {
      await fetch(`/api/data/modules/${moduleId}`, { method: 'DELETE' });
      setModules(prev => prev.filter(m => m.id !== moduleId));
      setSessionModules(prev => prev.filter(sm => sm.moduleId !== moduleId));
    } catch (error) {
      console.error('Failed to delete module:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderTypedEditor = (
    panelId: string,
    item: any,
    path: Array<string | number>,
    value: any,
    label?: string,
    depth = 0,
  ): JSX.Element => {
    const keyName = String(path[path.length - 1] ?? label ?? 'value');
    const keyNameLower = String(keyName).toLowerCase();
    const layoutType = getPanelLayoutType(String(item?.type || '').toLowerCase());
    const isSpellItem = layoutType === 'spell';
    const fieldLabel = label || toLabel(keyName);
    const controlKey = path.join('.');
    const compactKeys = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha', 'cr', 'ac', 'hp', 'passive', 'level', 'size']);
    const isCompactField = compactKeys.has(keyNameLower);
    const pathKey = path.join('.');
    const requiredHints = getRequiredFieldHints(item);
    const requiredHint = requiredHints[pathKey];
    const isRequired = Boolean(requiredHint);
    const isInvalid = isRequired && isMissingRequiredValue(value);

    const getSelectOptionsForField = (field: string): Array<{ value: string; label: string }> | null => {
      return getEditorSelectOptions(field, layoutType, isSpellItem);
    };

    const getAutocompleteSuggestions = (field: string, pathTokens: Array<string | number>): string[] => {
      return getEditorAutocompleteSuggestions(field, pathTokens);
    };

    if (typeof value === 'boolean') {
      return (
        <div className={`panel-editor-field panel-editor-field-boolean ${isCompactField ? 'panel-editor-field-compact' : ''}`} key={controlKey}>
          <label className="panel-editor-checkbox">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => updatePanelItemPath(panelId, item, path, e.target.checked)}
            />
            <span>{fieldLabel}</span>
          </label>
          {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
        </div>
      );
    }

    if (typeof value === 'number') {
      if (layoutType === 'creature' && keyNameLower === 'cr') {
        const crValue = Number.isFinite(value) ? Number(value) : 0;
        const crOptions = getCreatureCrOptions();

        return (
          <div className={`panel-editor-field ${isCompactField ? 'panel-editor-field-compact' : ''}`} key={controlKey}>
            <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
            <select
              className={isInvalid ? 'panel-input-invalid' : ''}
              value={String(crValue)}
              onChange={(e) => updatePanelItemPath(panelId, item, path, Number(e.target.value || 0))}
            >
              {crOptions.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
            {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
          </div>
        );
      }

      if (isSpellItem && keyNameLower === 'level') {
        const levelValue = Number.isFinite(value) ? Number(value) : 0;
        const levelOptions = getSpellLevelOptions();

        return (
          <div className={`panel-editor-field ${isCompactField ? 'panel-editor-field-compact' : ''}`} key={controlKey}>
            <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
            <select
              className={isInvalid ? 'panel-input-invalid' : ''}
              value={String(levelValue)}
              onChange={(e) => updatePanelItemPath(panelId, item, path, Number(e.target.value || 0))}
            >
              {levelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
          </div>
        );
      }

      return (
        <div className={`panel-editor-field ${isCompactField ? 'panel-editor-field-compact' : ''}`} key={controlKey}>
          <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
          <input
            type="number"
            step="any"
            className={isInvalid ? 'panel-input-invalid' : ''}
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => updatePanelItemPath(panelId, item, path, Number(e.target.value || 0))}
          />
          {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
        </div>
      );
    }

    if (typeof value === 'string' || value === null || value === undefined) {
      const stringValue = value == null ? '' : String(value);
      const useTextarea = /description|summary|entries|text/i.test(keyName) || stringValue.includes('\n') || stringValue.length > 100;
      const selectOptions = getSelectOptionsForField(keyNameLower);
      const autocompleteSuggestions = getAutocompleteSuggestions(keyNameLower, path);
      const datalistId = autocompleteSuggestions.length > 0 ? `panel-datalist-${controlKey.replace(/[^a-zA-Z0-9_-]+/g, '-')}` : undefined;

      if (selectOptions && !useTextarea) {
        const normalizedCurrent = stringValue.trim().toLowerCase();
        const hasCurrent = selectOptions.some((opt) => opt.value.toLowerCase() === normalizedCurrent);
        const options = hasCurrent || !normalizedCurrent
          ? selectOptions
          : [{ value: stringValue, label: toLabel(stringValue) }, ...selectOptions];

        return (
          <div className={`panel-editor-field ${isCompactField ? 'panel-editor-field-compact' : ''}`} key={controlKey}>
            <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
            <select
              className={isInvalid ? 'panel-input-invalid' : ''}
              value={stringValue}
              onChange={(e) => updatePanelItemPath(panelId, item, path, e.target.value)}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
          </div>
        );
      }

      if (keyName === 'size') {
        const normalizedSize = String(stringValue || '').trim();
        const currentValue = normalizedSize || 'M';
        const sizeOptions = getSizeFieldOptions();
        return (
          <div className="panel-editor-field panel-editor-field-compact" key={controlKey}>
            <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
            <select
              className={isInvalid ? 'panel-input-invalid' : ''}
              value={currentValue}
              onChange={(e) => updatePanelItemPath(panelId, item, path, e.target.value)}
            >
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="panel-editor-help">Displayed as {getReadableSizeLabel(currentValue)}</span>
            {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
          </div>
        );
      }

      return (
        <div className={`panel-editor-field ${useTextarea ? 'panel-editor-field-wide' : ''} ${isCompactField ? 'panel-editor-field-compact' : ''}`} key={controlKey}>
          <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
          {useTextarea ? (
            <textarea
              className={isInvalid ? 'panel-input-invalid' : ''}
              value={stringValue}
              onChange={(e) => updatePanelItemPath(panelId, item, path, e.target.value)}
              rows={Math.max(3, Math.min(8, stringValue.split('\n').length + 1))}
            />
          ) : (
            <input
              type="text"
              className={isInvalid ? 'panel-input-invalid' : ''}
              list={datalistId}
              value={stringValue}
              onChange={(e) => updatePanelItemPath(panelId, item, path, e.target.value)}
            />
          )}
          {!useTextarea && datalistId ? (
            <datalist id={datalistId}>
              {autocompleteSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          ) : null}
          {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
        </div>
      );
    }

    if (Array.isArray(value)) {
      const monsterActionKeys = ['action', 'actions', 'bonus', 'bonusActions', 'reaction', 'reactions', 'trait', 'traits', 'legendary', 'legendaryActions'];
      const spellEntryKeys = ['entries', 'entriesHigherLevel'];
      const isMonsterActionArray = monsterActionKeys.includes(keyName);
      const isSpellEntryArray = spellEntryKeys.includes(keyName);
      const actionArrayIcon = isMonsterActionArray ? getActionGroupIcon(keyName) : null;

      const createArrayTemplate = () => {
        if (isMonsterActionArray) {
          return { name: 'New Action', entries: [''] };
        }
        if (isSpellEntryArray) {
          return '';
        }
        return value[0];
      };

      const getArrayEntryLabel = (entry: any, index: number): string => {
        return getArrayEntryPreviewLabel(fieldLabel, entry, index);
      };

      const isPrimitiveArray = isPrimitiveEditorArray(value);

      return (
        <div className="panel-editor-group panel-editor-array panel-editor-group-full" key={controlKey}>
          <div className="panel-editor-group-header">
            <div>
              <h5 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {actionArrayIcon ? <Icon name={actionArrayIcon} /> : null}
                {fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}
              </h5>
              <span>{value.length} {value.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <button
              type="button"
              className="panel-inline-btn"
              title={isMonsterActionArray ? 'Add Action' : isSpellEntryArray ? 'Add Entry' : 'Add'}
              onClick={() => addPanelArrayItem(panelId, item, path, createArrayTemplate())}
            >
              <Icon name="plus" />
            </button>
          </div>
          {value.length === 0 ? (
            <div className="panel-editor-empty">No entries yet.</div>
          ) : (
            <div className={`panel-editor-array-list ${isPrimitiveArray ? 'panel-editor-array-list-compact' : ''}`}>
              {value.map((entry, index) => (
                <div key={`${controlKey}-${index}`} className="panel-editor-array-item">
                  <div className="panel-editor-array-item-header">
                    <span className="panel-editor-array-item-label" title={getArrayEntryLabel(entry, index)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {actionArrayIcon ? <Icon name={actionArrayIcon} /> : null}
                      {getArrayEntryLabel(entry, index)}
                    </span>
                    <div className="panel-array-item-actions">
                      <button
                        type="button"
                        className="panel-inline-btn"
                        title="Move up"
                        onClick={() => movePanelArrayItem(panelId, item, path, index, index - 1)}
                        disabled={index === 0}
                      >
                        <Icon name="chevron-up" />
                      </button>
                      <button
                        type="button"
                        className="panel-inline-btn"
                        title="Move down"
                        onClick={() => movePanelArrayItem(panelId, item, path, index, index + 1)}
                        disabled={index === value.length - 1}
                      >
                        <Icon name="chevron-down" />
                      </button>
                      <button
                        type="button"
                        className="panel-inline-btn"
                        title="Duplicate"
                        onClick={() => duplicatePanelArrayItem(panelId, item, path, index)}
                      >
                        <Icon name="copy" />
                      </button>
                      <button
                        type="button"
                        className="panel-inline-btn panel-inline-btn-danger"
                        title="Remove"
                        onClick={() => removePanelArrayItem(panelId, item, path, index)}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                  {isMonsterActionArray && isPlainDataObject(entry) ? (
                    <div className="panel-specialized-grid">
                      {renderTypedEditor(panelId, item, [...path, index, 'name'], entry.name || '', 'Action Name', depth + 1)}
                      {renderTypedEditor(panelId, item, [...path, index, 'entries'], Array.isArray(entry.entries) ? entry.entries : [''], 'Action Text', depth + 1)}
                    </div>
                  ) : isSpellEntryArray && typeof entry === 'string' ? (
                    <div className="panel-editor-field">
                      <label>Entry Text</label>
                      <textarea
                        value={entry}
                        onChange={(e) => updatePanelItemPath(panelId, item, [...path, index], e.target.value)}
                        rows={Math.max(3, Math.min(10, String(entry).split('\n').length + 1))}
                      />
                    </div>
                  ) : (
                    renderTypedEditor(panelId, item, [...path, index], entry, Array.isArray(entry) || isPlainDataObject(entry) ? undefined : 'Value', depth + 1)
                  )}
                </div>
              ))}
            </div>
          )}
          {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
        </div>
      );
    }

    if (isPlainDataObject(value)) {
      const entries = Object.entries(value);
      const hasNonNumericKeys = entries.some(([entryKey]) => !/^\d+$/.test(entryKey));
      const filteredEntries = hasNonNumericKeys
        ? entries.filter(([entryKey]) => !/^\d+$/.test(entryKey))
        : entries;
      const isSpellItem = String(item?.type || '').toLowerCase() === 'spell';
      const normalizedKeyName = String(keyName || '').toLowerCase();
      const spellObjectPreferredOrder = isSpellItem
        ? getSpellObjectPreferredOrder(normalizedKeyName)
        : null;

      if (spellObjectPreferredOrder) {
        const orderedEntries = getOrderedObjectEntries(value, spellObjectPreferredOrder);
        const inlineGridClass = normalizedKeyName === 'components'
          ? 'panel-editor-inline-grid panel-editor-inline-grid-spell-components'
          : 'panel-editor-inline-grid panel-editor-inline-grid-spell-distance';
        const inlineCellBaseClass = normalizedKeyName === 'components'
          ? 'panel-editor-inline-cell panel-editor-inline-cell-spell-components'
          : 'panel-editor-inline-cell panel-editor-inline-cell-spell-distance';

        return (
          <div className="panel-editor-group panel-editor-object panel-editor-group-full" key={controlKey} data-depth={depth}>
            <div className="panel-editor-group-header">
              <div>
                <h5>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</h5>
                <span>{filteredEntries.length} {filteredEntries.length === 1 ? 'property' : 'properties'}</span>
              </div>
            </div>
            <div className={inlineGridClass}>
              {orderedEntries.length === 0 ? (
                <div className="panel-editor-empty">No nested properties.</div>
              ) : (
                orderedEntries.map(([nestedKey, nestedValue]) => (
                  <div
                    key={`${controlKey}.${nestedKey}`}
                    className={`${inlineCellBaseClass}${normalizedKeyName === 'components' ? ` panel-editor-inline-cell-spell-components-${nestedKey.toLowerCase()}` : ''}`}
                  >
                    {renderTypedEditor(panelId, item, [...path, nestedKey], nestedValue, toLabel(nestedKey), depth + 1)}
                  </div>
                ))
              )}
            </div>
            {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
          </div>
        );
      }

      return (
        <div className="panel-editor-group panel-editor-object panel-editor-group-full" key={controlKey} data-depth={depth}>
          <div className="panel-editor-group-header">
            <div>
              <h5>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</h5>
                <span>{filteredEntries.length} {filteredEntries.length === 1 ? 'property' : 'properties'}</span>
              </div>
            </div>
          <div className="panel-editor-object-fields">
            {filteredEntries.length === 0 ? (
              <div className="panel-editor-empty">No nested properties.</div>
            ) : (
              filteredEntries.map(([nestedKey, nestedValue]) => renderTypedEditor(panelId, item, [...path, nestedKey], nestedValue, toLabel(nestedKey), depth + 1))
            )}
          </div>
          {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
        </div>
      );
    }

    return (
      <div className="panel-editor-field" key={controlKey}>
        <label>{fieldLabel}{isRequired ? <span className="panel-required">*</span> : null}</label>
        <input
          type="text"
          className={isInvalid ? 'panel-input-invalid' : ''}
          value={String(value ?? '')}
          onChange={(e) => updatePanelItemPath(panelId, item, path, e.target.value)}
        />
        {isInvalid && requiredHint ? <span className="panel-editor-error">{requiredHint}</span> : null}
      </div>
    );
  };

  const renderGenericPanelReadFields = (item: any, excludedKeys: string[] = []) => {
    const excluded = new Set(excludedKeys);
    const system = item?.system || {};
    const fields = Object.entries(system).filter(([key, value]) => !META_SYSTEM_KEYS.has(key) && !excluded.has(key) && value !== undefined && value !== null);

    if (fields.length === 0) return null;

    return (
      <div className="panel-section">
        <h4 className="panel-section-title">Additional Details</h4>
        <div className="panel-data">
          {fields.map(([key, value]) => (
            <div key={key} className="detail-field">
              <span className="field-label">{toLabel(key)}:</span>
              {renderValueByType(key, value, getUIControlFromValue(value))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCompendiumHero = (
    subtitle: string | null,
    badges: string[] = [],
    imageUrl?: string | null,
    iconName: string = 'file',
  ) => (
    <div className="panel-spell-hero">
      {imageUrl ? (
        <div className="panel-compendium-hero-image">
          <img src={imageUrl} alt="Entry" loading="lazy" />
        </div>
      ) : (
        <div className="panel-compendium-hero-image panel-compendium-hero-image-fallback">
          <Icon name={iconName as any} />
        </div>
      )}
      {subtitle ? <div className="panel-spell-subtitle">{subtitle}</div> : null}
      {badges.length > 0 ? (
        <div className="panel-spell-badges">
          {badges.map((badge) => (
            <span key={badge} className="panel-meta-badge panel-meta-badge-hero">{badge}</span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderFactGrid = (
    title: string,
    facts: Array<{ label: string; value: string | null | undefined }>,
  ) => {
    const visibleFacts = facts.filter((fact) => Boolean(fact.value));
    if (visibleFacts.length === 0) return null;

    return (
      <div className="panel-section panel-section-facts">
        <h4 className="panel-section-title">{title}</h4>
        <div className="panel-spell-facts-grid">
          {visibleFacts.map((fact) => (
            <div key={fact.label} className="panel-spell-fact-card">
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReadingSection = (
    title: string,
    content?: any,
    fallbackText?: string,
  ) => {
    const hasEntries = Array.isArray(content) && content.length > 0;
    const hasFallback = Boolean(fallbackText && fallbackText.trim());
    if (!hasEntries && !hasFallback) return null;

    return (
      <div className="panel-section panel-section-reading">
        <h4 className="panel-section-title">{title}</h4>
        <div className="panel-spell-reading">
          {hasEntries ? renderEntriesList(content) : renderTextContent(String(fallbackText))}
        </div>
      </div>
    );
  };

  const renderDetailFieldsSection = (
    title: string,
    fields: Array<{ label: string; key: string; value: any }>,
  ) => {
    const visibleFields = fields.filter((field) => field.value !== undefined && field.value !== null && field.value !== '');
    if (visibleFields.length === 0) return null;

    return (
      <div className="panel-section">
        <h4 className="panel-section-title">{title}</h4>
        <div className="panel-data">
          {visibleFields.map((field) => (
            <div key={`${title}-${field.key}`} className="detail-field">
              <span className="field-label">{field.label}:</span>
              {renderValueByType(field.key, field.value, getUIControlFromValue(field.value))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const setPanelActiveTab = (panelId: string, activeTab: string) => {
    updateFloatingPanel(panelId, { activeTab });
  };

  const setPanelActionSearch = (panelId: string, actionSearch: string) => {
    updateFloatingPanel(panelId, { actionSearch });
  };

  const setPanelActionFilter = (panelId: string, actionFilter: string) => {
    updateFloatingPanel(panelId, { actionFilter });
  };

  const renderSheetTabs = (
    panel: typeof floatingPanels[0],
    tabs: Array<{ value: string; label: string }>,
  ) => {
    const activeTab = panel.activeTab || tabs[0]?.value;

    return (
      <div className="sheet-tab-navigation">
        {tabs.map((tab) => (
          <button
            key={`${panel.id}-${tab.value}`}
            type="button"
            className={`sheet-tab ${activeTab === tab.value ? 'active' : ''}`}
            onClick={() => setPanelActiveTab(panel.id, tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  const renderSheetDivider = () => (
    <div className="sheet-divider" aria-hidden="true">
      <span className="sheet-divider-line" />
      <span className="sheet-divider-icon">✦</span>
      <span className="sheet-divider-line" />
    </div>
  );

  const renderFactRows = (facts: Array<{ label: string; value: any }>, compact = false) => {
    const visibleFacts = facts.filter((fact) => fact.value !== undefined && fact.value !== null && fact.value !== '');
    if (visibleFacts.length === 0) return null;

    return (
      <div className={compact ? 'sheet-fact-rows compact' : 'sheet-fact-rows'}>
        {visibleFacts.map((fact) => (
          <div key={fact.label} className="sheet-fact-row">
            <span>{fact.label}</span>
            <strong>{toInlineText(fact.value)}</strong>
          </div>
        ))}
      </div>
    );
  };

  const renderTagCollection = (values: string[], emptyLabel: string) => {
    if (values.length === 0) return <div className="sheet-empty-state">{emptyLabel}</div>;

    return (
      <div className="sheet-tag-collection">
        {values.map((value) => (
          <span key={value} className="sheet-tag">
            {value}
          </span>
        ))}
      </div>
    );
  };

  const toTagCollection = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((entry) => toInlineText(entry)).filter(Boolean);
    if (typeof value === 'string') return parseDelimitedValue(value);
    if (typeof value === 'object') {
      return Object.entries(value)
        .flatMap(([key, nestedValue]) => {
          if (nestedValue === true) return [toLabel(key)];
          const text = toInlineText(nestedValue);
          return text ? [`${toLabel(key)} ${text}`.trim()] : [];
        })
        .filter(Boolean);
    }
    return [String(value)];
  };

  const renderActivityList = (activities: any) => {
    const entries = Array.isArray(activities)
      ? activities
      : activities && typeof activities === 'object'
        ? Object.entries(activities).map(([key, value]) => ({ name: toLabel(key), value }))
        : [];

    if (entries.length === 0) {
      return <div className="sheet-empty-state">No activities defined for this entry.</div>;
    }

    return (
      <div className="sheet-card-list">
        {entries.map((activity: any, index: number) => {
          const raw = activity?.value ?? activity;
          const title = activity?.name || raw?.name || `Activity ${index + 1}`;
          const facts = [
            { label: 'Activation', value: raw?.activation || raw?.time || raw?.type },
            { label: 'Type', value: raw?.activityType || raw?.attackType || raw?.type },
            { label: 'Range', value: raw?.range },
            { label: 'Target', value: raw?.target },
            { label: 'Damage', value: raw?.damage || raw?.formula },
          ].filter((fact) => fact.value !== undefined && fact.value !== null && fact.value !== '');

          return (
            <div key={`${title}-${index}`} className="sheet-card-list-item">
              <div className="sheet-card-list-header">
                <h4>{title}</h4>
              </div>
              {facts.length > 0 ? renderFactRows(facts, true) : null}
              {raw?.entries ? <div className="sheet-body-copy">{renderEntriesList(raw.entries)}</div> : null}
            </div>
          );
        })}
      </div>
    );
  };

  const renderEffectsList = (effects: any, emptyLabel: string) => {
    const entries = Array.isArray(effects)
      ? effects
      : effects && typeof effects === 'object'
        ? Object.entries(effects).map(([key, value]) => ({ name: toLabel(key), value }))
        : [];

    if (entries.length === 0) return <div className="sheet-empty-state">{emptyLabel}</div>;

    return (
      <div className="sheet-card-list">
        {entries.map((effect: any, index: number) => {
          const raw = effect?.value ?? effect;
          const title = effect?.name || raw?.name || `Effect ${index + 1}`;
          const text = Array.isArray(raw?.entries)
            ? renderEntriesList(raw.entries)
            : renderTextContent(toInlineText(raw));

          return (
            <div key={`${title}-${index}`} className="sheet-card-list-item">
              <div className="sheet-card-list-header">
                <h4>{title}</h4>
              </div>
              <div className="sheet-body-copy">{text}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSpellPanelView = (panel: typeof floatingPanels[0], item: any) => {
    const system = item.system || {};
    const entries = getSpellPrimaryEntries(item);
    const subtitle = [formatSpellLevel(system.level), formatSpellSchool(system.school)].filter(Boolean).join(' • ');
    const sourceText = system.source?.custom || system.source || item.book;
    const activeTab = panel.activeTab || 'description';
    const quickFacts = [
      { label: 'Casting Time', value: formatSpellTime(system) },
      { label: 'Range', value: formatSpellRange(system) },
      { label: 'Target', value: formatSpellTarget(system) },
      { label: 'Components', value: formatSpellComponents(system) },
      { label: 'Duration', value: formatSpellDuration(system) },
      { label: 'Scaling', value: formatSpellScaling(system) },
    ].filter((fact) => Boolean(fact.value));
    const badges = [
      system.srd ? 'SRD' : null,
      system.basicRules ? 'Basic Rules' : null,
      isSpellRitual(system) ? 'Ritual' : null,
      isSpellConcentration(system) ? 'Concentration' : null,
      system.page ? `p. ${system.page}` : null,
      sourceText || null,
    ].filter(Boolean) as string[];
    const heroImage = getEntryDisplayImage(item);

    let activeSection: JSX.Element | null = null;

    switch (activeTab) {
      case 'details':
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Spell Details</h3>
              {renderFactRows([
                { label: 'Level', value: formatSpellLevel(system.level) },
                { label: 'School', value: formatSpellSchool(system.school) },
                { label: 'Components', value: formatSpellComponents(system) },
                { label: 'Materials', value: system.components?.m || system.materials },
                { label: 'Method', value: system.sourceClass || system.spellcasting?.method },
                { label: 'Ability', value: system.spellcastingAbility },
              ])}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Casting</h3>
              {renderFactRows([
                { label: 'Casting Time', value: formatSpellTime(system) },
                { label: 'Range', value: formatSpellRange(system) },
                { label: 'Target', value: formatSpellTarget(system) },
                { label: 'Duration', value: formatSpellDuration(system) },
              ])}
            </section>
          </div>
        );
        break;
      case 'activities':
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Activities</h3>
              {renderActivityList(system.activities)}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Combat & Resolution</h3>
              {renderFactRows([
                { label: 'Saving Throw', value: system.savingThrow },
                { label: 'Damage', value: system.damageInflict },
                { label: 'Scaling', value: formatSpellScaling(system) },
                { label: 'Areas', value: system.areaTags },
                { label: 'Tags', value: system.miscTags },
              ])}
            </section>
          </div>
        );
        break;
      case 'effects':
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Effects</h3>
              {renderEffectsList(system.effects || item.effects, 'No active effects are linked to this spell.')}
            </section>
          </div>
        );
        break;
      case 'description':
      default:
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Description</h3>
              <div className="sheet-body-copy">
                {entries.length > 0 ? renderEntriesList(entries) : renderTextContent(String(getItemDescription(item)))}
              </div>
            </section>
          </div>
        );
        break;
    }

    return (
      <div className="panel-sheet panel-sheet-spell">
        <div className="sheet-hero sheet-hero-spell">
          <div className="sheet-hero-icon">
            <img src={heroImage} alt={item.name} loading="lazy" />
          </div>
          <div className="sheet-hero-copy">
            <div className="sheet-hero-title">{item.name}</div>
            <div className="sheet-hero-subtitle">{subtitle || 'Spell'}</div>
          </div>
          {sourceText ? <div className="sheet-source-badge">{sourceText}</div> : null}
        </div>

        {badges.length > 0 ? renderCompendiumHero(null, badges) : null}
        {renderSheetTabs(panel, [
          { value: 'description', label: 'Description' },
          { value: 'details', label: 'Details' },
          { value: 'activities', label: 'Activities' },
          { value: 'effects', label: 'Effects' },
        ])}

        <div className="sheet-content-shell">
          <section className="sheet-summary-panel">
            <h3 className="sheet-section-heading">Overview</h3>
            {renderFactRows(quickFacts)}
          </section>
          {renderSheetDivider()}
          <div className="sheet-section-container">{activeSection}</div>
        </div>
      </div>
    );
  };

  const renderClassPanelView = (item: any) => {
    const system = item.system || {};
    const subtitle = [system.primaryAbility ? `${toInlineText(system.primaryAbility)} class` : null, system.hitDie ? `Hit Die ${toInlineText(system.hitDie)}` : null]
      .filter(Boolean)
      .join(' • ');
    const badges = [item.book || system.source || null].filter(Boolean) as string[];

    return (
      <div className="panel-view-content">
        {renderCompendiumHero(subtitle || 'Adventuring Class', badges, getEntryDisplayImage(item), 'book')}
        {renderFactGrid('Quick Facts', [
          { label: 'Armor', value: toInlineText(system.armorProficiencies) },
          { label: 'Weapons', value: toInlineText(system.weaponProficiencies) },
          { label: 'Tools', value: toInlineText(system.toolProficiencies) },
          { label: 'Skills', value: toInlineText(system.skillProficiencies) },
        ])}
        {renderFactGrid('Class Overview', [
          { label: 'Hit Die', value: toInlineText(system.hitDie) },
          { label: 'Primary Ability', value: toInlineText(system.primaryAbility) },
          { label: 'Saving Throws', value: toInlineText(system.savingThrows) },
          { label: 'Spellcasting', value: toInlineText(system.spellcastingAbility) },
        ])}
        {renderDetailFieldsSection('Proficiencies', [
          { label: 'Armor', key: 'armorProficiencies', value: system.armorProficiencies },
          { label: 'Weapons', key: 'weaponProficiencies', value: system.weaponProficiencies },
          { label: 'Tools', key: 'toolProficiencies', value: system.toolProficiencies },
          { label: 'Skills', key: 'skillProficiencies', value: system.skillProficiencies },
        ])}
        {renderReadingSection('Class Features', system.entries, getItemDescription(item))}
        {renderDetailFieldsSection('Progression', [
          { label: 'Features', key: 'classFeatures', value: system.classFeatures },
          { label: 'Subclasses', key: 'subclasses', value: system.subclasses },
          { label: 'Starting Equipment', key: 'startingEquipment', value: system.startingEquipment },
        ])}
        {renderGenericPanelReadFields(item, ['hitDie', 'primaryAbility', 'savingThrows', 'armorProficiencies', 'weaponProficiencies', 'toolProficiencies', 'skillProficiencies', 'spellcastingAbility', 'entries', 'classFeatures', 'subclasses', 'startingEquipment'])}
      </div>
    );
  };

  const renderFeatPanelView = (item: any) => {
    const system = item.system || {};
    const subtitle = system.prerequisites ? `Prerequisite: ${toInlineText(system.prerequisites)}` : 'Feat';
    const badges = [system.repeatable ? 'Repeatable' : null, item.book || system.source || null].filter(Boolean) as string[];

    return (
      <div className="panel-view-content">
        {renderCompendiumHero(subtitle, badges, getEntryDisplayImage(item), 'star')}
        {renderFactGrid('Feat Impact', [
          { label: 'Benefits', value: toInlineText(system.benefits) },
          { label: 'Source', value: toInlineText(item.book || system.source) },
        ])}
        {renderFactGrid('Feat Summary', [
          { label: 'Prerequisites', value: toInlineText(system.prerequisites) },
          { label: 'Ability Bonus', value: toInlineText(system.abilityBonuses) },
          { label: 'Repeatable', value: system.repeatable ? 'Yes' : null },
        ])}
        {renderReadingSection('Benefits', system.entries, typeof system.benefits === 'string' ? system.benefits : getItemDescription(item))}
        {renderDetailFieldsSection('Mechanical Benefits', [
          { label: 'Benefits', key: 'benefits', value: system.benefits },
          { label: 'Ability Bonuses', key: 'abilityBonuses', value: system.abilityBonuses },
        ])}
        {renderGenericPanelReadFields(item, ['prerequisites', 'repeatable', 'abilityBonuses', 'benefits', 'entries'])}
      </div>
    );
  };

  const renderBackgroundPanelView = (item: any) => {
    const system = item.system || {};
    const subtitle = system.feature ? `Feature: ${toInlineText(system.feature)}` : 'Background';
    const badges = [item.book || system.source || null].filter(Boolean) as string[];

    return (
      <div className="panel-view-content">
        {renderCompendiumHero(subtitle, badges, getEntryDisplayImage(item), 'book')}
        {renderFactGrid('Story Hooks', [
          { label: 'Feature', value: toInlineText(system.feature) },
          { label: 'Ability Scores', value: toInlineText(system.abilityScores) },
        ])}
        {renderFactGrid('Background Essentials', [
          { label: 'Skills', value: toInlineText(system.skillProficiencies) },
          { label: 'Tools', value: toInlineText(system.toolProficiencies) },
          { label: 'Languages', value: toInlineText(system.languages) },
          { label: 'Equipment', value: toInlineText(system.equipment) },
        ])}
        {renderReadingSection('Background Feature', system.entries, typeof system.feature === 'string' ? system.feature : getItemDescription(item))}
        {renderDetailFieldsSection('Additional Training', [
          { label: 'Feature', key: 'feature', value: system.feature },
          { label: 'Ability Scores', key: 'abilityScores', value: system.abilityScores },
        ])}
        {renderGenericPanelReadFields(item, ['skillProficiencies', 'toolProficiencies', 'languages', 'equipment', 'feature', 'abilityScores', 'entries'])}
      </div>
    );
  };

  const renderSpeciesPanelView = (item: any) => {
    const system = item.system || {};
    const subtitle = [system.size ? `${formatSizeDisplay(system.size)} size` : null, system.speed ? `${toInlineText(system.speed)} speed` : null]
      .filter(Boolean)
      .join(' • ');
    const badges = [item.book || system.source || null].filter(Boolean) as string[];

    return (
      <div className="panel-view-content">
        {renderCompendiumHero(subtitle || 'Species', badges, getEntryDisplayImage(item), 'user-group')}
        {renderFactGrid('Combat & Senses', [
          { label: 'Darkvision', value: toInlineText(system.darkvision) },
          { label: 'Resistances', value: toInlineText(system.resist) },
          { label: 'Immunities', value: toInlineText(system.immune) },
          { label: 'Condition Immunities', value: toInlineText(system.conditionImmune) },
        ])}
        {renderFactGrid('Species Traits', [
          { label: 'Size', value: formatSizeDisplay(system.size) },
          { label: 'Speed', value: toInlineText(system.speed) },
          { label: 'Languages', value: toInlineText(system.languages) },
          { label: 'Ability Bonuses', value: toInlineText(system.abilityBonuses) },
        ])}
        {renderReadingSection('Traits', system.entries, typeof system.traits === 'string' ? system.traits : getItemDescription(item))}
        {renderDetailFieldsSection('Resistances & Senses', [
          { label: 'Traits', key: 'traits', value: system.traits },
          { label: 'Darkvision', key: 'darkvision', value: system.darkvision },
          { label: 'Resistances', key: 'resist', value: system.resist },
          { label: 'Immunities', key: 'immune', value: system.immune },
          { label: 'Condition Immunities', key: 'conditionImmune', value: system.conditionImmune },
        ])}
        {renderGenericPanelReadFields(item, ['size', 'speed', 'languages', 'abilityBonuses', 'traits', 'darkvision', 'resist', 'immune', 'conditionImmune', 'entries'])}
      </div>
    );
  };

  const renderItemPanelView = (panel: typeof floatingPanels[0], item: any) => {
    const system = item.system || {};
    const subtitle = [
      system.type?.value ? toInlineText(system.type.value) : null,
      system.weaponCategory ? toInlineText(system.weaponCategory) : null,
      system.rarity ? toInlineText(system.rarity) : null,
    ]
      .filter(Boolean)
      .join(' • ');
    const activeTab = panel.activeTab || 'description';
    const badges = [
      system.requiresAttunement || system.attunement ? 'Attunement' : null,
      item.book || system.source || null,
    ].filter(Boolean) as string[];

    const summaryFacts = [
      { label: 'Hit Modifier', value: toInlineText(system.attackBonus || system.toHit || system.hitModifier) },
      { label: 'Damage Formula', value: toInlineText(system.damage?.base || system.damage || system.formula || system.damageType) },
    ];
    const heroImage = getEntryDisplayImage(item);

    let activeSection: JSX.Element | null = null;

    switch (activeTab) {
      case 'details':
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Details</h3>
              {renderFactRows([
                { label: 'Weapon Type', value: system.weaponType || system.weaponCategory },
                { label: 'Base Weapon', value: system.baseItem || system.baseWeapon },
                { label: 'Proficiency', value: system.proficiencyLevel || system.proficient },
                { label: 'Mastery', value: system.mastery },
                { label: 'Range', value: system.range },
              ])}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Properties</h3>
              {renderTagCollection(toTagCollection(system.properties), 'No weapon or item properties specified.')}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Damage & Usage</h3>
              {renderFactRows([
                { label: 'Damage', value: system.damage?.base || system.damage },
                { label: 'Damage Type', value: system.damageType },
                { label: 'Uses', value: system.uses || system.charges },
                { label: 'Strength', value: system.strength },
              ])}
            </section>
          </div>
        );
        break;
      case 'activities':
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Activities</h3>
              {renderActivityList(system.activities)}
            </section>
          </div>
        );
        break;
      case 'effects':
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Effects</h3>
              {renderEffectsList(system.effects || item.effects, 'No active effects are linked to this item.')}
            </section>
          </div>
        );
        break;
      case 'description':
      default:
        activeSection = (
          <div className="sheet-section-stack">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Description</h3>
              <div className="sheet-body-copy">
                {Array.isArray(system.entries) ? renderEntriesList(system.entries) : renderTextContent(getItemDescription(item))}
              </div>
            </section>
          </div>
        );
        break;
    }

    return (
      <div className="panel-sheet panel-sheet-item">
        <div className="sheet-hero sheet-hero-item">
          <div className="sheet-hero-icon">
            <img src={heroImage} alt={item.name} loading="lazy" />
          </div>
          <div className="sheet-hero-copy">
            <div className="sheet-hero-title">{item.name}</div>
            <div className="sheet-hero-subtitle">{subtitle || 'Equipment'}</div>
          </div>
          <div className="sheet-stat-cluster">
            <div>
              <span>Qty</span>
              <strong>{toInlineText(system.quantity || 1)}</strong>
            </div>
            <div>
              <span>Weight</span>
              <strong>{toInlineText(system.weight || '—')}</strong>
            </div>
            <div>
              <span>Price</span>
              <strong>{toInlineText(system.price?.value || system.price || system.value || '—')}</strong>
            </div>
          </div>
        </div>

        {badges.length > 0 ? renderCompendiumHero(null, badges) : null}
        {renderSheetTabs(panel, [
          { value: 'description', label: 'Description' },
          { value: 'details', label: 'Details' },
          { value: 'activities', label: 'Activities' },
          { value: 'effects', label: 'Effects' },
        ])}

        <div className="sheet-content-shell">
          <section className="sheet-summary-bar">
            {summaryFacts.map((fact) => (
              <div key={fact.label} className="sheet-summary-bar-item">
                <span>{fact.label}</span>
                <strong>{toInlineText(fact.value || '—')}</strong>
              </div>
            ))}
          </section>
          {renderSheetDivider()}
          <div className="sheet-section-container">{activeSection}</div>
        </div>
      </div>
    );
  };

  const renderCreaturePanelView = (panel: typeof floatingPanels[0], item: any) => {
    const system = item.system || {};
    const typeText = typeof system.type === 'string' ? system.type : system.type?.type;
    const alignmentText = formatAlignmentDisplay(system.alignment);
    const subtitle = [formatSizeDisplay(system.size), typeText, alignmentText].filter(Boolean).join(' • ');
    const challenge = extractMonsterChallengeRating(item) ?? system.cr;
    const profText = system.pb || system.proficiencyBonus
      ? `PB +${system.pb || system.proficiencyBonus}`
      : challenge !== undefined && challenge !== null
        ? `CR ${challenge}`
        : 'Encounter Unit';
    const actionSearch = (panel.actionSearch || '').trim().toLowerCase();
    const actionFilter = panel.actionFilter || 'all';
    const portraitImage = getEntryDisplayImage(item, true);
    const movementEntries = typeof system.speed === 'object' && system.speed
      ? Object.entries(system.speed)
          .filter(([key]) => key !== 'canHover')
          .map(([key, value]) => ({ label: toLabel(key), value: typeof value === 'object' ? toInlineText(value) : `${value} ft.` }))
      : formatSpeed(system.speed)
        ? [{ label: 'Speed', value: formatSpeed(system.speed) }]
        : [];
    const skills = system.skills && typeof system.skills === 'object'
      ? Object.entries(system.skills)
          .map(([key, value]) => ({
            label: toLabel(key),
            value: typeof value === 'object' ? toInlineText((value as any).mod ?? (value as any).bonus ?? value) : toInlineText(value),
          }))
          .filter((entry) => entry.value)
      : [];
    const senses = [
      ...(toTagCollection(system.senses).map((value) => ({ label: 'Sense', value }))),
      ...(system.passive ? [{ label: 'Passive Perception', value: String(system.passive) }] : []),
    ];
    const languages = toTagCollection(system.languages);
    const actionGroups = [
      { key: 'action', label: 'Actions', icon: getActionGroupIcon('action'), items: system.action || system.actions || [] },
      { key: 'bonus', label: 'Bonus Actions', icon: getActionGroupIcon('bonus'), items: system.bonus || system.bonusActions || [] },
      { key: 'reaction', label: 'Reactions', icon: getActionGroupIcon('reaction'), items: system.reaction || system.reactions || [] },
      { key: 'trait', label: 'Traits', icon: getActionGroupIcon('trait'), items: system.trait || system.traits || [] },
      { key: 'legendary', label: 'Legendary Actions', icon: getActionGroupIcon('legendary'), items: system.legendary || system.legendaryActions || [] },
    ];

    const visibleGroups = actionGroups
      .filter((group) => actionFilter === 'all' || group.key === actionFilter)
      .map((group) => ({
        ...group,
        items: (Array.isArray(group.items) ? group.items : [])
          .filter((entry) => {
            if (!actionSearch) return true;
            const haystack = `${entry?.name || ''} ${toInlineText(entry?.entries || entry)}`.toLowerCase();
            return haystack.includes(actionSearch);
          }),
      }))
      .filter((group) => group.items.length > 0);

    return (
      <div className="panel-sheet panel-sheet-creature">
        <div className="creature-sheet-header">
          <div className="creature-sheet-portrait">
            <img src={portraitImage} alt={item.name} loading="lazy" />
          </div>
          <div className="creature-sheet-identity">
            <div className="creature-sheet-name">{item.name}</div>
            <div className="creature-sheet-meta">{subtitle || 'Creature'}</div>
          </div>
          <div className="creature-sheet-proficiency">
            <span>Proficiency</span>
            <strong>{profText}</strong>
          </div>
          <div className="creature-utility-toolbar">
            <button type="button" className="panel-action-btn" onClick={() => togglePanelEdit(panel.id)} title="Edit">
              <Icon name="edit" />
            </button>
            <button type="button" className="panel-action-btn" onClick={() => duplicateItem(panel.item)} title="Duplicate">
              <Icon name="copy" />
            </button>
            <button type="button" className="panel-action-btn panel-action-btn-delete" onClick={() => deleteItem(panel.item)} title="Delete">
              <Icon name="trash" />
            </button>
          </div>
        </div>

        <div className="creature-attribute-bar">
          {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((ability) => {
            const value = Number(system[ability] ?? 10);
            const modifier = Math.floor((value - 10) / 2);
            return (
              <div key={ability} className="creature-ability-card">
                <span>{ability.toUpperCase()}</span>
                <strong>{modifier >= 0 ? `+${modifier}` : `${modifier}`}</strong>
                <em>{value}</em>
              </div>
            );
          })}
        </div>

        <div className="creature-stats-row">
          {[
            { label: 'Initiative', value: `${Math.floor((Number(system.dex ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(system.dex ?? 10) - 10) / 2)}` },
            { label: 'Speed', value: formatSpeed(system.speed) || '—' },
            { label: 'Armor Class', value: formatAc(system.ac) || '—' },
            { label: 'Hit Points', value: formatHp(system.hp) || '—' },
            { label: 'Challenge', value: challenge !== undefined && challenge !== null ? String(challenge) : '—' },
          ].map((stat) => (
            <div key={stat.label} className="creature-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>

        <div className="creature-content-layout">
          <aside className="creature-sidebar">
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Movement</h3>
              {renderFactRows(movementEntries)}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Skills</h3>
              {skills.length > 0 ? (
                <div className="creature-skills-list">
                  {skills.map((skill) => (
                    <div key={skill.label} className="creature-skills-item">
                      <span>{skill.label}</span>
                      <strong>{skill.value}</strong>
                    </div>
                  ))}
                </div>
              ) : <div className="sheet-empty-state">No skills listed.</div>}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Senses</h3>
              {renderFactRows(senses)}
            </section>
            <section className="sheet-section-block">
              <h3 className="sheet-section-heading">Languages</h3>
              {renderTagCollection(languages, 'No languages listed.')}
            </section>
          </aside>

          <div className="creature-main-panel">
            <div className="creature-search-bar">
              <input
                type="text"
                value={panel.actionSearch || ''}
                onChange={(e) => setPanelActionSearch(panel.id, e.target.value)}
                placeholder="Search actions and traits"
              />
              <div className="creature-filter-buttons">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'action', label: 'Actions' },
                  { value: 'bonus', label: 'Bonus' },
                  { value: 'reaction', label: 'Reactions' },
                  { value: 'trait', label: 'Traits' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={`sheet-filter-chip ${actionFilter === filter.value ? 'active' : ''}`}
                    onClick={() => setPanelActionFilter(panel.id, filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="creature-action-groups">
              {visibleGroups.length > 0 ? visibleGroups.map((group) => (
                <section key={group.key} className="sheet-section-block">
                  <h3 className="sheet-section-heading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name={group.icon} />
                    {group.label}
                  </h3>
                  <div className="creature-action-list">
                    {group.items.map((entry: any, index: number) => {
                      const fullText = Array.isArray(entry?.entries)
                        ? entry.entries.map((nested: any) => toInlineText(nested)).join(' ')
                        : toInlineText(entry);
                      const rollMatch = fullText.match(/[+-]\d+\s*to hit/i);
                      const formulaMatch = fullText.match(/\d+d\d+(?:\s*[+\-]\s*\d+)?(?:\s+[a-zA-Z]+)?/);

                      return (
                        <article key={`${group.key}-${index}-${entry?.name || 'entry'}`} className="creature-action-item">
                          <div className="creature-action-item-main">
                            <div className="creature-action-item-header">
                              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon name={group.icon} />
                                {entry?.name || `${group.label} ${index + 1}`}
                              </h4>
                              <div className="creature-action-meta">
                                {rollMatch ? <span>{rollMatch[0]}</span> : null}
                                {formulaMatch ? <span>{formulaMatch[0]}</span> : null}
                              </div>
                            </div>
                            <div className="sheet-body-copy">
                              {Array.isArray(entry?.entries) ? renderEntriesList(entry.entries) : renderTextContent(fullText)}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )) : (
                <div className="sheet-empty-state">No actions matched the current search and filter settings.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConditionPanelView = (item: any) => {
    const system = item.system || {};
    const badges = [item.book || system.source || null].filter(Boolean) as string[];

    return (
      <div className="panel-view-content">
        {renderCompendiumHero('Condition', badges, getEntryDisplayImage(item), 'file')}
        {renderReadingSection('Condition Rules', system.entries, getItemDescription(item))}
        {renderDetailFieldsSection('Effects', [
          { label: 'Effects', key: 'effects', value: system.effects },
          { label: 'Duration', key: 'duration', value: system.duration },
          { label: 'Applies To', key: 'applies', value: system.applies },
        ])}
        {renderGenericPanelReadFields(item, ['entries', 'effects', 'duration', 'applies'])}
      </div>
    );
  };

  const renderTypedPanelView = (item: any) => {
    const layoutType = getPanelLayoutType(String(item.type || ''));

    switch (layoutType) {
      case 'character':
        return (
          <div style={{ height: '100%' }}>
            <CharacterSheetPanel
              character={characters.find((character) => character.id === item.id) || item}
              onUpdate={updateCharacter}
              onDelete={async (id) => {
                await deleteCharacter(id);
                closePanel(panelForTypedView!.id);
              }}
              onClose={() => closePanel(panelForTypedView!.id)}
            />
          </div>
        );
      case 'creature':
        return renderCreaturePanelView(panelForTypedView!, item);
      case 'spell':
        return renderSpellPanelView(panelForTypedView!, item);
      case 'class':
        return renderClassPanelView(item);
      case 'feat':
        return renderFeatPanelView(item);
      case 'background':
        return renderBackgroundPanelView(item);
      case 'species':
        return renderSpeciesPanelView(item);
      case 'item':
        return renderItemPanelView(panelForTypedView!, item);
      case 'condition':
        return renderConditionPanelView(item);
      default:
        return null;
    }
  };

  const renderPanelEditSections = (panel: typeof floatingPanels[0]) => {
    const normalizedItem = normalizeViewerItem(panel.item);
    const system = normalizedItem.system || {};
    const itemType = String(normalizedItem.type || '').toLowerCase();
    const layoutType = getPanelLayoutType(itemType);

    const monsterSections = [
      {
        key: 'monster-core',
        title: 'Creature Core',
        description: 'Identity, challenge, and baseline combat profile.',
        fields: ['size', 'type', 'alignment', 'ac', 'hp', 'speed', 'cr'],
      },
      {
        key: 'monster-ability-scores',
        title: 'Ability Scores',
        description: 'Primary ability scores laid out compactly.',
        fields: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
      },
      {
        key: 'monster-abilities',
        title: 'Saves, Skills & Senses',
        description: 'Defensive and perception-related values.',
        fields: ['save', 'skills', 'passive', 'senses', 'languages'],
      },
      {
        key: 'monster-actions',
        title: 'Actions & Traits',
        description: 'Traits, actions, bonus actions, reactions, and legendary actions.',
        fields: ['trait', 'traits', 'action', 'actions', 'bonus', 'bonusActions', 'reaction', 'reactions', 'legendary', 'legendaryActions'],
      },
    ];

    const spellCoreKeys = new Set(['level', 'school', 'time', 'range', 'components', 'duration']);
    const spellDetailsCompactKeys = new Set(['level', 'school', 'ability', 'sourceClass']);
    const spellCastingCompactKeys = new Set(['activation', 'time', 'range', 'duration', 'concentration', 'ritual']);
    const spellTargetingCompactKeys = new Set(['target', 'targets', 'area']);
    const spellUsageCompactKeys = new Set(['uses', 'consume', 'cost']);

    const entitySections = (layoutType === 'creature'
      ? monsterSections
      : getEntityEditorSections(itemType, system).map((section) => {
          console.log('[DEBUG DataManager] getEntityEditorSections for itemType:', itemType, 'section:', section.title, 'keys:', section.keys);
          return ({
            key: `entity-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            title: section.title,
            description: section.description,
            fields: section.keys,
          });
        })
    ).map((section) => ({
      ...section,
      fields: section.fields,
    })).filter((section) => section.fields.length > 0);

    const allSections = [
      {
        key: 'identity',
        title: 'Identity',
        description: 'Basic compendium information for this entry.',
        fields: ['name', 'type', 'book', 'source', 'slug', 'description'],
      },
      ...entitySections,
    ];

    const sectionFilter = (panelEditSearch[panel.id] || '').trim().toLowerCase();
    const visibleSections = allSections.filter((section) => {
      if (!sectionFilter) return true;
      const haystack = [
        section.title,
        section.description || '',
        ...section.fields.map((field) => toLabel(field)),
      ].join(' ').toLowerCase();
      return haystack.includes(sectionFilter);
    });

    const requiredHints = getRequiredFieldHints(panel.item);
    const imageCandidates = panelImageCandidates[panel.id] || [];
    const bestImageCandidate = panelImageBestCandidate[panel.id] || null;
    const imageLoading = Boolean(panelImageLoading[panel.id]);
    const imageError = panelImageError[panel.id] || null;
    const getSectionErrorCount = (section: { key: string; fields: string[] }): number => {
      if (section.key === 'identity') {
        return ['name', 'type'].reduce((count, key) => {
          const hint = requiredHints[key];
          if (!hint) return count;
          const value = key === 'name' ? normalizedItem.name : normalizedItem.type;
          return count + (isMissingRequiredValue(value) ? 1 : 0);
        }, 0);
      }

      return section.fields.reduce((count, key) => {
        const path = `system.${key}`;
        const hint = requiredHints[path];
        if (!hint) return count;
        return count + (isMissingRequiredValue(system[key]) ? 1 : 0);
      }, 0);
    };

    const setAllSectionsCollapsed = (collapsed: boolean) => {
      const next = { ...(panel.collapsedSections || {}) };
      visibleSections.forEach((section) => {
        if (collapsed) next[section.key] = true;
        else delete next[section.key];
      });
      updateFloatingPanel(panel.id, { collapsedSections: next });
    };

    const allCollapsed = visibleSections.length > 0 && visibleSections.every((section) => getPanelSectionCollapsed(panel, section.key));

    return (
      <div className="panel-edit-form">
        <div className="panel-edit-toolbar">
          <div className="panel-edit-toolbar-row panel-edit-toolbar-row-sticky">
            <input
              type="text"
              className="panel-edit-search"
              value={panelEditSearch[panel.id] || ''}
              onChange={(e) => setPanelEditSearch((prev) => ({ ...prev, [panel.id]: e.target.value }))}
              placeholder="Filter sections and fields"
            />
            <div className="panel-edit-toolbar-actions">
              <button
                type="button"
                className="panel-inline-btn panel-inline-btn-ghost"
                title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
                onClick={() => setAllSectionsCollapsed(!allCollapsed)}
              >
                <Icon name={allCollapsed ? 'expand' : 'compress'} />
              </button>
            </div>
          </div>
          <div className="panel-edit-shortcuts-hint">
            <span><kbd>⌘/Ctrl</kbd>+<kbd>S</kbd> Save</span>
            <span><kbd>Alt</kbd>+<kbd>[</kbd>/<kbd>]</kbd> Section</span>
            <span><kbd>Alt</kbd>+<kbd>C</kbd> Toggle</span>
          </div>
          <div className="panel-edit-quick-nav">
            {visibleSections.map((section) => (
              <button
                key={`nav-${section.key}`}
                type="button"
                className="panel-inline-btn panel-inline-btn-ghost"
                title={section.title}
                onClick={() => {
                  setPanelSectionCollapsed(panel.id, section.key, false);
                  scrollToPanelSection(panel.id, section.key);
                }}
              >
                {section.title}
                {getSectionErrorCount(section) > 0 ? <span className="panel-chip-error-count">{getSectionErrorCount(section)}</span> : null}
              </button>
            ))}
            <button
              type="button"
              className={`panel-inline-btn panel-inline-btn-ghost ${panelShowAdvancedRaw[panel.id] ? 'active' : ''}`}
              title={panelShowAdvancedRaw[panel.id] ? 'Hide advanced raw fields' : 'Show advanced raw fields'}
              onClick={() => setPanelShowAdvancedRaw((prev) => ({ ...prev, [panel.id]: !prev[panel.id] }))}
            >
              Raw
            </button>
          </div>
        </div>

        {visibleSections.map((section) => {
          if (section.key === 'identity') {
            return renderCollapsibleEditSection(
              panel,
              section.key,
              section.title,
              section.description,
              <>
                {renderTypedEditor(panel.id, panel.item, ['name'], normalizedItem.name || '', 'Name')}
                {renderTypedEditor(panel.id, panel.item, ['type'], normalizedItem.type || '', 'Type')}
                {renderTypedEditor(panel.id, panel.item, ['book'], normalizedItem.book || '', 'Source')}
                {panel.item.source !== undefined ? renderTypedEditor(panel.id, panel.item, ['source'], panel.item.source || '', 'Source Key') : null}
                {normalizedItem.slug !== undefined ? renderTypedEditor(panel.id, panel.item, ['slug'], normalizedItem.slug || '', 'Slug') : null}
                {renderTypedEditor(panel.id, panel.item, ['description'], normalizedItem.description || '', 'Summary')}
                {renderTypedEditor(panel.id, panel.item, ['img'], normalizedItem.img || '', 'Image URL')}
                {layoutType === 'creature' ? renderTypedEditor(panel.id, panel.item, ['imgToken'], normalizedItem.imgToken || '', 'Token Image URL') : null}
                {renderTypedEditor(panel.id, panel.item, ['imgSource'], normalizedItem.imgSource || '', 'Image Source')}
                {renderTypedEditor(panel.id, panel.item, ['imgFallback'], normalizedItem.imgFallback || getFallbackImageForType(itemType), 'Fallback Image')}
                <div className="panel-edit-image-preview">
                  <label>Preview</label>
                  <div className="panel-edit-image-preview-row">
                    <img src={getEntryDisplayImage(normalizedItem, layoutType === 'creature')} alt={normalizedItem.name || 'Entry image'} loading="lazy" />
                    <button
                      type="button"
                      className="panel-inline-btn panel-inline-btn-ghost"
                      onClick={() => updatePanelItemPath(panel.id, panel.item, ['imgFallback'], getFallbackImageForType(itemType))}
                      title="Reset fallback image"
                    >
                      Reset Fallback
                    </button>
                  </div>
                </div>
                <div className="panel-edit-image-tools">
                  <div className="panel-edit-image-tools-header">
                    <label>Image Fetcher</label>
                    <div className="panel-edit-image-tools-actions">
                      <button
                        type="button"
                        className="panel-inline-btn panel-inline-btn-ghost"
                        onClick={() => resolvePanelImageCandidates(panel)}
                        disabled={imageLoading}
                        title="Resolve candidates from enabled providers"
                      >
                        {imageLoading ? 'Resolving…' : 'Resolve'}
                      </button>
                      <button
                        type="button"
                        className="panel-inline-btn panel-inline-btn-ghost"
                        onClick={() => rejectPanelImageCandidates(panel)}
                        disabled={imageLoading}
                        title="Reject current candidates"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  {imageError ? <div className="panel-edit-image-error">{imageError}</div> : null}
                  {bestImageCandidate ? (
                    <div className="panel-edit-image-best">
                      <div className="panel-edit-image-best-info">
                        <img
                          src={bestImageCandidate.url}
                          alt={`Best candidate from ${bestImageCandidate.provider}`}
                          loading="lazy"
                          className="panel-edit-image-candidate-preview"
                        />
                        <span>Best: {bestImageCandidate.provider} ({Math.round((bestImageCandidate.confidence || 0) * 100)}%)</span>
                      </div>
                      <button
                        type="button"
                        className="panel-inline-btn"
                        onClick={() => approvePanelImageCandidate(panel, bestImageCandidate)}
                        disabled={imageLoading}
                      >
                        Approve Best
                      </button>
                    </div>
                  ) : null}
                  {imageCandidates.length > 0 ? (
                    <div className="panel-edit-image-candidates">
                      {imageCandidates.map((candidate, index) => (
                        <div key={`${candidate.url}-${index}`} className="panel-edit-image-candidate">
                          <img
                            src={candidate.url}
                            alt={`${candidate.provider} candidate`}
                            loading="lazy"
                            className="panel-edit-image-candidate-preview"
                          />
                          <div className="panel-edit-image-candidate-meta">
                            <strong>{candidate.provider}</strong>
                            <span>{candidate.kind}</span>
                            <span>{Math.round((candidate.confidence || 0) * 100)}%</span>
                          </div>
                          <a href={candidate.url} target="_blank" rel="noreferrer" className="panel-edit-image-candidate-url">{candidate.url}</a>
                          <div className="panel-edit-image-candidate-actions">
                            <button
                              type="button"
                              className="panel-inline-btn"
                              onClick={() => approvePanelImageCandidate(panel, candidate)}
                              disabled={imageLoading}
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>,
            );
          }

          return renderCollapsibleEditSection(
            panel,
            section.key,
            section.title,
            section.description,
            <>
              {section.key === 'monster-ability-scores' ? (
                <div className="panel-editor-inline-grid panel-editor-inline-grid-abilities">
                  {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((abilityKey) => (
                    <div key={abilityKey} className="panel-editor-inline-cell">
                      {renderTypedEditor(panel.id, panel.item, ['system', abilityKey], system[abilityKey], abilityKey.toUpperCase())}
                    </div>
                  ))}
                </div>
              ) : section.title === 'Spell Details' ? (
                <div className="panel-editor-inline-grid panel-editor-inline-grid-spell-details">
                  {section.fields.map((key) => (
                    <div
                      key={key}
                      className={`panel-editor-inline-cell panel-editor-inline-cell-key-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')} ${spellDetailsCompactKeys.has(key) ? 'panel-editor-inline-cell-compact' : ''}`}
                    >
                      {renderTypedEditor(panel.id, panel.item, ['system', key], system[key], toLabel(key))}
                    </div>
                  ))}
                </div>
              ) : section.title === 'Casting' ? (
                <div className="panel-editor-inline-grid panel-editor-inline-grid-spell-casting">
                  {section.fields.map((key) => (
                    <div
                      key={key}
                      className={`panel-editor-inline-cell panel-editor-inline-cell-key-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')} ${spellCastingCompactKeys.has(key) ? 'panel-editor-inline-cell-compact' : ''}`}
                    >
                      {renderTypedEditor(panel.id, panel.item, ['system', key], system[key], toLabel(key))}
                    </div>
                  ))}
                </div>
              ) : section.title === 'Targets & Area' ? (
                <div className="panel-editor-inline-grid panel-editor-inline-grid-spell-targeting">
                  {section.fields.map((key) => (
                    <div
                      key={key}
                      className={`panel-editor-inline-cell panel-editor-inline-cell-key-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')} ${spellTargetingCompactKeys.has(key) ? 'panel-editor-inline-cell-compact' : ''}`}
                    >
                      {renderTypedEditor(panel.id, panel.item, ['system', key], system[key], toLabel(key))}
                    </div>
                  ))}
                </div>
              ) : section.title === 'Usage' ? (
                <div className="panel-editor-inline-grid panel-editor-inline-grid-spell-usage">
                  {section.fields.map((key) => (
                    <div
                      key={key}
                      className={`panel-editor-inline-cell panel-editor-inline-cell-key-${String(key).toLowerCase().replace(/[^a-z0-9]+/g, '-')} ${spellUsageCompactKeys.has(key) ? 'panel-editor-inline-cell-compact' : ''}`}
                    >
                      {renderTypedEditor(panel.id, panel.item, ['system', key], system[key], toLabel(key))}
                    </div>
                  ))}
                </div>
              ) : section.title === 'Spell Core' ? (
                <div className="panel-editor-inline-grid panel-editor-inline-grid-spell-core">
                  {section.fields.map((key) => (
                    <div key={key} className={`panel-editor-inline-cell ${spellCoreKeys.has(key) ? 'panel-editor-inline-cell-compact' : ''}`}>
                      {renderTypedEditor(panel.id, panel.item, ['system', key], system[key], toLabel(key))}
                    </div>
                  ))}
                </div>
              ) : (
                section.fields.map((key) => renderTypedEditor(panel.id, panel.item, ['system', key], system[key], toLabel(key)))
              )}
            </>,
          );
        })}

        {panelShowAdvancedRaw[panel.id] ? renderCollapsibleEditSection(
          panel,
          'advanced-raw',
          'Advanced Raw Data',
          'Directly edit any nested property not shown in structured sections.',
          <>
            {renderTypedEditor(panel.id, panel.item, ['system'], system, 'System Data')}
          </>,
        ) : null}
      </div>
    );
  };

  let panelForTypedView: typeof floatingPanels[0] | null = null;

  // Helper function to render a floating panel
  const renderFloatingPanel = (panel: typeof floatingPanels[0]) => (
    (() => {
      panelForTypedView = panel;
      const layoutType = getPanelLayoutType(String(panel.item.type || ''));
      const visual = getItemCardVisual(String(panel.item.type || ''), extractMonsterChallengeRating(panel.item), extractSpellSchool(panel.item));

      return (
        <div
          key={panel.id}
          className={`floating-panel floating-panel-${layoutType} ${panel.isEditing ? 'editing' : ''}`}
          style={{
            position: 'fixed',
            left: panel.position.x,
            top: panel.position.y,
            width: panel.size?.width || 620,
            height: panel.size?.height || 680,
            zIndex: 10000 + floatingPanels.indexOf(panel),
            '--bg-primary': colorScheme.background,
            '--bg-secondary': colorScheme.surface,
            '--bg-tertiary': colorScheme.surface,
            '--accent': colorScheme.accent,
            '--border': colorScheme.accent,
            '--text-primary': colorScheme.text,
            '--text-secondary': colorScheme.text,
            '--panel-accent': visual.accent,
          } as React.CSSProperties}
        >
          <div
            className="floating-panel-header"
            onMouseDown={(e) => handlePanelDragStart(e, panel.id)}
            onMouseDownCapture={() => setPanelFocus(panel.id)}
          >
            <div className="panel-title-area">
              <span className="panel-title">{panel.item.name}</span>
              <span className="panel-title-meta">{toLabel(panel.item.type || 'entry')}</span>
              {panel.isEditing && isCompendiumPanel(panel) ? (
                <span className={`panel-save-status ${panel.saveError ? 'error' : panel.isSaving ? 'saving' : panel.isDirty ? 'dirty' : panel.lastSavedAt ? 'saved' : ''}`}>
                  {panel.saveError
                    ? panel.saveError
                    : panel.isSaving
                      ? 'Saving...'
                      : panel.isDirty
                        ? 'Unsaved changes'
                        : panel.lastSavedAt
                          ? 'Saved'
                          : 'Ready'}
                </span>
              ) : null}
            </div>
            <div className="panel-actions">
              {panel.isEditing && isCompendiumPanel(panel) ? (
                <>
                  <button
                    className="panel-btn panel-btn-save"
                    onClick={() => savePanelItem(panel.id)}
                    disabled={Boolean(panel.isSaving)}
                    title="Save"
                  >
                    <Icon name="save" />
                  </button>
                  <button
                    className="panel-btn"
                    onClick={() => discardPanelChanges(panel.id, true)}
                    disabled={Boolean(panel.isSaving)}
                    title="Discard"
                  >
                    <Icon name="repeat" />
                  </button>
                  <button
                    className="panel-btn"
                    onClick={() => discardPanelChanges(panel.id, false)}
                    disabled={Boolean(panel.isSaving)}
                    title="Reset"
                  >
                    <Icon name="rotate" />
                  </button>
                </>
              ) : null}
              <button
                className="panel-btn"
                onClick={() => togglePanelEdit(panel.id)}
                disabled={Boolean(panel.isSaving)}
                title={panel.isEditing ? 'View' : 'Edit'}
              >
                <Icon name={panel.isEditing ? 'eye' : 'edit'} />
              </button>
              <button
                className="panel-btn panel-btn-close"
                onClick={() => closePanel(panel.id)}
                disabled={Boolean(panel.isSaving)}
                title="Close"
              >
                <Icon name="times" />
              </button>
            </div>
          </div>
          <div className="floating-panel-content">
            {panel.isEditing ? (
              <div
                className="panel-edit-hotkeys"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (!panel.isEditing) return;

                  const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
                  if (isSaveShortcut) {
                    event.preventDefault();
                    if (!panel.isSaving) savePanelItem(panel.id);
                    return;
                  }

                  if (event.altKey && event.key === ']') {
                    event.preventDefault();
                    focusAdjacentSection(panel.id, 'next');
                    return;
                  }

                  if (event.altKey && event.key === '[') {
                    event.preventDefault();
                    focusAdjacentSection(panel.id, 'prev');
                    return;
                  }

                  if (event.altKey && event.key.toLowerCase() === 'c') {
                    event.preventDefault();
                    const sectionSelector = `[id^="panel-${panel.id}-section-"] .panel-edit-section-toggle`;
                    const firstToggle = document.querySelector<HTMLElement>(sectionSelector);
                    firstToggle?.click();
                  }
                }}
              >
                {renderPanelEditSections(panel)}
              </div>
            ) : (
              renderTypedPanelView(panel.item) || (
                <div className="panel-view-content">
                  {(getItemDescription(panel.item)) && (
                    <div className="panel-section panel-section-reading">
                      <h4 className="panel-section-title">Description</h4>
                      <div className="panel-summary">
                        {renderTextContent(String(getItemDescription(panel.item)))}
                      </div>
                    </div>
                  )}
                  <div className="panel-section">
                    <h4 className="panel-section-title">Details</h4>
                    {panel.item.book && panel.item.type !== 'spell' && (
                      <div className="panel-source">
                        <Icon name="book" /> {panel.item.book}
                      </div>
                    )}
                    <div className="panel-data">
                      {renderSystemFields(panel.item, 'summary') || (
                        <div className="detail-field">
                          <span className="field-value">No structured fields available.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
          <div
            className="floating-panel-resize"
            onMouseDown={(e) => {
              e.preventDefault();
              setResizingPanel(panel.id);
            }}
          />
        </div>
      );
    })()
  );

  // Build theme class from color scheme id (same logic as App.tsx)
  const getBaseThemeId = (id: string) => {
    const baseTheme = id.split('-custom-')[0];
    return baseTheme || id;
  };
  const themeClass = `theme-${getBaseThemeId(colorScheme.id)}`;
  
  // Build theme style with custom colors for customized schemes
  const isCustomized = colorScheme.id.includes('-custom-') || colorScheme.id === 'custom';
  const themeStyle: React.CSSProperties = isCustomized ? {
    '--bg-primary': colorScheme.background,
    '--bg-secondary': colorScheme.surface,
    '--bg-tertiary': colorScheme.surface,
    '--surface': colorScheme.surface,
    '--accent': colorScheme.accent,
    '--border': colorScheme.accent,
    '--text-primary': colorScheme.text,
    '--text-secondary': colorScheme.text,
  } as React.CSSProperties : {};

  if (sheetLayerOnly) {
    return (
      <FloatingPanelsLayer
        panels={floatingPanels}
        themeClass={themeClass}
        themeStyle={themeStyle}
        renderPanel={renderFloatingPanel}
      />
    );
  }

  if (!dndManagerVisible) return null;

  return (
    <div
      ref={containerRef}
      className={`data-manager ${isDragging ? 'dragging' : ''}`}
      onClick={() => setPanelFocus('dndManager')}
      style={{
        position: 'absolute',
        left: dndManagerPosition.x,
        top: dndManagerPosition.y,
        width: dndManagerSize.width,
        height: dndManagerSize.height,
        zIndex: panelFocus === 'dndManager' ? 5000 : 100,
        display: dndManagerVisible ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      <div
        className="data-manager-header"
        onMouseDown={handleDragStart}
        style={{ cursor: isGM ? 'grab' : 'default' }}
      >
        <div className="header-title">
          <h2>Compendium</h2>
        </div>
        <div className="header-actions">
          {isGM && (
            <button className="btn-import-header" onClick={handleModulesClick} title="Manage Modules">
              <Icon name="layer-group" /> Modules
            </button>
          )}
          {isGM && (
            <button className="btn-import-header" onClick={handleImportClick} title="Import Data">
              <Icon name="upload" /> Import
            </button>
          )}
          <button className="data-manager-close" onClick={handleClose} title="Close Data Manager">
            <Icon name="times" />
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="main-tabs" style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <button
          className={`main-tab ${activeTab === 'compendium' ? 'active' : ''}`}
          onClick={() => setActiveTab('compendium')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'compendium' ? (colorScheme?.surface || '#333') : 'transparent',
            border: 'none',
            color: activeTab === 'compendium' ? (colorScheme?.text || '#fff') : (colorScheme?.textSecondary || '#aaa'),
            cursor: 'pointer',
            borderBottom: activeTab === 'compendium' ? `2px solid ${colorScheme?.accent || '#6b8aff'}` : '2px solid transparent',
          }}
        >
          <Icon name="book" /> Compendium
        </button>
        <button
          className={`main-tab ${activeTab === 'journals' ? 'active' : ''}`}
          onClick={() => { setActiveTab('journals'); fetchJournals(); }}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'journals' ? (colorScheme?.surface || '#333') : 'transparent',
            border: 'none',
            color: activeTab === 'journals' ? (colorScheme?.text || '#fff') : (colorScheme?.textSecondary || '#aaa'),
            cursor: 'pointer',
            borderBottom: activeTab === 'journals' ? `2px solid ${colorScheme?.accent || '#6b8aff'}` : '2px solid transparent',
          }}
        >
          <Icon name="book-open" /> Journals
        </button>
        <button
          className={`main-tab ${activeTab === 'characters' ? 'active' : ''}`}
          onClick={() => { setActiveTab('characters'); fetchCharacters(); }}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'characters' ? (colorScheme?.surface || '#333') : 'transparent',
            border: 'none',
            color: activeTab === 'characters' ? (colorScheme?.text || '#fff') : (colorScheme?.textSecondary || '#aaa'),
            cursor: 'pointer',
            borderBottom: activeTab === 'characters' ? `2px solid ${colorScheme?.accent || '#6b8aff'}` : '2px solid transparent',
          }}
        >
          <Icon name="user" /> Characters
        </button>
      </div>

      <div className="data-manager-body">
        <Compendium
          activeTab={activeTab}
          activeBrowseTab={activeBrowseTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filters={filters}
          setFilters={setFilters}
          fetchItemsByType={fetchItemsByType}
          loadingTypeItems={loadingTypeItems}
          cardSizeScale={cardSizeScale}
          setCardSizeScale={setCardSizeScale}
          setActiveBrowseTab={setActiveBrowseTab}
          modules={modules}
          sessionModules={sessionModules}
          isGM={isGM}
          handleToggleModule={handleToggleModule}
          handleDeleteModule={handleDeleteModule}
          setActiveTab={setActiveTab}
          fetchAvailableFiles={fetchAvailableFiles}
          typeItems={typeItems}
          floatingPanels={floatingPanels}
          openItemPanel={openItemPanel}
          duplicateItem={duplicateItem}
          deleteItem={deleteItem}
          autoResolveBestImageForItem={autoResolveBestImageForItem}
          getItemCardVisual={getItemCardVisual}
          extractMonsterChallengeRating={extractMonsterChallengeRating}
          extractSpellSchool={extractSpellSchool}
          getEntryDisplayImage={getEntryDisplayImage}
          selectedItem={selectedItem}
          setSelectedItem={setSelectedItem}
          renderSystemFields={renderSystemFields}
          availableFiles={availableFiles}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          importName={importName}
          setImportName={setImportName}
          importSystem={importSystem}
          setImportSystem={setImportSystem}
          importVersion={importVersion}
          setImportVersion={setImportVersion}
          importDescription={importDescription}
          setImportDescription={setImportDescription}
          handleFileImport={handleFileImport}
          fiveEToolsCategory={fiveEToolsCategory}
          setFiveEToolsCategory={setFiveEToolsCategory}
          fiveEToolsDataset={fiveEToolsDataset}
          setFiveEToolsDataset={setFiveEToolsDataset}
          fiveEToolsName={fiveEToolsName}
          setFiveEToolsName={setFiveEToolsName}
          fiveEToolsSystem={fiveEToolsSystem}
          setFiveEToolsSystem={setFiveEToolsSystem}
          fiveEToolsVersion={fiveEToolsVersion}
          setFiveEToolsVersion={setFiveEToolsVersion}
          fiveEToolsDescription={fiveEToolsDescription}
          setFiveEToolsDescription={setFiveEToolsDescription}
          fiveEToolsCategories={fiveEToolsCategories}
          fiveEToolsOptions={fiveEToolsOptions}
          fiveEToolsSources={fiveEToolsSources}
          handle5eToolsImport={handle5eToolsImport}
          importType={importType}
          setImportType={setImportType}
          importJson={importJson}
          setImportJson={setImportJson}
          loading={loading}
          quickImport={quickImport}
          imageBackfillLimit={imageBackfillLimit}
          setImageBackfillLimit={setImageBackfillLimit}
          imageBackfillRunning={imageBackfillRunning}
          imageBackfillResult={imageBackfillResult}
          runImageBackfill={runImageBackfill}
          imageFetcherConfig={imageFetcherConfig}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          activeFilterCount={Object.keys(filters).length}
          handleRefreshModule={handleRefreshModule}
        />

        {activeTab === 'journals' && (
          <Journals
            journalFilterType={journalFilterType}
            setJournalFilterType={setJournalFilterType}
            journalTypes={journalTypes}
            journals={journals}
            selectedJournal={selectedJournal}
            isEditingJournal={isEditingJournal}
            setSelectedJournal={setSelectedJournal}
            createJournal={createJournal}
            updateJournal={updateJournal}
            deleteJournal={deleteJournal}
            setIsEditingJournal={setIsEditingJournal}
            journalLayouts={journalLayouts}
            colorScheme={colorScheme}
          />
        )}

        {activeTab === 'characters' && (
          <Characters
            cardSizeScale={cardSizeScale}
            setCardSizeScale={setCardSizeScale}
            createCharacter={createCharacter}
            characters={characters}
            openCharacterPanel={openCharacterPanel}
          />
        )}
      </div>

      <div
        ref={resizeRef}
        className="data-manager-resize"
        onMouseDown={handleResizeStart}
      />

      <CharacterCreatorWizard
        isOpen={showCharacterWizard}
        onClose={() => setShowCharacterWizard(false)}
        onCharacterCreated={(newCharacter) => {
          setCharacters([...characters, newCharacter]);
          openCharacterPanel(newCharacter);
          setShowCharacterWizard(false);
        }}
      />
    </div>
  );
}
