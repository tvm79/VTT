// Dice rolling utility for parsing and calculating dice rolls

export interface DiceRoll {
  dice: string;       // e.g., "2d6"
  rolls: number[];     // Individual roll results
  total: number;       // Sum of all dice
  modifier: number;    // Added/subtracted modifier
}

export interface RollResult {
  formula: string;    // Original formula like "2d6+3"
  dice: DiceRoll[];
  total: number;
  isPrivate: boolean;  // GM-only roll
  isBlindGM: boolean; // Only GM sees result
  isSelfRoll: boolean; // Only roller sees result
}

// Roll types based on command prefixes
type RollType = 'public' | 'gm' | 'blind' | 'self';

// Parse a dice formula with full syntax support
export function parseDiceFormula(formula: string): RollResult | null {
  try {
    // Normalize the formula
    let normalized = formula.toLowerCase().replace(/\s/g, '');
    
    // Check for roll command prefixes
    let rollType: RollType = 'public';
    let cleanFormula = normalized;
    
    // Remove command prefixes
    if (normalized.startsWith('/r ') || normalized.startsWith('/r')) {
      cleanFormula = normalized.replace(/^\/r\s*/, '');
    } else if (normalized.startsWith('/pr ') || normalized.startsWith('/pr')) {
      rollType = 'public';
      cleanFormula = normalized.replace(/^\/(pr|publicroll)\s*/, '');
    } else if (normalized.startsWith('/gmr ') || normalized.startsWith('/gmr') || normalized.startsWith('/gmroll ')) {
      rollType = 'gm';
      cleanFormula = normalized.replace(/^\/(gmr|gmroll)\s*/, '');
    } else if (normalized.startsWith('/broll ') || normalized.startsWith('/broll') || normalized.startsWith('/blindroll ')) {
      rollType = 'blind';
      cleanFormula = normalized.replace(/^\/(broll|blindroll)\s*/, '');
    } else if (normalized.startsWith('/sr ') || normalized.startsWith('/sr') || normalized.startsWith('/selfroll ')) {
      rollType = 'self';
      cleanFormula = normalized.replace(/^\/(sr|selfroll)\s*/, '');
    }
    
    // Check for inline roll type indicators (gm, bg, sr)
    let isPrivate = rollType === 'gm' || rollType === 'blind' || rollType === 'self';
    let isBlindGM = rollType === 'blind';
    let isSelfRoll = rollType === 'self';
    
    // Also check for inline indicators
    if (cleanFormula.includes('gm') && !cleanFormula.startsWith('gm')) {
      // Only mark as private if gm is not at the start (to avoid matching gmroll)
      const gmMatch = cleanFormula.match(/(.+?)(gm|gp|bg|sr|self)/);
      if (gmMatch) {
        isPrivate = true;
        cleanFormula = gmMatch[1];
      }
    }
    
    if (cleanFormula.includes('bg')) {
      isBlindGM = true;
      isPrivate = true;
      cleanFormula = cleanFormula.replace(/bg/g, '');
    }
    
    if (cleanFormula.includes('sr') || cleanFormula.includes('self')) {
      isSelfRoll = true;
      isPrivate = true;
      cleanFormula = cleanFormula.replace(/sr|self/g, '');
    }
    
    // Process parenthetical expressions first - (1d20*2)d(1d10)
    cleanFormula = processParentheses(cleanFormula);
    
    // Process dice pools - {4d6, 3d8, 2d10}kh
    const poolResult = processDicePools(cleanFormula);
    cleanFormula = poolResult.formula;
    
    // Parse the formula with all modifiers
    const { dice, total, modifier } = parseDiceWithModifiers(cleanFormula);
    
    // Handle success counting (cs>10) - returns count of successes instead of sum
    const successResult = processSuccessCounting(cleanFormula, dice);
    // Note: total already includes modifier from parseDiceWithModifiers, don't add again
    let finalTotal = total;
    let finalDice = dice;
    
    if (successResult.isSuccessCount) {
      finalTotal = successResult.successCount;
      // Update dice to show success count
      finalDice = [{
        dice: cleanFormula,
        rolls: [successResult.successCount],
        total: successResult.successCount,
        modifier: 0
      }];
    }
    
    return {
      formula: normalized,
      dice: finalDice,
      total: finalTotal,
      isPrivate,
      isBlindGM,
      isSelfRoll,
    };
  } catch (error) {
    console.error('Failed to parse dice formula:', error);
    return null;
  }
}

// Process parenthetical expressions like (1d20*2)d(1d10)
function processParentheses(formula: string): string {
  // Find all parenthetical expressions
  const parenRegex = /\(([^)]+)\)/g;
  
  while (formula.match(parenRegex)) {
    formula = formula.replace(parenRegex, (match, content) => {
      // Evaluate the expression inside parentheses
      const result = evaluateExpression(content);
      return result.toString();
    });
  }
  
  return formula;
}

// Evaluate simple expressions (supports dice, multiplication, addition)
function evaluateExpression(expr: string): number {
  // First process any dice in the expression
  let processed = expr.toLowerCase();
  
  // Replace dice notation with random results
  const diceRegex = /(\d*)d(\d+)/g;
  processed = processed.replace(diceRegex, (match, count, sides) => {
    const numDice = parseInt(count) || 1;
    const numSides = parseInt(sides);
    let sum = 0;
    for (let i = 0; i < numDice; i++) {
      sum += Math.floor(Math.random() * numSides) + 1;
    }
    return sum.toString();
  });
  
  // Now evaluate the mathematical expression
  try {
    // Safe evaluation of simple math (only numbers, +, -, *, /, parentheses)
    return Function(`"use strict"; return (${processed})`)();
  } catch {
    return 0;
  }
}

// Process dice pools like {4d6, 3d8, 2d10}kh
function processDicePools(formula: string): { formula: string; poolResults?: number[] } {
  const poolRegex = /\{([^}]+)\}(kh?|kl|romo)?(\d*)/gi;
  
  const poolMatches: { original: string; replacement: string }[] = [];
  
  let match;
  while ((match = poolRegex.exec(formula)) !== null) {
    const poolContent = match[1];
    const modifier = match[2] || '';
    const modifierValue = parseInt(match[3]) || 1;
    
    // Parse each dice in the pool
    const diceParts = poolContent.split(',').map(s => s.trim());
    const poolRolls: number[] = [];
    
    for (const part of diceParts) {
      const diceMatch = part.match(/(\d*)d(\d+)/i);
      if (diceMatch) {
        const count = parseInt(diceMatch[1]) || 1;
        const sides = parseInt(diceMatch[2]);
        
        for (let i = 0; i < count; i++) {
          poolRolls.push(Math.floor(Math.random() * sides) + 1);
        }
      }
    }
    
    // Apply modifiers to pool
    let keptRolls = [...poolRolls];
    if (modifier.startsWith('kh') && modifierValue > 0 && modifierValue < poolRolls.length) {
      keptRolls = poolRolls.sort((a, b) => b - a).slice(0, modifierValue);
    } else if (modifier.startsWith('kl') && modifierValue > 0 && modifierValue < poolRolls.length) {
      keptRolls = poolRolls.sort((a, b) => a - b).slice(0, modifierValue);
    } else if (modifier === 'romo') {
      // Roll my highest (drop others)
      keptRolls = [Math.max(...poolRolls)];
    }
    
    const sum = keptRolls.reduce((a, b) => a + b, 0);
    poolMatches.push({ original: match[0], replacement: sum.toString() });
  }
  
  // Replace pool expressions with their results
  for (const m of poolMatches) {
    formula = formula.replace(m.original, m.replacement);
  }
  
  return { formula };
}

// Parse dice with all modifiers (reroll, explode, keep, etc.)
function parseDiceWithModifiers(formula: string): { dice: DiceRoll[]; total: number; modifier: number } {
  // Extract global modifiers first
  const globalModifiers: { type: string; value: string }[] = [];
  
  // Reroll modifier: r<10 or r>15
  const rerollMatch = formula.match(/r([<>])(\d+)/i);
  if (rerollMatch) {
    globalModifiers.push({ type: 'reroll', value: rerollMatch[1] + rerollMatch[2] });
    formula = formula.replace(rerollMatch[0], '');
  }
  
  // Exploding dice: x or !
  if (formula.includes('x') || formula.includes('!')) {
    globalModifiers.push({ type: 'explode', value: 'true' });
    formula = formula.replace(/x|!/g, '');
  }
  
  // Success counting: cs>10 or cs<15
  const successMatch = formula.match(/cs([<>])(\d+)/i);
  if (successMatch) {
    globalModifiers.push({ type: 'success', value: successMatch[1] + successMatch[2] });
    formula = formula.replace(successMatch[0], '');
  }
  
  // Keep highest/lowest: kh#, kl#
  const keepMatch = formula.match(/k([hl])(\d+)/i);
  let keepHighest: number | null = null;
  let keepLowest: number | null = null;
  if (keepMatch) {
    if (keepMatch[1] === 'h') {
      keepHighest = parseInt(keepMatch[2]);
    } else {
      keepLowest = parseInt(keepMatch[2]);
    }
    formula = formula.replace(keepMatch[0], '');
  }
  
  // Match patterns like "2d6+3", "d20-1", "4d6kh3"
  const dicePattern = /(\d*)d(\d+)/gi;
  const modifierPattern = /([+-]\d+)/g;
  
  const dice: DiceRoll[] = [];
  let total = 0;
  let match;
  
  // Parse dice parts
  while ((match = dicePattern.exec(formula)) !== null) {
    const count = parseInt(match[1]) || 1;
    const sides = parseInt(match[2]);
    
    let rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      let roll = Math.floor(Math.random() * sides) + 1;
      
      // Apply reroll modifier
      const rerollMod = globalModifiers.find(m => m.type === 'reroll');
      if (rerollMod) {
        const condition = rerollMod.value[0];
        const threshold = parseInt(rerollMod.value.slice(1));
        // Reroll once if condition is met
        if ((condition === '<' && roll < threshold) || (condition === '>' && roll > threshold)) {
          roll = Math.floor(Math.random() * sides) + 1;
        }
      }
      
      // Apply exploding dice
      const hasExplode = globalModifiers.some(m => m.type === 'explode');
      if (hasExplode) {
        rolls.push(roll);
        // Keep exploding while max
        while (roll === sides) {
          roll = Math.floor(Math.random() * sides) + 1;
          rolls.push(roll);
        }
      } else {
        rolls.push(roll);
      }
    }
    
    // Apply keep highest/lowest
    let keptRolls = rolls;
    if (keepHighest && keepHighest < count) {
      keptRolls = [...rolls].sort((a, b) => b - a).slice(0, keepHighest);
    } else if (keepLowest && keepLowest < count) {
      keptRolls = [...rolls].sort((a, b) => a - b).slice(0, keepLowest);
    }
    
    const rollTotal = keptRolls.reduce((sum, r) => sum + r, 0);
    dice.push({
      dice: match[0],
      rolls: rolls,
      total: rollTotal,
      modifier: 0,
    });
    total += rollTotal;
  }
  
  // Parse modifiers
  const modifierMatches = formula.match(/[+-]\d+/g) || [];
  let modifier = 0;
  modifierMatches.forEach(mod => {
    modifier += parseInt(mod);
    total += parseInt(mod);
  });
  
  // Add modifier to last dice roll for display
  if (dice.length > 0) {
    dice[dice.length - 1].modifier = modifier;
  }
  
  return { dice, total, modifier };
}

// Process success counting
function processSuccessCounting(formula: string, dice: DiceRoll[]): { isSuccessCount: boolean; successCount: number } {
  const successMatch = formula.match(/cs([<>])(\d+)/i);
  if (!successMatch) {
    return { isSuccessCount: false, successCount: 0 };
  }
  
  const condition = successMatch[1];
  const threshold = parseInt(successMatch[2]);
  let successCount = 0;
  
  for (const die of dice) {
    for (const roll of die.rolls) {
      if ((condition === '>' && roll > threshold) || (condition === '<' && roll < threshold) || (condition === '=' && roll === threshold)) {
        successCount++;
      }
    }
  }
  
  return { isSuccessCount: true, successCount };
}

// Roll a simple die (for quick rolls)
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

// Roll multiple dice
export function rollDice(count: number, sides: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  return rolls;
}

// Get roll description for display
export function getRollDescription(result: RollResult): string {
  const parts: string[] = [];
  
  result.dice.forEach((die) => {
    if (die.rolls.length === 1) {
      parts.push(`${die.total}`);
    } else {
      parts.push(`[${die.rolls.join(', ')}] = ${die.total}`);
    }
  });
  
  if (result.dice.length > 0 && result.dice[result.dice.length - 1].modifier !== 0) {
    const mod = result.dice[result.dice.length - 1].modifier;
    parts.push(mod > 0 ? `+${mod}` : `${mod}`);
  }
  
  return parts.join(' ') + ` = ${result.total}`;
}

// Common quick roll presets
export const QUICK_ROLLS = [
  { label: 'd4', formula: '1d4', sides: 4 },
  { label: 'd6', formula: '1d6', sides: 6 },
  { label: 'd8', formula: '1d8', sides: 8 },
  { label: 'd10', formula: '1d10', sides: 10 },
  { label: 'd12', formula: '1d12', sides: 12 },
  { label: 'd20', formula: '1d20', sides: 20 },
  { label: 'd100', formula: '1d100', sides: 100 },
];

// D&D specific rolls
export const DnD_ROLLS = [
  { label: 'Attack', formula: '1d20+5' },
  { label: 'Damage', formula: '1d8+3' },
  { label: 'Save', formula: '1d20+2' },
  { label: 'Skill', formula: '1d20+4' },
  { label: 'Init', formula: '1d20+3' },
  { label: 'Hit', formula: '1d20+7' },
];
