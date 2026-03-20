import {
  ArcRotateCamera,
  Animation,
  CubicEase,
  Engine,
  HemisphericLight,
  Mesh,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  Scalar,
  EasingFunction,
  Vector3,
} from '@babylonjs/core';
import { useCallback, useEffect, useRef } from 'react';
import type { DiceRollResult } from '../../../../shared/src/index';
import { attachDieValueBadge, createDieMesh } from './diceMeshFactory';
import { mapTargetFaceQuaternion } from './faceMapping';

interface EngineRefs {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
}

interface ActiveDie {
  root: TransformNode;
  mesh: Mesh;
  badge: Mesh;
  target: Quaternion;
  durationMs: number;
  elapsedMs: number;
}

export function useDice3DEngine(canvasRef: React.RefObject<HTMLCanvasElement>, quality: 'off' | 'low' | 'high' = 'low') {
  const refs = useRef<EngineRefs | null>(null);
  const activeDice = useRef<ActiveDie[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const antialias = quality === 'high';
    const engine = new Engine(canvas, antialias, { preserveDrawingBuffer: false, stencil: true, antialias });
    const scene = new Scene(engine);
    scene.clearColor.set(0, 0, 0, 0);

    const camera = new ArcRotateCamera('dice-camera', -Math.PI / 2, 1.1, 7, new Vector3(0, 0, 0), scene);
    camera.attachControl(canvas, false);
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 10;

    const light = new HemisphericLight('dice-hemi', new Vector3(0.3, 1, 0.2), scene);
    light.intensity = 1.1;

    scene.onBeforeRenderObservable.add(() => {
      const deltaMs = engine.getDeltaTime();
      activeDice.current.forEach((die) => {
        die.elapsedMs += deltaMs;
        const progress = Scalar.Clamp(die.elapsedMs / die.durationMs, 0, 1);
        const eased = easeOutCubic(progress);
        const start = die.root.rotationQuaternion ?? Quaternion.Identity();
        die.root.rotationQuaternion = Quaternion.Slerp(start, die.target, eased);
      });
    });

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    refs.current = { engine, scene, camera };

    return () => {
      window.removeEventListener('resize', handleResize);
      activeDice.current.forEach((die) => {
        die.badge.dispose();
        die.mesh.dispose();
        die.root.dispose();
      });
      activeDice.current = [];
      refs.current?.scene.dispose();
      refs.current?.engine.dispose();
      refs.current = null;
    };
  }, [canvasRef]);

  const playRoll = useCallback((roll: DiceRollResult) => {
    if (!refs.current) return;
    const { scene } = refs.current;

    activeDice.current.forEach((die) => {
      die.badge.dispose();
      die.mesh.dispose();
      die.root.dispose();
    });
    activeDice.current = [];

    const expandedDice = roll.dice.flatMap((die) => {
      const sides = die.sides;
      return die.rolls.map((value) => ({ sides, value }));
    });

    expandedDice.forEach((die, index) => {
      const root = new TransformNode(`dice-root-${index}`, scene);
      root.position = new Vector3((index - (expandedDice.length - 1) / 2) * 1.25, 0, 0);

      const mesh = createDieMesh(scene, die.sides);
      mesh.parent = root;
      mesh.position = Vector3.Zero();

      const badge = attachDieValueBadge(scene, mesh, die.value);

      const loops = 4 + (index % 3);
      // IMPORTANT: avoid exact 2π multiples, otherwise start/end quaternions can become identical.
      const spin = Quaternion.FromEulerAngles(
        Math.PI * (2 * loops + 0.63),
        Math.PI * (2 * (loops + 1) + 0.41),
        Math.PI * (2 * (loops + 2) + 0.27),
      );
      const target = mapTargetFaceQuaternion(die.sides, die.value, index + expandedDice.length);
      const start = spin.multiply(target);
      root.rotationQuaternion = start;

      const dropStart = root.position.clone().add(new Vector3(0, 2.25, -1.2));
      root.position = dropStart;

      const rotationAnimation = new Animation(
        `dice-rotation-${index}`,
        'rotationQuaternion',
        60,
        Animation.ANIMATIONTYPE_QUATERNION,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );

      const ease = new CubicEase();
      ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
      rotationAnimation.setEasingFunction(ease);

      rotationAnimation.setKeys([
        { frame: 0, value: start },
        { frame: 28, value: Quaternion.FromEulerAngles(0.45, 0.9, 0.4).multiply(target) },
        { frame: 48, value: target },
      ]);

      const positionAnimation = new Animation(
        `dice-position-${index}`,
        'position',
        60,
        Animation.ANIMATIONTYPE_VECTOR3,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );
      positionAnimation.setEasingFunction(ease);
      positionAnimation.setKeys([
        { frame: 0, value: dropStart },
        { frame: 48, value: new Vector3((index - (expandedDice.length - 1) / 2) * 1.25, 0, 0) },
      ]);

      root.animations = [rotationAnimation, positionAnimation];
      scene.beginAnimation(root, 0, 48, false);

      activeDice.current.push({
        root,
        mesh,
        badge,
        target,
        durationMs: 850,
        elapsedMs: 0,
      });
    });
  }, [quality]);

  return {
    playRoll,
    isReady: refs.current !== null,
  };
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}
