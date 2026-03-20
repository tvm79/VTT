import type {
  DiceRollRequest,
  DiceRollResult,
  DiceRollVisibility,
} from '../../../shared/src/index';
import { socketService } from '../services/socket';
import { getDice3DRoller } from './dice3dBridge';

type RollSource = DiceRollRequest['source'];

interface PendingRoll {
  resolve: (result: DiceRollResult) => void;
  reject: (error: Error) => void;
  timeoutId: number;
}

const pendingRolls = new Map<string, PendingRoll>();
let initialized = false;
const LEGACY_TIMEOUT_MS = 10_000;

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  socketService.on('dice_roll_result', (payload: unknown) => {
    const result = payload as DiceRollResult;
    if (!result?.requestId) return;

    const pending = pendingRolls.get(result.requestId);
    if (!pending) return;

    window.clearTimeout(pending.timeoutId);
    pendingRolls.delete(result.requestId);
    pending.resolve(result);
  });

}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `roll-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function requestAuthoritativeRoll(input: {
  formula: string;
  source: RollSource;
  visibility: DiceRollVisibility;
}): Promise<DiceRollResult> {
  ensureInitialized();

  const requestId = createRequestId();

  const payload: DiceRollRequest = {
    requestId,
    formula: input.formula,
    source: input.source,
    visibility: input.visibility,
  };

  const roller = getDice3DRoller();
  if (roller) {
    try {
      const visualResult = await roller({ requestId, formula: input.formula });
      if (visualResult) {
        payload.clientResult = visualResult;
      }
    } catch (error) {
      console.warn('[dice3d] visual roll failed before authoritative request; proceeding without clientResult', {
        requestId,
        error,
      });
    }
  }

  return await new Promise<DiceRollResult>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRolls.delete(requestId);
      reject(new Error('Timed out waiting for authoritative roll result'));
    }, LEGACY_TIMEOUT_MS);

    pendingRolls.set(requestId, { resolve, reject, timeoutId });
    socketService.sendDiceRollRequest(payload);
  });
}
