import { Quaternion, Vector3 } from '@babylonjs/core';

const D6_FACE_EULER: Record<number, Vector3> = {
  1: new Vector3(0, 0, 0),
  2: new Vector3(0, 0, -Math.PI / 2),
  3: new Vector3(Math.PI / 2, 0, 0),
  4: new Vector3(-Math.PI / 2, 0, 0),
  5: new Vector3(0, 0, Math.PI / 2),
  6: new Vector3(Math.PI, 0, 0),
};

export function mapTargetFaceQuaternion(sides: number, value: number, seed = 0): Quaternion {
  if (sides === 6) {
    const euler = D6_FACE_EULER[value] ?? D6_FACE_EULER[1];
    return Quaternion.FromEulerVector(euler);
  }

  // Placeholder mapping for non-d6 dice (d20 first-phase support)
  // Produces deterministic-but-simple orientation keyed by value and seed.
  const a = ((value * 37 + seed * 13) % 360) * (Math.PI / 180);
  const b = ((value * 53 + seed * 7) % 360) * (Math.PI / 180);
  const c = ((value * 19 + seed * 17) % 360) * (Math.PI / 180);
  return Quaternion.FromEulerAngles(a, b, c);
}

