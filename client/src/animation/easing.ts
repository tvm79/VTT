export type EasingFunction = (t: number) => number;

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

export const easeOutQuad: EasingFunction = (t) => 1 - (1 - t) * (1 - t);

export const easeInOutQuad: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeInOutCubic: EasingFunction = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic: EasingFunction = (t) => 1 - Math.pow(1 - t, 3);

export const easeOutBack: EasingFunction = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const dampedSine = (t: number, oscillations: number, decay: number): number =>
  Math.sin(t * Math.PI * oscillations) * Math.exp(-t * decay);
