import { Fragment, useMemo } from 'react';
import { socketService } from '../services/socket';
import { useGameStore } from '../store/gameStore';
import { parseDiceFormula } from '../utils/diceParser';
import { buildRollChatMessage } from '../utils/chatRolls';
import { audioPlayer } from '../utils/audioPlayer';
import { requestAuthoritativeRoll } from '../dice/rollOrchestrator';

interface RollToken {
  index: number;
  text: string;
  formula: string;
  title: string;
}

const ATTACK_BONUS_PATTERN = /([+-]\d+)\s+to hit\b/gi;
const DICE_FORMULA_PATTERN = /\b\d*d\d+(?:\s*[+\-]\s*\d+)?(?:\s*(?:kh\d+|kl\d+|r[<>]\d+|cs[<>]\d+|!|x))*\b/gi;

function hasOverlap(candidate: { index: number; text: string }, existing: RollToken[]): boolean {
  const candidateEnd = candidate.index + candidate.text.length;
  return existing.some((token) => {
    const tokenEnd = token.index + token.text.length;
    return candidate.index < tokenEnd && candidateEnd > token.index;
  });
}

function getTokenTitle(source: string, index: number, text: string): string {
  const tail = source.slice(index + text.length).match(/^\s+([a-z][a-z\s-]{0,30})\b(damage|healing|hit points?)\b/i);
  if (!tail) {
    return `Roll ${text}`;
  }

  return `Roll ${text} ${tail[1].trim()} ${tail[2]}`;
}

export function extractRollTokens(text: string): RollToken[] {
  const tokens: RollToken[] = [];

  for (const match of text.matchAll(ATTACK_BONUS_PATTERN)) {
    const attackText = match[0];
    const bonus = match[1];
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }

    tokens.push({
      index,
      text: attackText,
      formula: `1d20${bonus}`,
      title: `Roll attack: 1d20${bonus}`,
    });
  }

  for (const match of text.matchAll(DICE_FORMULA_PATTERN)) {
    const formulaText = match[0];
    const index = match.index ?? -1;
    if (index < 0 || hasOverlap({ index, text: formulaText }, tokens)) {
      continue;
    }

    tokens.push({
      index,
      text: formulaText,
      formula: formulaText.replace(/\s+/g, ''),
      title: getTokenTitle(text, index, formulaText),
    });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

export function RollableText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { user, addDiceRoll, dice3dEnabled } = useGameStore();
  const tokens = useMemo(() => extractRollTokens(text), [text]);

  if (!tokens.length) {
    return <span className={className}>{text}</span>;
  }

  const handleRoll = (formula: string) => {
    if (dice3dEnabled) {
      audioPlayer.playDiceRoll();
      requestAuthoritativeRoll({
        formula,
        source: 'inline',
        visibility: 'public',
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
          console.error('Authoritative inline roll failed, using local fallback:', error);
          const fallback = parseDiceFormula(formula);
          if (!fallback) return;
          socketService.sendChatMessage(
            buildRollChatMessage(user?.username || 'Someone', fallback),
            fallback.isPrivate,
            fallback.isBlindGM,
            fallback.isSelfRoll
          );
          addDiceRoll({
            id: `roll-${Date.now()}`,
            formula: fallback.formula,
            total: fallback.total,
            rolls: fallback.dice.flatMap((die) => die.rolls),
            username: user?.username || 'Unknown',
            timestamp: new Date(),
            isPrivate: fallback.isPrivate,
          });
        });
      return;
    }

    const result = parseDiceFormula(formula);
    if (!result) {
      return;
    }

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
      rolls: result.dice.flatMap((die) => die.rolls),
      username: user?.username || 'Unknown',
      timestamp: new Date(),
      isPrivate: result.isPrivate,
    });
  };

  const content: JSX.Element[] = [];
  let cursor = 0;

  tokens.forEach((token, index) => {
    if (token.index > cursor) {
      content.push(
        <Fragment key={`text-${index}`}>
          {text.slice(cursor, token.index)}
        </Fragment>,
      );
    }

    content.push(
      <button
        key={`roll-${token.index}-${token.formula}`}
        type="button"
        className="inline-roll-btn"
        title={token.title}
        onClick={(event) => {
          event.stopPropagation();
          handleRoll(token.formula);
        }}
      >
        {token.text}
      </button>,
    );

    cursor = token.index + token.text.length;
  });

  if (cursor < text.length) {
    content.push(<Fragment key="text-tail">{text.slice(cursor)}</Fragment>);
  }

  return <span className={className}>{content}</span>;
}
