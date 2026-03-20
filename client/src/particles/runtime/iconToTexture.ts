import { icon, type IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBolt,
  faCircle,
  faCloud,
  faFire,
  faGhost,
  faHeart,
  faMoon,
  faSkull,
  faSnowflake,
  faSquare,
  faStar,
  faSun,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';

// Font Awesome icon names available as particle textures
export const PARTICLE_ICON_NAMES = [
  'circle',
  'square',
  'star',
  'heart',
  'fire',
  'snowflake',
  'bolt',
  'cloud',
  'sun',
  'moon',
  'skull',
  'ghost',
  'magic',
  'sparkles',
] as const;

const ICON_DEFINITIONS: Record<(typeof PARTICLE_ICON_NAMES)[number], IconDefinition> = {
  circle: faCircle,
  square: faSquare,
  star: faStar,
  heart: faHeart,
  fire: faFire,
  snowflake: faSnowflake,
  bolt: faBolt,
  cloud: faCloud,
  sun: faSun,
  moon: faMoon,
  skull: faSkull,
  ghost: faGhost,
  magic: faWandMagicSparkles,
  sparkles: faStar,
};

// Convert a Font Awesome icon to a PNG data URL usable as a particle texture
export async function iconToDataURL(iconName: string, size: number = 64): Promise<string> {
  const definition = ICON_DEFINITIONS[iconName as keyof typeof ICON_DEFINITIONS];
  if (!definition) {
    console.warn(`Icon not found: ${iconName}`);
    return '';
  }

  const rendered = icon(definition, {
    styles: {
      color: '#ffffff',
    },
  });
  const svg = rendered.html?.[0];
  if (!svg) return '';
  
  // Create a canvas
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  // Create an image from SVG
  const img = new Image();
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  return new Promise((resolve) => {
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('');
    };
    img.src = url;
  });
}
