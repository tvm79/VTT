import { getRollDescription, parseDiceFormula, type RollResult } from './diceParser';

export interface ChatRollDie {
  dice: string;
  rolls: number[];
  total: number;
  modifier: number;
}

export interface ChatRollCardData {
  username: string;
  formula: string;
  total: number;
  dice: ChatRollDie[];
  modifier: number;
  isAdvantage: boolean;
  isDisadvantage: boolean;
  visibility: 'public' | 'gm' | 'blind' | 'self';
  summaryLabel: string;
  tableName?: string;
  resultLabel?: string;
  detailText?: string;
  imageUrl?: string;
}

const USERNAME_ROLL_PATTERN = /^🎲\s+(.+?)\s+rolled\s+(.+?):\s+(.+)$/;
const GENERIC_ROLL_PATTERN = /^🎲\s+Rolled\s+(.+?):\s+(.+)$/;
const DICE_EXPRESSION_PATTERN = /(\d*d\d+)/gi;

export function parseChatCommandRoll(input: string): RollResult | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const result = parseDiceFormula(trimmed);
  if (!result || result.dice.length === 0) {
    return null;
  }

  return {
    ...result,
    formula: stripRollCommandPrefix(trimmed),
  };
}

export function buildRollChatMessage(username: string, result: RollResult): string {
  const safeUsername = username.trim() || 'Someone';
  const description = getRollDescription(result);
  return `🎲 ${safeUsername} rolled ${result.formula}: ${description}`;
}

export function parseDiceRollMessage(text: string): ChatRollCardData | null {
  const usernameMatch = text.match(USERNAME_ROLL_PATTERN);
  const genericMatch = !usernameMatch ? text.match(GENERIC_ROLL_PATTERN) : null;

  if (!usernameMatch && !genericMatch) {
    return null;
  }

  const username = usernameMatch?.[1]?.trim() || 'Player';
  const formula = usernameMatch?.[2]?.trim() || genericMatch?.[1]?.trim() || '';
  const description = usernameMatch?.[3] || genericMatch?.[2] || '';

  if (!formula || !description) {
    return null;
  }

  const descriptionParts = description.split('|').map((part) => part.trim()).filter(Boolean);
  const descriptionMain = descriptionParts[0] || '';
  const metadataPairs = descriptionParts.slice(1);

  const metadata: Record<string, string> = {};
  metadataPairs.forEach((pair) => {
    const divider = pair.indexOf('=');
    if (divider <= 0) return;
    const key = pair.slice(0, divider).trim().toLowerCase();
    const value = pair.slice(divider + 1).trim();
    if (!key || !value) return;
    metadata[key] = value;
  });

  const totalMatch = descriptionMain.match(/=\s*(-?\d+)\s*$/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const modifierMatches = Array.from(descriptionMain.matchAll(/([+-]\d+)\s*(?==\s*-?\d+\s*$)/g));
  const modifier = modifierMatches.reduce((sum, match) => sum + parseInt(match[1], 10), 0);
  const descriptionWithoutTail = descriptionMain
    .replace(/\s*[+-]\d+\s*(?==\s*-?\d+\s*$)/g, '')
    .replace(/\s*=\s*-?\d+\s*$/, '')
    .trim();

  const diceExpressions = Array.from(formula.matchAll(DICE_EXPRESSION_PATTERN)).map((match) => match[1]);
  
  const detailSegments: Array<{ rolls: number[]; total: number }> = [];
  const segmentPattern = /\[([^\]]+)\]\s*=\s*(-?\d+)|(?<![=+\-\d])-?\d+(?!\s*=)/g;
  let match: RegExpExecArray | null;

  while ((match = segmentPattern.exec(descriptionWithoutTail)) !== null) {
    if (match[1] && match[2]) {
      const rolls = match[1]
        .split(',')
        .map((value) => parseInt(value.trim(), 10))
        .filter((value) => !Number.isNaN(value));
      detailSegments.push({
        rolls,
        total: parseInt(match[2], 10),
      });
      continue;
    }

    const numericValue = parseInt(match[0], 10);
    if (!Number.isNaN(numericValue)) {
      detailSegments.push({ rolls: [numericValue], total: numericValue });
    }
  }

  const dice = (diceExpressions.length > 0 ? diceExpressions : [formula]).map((expression, index) => {
    const segment = detailSegments[index];
    return {
      dice: expression,
      rolls: segment?.rolls || [],
      total: segment?.total ?? 0,
      modifier: index === diceExpressions.length - 1 ? modifier : 0,
    };
  });

  const visibility = getRollVisibility(formula);
  const isAdvantage = /\badv\b|\(adv\)/i.test(formula);
  const isDisadvantage = /\bdis\b|\(dis\)/i.test(formula);

  return {
    username,
    formula,
    total,
    dice,
    modifier,
    isAdvantage,
    isDisadvantage,
    visibility,
    summaryLabel: metadata.result || getSummaryLabel(total, visibility),
    tableName: metadata.table,
    resultLabel: metadata.result,
    detailText: metadata.detail,
    imageUrl: metadata.img,
  };
}

function getRollVisibility(formula: string): ChatRollCardData['visibility'] {
  const normalized = formula.trim().toLowerCase();

  if (normalized.startsWith('/broll') || normalized.startsWith('/blindroll')) {
    return 'blind';
  }

  if (normalized.startsWith('/gmr') || normalized.startsWith('/gmroll')) {
    return 'gm';
  }

  if (normalized.startsWith('/sr') || normalized.startsWith('/selfroll')) {
    return 'self';
  }

  return 'public';
}

function stripRollCommandPrefix(formula: string): string {
  return formula
    .trim()
    .replace(/^\/(r|roll|pr|publicroll|gmr|gmroll|broll|blindroll|sr|selfroll)\s*/i, '')
    .trim();
}

function getSummaryLabel(total: number, visibility: ChatRollCardData['visibility']): string {
  const visibilityLabel = visibility === 'public'
    ? 'Public Roll'
    : visibility === 'gm'
      ? 'GM Roll'
      : visibility === 'blind'
        ? 'Blind GM Roll'
        : 'Self Roll';

  if (total >= 20) {
    return `${visibilityLabel} • Critical`;
  }

  if (total <= 1) {
    return `${visibilityLabel} • Mishap`;
  }

  return visibilityLabel;
}
