import type { DiceRollVisibility } from '../../../shared/src/index';

export type MacroCommandType = 'announce' | 'randomTable' | 'rollSequence' | 'scene';

export interface AnnounceCommandPayload {
  command: 'announce';
  message: string;
  title?: string;
  visibility?: DiceRollVisibility;
  tone?: 'info' | 'warning' | 'success' | 'danger';
}

export interface RandomTableEntry {
  id?: string;
  label: string;
  weight?: number;
  detail?: string;
  type?: 'text' | 'document' | 'compendium';
  range?: [number, number];
  img?: string;
  drawn?: boolean;
  documentUuid?: string | null;
  flags?: Record<string, unknown>;
}

export interface RollTable {
  id: string;
  name: string;
  description?: string;
  img?: string;
  formula?: string;
  replacement?: boolean;
  displayRoll?: boolean;
  folder?: string | null;
  ownership?: Record<string, number>;
  flags?: Record<string, unknown>;
  rows: RandomTableEntry[];
  isGlobal: boolean;
  tags?: string[];
}

export interface RandomTableCommandPayload {
  command: 'randomTable';
  title?: string;
  tableId?: string;
  entries?: RandomTableEntry[]; // legacy fallback
  visibility?: DiceRollVisibility;
}

export interface RollSequenceStep {
  label?: string;
  formula: string;
  visibility?: DiceRollVisibility;
}

export interface RollSequenceCommandPayload {
  command: 'rollSequence';
  title?: string;
  steps: RollSequenceStep[];
  summarize?: boolean;
  visibility?: DiceRollVisibility;
}

export interface SceneCommandPayload {
  command: 'scene';
  title: string;
  narration?: string;
  visibility?: DiceRollVisibility;
  weather?: {
    enabled?: boolean;
    type?: 'none' | 'rain' | 'snow' | 'fog' | 'clouds' | 'fireflies' | 'embers' | 'sparkles' | 'hearts' | 'blizzard';
    intensity?: number;
    speed?: number;
    direction?: number;
  };
  time?: {
    setSeconds?: number;
    advanceBy?: number;
  };
}

export type SceneWeatherType = NonNullable<NonNullable<SceneCommandPayload['weather']>['type']>;

export type MacroCommandPayload =
  | AnnounceCommandPayload
  | RandomTableCommandPayload
  | RollSequenceCommandPayload
  | SceneCommandPayload;

export interface MacroCommandParseSuccess {
  ok: true;
  payload: MacroCommandPayload;
}

export interface MacroCommandParseFailure {
  ok: false;
  error: string;
}

export type MacroCommandParseResult = MacroCommandParseSuccess | MacroCommandParseFailure;

export interface MacroDispatchResult {
  ok: boolean;
  error?: string;
}

export interface RollExecutionResult {
  formula: string;
  total: number;
}

export interface CommandExecutionContext {
  isGM: boolean;
  username: string;
  sendChatMessage: (text: string, options?: { visibility?: DiceRollVisibility }) => void;
  rollFormula: (formula: string, visibility?: DiceRollVisibility) => Promise<RollExecutionResult | null>;
  weather: {
    setType: (value: SceneWeatherType) => void;
    setIntensity: (value: number) => void;
    setSpeed: (value: number) => void;
    setDirection: (value: number) => void;
    setVisible: (visible: boolean) => void;
  };
  time: {
    setGameTime: (seconds: number) => void;
    advanceTime: (delta: number) => void;
  };
  getRollTableById: (id: string) => RollTable | null;
}
