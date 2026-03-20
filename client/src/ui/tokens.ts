export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const typography = {
  family: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
    display: "'Polymath', 'Polymath Bold', sans-serif",
    mono: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
  },
  size: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '20px',
    xl: '24px',
    xxl: '32px',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.4,
    normal: 1.5,
    relaxed: 1.6,
  },
} as const;

export const radius = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  round: '999px',
} as const;

export const shadows = {
  none: 'none',
  sm: '0 4px 12px rgba(0, 0, 0, 0.18)',
  md: '0 10px 30px rgba(0, 0, 0, 0.24)',
} as const;

export const zIndex = {
  base: 0,
  board: 1,
  floatingPanel: 50,
  overlay: 200,
  popover: 500,
  modal: 1000,
  toast: 1100,
  debug: 2000,
} as const;

export const motion = {
  duration: {
    fast: '120ms',
    normal: '180ms',
  },
  easing: {
    standard: 'ease',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const;

export const interaction = {
  hoverOpacity: 0.92,
  activeOpacity: 0.82,
  disabledOpacity: 0.48,
  focusRing: '0 0 0 2px rgba(255, 255, 255, 0.16)',
} as const;

export const colors = {
  background: {
    primary: '#10141c',
    secondary: '#151b24',
    tertiary: '#1b2230',
    canvas: '#0c1017',
  },
  surface: {
    base: '#1a2230',
    muted: '#212b3a',
    elevated: '#263244',
    overlay: 'rgba(18, 24, 34, 0.92)',
    translucent: 'rgba(26, 34, 48, 0.78)',
  },
  text: {
    primary: '#f3f6fb',
    secondary: '#b5c0d0',
    muted: '#8593a7',
    inverse: '#0f141c',
  },
  border: {
    subtle: 'rgba(181, 192, 208, 0.14)',
    strong: 'rgba(181, 192, 208, 0.26)',
    accent: 'rgba(110, 168, 255, 0.42)',
  },
  accent: {
    primary: '#6ea8ff',
    primaryHover: '#82b5ff',
    primaryActive: '#4f8fe8',
    info: '#4299e1',
    success: '#4fbf88',
    danger: '#ef6b73',
    warning: '#f2b45a',
  },
  lightingPreset: {
    torchStart: '#ffaa44',
    torchEnd: '#ff6600',
    torchBorder: '#cc5500',
    lanternStart: '#ffeedd',
    lanternEnd: '#ccaa88',
    lanternBorder: '#aa8866',
    candleStart: '#ffdd88',
    candleEnd: '#ffcc44',
    candleBorder: '#ccaa33',
    magicStart: '#88ddff',
    magicEnd: '#4488cc',
    magicBorder: '#336699',
    shroudStart: '#443355',
    shroudEnd: '#221133',
    shroudBorder: '#1a0a22',
    sunStart: '#ffffff',
    sunEnd: '#ffdd88',
    sunBorder: '#ccaa66',
  },
  state: {
    selected: 'rgba(110, 168, 255, 0.16)',
    hover: 'rgba(255, 255, 255, 0.05)',
    active: 'rgba(255, 255, 255, 0.08)',
    disabled: 'rgba(255, 255, 255, 0.04)',
    focus: 'rgba(110, 168, 255, 0.3)',
  },
} as const;

export const tokens = {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  zIndex,
  motion,
  interaction,
} as const;

export type Tokens = typeof tokens;

type Primitive = string | number;
interface TokenRecord {
  [key: string]: Primitive | TokenRecord;
}

function flattenTokenGroup(prefix: string, value: Primitive | TokenRecord, output: Record<string, string>) {
  if (typeof value === 'string' || typeof value === 'number') {
    output[`--${prefix}`] = String(value);
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    flattenTokenGroup(`${prefix}-${key}`, nested, output);
  }
}

export function createCssVariables() {
  const result: Record<string, string> = {};

  for (const [group, value] of Object.entries(tokens)) {
    flattenTokenGroup(group, value as Primitive | TokenRecord, result);
  }

  return result;
}
