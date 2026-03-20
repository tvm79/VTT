/**
 * Color utility functions
 */

// Token disposition types and colors
export type TokenDisposition = 'neutral' | 'friendly' | 'secret' | 'hostile';

export interface DispositionInfo {
  label: string;
  color: string; // Hex color string (e.g., '#ff0000')
  borderColor: number; // PIXI color number (e.g., 0xff0000)
}

export const TOKEN_DISPOSITIONS: Record<TokenDisposition, DispositionInfo> = {
  neutral: {
    label: 'Neutral',
    color: '#ed8936',
    borderColor: 0xed8936,
  },
  friendly: {
    label: 'Friendly',
    color: '#48BB78',
    borderColor: 0x48BB78,
  },
  secret: {
    label: 'Secret',
    color: '#9F7AEA',
    borderColor: 0x9F7AEA,
  },
  hostile: {
    label: 'Hostile',
    color: '#EF4444',
    borderColor: 0xEF4444,
  },
};

// Default selection color (when no disposition is set)
export const DEFAULT_TOKEN_SELECTION_COLOR = 0xed8936; // Orange

/**
 * Gets the disposition info for a token based on its properties
 * @param properties - Token properties object
 * @returns DispositionInfo or undefined if no disposition is set
 */
export function getTokenDisposition(properties: Record<string, unknown> | undefined): DispositionInfo | undefined {
  if (!properties) return undefined;
  const disposition = properties.disposition as TokenDisposition | undefined;
  if (!disposition || !TOKEN_DISPOSITIONS[disposition]) return undefined;
  return TOKEN_DISPOSITIONS[disposition];
}

/**
 * Gets the border color for a token based on its disposition
 * @param properties - Token properties object
 * @returns PIXI color number for the border
 */
export function getTokenBorderColor(properties: Record<string, unknown> | undefined): number {
  const disposition = getTokenDisposition(properties);
  return disposition?.borderColor ?? DEFAULT_TOKEN_SELECTION_COLOR;
}

/**
 * Calculates the relative luminance of a color
 * Based on W3C WCAG 2.0 formula
 * @param hex - Color in hex format (e.g., '#ff0000' or '#f00')
 * @returns Luminance value between 0 and 1
 */
export function getRelativeLuminance(hex: string): number {
  // Remove # if present
  const color = hex.replace('#', '');
  
  // Parse RGB values
  let r: number, g: number, b: number;
  
  if (color.length === 3) {
    // Short form (e.g., #f00)
    r = parseInt(color[0] + color[0], 16);
    g = parseInt(color[1] + color[1], 16);
    b = parseInt(color[2] + color[2], 16);
  } else if (color.length === 6) {
    // Long form (e.g., #ff0000)
    r = parseInt(color.substring(0, 2), 16);
    g = parseInt(color.substring(2, 4), 16);
    b = parseInt(color.substring(4, 6), 16);
  } else {
    // Default to white if invalid
    return 1;
  }
  
  // Apply gamma correction
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;
  
  const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
  
  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Determines if a background color is "bright" (needs dark text)
 * @param backgroundColor - Background color in hex format
 * @param threshold - Luminance threshold (default 0.5 - the ISO standard)
 * @returns true if background is bright (use dark text), false if dark (use light text)
 */
export function isBackgroundBright(backgroundColor: string, threshold = 0.5): boolean {
  return getRelativeLuminance(backgroundColor) > threshold;
}

/**
 * Gets the appropriate text color for a given background color
 * Automatically chooses between light and dark text based on background brightness
 * @param backgroundColor - Background color in hex format
 * @param darkText - Color to use for bright backgrounds (default: '#000000')
 * @param lightText - Color to use for dark backgrounds (default: '#ffffff')
 * @returns Appropriate text color
 */
export function getContrastTextColor(
  backgroundColor: string,
  darkText = '#000000',
  lightText = '#ffffff'
): string {
  return isBackgroundBright(backgroundColor) ? darkText : lightText;
}

/**
 * Adjusts the brightness of a color by a given percentage
 * @param hex - Color in hex format
 * @param percent - Percentage to adjust (-100 to 100, negative = darker, positive = lighter)
 * @returns Adjusted hex color
 */
function adjustBrightness(hex: string, percent: number): string {
  // Remove # if present
  let color = hex.replace('#', '');
  
  // Parse RGB values
  let r: number, g: number, b: number;
  
  if (color.length === 3) {
    r = parseInt(color[0] + color[0], 16);
    g = parseInt(color[1] + color[1], 16);
    b = parseInt(color[2] + color[2], 16);
  } else if (color.length === 6) {
    r = parseInt(color.substring(0, 2), 16);
    g = parseInt(color.substring(2, 4), 16);
    b = parseInt(color.substring(4, 6), 16);
  } else {
    return hex; // Return original if invalid
  }
  
  // Adjust brightness
  const adjustment = (percent / 100) * 255;
  
  r = Math.max(0, Math.min(255, Math.round(r + adjustment)));
  g = Math.max(0, Math.min(255, Math.round(g + adjustment)));
  b = Math.max(0, Math.min(255, Math.round(b + adjustment)));
  
  // Convert back to hex
  return '#' + 
    r.toString(16).padStart(2, '0') + 
    g.toString(16).padStart(2, '0') + 
    b.toString(16).padStart(2, '0');
}

/**
 * Gets the hover state color for a button
 * Adapts based on whether the background is light or dark
 * @param baseColor - The base button color in hex format
 * @returns Hover state color
 */
export function getButtonHoverColor(baseColor: string): string {
  const isBright = isBackgroundBright(baseColor);
  // On dark backgrounds, lighten; on light backgrounds, darken
  return isBright ? adjustBrightness(baseColor, -10) : adjustBrightness(baseColor, 15);
}

/**
 * Gets the active/pressed state color for a button
 * @param baseColor - The base button color in hex format
 * @returns Active state color
 */
export function getButtonActiveColor(baseColor: string): string {
  const isBright = isBackgroundBright(baseColor);
  // More intense change than hover
  return isBright ? adjustBrightness(baseColor, -20) : adjustBrightness(baseColor, 20);
}

/**
 * Interface for button style options
 */
export interface ButtonStyleOptions {
  baseColor: string;
  textColor?: string;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
  fontSize?: number;
  fontWeight?: string;
  transitionDuration?: string;
}

/**
 * Interface for complete button styles
 */
export interface ButtonStyles {
  default: React.CSSProperties;
  hover: React.CSSProperties;
  active: React.CSSProperties;
  disabled: React.CSSProperties;
}

/**
 * Gets the appropriate text color for a button background
 * @param backgroundColor - Button background color
 * @returns Readable text color
 */
export function getButtonTextColor(backgroundColor: string): string {
  return getContrastTextColor(backgroundColor);
}

/**
 * Gets complete button style objects for all states
 * @param options - Button style options
 * @returns Object containing styles for default, hover, active, and disabled states
 */
export function getButtonStyles(options: ButtonStyleOptions): ButtonStyles {
  const {
    baseColor,
    textColor = getButtonTextColor(baseColor),
    borderRadius = 4,
    paddingX = 16,
    paddingY = 8,
    fontSize = 14,
    fontWeight = 'normal',
    transitionDuration = '0.2s'
  } = options;

  const hoverColor = getButtonHoverColor(baseColor);
  const activeColor = getButtonActiveColor(baseColor);
  const disabledTextColor = getButtonTextColor(baseColor);

  return {
    default: {
      backgroundColor: baseColor,
      color: textColor,
      border: 'none',
      borderRadius: `${borderRadius}px`,
      padding: `${paddingY}px ${paddingX}px`,
      fontSize: `${fontSize}px`,
      fontWeight,
      cursor: 'pointer',
      transition: `background-color ${transitionDuration}, transform ${transitionDuration}`,
      outline: 'none'
    },
    hover: {
      backgroundColor: hoverColor,
      color: getButtonTextColor(hoverColor)
    },
    active: {
      backgroundColor: activeColor,
      color: getButtonTextColor(activeColor),
      transform: 'scale(0.98)'
    },
    disabled: {
      backgroundColor: baseColor,
      color: disabledTextColor,
      opacity: 0.5,
      cursor: 'not-allowed',
      transform: 'none'
    }
  };
}

/**
 * Gets dynamic button styles that adapt to light/dark backgrounds
 * Uses the background brightness to determine appropriate hover/active colors
 * @param backgroundColor - The background color the button will be placed on
 * @param variant - Optional variant: 'primary', 'secondary', or 'accent'
 * @returns Complete button styles
 */
export function getDynamicButtonStyles(
  backgroundColor: string,
  variant?: 'primary' | 'secondary' | 'accent'
): ButtonStyles {
  // Determine if background is bright or dark
  const isBackgroundDark = !isBackgroundBright(backgroundColor);
  
  // Select appropriate base color based on variant
  let baseColor: string;
  if (variant === 'secondary') {
    baseColor = isBackgroundDark ? '#4a5568' : '#718096';
  } else if (variant === 'accent') {
    baseColor = isBackgroundDark ? '#ed8936' : '#dd6b20';
  } else {
    // Primary (default)
    baseColor = isBackgroundDark ? '#4299e1' : '#3182ce';
  }

  return getButtonStyles({ baseColor });
}

/**
 * Gets colors for an activated/pressed button state that inverts the color scheme
 * If base color is bright → returns dark colors
 * If base color is dark → returns bright colors
 * @param baseColor - The base button color in hex format
 * @returns Activated state colors with inverted brightness
 */
export function getActivatedButtonColors(baseColor: string): { background: string; text: string } {
  const isBright = isBackgroundBright(baseColor);
  
  // Invert: if bright, make dark; if dark, make bright
  const activatedBackground = isBright 
    ? adjustBrightness(baseColor, -40)  // Much darker
    : adjustBrightness(baseColor, 40);  // Much brighter
  
  return {
    background: activatedBackground,
    text: getContrastTextColor(activatedBackground)
  };
}

/**
 * Gets just the text color for an activated button (for icon color changes)
 * @param baseColor - The background color to check against
 * @returns Text color that contrasts with inverted background
 */
export function getActivatedTextColor(baseColor: string): string {
  const activatedColors = getActivatedButtonColors(baseColor);
  return activatedColors.text;
}

/**
 * Gets complete button styles with explicit activated state that inverts colors
 * Use this for buttons that should dramatically change when pressed
 * @param options - Button style options
 * @returns Button styles including inverted activated state
 */
export function getButtonStylesWithActivated(options: ButtonStyleOptions): ButtonStyles & { activated: React.CSSProperties } {
  const baseStyles = getButtonStyles(options);
  
  const activatedColors = getActivatedButtonColors(options.baseColor);
  
  return {
    ...baseStyles,
    activated: {
      backgroundColor: activatedColors.background,
      color: activatedColors.text,
      transform: 'scale(0.95)'
    }
  };
}
