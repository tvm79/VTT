import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { DiceRollDieResult } from '../../../../shared/src/index';
import { registerDice3DRoller } from '../../dice/dice3dBridge';
import '@3d-dice/dice-box/dist/style.css';

type DiceSpec = {
  sides: number | 'fate';
  qty?: number;
  modifier?: number;
  value?: number;
  rollId?: string;
};

type DiceBoxInstance = {
  init: () => Promise<void>;
  clear: () => void;
  hide: (className?: string) => unknown;
  show: () => unknown;
  resizeWorld: () => void;
  updateConfig: (config: Record<string, unknown>) => unknown;
  roll: (
    notation: string | DiceSpec[] | DiceSpec,
    options?: { newStartPoint?: boolean; theme?: string; themeColor?: string },
  ) => Promise<unknown>;
};

type DiceBoxVisualDie = {
  sides?: string | number;
  dieType?: string;
  value?: number;
  rolls?: number[];
  modifier?: number;
};

function normalizeSides(input: string | number | undefined): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const parsed = Number.parseInt(input.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 20;
}

function extractFlatModifierFromFormula(formula: string): number {
  const normalized = formula.toLowerCase().replace(/\s+/g, '');
  const cleanFormula = normalized.replace(/\((adv|dis)\)$/i, '');
  const parts = cleanFormula.match(/[+-]?[^+-]+/g) || [];
  let modifier = 0;

  for (const rawPart of parts) {
    const sign = rawPart.startsWith('-') ? -1 : 1;
    const part = rawPart.replace(/^[-+]/, '');
    if (/^\d+$/.test(part)) {
      modifier += parseInt(part, 10) * sign;
    }
  }

  return modifier;
}

function buildClientResultFromVisual(visualResult: unknown, formula: string): { dice: DiceRollDieResult[]; total: number } | null {
  if (!Array.isArray(visualResult) || visualResult.length === 0) {
    return null;
  }

  const bySides = new Map<number, number[]>();

  for (const die of visualResult as DiceBoxVisualDie[]) {
    const inferredSides = normalizeSides(die?.sides ?? die?.dieType);
    const values = Array.isArray(die?.rolls)
      ? die.rolls.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : typeof die?.value === 'number' && Number.isFinite(die.value)
        ? [die.value]
        : [];

    if (values.length === 0) continue;

    const existing = bySides.get(inferredSides) ?? [];
    existing.push(...values);
    bySides.set(inferredSides, existing);
  }

  const dice: DiceRollDieResult[] = Array.from(bySides.entries()).map(([sides, rolls]) => {
    const subtotal = rolls.reduce((sum, v) => sum + v, 0);
    return {
      dice: `${rolls.length}d${sides}`,
      sides,
      rolls,
      total: subtotal,
      modifier: 0,
    };
  });

  if (dice.length === 0) return null;
  const diceTotal = dice.reduce((sum, die) => sum + die.total, 0);
  const modifierTotal = extractFlatModifierFromFormula(formula);
  const total = diceTotal + modifierTotal;

  if (modifierTotal !== 0) {
    const last = dice[dice.length - 1];
    dice[dice.length - 1] = {
      ...last,
      modifier: modifierTotal,
    };
  }

  return { dice, total };
}

function getRollAreaTuning(area: { width: number; height: number }): { throwForce: number; scale: number } {
  const normalizedArea = Math.max(0.08, Math.min(1, area.width * area.height));
  const areaRoot = Math.sqrt(normalizedArea);

  // Smaller roll areas need gentler force and slightly smaller dice to avoid edge escape.
  const throwForce = Math.max(2.2, Math.min(6.8, 6.8 * areaRoot));
  const scale = Math.max(4.6, Math.min(8, 8 * areaRoot));

  return { throwForce, scale };
}

function getRollAreaPhysicsConfig(area: { width: number; height: number }): { size: number; startingHeight: number } {
  const normalizedArea = Math.max(0.08, Math.min(1, area.width * area.height));
  const areaRoot = Math.sqrt(normalizedArea);

  // Dice Box worker creates physical walls from `size` and current canvas aspect ratio.
  // Shrink world size for smaller roll areas so side walls are physically closer.
  const size = Math.max(2.8, Math.min(9.5, 9.5 * areaRoot));
  // Keep spawn visibly above the table to avoid immediate floor-hit look on release.
  const startingHeight = Math.max(4.4, Math.min(9.2, 9.2 * areaRoot));

  return { size, startingHeight };
}

function buildDiceSpecsFromFormula(formula: string): DiceSpec[] {
  const normalized = formula.toLowerCase().replace(/\s+/g, '');
  const cleanFormula = normalized.replace(/\((adv|dis)\)$/i, '');
  const parts = cleanFormula.match(/[+-]?[^+-]+/g) || [];
  const specs: DiceSpec[] = [];

  for (const rawPart of parts) {
    const sign = rawPart.startsWith('-') ? -1 : 1;
    const part = rawPart.replace(/^[-+]/, '');
    const match = part.match(/^(\d+)d(\d+)$/i);
    if (!match) continue;

    const qty = Math.max(1, Number.parseInt(match[1], 10));
    const sides = Number.parseInt(match[2], 10);
    if (!Number.isFinite(qty) || !Number.isFinite(sides) || sides <= 0) continue;

    specs.push({
      sides,
      qty,
      modifier: 0,
      // Negative dice pools are unusual, but keep sign as best effort for parser symmetry.
      value: sign < 0 ? -1 : undefined,
    });
  }

  return specs;
}

export function Dice3DOverlay() {
  const DISSOLVE_HOLD_MS = 1100;
  const DISSOLVE_DURATION_MS = 700;
  const {
    dice3dEnabled,
    dice3dQuality,
    dice3dRollArea,
    dice3dColor,
    dice3dMaterial,
    dice3dSize,
    dice3dRollForce,
    dice3dTorque,
    dice3dScaleMultiplier,
    dice3dWorldSizeMultiplier,
    dice3dStartingHeightMultiplier,
    dice3dRestitutionMultiplier,
    dice3dFrictionMultiplier,
    dice3dLightIntensityMultiplier,
    dice3dShadowTransparencyMultiplier,
    dice3dTorqueThrowCoupling,
    dice3dRollDirectionMode,
    dice3dRollDirectionDegrees,
    dice3dShowBoundariesOverlay,
    setDice3dRollArea,
    lastAuthoritativeDiceRoll,
  } = useGameStore((state) => ({
    dice3dEnabled: state.dice3dEnabled,
    dice3dQuality: state.dice3dQuality,
    dice3dRollArea: state.dice3dRollArea,
    dice3dColor: state.dice3dColor,
    dice3dMaterial: state.dice3dMaterial,
    dice3dSize: state.dice3dSize,
    dice3dRollForce: state.dice3dRollForce,
    dice3dTorque: state.dice3dTorque,
    dice3dScaleMultiplier: state.dice3dScaleMultiplier,
    dice3dWorldSizeMultiplier: state.dice3dWorldSizeMultiplier,
    dice3dStartingHeightMultiplier: state.dice3dStartingHeightMultiplier,
    dice3dRestitutionMultiplier: state.dice3dRestitutionMultiplier,
    dice3dFrictionMultiplier: state.dice3dFrictionMultiplier,
    dice3dLightIntensityMultiplier: state.dice3dLightIntensityMultiplier,
    dice3dShadowTransparencyMultiplier: state.dice3dShadowTransparencyMultiplier,
    dice3dTorqueThrowCoupling: state.dice3dTorqueThrowCoupling,
    dice3dRollDirectionMode: state.dice3dRollDirectionMode,
    dice3dRollDirectionDegrees: state.dice3dRollDirectionDegrees,
    dice3dShowBoundariesOverlay: state.dice3dShowBoundariesOverlay,
    setDice3dRollArea: state.setDice3dRollArea,
    lastAuthoritativeDiceRoll: state.lastAuthoritativeDiceRoll,
  }));
  const containerRef = useRef<HTMLDivElement>(null);
  const diceBoxRef = useRef<DiceBoxInstance | null>(null);
  const initializingRef = useRef<Promise<void> | null>(null);
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const rollingRef = useRef<Promise<void> | null>(null);
  const dissolveTimerRef = useRef<number | null>(null);
  const dissolveFrameRef = useRef<number | null>(null);
  const [isDissolving, setIsDissolving] = useState(false);
  const [dissolveProgress, setDissolveProgress] = useState(0);
  const [authoritativeSummary, setAuthoritativeSummary] = useState<{
    requestId: string;
    total: number;
    parts: string[];
    dice: Array<{ sides: number; value: number }>;
  } | null>(null);
  const [pendingAuthoritativeSummary, setPendingAuthoritativeSummary] = useState<{
    requestId: string;
    total: number;
    parts: string[];
    dice: Array<{ sides: number; value: number }>;
  } | null>(null);
  const pendingSummaryByRequestIdRef = useRef(new Map<string, {
    requestId: string;
    total: number;
    parts: string[];
    dice: Array<{ sides: number; value: number }>;
  }>());
  const dragStateRef = useRef<null | {
    edge: 'left' | 'right' | 'top' | 'bottom';
    area: { x: number; y: number; width: number; height: number };
    startX: number;
    startY: number;
  }>(null);

  const clampArea = (area: { x: number; y: number; width: number; height: number }) => {
    const minW = 0.2;
    const minH = 0.2;
    let x = Math.max(0, Math.min(1, area.x));
    let y = Math.max(0, Math.min(1, area.y));
    let width = Math.max(minW, Math.min(1, area.width));
    let height = Math.max(minH, Math.min(1, area.height));

    if (x + width > 1) {
      if (width > 1) width = 1;
      x = Math.max(0, 1 - width);
    }
    if (y + height > 1) {
      if (height > 1) height = 1;
      y = Math.max(0, 1 - height);
    }

    return { x, y, width, height };
  };

  const clearDissolveTimers = () => {
    if (dissolveTimerRef.current !== null) {
      window.clearTimeout(dissolveTimerRef.current);
      dissolveTimerRef.current = null;
    }
    if (dissolveFrameRef.current !== null) {
      window.cancelAnimationFrame(dissolveFrameRef.current);
      dissolveFrameRef.current = null;
    }
  };

  const resetDissolve = () => {
    clearDissolveTimers();
    setIsDissolving(false);
    setDissolveProgress(0);
  };

  const scheduleDissolve = (input: { requestId: string; diceCount: number }) => {
    clearDissolveTimers();

    const perDieMs = input.diceCount > 0 ? Math.round(DISSOLVE_DURATION_MS / input.diceCount) : DISSOLVE_DURATION_MS;
    console.info('[dice3d] dissolve scheduled', {
      requestId: input.requestId,
      holdMs: DISSOLVE_HOLD_MS,
      durationMs: DISSOLVE_DURATION_MS,
      diceCount: input.diceCount,
      perDieMs,
      note: 'Per-die timing is a diagnostic schedule; dissolve is rendered as a single canvas pass.',
    });

    dissolveTimerRef.current = window.setTimeout(() => {
      const startedAt = performance.now();
      setIsDissolving(true);

      const tick = () => {
        const elapsed = performance.now() - startedAt;
        const nextProgress = Math.max(0, Math.min(1, elapsed / DISSOLVE_DURATION_MS));
        setDissolveProgress(nextProgress);

        if (nextProgress < 1) {
          dissolveFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        dissolveFrameRef.current = null;
        setIsDissolving(false);
        setDissolveProgress(0);
        diceBoxRef.current?.clear();
        diceBoxRef.current?.hide();
        console.info('[dice3d] dissolve complete; cleared and hid settled dice', {
          requestId: input.requestId,
        });
      };

      dissolveFrameRef.current = window.requestAnimationFrame(tick);
    }, DISSOLVE_HOLD_MS);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;

      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = (event.clientX - drag.startX) / rect.width;
      const dy = (event.clientY - drag.startY) / rect.height;
      const next = { ...drag.area };

      if (drag.edge === 'left') {
        next.x = drag.area.x + dx;
        next.width = drag.area.width - dx;
      } else if (drag.edge === 'right') {
        next.width = drag.area.width + dx;
      } else if (drag.edge === 'top') {
        next.y = drag.area.y + dy;
        next.height = drag.area.height - dy;
      } else if (drag.edge === 'bottom') {
        next.height = drag.area.height + dy;
      }

      setDice3dRollArea(clampArea(next));
    };

    const onUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setDice3dRollArea]);

  const syncCanvasLayout = () => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetWidth = Math.max(1, Math.round(container.clientWidth * dpr));
    const targetHeight = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width !== targetWidth) {
      canvas.width = targetWidth;
    }
    if (canvas.height !== targetHeight) {
      canvas.height = targetHeight;
    }

    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    diceBoxRef.current?.resizeWorld();
  };

  const applyAreaPhysicsConfig = (reason: 'init' | 'bridge-roll' | 'authoritative-roll') => {
    const box = diceBoxRef.current;
    if (!box) return;

    const tuningBase = getRollAreaTuning(dice3dRollArea);
    const physics = getRollAreaPhysicsConfig(dice3dRollArea);
    const materialOverrides: Record<string, { lightIntensity: number; shadowTransparency: number; restitution: number; friction: number }> = {
      plastic: { lightIntensity: 1.2, shadowTransparency: 0.8, restitution: 0.15, friction: 0.78 },
      metal: { lightIntensity: 1.45, shadowTransparency: 0.7, restitution: 0.08, friction: 0.7 },
      glass: { lightIntensity: 1.5, shadowTransparency: 0.6, restitution: 0.04, friction: 0.62 },
      stone: { lightIntensity: 1.0, shadowTransparency: 0.86, restitution: 0.02, friction: 0.88 },
    };
    const material = materialOverrides[dice3dMaterial] ?? materialOverrides.plastic;
    const torqueFactor = Math.max(0.4, Math.min(1.4, dice3dTorque * dice3dTorqueThrowCoupling));
    const tuning = {
      // Perceived startup spin is heavily coupled to launch impulse in Dice Box.
      // Lower torque should therefore reduce effective throw force as well.
      throwForce: Math.max(1.25, Math.min(8.5, tuningBase.throwForce * dice3dRollForce * torqueFactor)),
      scale: Math.max(3.2, Math.min(11, tuningBase.scale * dice3dSize * dice3dScaleMultiplier)),
      torque: Math.max(0.3, Math.min(2.5, dice3dTorque)),
    };
    const effectiveRestitution = Math.max(0.005, Math.min(0.35, material.restitution * (0.8 + 0.25 * torqueFactor) * dice3dRestitutionMultiplier));
    const effectiveFriction = Math.max(0.5, Math.min(0.98, (material.friction + (1 - torqueFactor) * 0.18) * dice3dFrictionMultiplier));
    const effectiveSize = Math.max(2.2, Math.min(12.5, physics.size * dice3dWorldSizeMultiplier));
    const effectiveStartingHeight = Math.max(2.5, Math.min(14, physics.startingHeight * dice3dStartingHeightMultiplier));
    const effectiveLightIntensity = Math.max(0.35, Math.min(2.4, material.lightIntensity * dice3dLightIntensityMultiplier));
    const effectiveShadowTransparency = Math.max(0.25, Math.min(1.25, material.shadowTransparency * dice3dShadowTransparencyMultiplier));

    const container = containerRef.current;
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;
    const aspect =
      canvas && canvas.clientHeight > 0
        ? canvas.clientWidth / canvas.clientHeight
        : dice3dRollArea.height > 0
          ? dice3dRollArea.width / dice3dRollArea.height
          : 1;

    const xHalfSpan = effectiveSize * aspect * 0.5;
    const zHalfSpan = effectiveSize * 0.5;
    const topWallY = effectiveStartingHeight + 9.5;

    box.updateConfig?.({
      throwForce: tuning.throwForce,
      scale: tuning.scale,
      torque: tuning.torque,
      size: effectiveSize,
      startingHeight: effectiveStartingHeight,
      themeColor: dice3dColor,
      lightIntensity: effectiveLightIntensity,
      shadowTransparency: effectiveShadowTransparency,
      restitution: effectiveRestitution,
      friction: effectiveFriction,
    });

    console.info('[dice3d] physics-config-applied', {
      reason,
      area: dice3dRollArea,
      config: {
        throwForce: tuning.throwForce,
        scale: tuning.scale,
        torque: tuning.torque,
        size: effectiveSize,
        startingHeight: effectiveStartingHeight,
        themeColor: dice3dColor,
        material: dice3dMaterial,
        lightIntensity: effectiveLightIntensity,
        shadowTransparency: effectiveShadowTransparency,
        restitution: effectiveRestitution,
        friction: effectiveFriction,
        torqueFactor,
      },
      inferredWalls: {
        aspect,
        xMin: -xHalfSpan,
        xMax: xHalfSpan,
        zMin: -zHalfSpan,
        zMax: zHalfSpan,
        yTop: topWallY,
      },
      rollControls: {
        sizeMultiplier: dice3dSize,
        forceMultiplier: dice3dRollForce,
        torqueMultiplier: dice3dTorque,
        scaleMultiplier: dice3dScaleMultiplier,
        worldSizeMultiplier: dice3dWorldSizeMultiplier,
        startingHeightMultiplier: dice3dStartingHeightMultiplier,
        restitutionMultiplier: dice3dRestitutionMultiplier,
        frictionMultiplier: dice3dFrictionMultiplier,
        lightIntensityMultiplier: dice3dLightIntensityMultiplier,
        shadowTransparencyMultiplier: dice3dShadowTransparencyMultiplier,
        torqueThrowCoupling: dice3dTorqueThrowCoupling,
        directionMode: dice3dRollDirectionMode,
        directionDegrees: dice3dRollDirectionDegrees,
      },
    });

    if (effectiveStartingHeight <= 4.2) {
      console.warn('[dice3d][diagnose] low-spawn-height', {
        reason,
        startingHeight: effectiveStartingHeight,
        size: effectiveSize,
        area: dice3dRollArea,
        note: 'Low startingHeight can make dice appear to spawn on/near table and instantly collide.',
      });
    }
  };

  const parsedNotation = useMemo<DiceSpec[] | null>(() => {
    if (!lastAuthoritativeDiceRoll) return null;

    const dice: DiceSpec[] = [];

    for (const die of lastAuthoritativeDiceRoll.dice) {
      for (const roll of die.rolls) {
        dice.push({
          sides: die.sides,
          qty: 1,
          modifier: 0,
          value: roll,
          // rollId included for deterministic identity per die in Dice Box internals
          rollId: `${lastAuthoritativeDiceRoll.rollId}-${die.sides}-${dice.length + 1}`,
        });
      }
    }

    return dice.length > 0 ? dice : [{ sides: 20, qty: 1, modifier: 0 }];
  }, [lastAuthoritativeDiceRoll]);

  const colliderWallStyle = useMemo(() => {
    const wallThickness = 18;
    return {
      wallThickness,
      wallColor: 'rgba(255, 64, 64, 0.28)',
      wallEdge: 'rgba(255, 64, 64, 0.92)',
      wallGlow: '0 0 10px rgba(255, 64, 64, 0.6)',
    };
  }, []);

  useEffect(() => {
    if (!dice3dEnabled || !containerRef.current || diceBoxRef.current || initializingRef.current) return;

    initializingRef.current = (async () => {
      const module = await import('@3d-dice/dice-box');
      const DiceBoxCtor = module.default as new (config?: Record<string, unknown>) => DiceBoxInstance;

      const box = new DiceBoxCtor({
        container: '#dice-box-overlay',
        id: 'dice-box-overlay-canvas',
        assetPath: '/assets/dice-box/',
        // Offscreen worker path can look softer on some GPUs/displays.
        offscreen: false,
        scale: dice3dQuality === 'high' ? 8 : 7,
        theme: 'default',
        gravity: 3.8,
        lightIntensity: 1.3,
        throwForce: dice3dQuality === 'high' ? 7.2 : 6.4,
        // Keep visuals interactive while game-state authority remains server-side.
        // We pass authoritative values in notation objects for best-effort visual alignment.
        onRollComplete: () => {
          // no-op for now; hook retained for future deterministic reconciliation
        },
      });

      await box.init();
      diceBoxRef.current = box;
      syncCanvasLayout();
      applyAreaPhysicsConfig('init');
    })().finally(() => {
      initializingRef.current = null;
    });
  }, [dice3dEnabled, dice3dQuality, dice3dRollArea.x, dice3dRollArea.y, dice3dRollArea.width, dice3dRollArea.height]);

  useEffect(() => {
    if (!dice3dEnabled) {
      registerDice3DRoller(null);
      return;
    }

    registerDice3DRoller(async ({ requestId, formula }) => {
      if (!diceBoxRef.current && initializingRef.current) {
        await initializingRef.current;
      }
      if (!diceBoxRef.current) return null;

      applyAreaPhysicsConfig('bridge-roll');

      // This request is already being visually rolled by the initiator through the bridge.
      // Mark it so the socket-result effect does not trigger a duplicate second roll.
      processedRequestIdsRef.current.add(requestId);

      const notationSpecs = buildDiceSpecsFromFormula(formula);
      let visualResult: unknown;
      const startedAt = performance.now();
      try {
        resetDissolve();
        diceBoxRef.current.clear();
        diceBoxRef.current.show?.();

        console.info('[dice3d] bridge-roll spawn', {
          requestId,
          formula,
          notationSpecs,
          area: dice3dRollArea,
          directionMode: dice3dRollDirectionMode,
          directionDegrees: dice3dRollDirectionDegrees,
          newStartPoint: dice3dRollDirectionMode === 'random',
          diagnosisHint: 'If spawn looks too low, inspect latest physics-config-applied.startingHeight',
        });

        visualResult = await diceBoxRef.current.roll(notationSpecs.length > 0 ? notationSpecs : formula, {
          newStartPoint: dice3dRollDirectionMode === 'random',
          themeColor: dice3dColor,
        });
      } catch (error) {
        // Allow fallback path to roll from server result if local visual roll failed.
        processedRequestIdsRef.current.delete(requestId);
        throw error;
      }

      const animationMs = Math.max(0, Math.round(performance.now() - startedAt));
      const visualMapped = buildClientResultFromVisual(visualResult, formula);

      console.info('[dice3d] authoritative-from-visual', {
        requestId,
        formula,
        visualResult,
        visualMapped,
        animationMs,
      });

      const plannedDiceCount = notationSpecs.reduce((sum, die) => sum + (die.qty ?? 1), 0);
      scheduleDissolve({ requestId, diceCount: plannedDiceCount });

      return visualMapped;
    });

    return () => {
      registerDice3DRoller(null);
    };
  }, [dice3dEnabled, dice3dRollArea, dice3dColor, dice3dMaterial, dice3dSize, dice3dRollForce, dice3dTorque, dice3dRollDirectionMode, dice3dRollDirectionDegrees]);

  useEffect(() => {
    const handleResize = () => syncCanvasLayout();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = container?.querySelector('canvas') as HTMLCanvasElement | null;
    const containerRect = container?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();

    console.info('[dice3d] roll-area geometry', {
      enabled: dice3dEnabled,
      area: dice3dRollArea,
      containerRect: containerRect
        ? {
            x: containerRect.x,
            y: containerRect.y,
            width: containerRect.width,
            height: containerRect.height,
          }
        : null,
      canvasRect: canvasRect
        ? {
            x: canvasRect.x,
            y: canvasRect.y,
            width: canvasRect.width,
            height: canvasRect.height,
          }
        : null,
      canvasBuffer: canvas
        ? {
            width: canvas.width,
            height: canvas.height,
          }
        : null,
      colliderWalls: {
        thickness: colliderWallStyle.wallThickness,
      },
    });
  }, [dice3dEnabled, dice3dRollArea, colliderWallStyle.wallThickness]);

  useEffect(() => {
    if (!dice3dEnabled || !lastAuthoritativeDiceRoll || !parsedNotation) {
      return;
    }

    if (processedRequestIdsRef.current.has(lastAuthoritativeDiceRoll.requestId)) {
      return;
    }
    processedRequestIdsRef.current.add(lastAuthoritativeDiceRoll.requestId);

    const run = async () => {
      if (!diceBoxRef.current && initializingRef.current) {
        await initializingRef.current;
      }

      if (!diceBoxRef.current) return;

      applyAreaPhysicsConfig('authoritative-roll');
      resetDissolve();

      console.info('[dice3d] roll start', {
        requestId: lastAuthoritativeDiceRoll.requestId,
        formula: lastAuthoritativeDiceRoll.formula,
        total: lastAuthoritativeDiceRoll.total,
        dice: lastAuthoritativeDiceRoll.dice,
        notation: parsedNotation,
        area: dice3dRollArea,
        directionMode: dice3dRollDirectionMode,
        directionDegrees: dice3dRollDirectionDegrees,
        newStartPoint: dice3dRollDirectionMode === 'random',
        diagnosisHint: 'If spawn looks too low, inspect latest physics-config-applied.startingHeight',
      });

      diceBoxRef.current.clear();
      diceBoxRef.current.show?.();
      const visualResult = await diceBoxRef.current.roll(parsedNotation, {
        newStartPoint: dice3dRollDirectionMode === 'random',
        themeColor: dice3dColor,
      });
      const visualMapped = buildClientResultFromVisual(visualResult, lastAuthoritativeDiceRoll.formula);

      const settledSummary = pendingSummaryByRequestIdRef.current.get(lastAuthoritativeDiceRoll.requestId);
      if (settledSummary) {
        setAuthoritativeSummary(settledSummary);
        setPendingAuthoritativeSummary(null);
        pendingSummaryByRequestIdRef.current.delete(lastAuthoritativeDiceRoll.requestId);
        console.info('[dice3d] authoritative-summary', {
          requestId: settledSummary.requestId,
          total: settledSummary.total,
          dice: settledSummary.dice,
          gatedUntil: 'roll visual-complete',
        });
      }

      console.info('[dice3d] roll visual-complete', {
        requestId: lastAuthoritativeDiceRoll.requestId,
        visualResult,
        visualMapped,
        authoritativeExpected: {
          total: lastAuthoritativeDiceRoll.total,
          dice: lastAuthoritativeDiceRoll.dice,
        },
        visualVsAuthoritativeMatch:
          !!visualMapped
          && visualMapped.total === lastAuthoritativeDiceRoll.total
          && JSON.stringify(visualMapped.dice) === JSON.stringify(lastAuthoritativeDiceRoll.dice),
        area: dice3dRollArea,
      });

      scheduleDissolve({
        requestId: lastAuthoritativeDiceRoll.requestId,
        diceCount: parsedNotation.length,
      });
    };

    const chain = (rollingRef.current ?? Promise.resolve()).then(run);
    rollingRef.current = chain.finally(() => {
      if (rollingRef.current === chain) {
        rollingRef.current = null;
      }
    });
  }, [dice3dEnabled, lastAuthoritativeDiceRoll, parsedNotation, dice3dRollArea, dice3dColor, dice3dTorque, dice3dRollDirectionMode, dice3dRollDirectionDegrees]);

  useEffect(() => {
    if (!lastAuthoritativeDiceRoll) return;

    const parts = lastAuthoritativeDiceRoll.dice
      .map((die) => `d${die.sides}: ${die.rolls.join(', ')}`)
      .filter(Boolean);

    const dice = lastAuthoritativeDiceRoll.dice.flatMap((die) =>
      die.rolls.map((value) => ({ sides: die.sides, value })),
    );

    const queuedSummary = {
      requestId: lastAuthoritativeDiceRoll.requestId,
      total: lastAuthoritativeDiceRoll.total,
      parts,
      dice,
    };
    setPendingAuthoritativeSummary(queuedSummary);
    pendingSummaryByRequestIdRef.current.set(lastAuthoritativeDiceRoll.requestId, queuedSummary);

    console.info('[dice3d] authoritative-summary-queued', {
      requestId: lastAuthoritativeDiceRoll.requestId,
      total: lastAuthoritativeDiceRoll.total,
      dice,
      waitingFor: 'roll visual-complete',
    });

    return () => {
      // no-op cleanup
    };
  }, [lastAuthoritativeDiceRoll]);

  useEffect(() => {
    if (dice3dEnabled) return;
    if (!diceBoxRef.current) return;

    resetDissolve();
    diceBoxRef.current.clear();
    diceBoxRef.current.hide();
  }, [dice3dEnabled]);

  useEffect(() => {
    return () => {
      clearDissolveTimers();
    };
  }, []);

  if (!dice3dEnabled && !authoritativeSummary) {
    return null;
  }

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9000,
        display: 'block',
      }}
    >
      <div
        id="dice-box-overlay"
        ref={containerRef}
        style={{
          position: 'absolute',
          left: dice3dEnabled ? `${dice3dRollArea.x * 100}%` : 0,
          top: dice3dEnabled ? `${dice3dRollArea.y * 100}%` : 0,
          width: dice3dEnabled ? `${dice3dRollArea.width * 100}%` : '100%',
          height: dice3dEnabled ? `${dice3dRollArea.height * 100}%` : '100%',
          overflow: 'hidden',
          opacity: isDissolving ? Math.max(0, 1 - dissolveProgress) : 1,
          filter: isDissolving
            ? `blur(${(1.8 * dissolveProgress).toFixed(2)}px) brightness(${(1 - dissolveProgress * 0.55).toFixed(3)})`
            : 'none',
          transition: isDissolving ? 'none' : 'opacity 140ms ease-out',
        }}
      />

      {dice3dEnabled && dice3dShowBoundariesOverlay ? (
        <div
          style={{
            position: 'absolute',
            left: `${dice3dRollArea.x * 100}%`,
            top: `${dice3dRollArea.y * 100}%`,
            width: `${dice3dRollArea.width * 100}%`,
            height: `${dice3dRollArea.height * 100}%`,
            border: '2px dashed rgba(255,176,0,0.85)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.45) inset',
            background: 'rgba(255,176,0,0.06)',
            pointerEvents: 'none',
          }}
        >
          {/* Debug visual: collider walls representation */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: colliderWallStyle.wallThickness,
              height: '100%',
              background: colliderWallStyle.wallColor,
              borderRight: `2px solid ${colliderWallStyle.wallEdge}`,
              boxShadow: colliderWallStyle.wallGlow,
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: colliderWallStyle.wallThickness,
              height: '100%',
              background: colliderWallStyle.wallColor,
              borderLeft: `2px solid ${colliderWallStyle.wallEdge}`,
              boxShadow: colliderWallStyle.wallGlow,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: colliderWallStyle.wallThickness,
              background: colliderWallStyle.wallColor,
              borderBottom: `2px solid ${colliderWallStyle.wallEdge}`,
              boxShadow: colliderWallStyle.wallGlow,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: colliderWallStyle.wallThickness,
              background: colliderWallStyle.wallColor,
              borderTop: `2px solid ${colliderWallStyle.wallEdge}`,
              boxShadow: colliderWallStyle.wallGlow,
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: '#ffd7d7',
              fontSize: 11,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              background: 'rgba(32,0,0,0.45)',
              border: '1px solid rgba(255,90,90,0.7)',
              borderRadius: 6,
              padding: '3px 6px',
            }}
          >
            Collider Walls (visual)
          </div>
          {([
            ['left', { left: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }],
            ['right', { right: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }],
            ['top', { top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' }],
            ['bottom', { bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' }],
          ] as const).map(([edge, pos]) => (
            <div
              key={edge}
              onPointerDown={(event) => {
                event.preventDefault();
                dragStateRef.current = {
                  edge,
                  area: { ...dice3dRollArea },
                  startX: event.clientX,
                  startY: event.clientY,
                };
              }}
              style={{
                position: 'absolute',
                width: 12,
                height: 12,
                borderRadius: 6,
                background: '#ffb000',
                border: '1px solid rgba(0,0,0,0.6)',
                pointerEvents: 'auto',
                ...pos,
              }}
            />
          ))}
        </div>
      ) : null}

      {null}
    </div>
  );
}
