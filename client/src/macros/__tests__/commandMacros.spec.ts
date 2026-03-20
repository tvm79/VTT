import { parseMacroCommandPayload } from '../commandParser';
import { dispatchCommandMacro } from '../dispatchCommandMacro';
import type { CommandExecutionContext } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[commandMacros.spec] ${message}`);
  }
}

async function runCommandMacroSpecs(): Promise<void> {
  const announce = parseMacroCommandPayload(
    JSON.stringify({ command: 'announce', message: 'Hello table' }),
  );
  assert(announce.ok, 'announce payload should parse');

  const randomTable = parseMacroCommandPayload(
    JSON.stringify({ command: 'randomTable', tableId: 'table-1' }),
  );
  assert(randomTable.ok, 'randomTable payload should parse');

  const rollSequence = parseMacroCommandPayload(
    JSON.stringify({ command: 'rollSequence', steps: [{ formula: '1d20+5' }] }),
  );
  assert(rollSequence.ok, 'rollSequence payload should parse');

  const badJson = parseMacroCommandPayload('{');
  assert(!badJson.ok, 'invalid JSON should fail parsing');

  const missingCommand = parseMacroCommandPayload(JSON.stringify({ message: 'No command' }));
  assert(!missingCommand.ok, 'missing command should fail parsing');

  const events: string[] = [];

  const context: CommandExecutionContext = {
    isGM: true,
    username: 'tester',
    sendChatMessage: (text) => {
      events.push(`chat:${text}`);
    },
    rollFormula: async (formula) => ({ formula, total: 10 }),
    weather: {
      setType: (value) => events.push(`weatherType:${value}`),
      setIntensity: (value) => events.push(`weatherIntensity:${value}`),
      setSpeed: (value) => events.push(`weatherSpeed:${value}`),
      setDirection: (value) => events.push(`weatherDirection:${value}`),
      setVisible: (value) => events.push(`weatherVisible:${value}`),
    },
    time: {
      setGameTime: (seconds) => events.push(`setTime:${seconds}`),
      advanceTime: (delta) => events.push(`advanceTime:${delta}`),
    },
    getRollTableById: (id) => {
      if (id !== 'table-1') return null;
      return {
        id: 'table-1',
        name: 'Spec Table',
        isGlobal: true,
        rows: [
          { id: 'row-1', label: 'One', weight: 1 },
          { id: 'row-2', label: 'Two', weight: 1 },
        ],
      };
    },
  };

  const announceDispatch = await dispatchCommandMacro(
    JSON.stringify({ command: 'announce', message: 'Ready!' }),
    context,
  );
  assert(announceDispatch.ok, 'announce dispatch should succeed');

  const sceneDispatch = await dispatchCommandMacro(
    JSON.stringify({
      command: 'scene',
      title: 'Nightfall',
      weather: { enabled: true, type: 'rain', intensity: 60, speed: 50, direction: 180 },
      time: { advanceBy: 600 },
    }),
    context,
  );
  assert(sceneDispatch.ok, 'scene dispatch should succeed for GM');
  assert(events.some((event) => event.startsWith('weatherType:rain')), 'scene should update weather type');

  const tableDispatch = await dispatchCommandMacro(
    JSON.stringify({ command: 'randomTable', tableId: 'table-1', title: 'Spec roll' }),
    context,
  );
  assert(tableDispatch.ok, 'randomTable dispatch should resolve tableId');

  const nonGmContext: CommandExecutionContext = { ...context, isGM: false };
  const blockedScene = await dispatchCommandMacro(
    JSON.stringify({ command: 'scene', title: 'Blocked for player' }),
    nonGmContext,
  );
  assert(!blockedScene.ok, 'scene dispatch should fail for non-GM');
}

void runCommandMacroSpecs();
