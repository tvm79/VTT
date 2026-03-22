import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { socketService } from '../services/socket';
import type { RandomTableEntry, RollTable } from '../macros/types';
import { getDice3DRoller } from '../dice/dice3dBridge';

const DMG_5ETOOLS_SOURCE_URL = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master/data/book/book-dmg.json';

function pickWeightedIndex(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return 0;
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function stripHtml(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function strip5eToolsTags(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/\{@([^\s}]+)\s+([^}|]+)(?:\|[^}]+)?\}/g, '$2')
      .replace(/\{@([^\s}]+)\s+([^}]+)\}/g, '$2')
      .replace(/\{@[^}]+\}/g, '')
      .replace(/\{@/g, '')
      .replace(/[{}]/g, ''),
  );
}

function stringify5eToolsValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return strip5eToolsTags(stripHtml(value));
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return normalizeWhitespace(value.map((entry) => stringify5eToolsValue(entry)).filter(Boolean).join(' '));
  }
  if (typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    if (typeof raw.roll === 'object' && raw.roll) {
      const roll = raw.roll as Record<string, unknown>;
      if (typeof roll.exact === 'number') return String(roll.exact);
      const min = typeof roll.min === 'number' ? roll.min : null;
      const max = typeof roll.max === 'number' ? roll.max : null;
      if (min !== null && max !== null) return min === max ? String(min) : `${min}-${max}`;
    }
    if (typeof raw.entry === 'string') return strip5eToolsTags(stripHtml(raw.entry));
    if (typeof raw.entries !== 'undefined') return stringify5eToolsValue(raw.entries);
    if (typeof raw.items !== 'undefined') return stringify5eToolsValue(raw.items);
    if (typeof raw.name === 'string') return strip5eToolsTags(stripHtml(raw.name));
  }
  return '';
}

function parseRangeCell(value: string): [number, number] | null {
  const normalized = value.replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [start, end];
}

function inferFormulaFromRows(rows: RandomTableEntry[]): string | undefined {
  if (rows.length === 0) return undefined;
  const hasExplicitRanges = rows.every((row) => Array.isArray(row.range) && row.range.length === 2);
  if (!hasExplicitRanges) return rows.length > 1 ? `1d${rows.length}` : undefined;
  const max = Math.max(...rows.map((row) => row.range?.[1] || 0));
  const min = Math.min(...rows.map((row) => row.range?.[0] || 1));
  if (min === 1 && max > 1) return `1d${max}`;
  return undefined;
}

interface RollTableFolderNode {
  name: string;
  path: string;
  tables: RollTable[];
  children: RollTableFolderNode[];
}

function renameFolderPath(value: string | null | undefined, fromPath: string, toPath: string): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  if (normalized === fromPath) return toPath || null;
  if (normalized.startsWith(`${fromPath}/`)) return `${toPath}${normalized.slice(fromPath.length)}`;
  return normalized;
}

function buildFolderTree(tables: RollTable[], createdFolders: string[]): RollTableFolderNode[] {
  const rootNodes: RollTableFolderNode[] = [];
  const nodesByPath = new Map<string, RollTableFolderNode>();

  const ensureNode = (folderPath: string): RollTableFolderNode => {
    const parts = folderPath.split('/').map((part) => part.trim()).filter(Boolean);
    let currentPath = '';
    let parentPath = '';
    let currentNode: RollTableFolderNode | null = null;

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let nextNode = nodesByPath.get(currentPath);
      if (!nextNode) {
        nextNode = { name: part, path: currentPath, tables: [], children: [] };
        nodesByPath.set(currentPath, nextNode);

        if (!parentPath) {
          rootNodes.push(nextNode);
        } else {
          const parentNode = nodesByPath.get(parentPath);
          if (parentNode && !parentNode.children.some((child) => child.path === nextNode!.path)) {
            parentNode.children.push(nextNode);
          }
        }
      }

      currentNode = nextNode;
      parentPath = currentPath;
    }

    if (!currentNode) {
      currentNode = { name: 'Unfiled', path: '', tables: [], children: [] };
    }

    return currentNode;
  };

  for (const folderPath of createdFolders.map((folder) => folder.trim()).filter(Boolean)) {
    ensureNode(folderPath);
  }

  for (const table of tables) {
    const folderPath = typeof table.folder === 'string' ? table.folder.trim() : '';
    if (!folderPath) {
      continue;
    }
    ensureNode(folderPath).tables.push(table);
  }

  const sortNode = (node: RollTableFolderNode): RollTableFolderNode => ({
    ...node,
    tables: [...node.tables].sort((a, b) => a.name.localeCompare(b.name)),
    children: [...node.children]
      .map(sortNode)
      .sort((a, b) => a.name.localeCompare(b.name)),
  });

  return [...rootNodes].map(sortNode).sort((a, b) => a.name.localeCompare(b.name));
}

function tableNodeToRollTable(input: unknown, index: number): RollTable | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, any>;
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) return null;

  const columnLabels = Array.isArray(raw.colLabels)
    ? raw.colLabels.map((label: unknown) => stringify5eToolsValue(label))
    : [];
  const firstColumnLooksLikeRoll = /(^|\b)(d\d+|roll|result)(\b|$)/i.test(columnLabels[0] || '');

  const rows: RandomTableEntry[] = raw.rows
    .map((row: unknown, rowIndex: number) => {
      const cells = Array.isArray(row)
        ? row.map((cell) => stringify5eToolsValue(cell))
        : [stringify5eToolsValue(row)];
      const cleanedCells = cells.map((cell) => normalizeWhitespace(cell));
      const primaryCell = cleanedCells[0] || `Result ${rowIndex + 1}`;
      const parsedRange = firstColumnLooksLikeRoll ? parseRangeCell(primaryCell) : null;
      const fallbackRange: [number, number] = [rowIndex + 1, rowIndex + 1];
      const range = parsedRange || fallbackRange;
      const labelIndex = parsedRange ? 1 : 0;
      const label = cleanedCells[labelIndex] || primaryCell || `Result ${rowIndex + 1}`;
      const detail = cleanedCells
        .map((cell, cellIndex) => {
          if (!cell) return null;
          if (cellIndex === labelIndex) return null;
          if (parsedRange && cellIndex === 0) return null;
          const header = columnLabels[cellIndex];
          return header ? `${header}: ${cell}` : cell;
        })
        .filter(Boolean)
        .join(' | ');

      return {
        id: `dmg-${index}-row-${rowIndex}`,
        label,
        detail: detail || undefined,
        weight: Math.max(1, range[1] - range[0] + 1),
        range,
      };
    })
    .filter((row) => row.label);

  if (rows.length === 0) return null;

  const name = stringify5eToolsValue(raw.caption || raw.name || `DMG Table ${index + 1}`);
  const description = columnLabels.length > 0 ? `Imported from 5etools DMG. Columns: ${columnLabels.join(', ')}` : 'Imported from 5etools DMG.';

  return {
    id: `dmg-${Date.now()}-${index}`,
    name,
    description,
    formula: inferFormulaFromRows(rows),
    replacement: true,
    displayRoll: true,
    rows,
    isGlobal: true,
    tags: ['dmg', '5etools', 'imported'],
  };
}

function extractDmgTablesFrom5eTools(input: unknown): RollTable[] {
  const tables: RollTable[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;
    const raw = node as Record<string, unknown>;
    if (raw.type === 'table') {
      const table = tableNodeToRollTable(raw, tables.length);
      if (table) tables.push(table);
    }
    Object.values(raw).forEach(walk);
  };

  walk(input);
  return tables;
}

function rollFormula(formula: string): number | null {
  const normalized = formula.trim().toLowerCase();
  const match = normalized.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  const count = Number(match[1] || '1');
  const sides = Number(match[2]);
  const modifier = Number(match[3] || '0');
  if (!count || !sides) return null;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total + modifier;
}

function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function normalizeFoundryRollTable(input: unknown): RollTable | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, any>;
  if (!Array.isArray(raw.results)) return null;

  const id = raw._id || `rt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const rows: RandomTableEntry[] = raw.results.map((result: any, index: number) => ({
    id: result._id || `${id}-row-${index}`,
    type: result.type || 'text',
    label: result.name || `Result ${index + 1}`,
    detail: stripHtml(result.description),
    img: result.img,
    weight: typeof result.weight === 'number' ? result.weight : 1,
    range: Array.isArray(result.range) && result.range.length === 2
      ? [Number(result.range[0]) || index + 1, Number(result.range[1]) || index + 1]
      : [index + 1, index + 1],
    drawn: Boolean(result.drawn),
    documentUuid: result.documentUuid ?? null,
    flags: result.flags || {},
  }));

  return {
    id,
    name: raw.name || 'Imported Rolltable',
    description: stripHtml(raw.description || ''),
    img: raw.img,
    formula: raw.formula || undefined,
    replacement: raw.replacement !== false,
    displayRoll: raw.displayRoll !== false,
    folder: raw.folder ?? null,
    flags: raw.flags || {},
    ownership: raw.ownership || {},
    rows,
    isGlobal: true,
  };
}

export function RollTablePanel() {
  const {
    rollTablePanelVisible,
    setRollTablePanelVisible,
    rollTablePanelPosition,
    setRollTablePanelPosition,
    rollTablePanelSize,
    setRollTablePanelSize,
    rollTables,
    addRollTable,
    updateRollTable,
    deleteRollTable,
    panelFocus,
    setPanelFocus,
    colorScheme,
    isGM,
    dice3dEnabled,
    setFileBrowserVisible,
    setFileBrowserSelectCallback,
  } = useGameStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [newTableName, setNewTableName] = useState('');
  const [lastRollInfo, setLastRollInfo] = useState<string>('');
  const [selectedRowId, setSelectedRowId] = useState<string>('');
  const [isImportingDmg, setIsImportingDmg] = useState(false);
  const [availableDmgTables, setAvailableDmgTables] = useState<RollTable[]>([]);
  const [selectedDmgTableNames, setSelectedDmgTableNames] = useState<string[]>([]);
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [expandedRowDetails, setExpandedRowDetails] = useState<Set<string>>(new Set());

  const selectedTable = useMemo(
    () => rollTables.find((t) => t.id === selectedTableId) || rollTables[0] || null,
    [rollTables, selectedTableId],
  );

  const folderTree = useMemo(() => {
    const tree = buildFolderTree(rollTables, createdFolders);
    return tree;
  }, [createdFolders, rollTables]);

  const rootTables = useMemo(
    () => rollTables
      .filter((table) => !table.folder || !table.folder.trim())
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rollTables],
  );

  const hasPendingDmgSelection = availableDmgTables.length > 0;

  useEffect(() => {
    if (!selectedTableId && rollTables[0]) {
      setSelectedTableId(rollTables[0].id);
    }
  }, [selectedTableId, rollTables]);

  useEffect(() => {
    if (!selectedTable) {
      setSelectedRowId('');
      return;
    }
    if (selectedTable.rows.length === 0) {
      setSelectedRowId('');
      return;
    }
    if (!selectedTable.rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(selectedTable.rows[0].id || '');
    }
  }, [selectedTable, selectedRowId]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setRollTablePanelPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      setIsDragging(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, dragOffset, setRollTablePanelPosition]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      setRollTablePanelSize({
        width: Math.max(300, e.clientX - rollTablePanelPosition.x),
        height: Math.max(280, e.clientY - rollTablePanelPosition.y),
      });
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      setIsResizing(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, rollTablePanelPosition, setRollTablePanelSize]);

  useEffect(() => {
    if (!isResizingSidebar) return;
    const onMove = (e: MouseEvent) => {
      const raw = e.clientX - rollTablePanelPosition.x;
      const maxSidebar = Math.max(180, rollTablePanelSize.width - 340);
      setSidebarWidth(Math.max(170, Math.min(maxSidebar, raw)));
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      setIsResizingSidebar(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isResizingSidebar, rollTablePanelPosition.x, rollTablePanelSize.width]);

  if (!rollTablePanelVisible) return null;

  const createTable = () => {
    const name = newTableName.trim();
    if (!name) return;
    const id = `rt-${Date.now()}`;
    addRollTable({
      id,
      name,
      isGlobal: true,
      formula: '1d20',
      replacement: true,
      displayRoll: true,
      rows: [{ id: `row-${Date.now()}`, label: 'New row', weight: 1, range: [1, 1] }],
    });
    setSelectedTableId(id);
    setNewTableName('');
  };

  const openRowImagePicker = (rowId: string, currentImage?: string) => {
    if (!selectedTable || !isGM) return;

    const manual = window.confirm('Press OK to paste an image URL. Press Cancel to open Asset Browser (upload/select).');

    if (manual) {
      const value = window.prompt('Set row image URL', currentImage || '');
      if (value === null) return;
      updateRollTable(selectedTable.id, {
        rows: selectedTable.rows.map((r) => (r.id === rowId ? { ...r, img: value.trim() || undefined } : r)),
      });
      return;
    }

    setFileBrowserSelectCallback((fileUrl: string) => {
      updateRollTable(selectedTable.id, {
        rows: selectedTable.rows.map((r) => (r.id === rowId ? { ...r, img: fileUrl } : r)),
      });
    });
    setFileBrowserVisible(true);
  };

  const addRow = () => {
    if (!selectedTable || !isGM) return;
    const nextRangeStart = selectedTable.rows.length > 0
      ? Math.max(...selectedTable.rows.map((r) => r.range?.[1] || 0)) + 1
      : 1;
    updateRollTable(selectedTable.id, {
      rows: [...selectedTable.rows, { id: `row-${Date.now()}`, label: 'New row', weight: 1, range: [nextRangeStart, nextRangeStart] }],
    });
  };

  const autoGenerateRanges = () => {
    if (!selectedTable) return;
    let cursor = 1;
    const rows = selectedTable.rows.map((row) => {
      const start = cursor;
      const width = Math.max(1, Number(row.weight || 1));
      const end = start + width - 1;
      cursor = end + 1;
      return { ...row, range: [start, end] as [number, number] };
    });
    updateRollTable(selectedTable.id, { rows });
  };

  const commitDrawnState = (pickedId: string | undefined) => {
    if (!selectedTable || !pickedId || selectedTable.replacement !== false) return;
    updateRollTable(selectedTable.id, {
      rows: selectedTable.rows.map((row) => (row.id === pickedId ? { ...row, drawn: true } : row)),
    });
  };

  const commitDrawnStateForTable = (table: RollTable, pickedId: string | undefined) => {
    if (!pickedId || table.replacement !== false) return;
    updateRollTable(table.id, {
      rows: table.rows.map((row) => (row.id === pickedId ? { ...row, drawn: true } : row)),
    });
  };

  const publishRoll = (picked: RandomTableEntry, rolled?: number | null, formulaForCard?: string) => {
    if (!selectedTable || selectedTable.rows.length === 0) return;
    const formula = formulaForCard || selectedTable.formula || '1d20';
    const safe = (value: string) => value.replace(/\|/g, '/').trim();
    const metadata = [
      `table=${safe(selectedTable.name)}`,
      `result=${safe(picked.label)}`,
      picked.detail ? `detail=${safe(picked.detail)}` : null,
      picked.img ? `img=${safe(picked.img)}` : null,
    ].filter(Boolean).join(' | ');
    const rolledValue = typeof rolled === 'number' ? rolled : 0;
    socketService.sendChatMessage(`🎲 Rolled ${formula}: [${rolledValue}] = ${rolledValue} | ${metadata}`);
    setLastRollInfo(`${selectedTable.name}${rolled ? ` (${rolled})` : ''}: ${picked.label}`);
    commitDrawnState(picked.id);
  };

  const publishRollForTable = (table: RollTable, picked: RandomTableEntry, rolled?: number | null, formulaForCard?: string) => {
    if (table.rows.length === 0) return;
    const formula = formulaForCard || table.formula || '1d20';
    const safe = (value: string) => value.replace(/\|/g, '/').trim();
    const metadata = [
      `table=${safe(table.name)}`,
      `result=${safe(picked.label)}`,
      picked.detail ? `detail=${safe(picked.detail)}` : null,
      picked.img ? `img=${safe(picked.img)}` : null,
    ].filter(Boolean).join(' | ');
    const hasRolledValue = typeof rolled === 'number';
    const rollPrefix = hasRolledValue
      ? `🎲 Rolled ${formula}: [${rolled}] = ${rolled}`
      : `🎲 Rolled ${formula}`;
    socketService.sendChatMessage(`${rollPrefix} | ${metadata}`);
    setLastRollInfo(`${table.name}${hasRolledValue ? ` (${rolled})` : ''}: ${picked.label}`);
    commitDrawnStateForTable(table, picked.id);
  };

  const triggerVisualRoll = async (formula: string): Promise<number | null> => {
    if (!dice3dEnabled) return null;
    const roller = getDice3DRoller();
    if (!roller) return null;
    try {
      const visual = await roller({ formula, requestId: `rt-${Date.now()}` });
      return typeof visual?.total === 'number' ? visual.total : null;
    } catch {
      return null;
    }
  };

  const rollSelectedTable = async () => {
    if (!selectedTable || selectedTable.rows.length === 0) return;

    const formula = selectedTable.formula || '1d20';
    const rolledFromVisual = await triggerVisualRoll(formula);

    const candidates = selectedTable.replacement === false
      ? selectedTable.rows.filter((r) => !r.drawn)
      : selectedTable.rows;

    const source = candidates.length > 0 ? candidates : selectedTable.rows;
    const normalized = source.map((r) => ({ ...r, weight: r.weight && r.weight > 0 ? r.weight : 1 }));
    const picked = normalized[pickWeightedIndex(normalized.map((r) => r.weight || 1))];
    publishRoll(picked, rolledFromVisual, formula);
  };

  const rollTableFromList = async (table: RollTable) => {
    if (table.rows.length === 0) return;
    const formula = table.formula || '1d20';
    const rolledFromVisual = table.id === selectedTable?.id ? await triggerVisualRoll(formula) : null;

    const rolled = rolledFromVisual ?? rollFormula(formula);
    const candidates = table.replacement === false
      ? table.rows.filter((r) => !r.drawn)
      : table.rows;
    const source = candidates.length > 0 ? candidates : table.rows;

    if (rolled !== null) {
      const pickedByRange = source.find((row) => {
        const [start, end] = row.range || [0, -1];
        return rolled >= start && rolled <= end;
      });
      if (pickedByRange) {
        publishRollForTable(table, pickedByRange, rolled, formula);
        setSelectedTableId(table.id);
        return;
      }
    }

    const normalized = source.map((r) => ({ ...r, weight: r.weight && r.weight > 0 ? r.weight : 1 }));
    const picked = normalized[pickWeightedIndex(normalized.map((r) => r.weight || 1))];
    publishRollForTable(table, picked, rolled, formula);
    setSelectedTableId(table.id);
  };

  const rollByRange = async () => {
    if (!selectedTable || selectedTable.rows.length === 0) return;
    const formula = selectedTable.formula || '1d20';
    const rolledFromVisual = await triggerVisualRoll(formula);
    const rolled = rolledFromVisual ?? rollFormula(formula);
    if (rolled === null) {
      rollSelectedTable();
      return;
    }
    const picked = selectedTable.rows.find((row) => {
      const [start, end] = row.range || [0, -1];
      return rolled >= start && rolled <= end;
    });
    if (!picked) {
      rollSelectedTable();
      return;
    }
    publishRoll(picked, rolled, formula);
  };

  const exportTables = () => {
    const blob = new Blob([JSON.stringify(rollTables, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vtt-rolltables.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTables = () => {
    const raw = window.prompt('Paste rolltables JSON');
    if (!raw || !isGM) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map((entry) => normalizeFoundryRollTable(entry) || entry)
          .filter((t) => t && typeof t.id === 'string' && Array.isArray(t.rows));
        useGameStore.getState().setRollTables(normalized as RollTable[]);
        if ((normalized as RollTable[])[0]?.id) setSelectedTableId((normalized as RollTable[])[0].id);
        return;
      }

      const single = normalizeFoundryRollTable(parsed);
      if (single) {
        addRollTable(single);
        setSelectedTableId(single.id);
      }
    } catch {
      socketService.sendChatMessage('Rolltable import failed: invalid JSON');
    }
  };

  const importDmgTables = async () => {
    if (!isGM || isImportingDmg) return;
    setIsImportingDmg(true);
    try {
      const response = await fetch(DMG_5ETOOLS_SOURCE_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const importedTables = extractDmgTablesFrom5eTools(payload?.data || payload);
      if (importedTables.length === 0) {
        socketService.sendChatMessage('DMG rolltable import failed: no tables found in source data');
        return;
      }

      const existingTables = useGameStore.getState().rollTables;
      const existingNames = new Set(existingTables.map((table) => table.name.trim().toLowerCase()));
      const dedupedTables = importedTables.filter((table) => !existingNames.has(table.name.trim().toLowerCase()));

      if (dedupedTables.length === 0) {
        socketService.sendChatMessage('DMG rolltable import skipped: all DMG tables already exist');
        return;
      }

      setAvailableDmgTables(dedupedTables);
      setSelectedDmgTableNames(dedupedTables.map((table) => table.name));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      socketService.sendChatMessage(`DMG rolltable import failed: ${message}`);
    } finally {
      setIsImportingDmg(false);
    }
  };

  const confirmImportSelectedDmgTables = () => {
    if (selectedDmgTableNames.length === 0) {
      socketService.sendChatMessage('DMG rolltable import skipped: no tables selected');
      return;
    }

    const selectedNames = new Set(selectedDmgTableNames);
    const chosenTables = availableDmgTables.filter((table) => selectedNames.has(table.name));
    if (chosenTables.length === 0) {
      socketService.sendChatMessage('DMG rolltable import skipped: no matching tables selected');
      return;
    }

    const existingTables = useGameStore.getState().rollTables;
    useGameStore.getState().setRollTables([...existingTables, ...chosenTables]);
    setSelectedTableId(chosenTables[0].id);
    setAvailableDmgTables([]);
    setSelectedDmgTableNames([]);
    socketService.sendChatMessage(`Imported ${chosenTables.length} selected DMG rolltables from 5etools`);
  };

  const cancelImportSelectedDmgTables = () => {
    setAvailableDmgTables([]);
    setSelectedDmgTableNames([]);
  };

  const togglePendingDmgTable = (tableName: string) => {
    setSelectedDmgTableNames((current) => (
      current.includes(tableName)
        ? current.filter((name) => name !== tableName)
        : [...current, tableName]
    ));
  };

  const deleteTableFromList = (tableId: string) => {
    deleteRollTable(tableId);
    if (selectedTableId === tableId) {
      const remainingTable = rollTables.find((table) => table.id !== tableId) || null;
      setSelectedTableId(remainingTable?.id || '');
    }
  };

  const deleteAllTables = () => {
    useGameStore.getState().setRollTables([]);
    setSelectedTableId('');
    setSelectedRowId('');
    setLastRollInfo('');
  };

  const createFolder = (parentPath?: string | null) => {
    const folderName = window.prompt('Folder name');
    const trimmed = folderName?.trim();
    if (!trimmed) return;
    const folderPath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
    
    // Ensure parent path exists in createdFolders if creating a subfolder
    let parentsToAdd: string[] = [];
    if (parentPath) {
      const parts = parentPath.split('/');
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!createdFolders.includes(currentPath)) {
          parentsToAdd.push(currentPath);
        }
      }
    }
    
    setCreatedFolders((current) => {
      let next = [...current];
      // Add any missing parent folders
      for (const p of parentsToAdd) {
        if (!next.includes(p)) {
          next.push(p);
        }
      }
      // Add the new folder
      if (!next.includes(folderPath)) {
        next.push(folderPath);
      }
      return next;
    });
    setExpandedFolders((current) => ({ ...current, ...(parentPath ? { [parentPath]: true } : {}), [folderPath]: true }));
  };

  const beginFolderRename = (folderPath: string) => {
    if (!folderPath) return;
    const currentName = folderPath.split('/').pop() || folderPath;
    setEditingFolderPath(folderPath);
    setEditingFolderName(currentName);
  };

  const commitFolderRename = () => {
    if (!editingFolderPath) return;
    const newName = editingFolderName.trim();
    if (!newName) {
      setEditingFolderPath(null);
      setEditingFolderName('');
      return;
    }
    const parentPath = editingFolderPath.includes('/') ? editingFolderPath.split('/').slice(0, -1).join('/') : '';
    const nextPath = parentPath ? `${parentPath}/${newName}` : newName;
    const nextCreatedFolders = Array.from(new Set(createdFolders.map((folder) => renameFolderPath(folder, editingFolderPath, nextPath)).filter(Boolean) as string[]));
    setCreatedFolders(nextCreatedFolders);
    useGameStore.getState().setRollTables(useGameStore.getState().rollTables.map((table) => ({
      ...table,
      folder: renameFolderPath(table.folder, editingFolderPath, nextPath),
    })));
    setExpandedFolders((current) => {
      const nextEntries = Object.entries(current).map(([key, value]) => [renameFolderPath(key, editingFolderPath, nextPath) || key, value] as const);
      return { ...Object.fromEntries(nextEntries), [nextPath]: true };
    });
    setEditingFolderPath(null);
    setEditingFolderName('');
  };

  const deleteFolder = (folderPath: string) => {
    if (!folderPath) return;
    const folderName = folderPath.split('/').pop() || folderPath;
    if (!window.confirm(`Delete folder "${folderName}"? Tables in this folder will be moved to Unfiled.`)) return;
    // Move all tables from this folder to unfiled
    useGameStore.getState().setRollTables(useGameStore.getState().rollTables.map((table) => ({
      ...table,
      folder: table.folder === folderPath ? null : (table.folder?.startsWith(`${folderPath}/`) ? table.folder : table.folder),
    })));
    // Remove the folder and its subfolders from createdFolders
    setCreatedFolders(createdFolders.filter((f) => f !== folderPath && !f.startsWith(`${folderPath}/`)));
    // Remove from expandedFolders
    setExpandedFolders((current) => {
      const next = { ...current };
      delete next[folderPath];
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${folderPath}/`)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const toggleRowDetail = (rowId: string) => {
    setExpandedRowDetails((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders((current) => ({ ...current, [folderKey]: current[folderKey] === false }));
  };

  const moveTableToFolder = (tableId: string, folderName: string | null) => {
    if (folderName) {
      setCreatedFolders((current) => (current.includes(folderName) ? current : [...current, folderName]));
    }
    updateRollTable(tableId, { folder: folderName });
    setDragOverFolder(null);
  };

  const moveFolderToFolder = (sourcePath: string, targetPath: string | null) => {
    if (!sourcePath) return;
    if (targetPath && (targetPath === sourcePath || targetPath.startsWith(`${sourcePath}/`))) return;
    const sourceName = sourcePath.split('/').pop() || sourcePath;
    const nextPath = targetPath ? `${targetPath}/${sourceName}` : sourceName;
    if (nextPath === sourcePath) return;
    const nextCreatedFolders = Array.from(new Set(createdFolders.map((folder) => renameFolderPath(folder, sourcePath, nextPath)).filter(Boolean) as string[]));
    setCreatedFolders(nextCreatedFolders);
    useGameStore.getState().setRollTables(useGameStore.getState().rollTables.map((table) => ({
      ...table,
      folder: renameFolderPath(table.folder, sourcePath, nextPath),
    })));
    setExpandedFolders((current) => {
      const nextEntries = Object.entries(current).map(([key, value]) => [renameFolderPath(key, sourcePath, nextPath) || key, value] as const);
      return Object.fromEntries(nextEntries);
    });
    setDragOverFolder(null);
  };

  const renderTableListItem = (t: RollTable, depth = 0): JSX.Element => (
    <div
      key={t.id}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/rolltable-id', t.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="rolltables-table-list-item"
      style={{
        '--rolltables-table-row-bg': selectedTable?.id === t.id
          ? 'color-mix(in srgb, var(--color-bg-surface-elevated) 100%, transparent)'
          : 'transparent',
        '--rolltables-indent': depth > 0 ? '10px' : '0px',
      } as React.CSSProperties}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSelectedTableId(t.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedTableId(t.id);
          }
        }}
        className="rolltables-table-select"
      >
        <div className="rolltables-table-heading">
          <span className="rolltables-table-title">{t.name}</span>
          <span className="rolltables-table-formula">{t.formula || 'weighted'}</span>
        </div>
      </div>
      <div className="rolltables-table-actions">
        <button
          className="rolltables-action-btn rolltables-action-btn-compact"
          onClick={() => { void rollTableFromList(t); }}
          title={`Roll on ${t.name}`}
        >
          <Icon name="dice-d20" />
        </button>
        <button
          className="rolltables-action-btn rolltables-action-btn-compact"
          onClick={() => deleteTableFromList(t.id)}
          title={`Delete ${t.name}`}
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );

  const renderFolderNode = (node: RollTableFolderNode, depth = 0): JSX.Element => {
    const folderKey = node.path;
    const isExpanded = expandedFolders[folderKey] !== false;
    const hasChildren = node.children.length > 0;
    const hasTables = node.tables.length > 0;
    const folderDropValue = node.path;

    return (
      <div
        key={folderKey}
        className="rolltables-folder-node"
        style={{
          '--rolltables-folder-divider': depth === 0 ? '1px solid color-mix(in srgb, var(--color-border-strong) 85%, transparent)' : 'none',
          '--rolltables-folder-bg': dragOverFolder === folderKey ? 'color-mix(in srgb, var(--color-accent-primary) 18%, transparent)' : 'transparent',
          '--rolltables-indent': depth > 0 ? '10px' : '0px',
        } as React.CSSProperties}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverFolder(folderKey);
        }}
        onDragLeave={() => setDragOverFolder((current) => (current === folderKey ? null : current))}
        draggable
        onDragStart={(e) => {
          if (e.target !== e.currentTarget) return;
          e.dataTransfer.setData('text/rolltable-folder-path', node.path);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const folderPath = e.dataTransfer.getData('text/rolltable-folder-path');
          const tableId = e.dataTransfer.getData('text/rolltable-id');
          if (folderPath && folderPath !== node.path) {
            moveFolderToFolder(folderPath, folderDropValue);
            return;
          }
          if (tableId) moveTableToFolder(tableId, folderDropValue);
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleFolder(folderKey)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleFolder(folderKey); }}
          className="rolltables-folder-toggle"
          style={{
            '--rolltables-folder-toggle-bg': depth === 0
              ? 'color-mix(in srgb, var(--color-bg-overlay) 92%, transparent)'
              : 'color-mix(in srgb, var(--color-bg-surface-elevated) 72%, transparent)',
            '--rolltables-folder-toggle-divider': isExpanded
              ? '1px solid color-mix(in srgb, var(--color-border-strong) 65%, transparent)'
              : 'none',
          } as React.CSSProperties}
        >
          <span className="rolltables-folder-main">
            <Icon name={isExpanded ? 'folder-open' : 'folder'} />
            {editingFolderPath === node.path ? (
              <input
                autoFocus
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                onBlur={commitFolderRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitFolderRename();
                  if (e.key === 'Escape') {
                    setEditingFolderPath(null);
                    setEditingFolderName('');
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="rolltables-folder-name-input"
              />
            ) : (
              <span onDoubleClick={(e) => { e.stopPropagation(); beginFolderRename(node.path); }}>{node.name}</span>
            )}
          </span>
          <span className="rolltables-folder-actions">
            <>
              <span
                  className="rolltables-folder-btn"
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    beginFolderRename(node.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      beginFolderRename(node.path);
                    }
                  }}
                  title={`Rename ${node.name}`}
                >
                  <Icon name="edit" />
              </span>
              <span
                  className="rolltables-folder-btn"
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    createFolder(node.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      createFolder(node.path);
                    }
                  }}
                  title={`Create subfolder in ${node.name}`}
                >
                  <Icon name="plus" />
              </span>
              <span
                  className="rolltables-folder-btn rolltables-folder-btn-delete"
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    deleteFolder(node.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      deleteFolder(node.path);
                    }
                  }}
                  title={`Delete ${node.name}`}
                >
                  <Icon name="trash" />
              </span>
            </>
          </span>
        </div>
        {isExpanded && (
          <>
            {node.children.map((child) => renderFolderNode(child, depth + 1))}
            {hasTables && node.tables.map((t) => renderTableListItem(t, depth))}
            {!hasChildren && !hasTables && (
              <div className="rolltables-folder-empty" style={{ '--rolltables-indent': depth > 0 ? '10px' : '0px' } as React.CSSProperties}>
                Empty folder
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="macros-panel"
      onClick={() => setPanelFocus('rollTablePanel')}
      style={{
        position: 'absolute',
        left: rollTablePanelPosition.x,
        top: rollTablePanelPosition.y,
        width: rollTablePanelSize.width,
        height: rollTablePanelSize.height,
        zIndex: panelFocus === 'rollTablePanel' ? 5000 : 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className={`macros-panel-header rolltables-panel-header ${isGM ? 'is-draggable' : ''}`}
        onMouseDown={(e) => {
          if (!isGM) return;
          // Prevent text selection during drag
          e.preventDefault();
          document.body.style.userSelect = 'none';
          
          setIsDragging(true);
          setDragOffset({ x: e.clientX - rollTablePanelPosition.x, y: e.clientY - rollTablePanelPosition.y });
        }}
      >
        <h3 className="macros-panel-title rolltables-panel-title"><Icon name="list" /> Rolltables</h3>
        <button className="macros-panel-close" onClick={() => setRollTablePanelVisible(false)}><Icon name="times" /></button>
      </div>

      <div className="rolltables-layout rolltables-layout-shell" style={{ '--rolltables-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
        <div className="rolltables-sidebar rolltables-sidebar-shell">
          <div className="rolltables-toolbar-row">
            <input className="rolltables-new-table-input rolltables-grow-input" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder="New table" />
            <button className="rolltables-action-btn" onClick={createTable}>Add</button>
          </div>
          <div className="rolltables-toolbar-row">
            <button className="rolltables-action-btn" onClick={exportTables} title="Export tables">
              <Icon name="download" />
            </button>
            <button className="rolltables-action-btn" onClick={() => createFolder(null)} title="Create folder">
              <Icon name="folder-plus" />
            </button>
            <button className="rolltables-action-btn" onClick={importTables} title="Import JSON tables">
              <Icon name="upload" />
            </button>
            <button className="rolltables-action-btn" onClick={() => { void importDmgTables(); }} disabled={isImportingDmg} title="Import DMG tables from 5etools">
              <Icon name={isImportingDmg ? 'rotate' : 'book'} />
            </button>
            <button className="rolltables-action-btn" onClick={deleteAllTables} disabled={rollTables.length === 0} title="Delete all tables">
              <Icon name="trash" />
            </button>
          </div>
          {hasPendingDmgSelection && (
            <div className="rolltables-import-card">
              <div className="rolltables-import-title">
                Select DMG tables to import ({selectedDmgTableNames.length}/{availableDmgTables.length})
              </div>
              <div className="rolltables-import-list">
                {availableDmgTables.map((table) => (
                  <label key={table.id} className="rolltables-import-item">
                    <input
                      type="checkbox"
                      checked={selectedDmgTableNames.includes(table.name)}
                      onChange={() => togglePendingDmgTable(table.name)}
                    />
                    <span>
                      <span className="rolltables-import-item-name">{table.name}</span>
                      <span className="rolltables-import-item-meta">{table.formula || 'weighted'} • {table.rows.length} rows</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="rolltables-toolbar-row rolltables-toolbar-row-wrap">
                <button className="rolltables-action-btn" onClick={() => setSelectedDmgTableNames(availableDmgTables.map((table) => table.name))} title="Select all">
                  <Icon name="check" />
                </button>
                <button className="rolltables-action-btn" onClick={() => setSelectedDmgTableNames([])} title="Clear selection">
                  <Icon name="eraser" />
                </button>
                <button className="rolltables-action-btn" onClick={confirmImportSelectedDmgTables} title="Import selected">
                  <Icon name="download" />
                </button>
                <button className="rolltables-action-btn" onClick={cancelImportSelectedDmgTables} title="Cancel selection">
                  <Icon name="times" />
                </button>
              </div>
            </div>
          )}
          <div
            className="rolltables-folder-tree"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverFolder('__root__');
            }}
            onDragLeave={() => setDragOverFolder((current) => (current === '__root__' ? null : current))}
            onDrop={(e) => {
              e.preventDefault();
              const folderPath = e.dataTransfer.getData('text/rolltable-folder-path');
              const tableId = e.dataTransfer.getData('text/rolltable-id');
              if (folderPath) {
                moveFolderToFolder(folderPath, null);
                return;
              }
              if (tableId) moveTableToFolder(tableId, null);
            }}
            style={{
              background: dragOverFolder === '__root__'
                ? 'color-mix(in srgb, var(--color-accent-primary) 8%, transparent)'
                : 'transparent',
            }}
          >
            {rootTables.map((table) => renderTableListItem(table, 0))}
            {folderTree.map((node) => renderFolderNode(node))}
          </div>
        </div>

        <div
          className="rolltables-separator"
          onMouseDown={(e) => {
            if (!isGM) return;
            e.stopPropagation();
            // Prevent text selection during resize
            e.preventDefault();
            document.body.style.userSelect = 'none';
            
            setIsResizingSidebar(true);
          }}
          style={{ cursor: isGM ? 'col-resize' : 'default' }}
          title="Drag to resize table list"
        />

        <div className="rolltables-editor rolltables-editor-shell">
          {selectedTable ? (
            <>
              <div className="rolltables-meta-grid rolltables-meta-grid-shell">
                <input value={selectedTable.name} onChange={(e) => updateRollTable(selectedTable.id, { name: e.target.value })} placeholder="Name" />
                <input value={selectedTable.img || ''} onChange={(e) => updateRollTable(selectedTable.id, { img: e.target.value })} placeholder="Image URL" />
                <input value={selectedTable.formula || ''} onChange={(e) => updateRollTable(selectedTable.id, { formula: e.target.value })} placeholder="Formula (e.g. 1d20)" />
                <input value={selectedTable.folder || ''} onChange={(e) => updateRollTable(selectedTable.id, { folder: e.target.value.trim() || null })} placeholder="Folder" />
                <div className="rolltables-toggles rolltables-toggles-shell">
                  <label className="rolltables-toggle-label"><input type="checkbox" checked={selectedTable.replacement !== false} onChange={(e) => updateRollTable(selectedTable.id, { replacement: e.target.checked })} /> Replacement</label>
                  <label className="rolltables-toggle-label"><input type="checkbox" checked={selectedTable.displayRoll !== false} onChange={(e) => updateRollTable(selectedTable.id, { displayRoll: e.target.checked })} /> Display Roll</label>
                </div>
              </div>

              <div className="rolltables-description-wrap rolltables-description-wrap-spaced">
                <label className="rolltables-section-label rolltables-section-label-muted">
                  Description
                </label>
                <textarea
                  className="rolltables-description rolltables-description-field"
                  value={selectedTable.description || ''}
                  onChange={(e) => updateRollTable(selectedTable.id, { description: e.target.value })}
                  placeholder="Write full table description, usage notes, and context..."
                  rows={1}
                />
              </div>

              <div className="rolltables-toolbar-row rolltables-toolbar-row-wrap">
                <button className="rolltables-action-btn" onClick={addRow}>+ Row</button>
                <button className="rolltables-action-btn" onClick={autoGenerateRanges}>Auto Range</button>
                <button className="rolltables-action-btn" onClick={rollSelectedTable}>Roll Weighted</button>
                <button className="rolltables-action-btn" onClick={rollByRange}>Roll Formula</button>
                <button className="rolltables-action-btn" onClick={() => deleteRollTable(selectedTable.id)}>Delete Table</button>
              </div>

              {selectedTable.rows.map((row) => (
                <div
                  key={row.id || row.label}
                  className={`rolltables-row rolltables-row-card rolltables-row-card-spaced ${selectedRowId === row.id ? 'is-expanded' : 'is-compact'}`}
                >
                  <div
                    className="rolltables-row-line rolltables-row-line-top rolltables-row-toggle"
                    onClick={() => setSelectedRowId(row.id || '')}
                  >
                    <div className="rolltables-row-image rolltables-row-image-stack">
                      {row.img ? (
                        <div className="rolltables-row-image-preview" onClick={() => openRowImagePicker(row.id || '', row.img)}>
                          <img src={row.img} alt={row.label || 'row image'} className="rolltables-row-image-img" />
                        </div>
                      ) : (
                        <button
                          className="tool-btn rolltables-row-icon-btn"
                          title="Set image (URL or Asset Browser)"
                          onClick={() => openRowImagePicker(row.id || '', row.img)}
                        >
                          <Icon name="image" />
                        </button>
                      )}
                    </div>
                    <input
                      className="rolltables-row-label"
                      value={row.label}
                      onChange={(e) => updateRollTable(selectedTable.id, {
                        rows: selectedTable.rows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)),
                      })}
                      placeholder="Label"
                    />
                    <button
                      className="tool-btn rolltables-row-expand-btn"
                      title={expandedRowDetails.has(row.id || '') ? 'Hide detail' : 'Add detail'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowDetail(row.id || '');
                      }}
                    >
                      <Icon name={expandedRowDetails.has(row.id || '') ? 'times' : 'edit'} />
                    </button>
                    <div className="rolltables-row-metrics">
                      <div className="rolltables-field-stack">
                        <input
                          type="number"
                          min={1}
                          aria-label="Weight"
                          value={row.weight || 1}
                          onChange={(e) => updateRollTable(selectedTable.id, {
                            rows: selectedTable.rows.map((r) => (r.id === row.id ? { ...r, weight: Number(e.target.value) || 1 } : r)),
                          })}
                          placeholder="Weight"
                        />
                      </div>
                      <div className="rolltables-field-stack">
                        <input
                          type="number"
                          aria-label="From"
                          value={row.range?.[0] || 1}
                          onChange={(e) => updateRollTable(selectedTable.id, {
                            rows: selectedTable.rows.map((r) => (r.id === row.id ? { ...r, range: [Number(e.target.value) || 1, r.range?.[1] || 1] } : r)),
                          })}
                          placeholder="From"
                        />
                      </div>
                      <div className="rolltables-field-stack">
                        <input
                          type="number"
                          aria-label="To"
                          value={row.range?.[1] || 1}
                          onChange={(e) => updateRollTable(selectedTable.id, {
                            rows: selectedTable.rows.map((r) => (r.id === row.id ? { ...r, range: [r.range?.[0] || 1, Number(e.target.value) || 1] } : r)),
                          })}
                          placeholder="To"
                        />
                      </div>
                    </div>
                    <button
                      className="tool-btn rolltables-row-delete"
                      title="Delete row"
                      onClick={() => updateRollTable(selectedTable.id, { rows: selectedTable.rows.filter((r) => r.id !== row.id) })}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>

                  {expandedRowDetails.has(row.id || '') && (
                    <div className="rolltables-row-line rolltables-row-line-bottom">
                      <textarea
                        className="rolltables-row-detail rolltables-row-result-textarea"
                        value={row.detail || ''}
                        onChange={(e) => {
                          updateRollTable(selectedTable.id, {
                            rows: selectedTable.rows.map((r) => (r.id === row.id ? { ...r, detail: e.target.value } : r)),
                          });
                          requestAnimationFrame(() => autoResizeTextarea(e.currentTarget));
                        }}
                        onInput={(e) => autoResizeTextarea(e.currentTarget)}
                        onFocus={(e) => autoResizeTextarea(e.currentTarget)}
                        placeholder="Add detail text..."
                        rows={1}
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="rolltables-status-text rolltables-status-text-spaced">
                {lastRollInfo ? `Last Roll: ${lastRollInfo}` : 'No roll yet.'}
              </div>
            </>
          ) : (
            <div className="rolltables-status-text">No table selected.</div>
          )}
        </div>
      </div>

      <div
        className="macros-panel-resize"
        onMouseDown={(e) => {
          if (!isGM) return;
          e.stopPropagation();
          // Prevent text selection during resize
          e.preventDefault();
          document.body.style.userSelect = 'none';
          
          setIsResizing(true);
        }}
      />
    </div>
  );
}
