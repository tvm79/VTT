import * as PIXI from 'pixi.js';

export type GridType = 'square' | 'hex';
export type GridStyle = 'solid' | 'dashed' | 'dotted';

export interface GridConfig {
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridColor: number;
  gridEnabled: boolean;
  gridType: GridType;
  gridStyle?: GridStyle;
  gridStyleAmount?: number;
  gridOpacity?: number;
}

const GRID_VERTEX_SHADER = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const GRID_FRAGMENT_SHADER = `
precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

uniform vec2 uCamera;
uniform float uZoom;
uniform float uGridSize;
uniform vec2 uResolution;
uniform vec2 uGridOffset;
uniform vec4 uGridColor;
uniform float uGridEnabled;
uniform float uGridType;
uniform float uGridStyle;
uniform float uGridStyleAmount;
uniform float uGridOpacity;

float lineStyleMask(float axisCoord)
{
    float styleAmount = clamp(uGridStyleAmount, 0.0, 1.0);

    if (uGridStyle < 0.5) {
        return 1.0;
    }

    if (uGridStyle < 1.5) {
        float frequency = mix(0.18, 1.6, styleAmount);
        float phase = fract(axisCoord * frequency);
        float dash = abs(phase - 0.5);
        float dashWidth = mix(0.30, 0.08, styleAmount);
        return 1.0 - smoothstep(dashWidth, dashWidth + 0.12, dash);
    }

    float frequency = mix(0.35, 2.6, styleAmount);
    float phase = fract(axisCoord * frequency);
    float dotPhase = abs(phase - 0.5);
    float dotRadius = mix(0.24, 0.05, styleAmount);
    return 1.0 - smoothstep(dotRadius, dotRadius + 0.12, dotPhase);
}

vec3 cubeRound(vec3 cube)
{
    vec3 rounded = floor(cube + 0.5);
    vec3 diff = abs(rounded - cube);

    if (diff.x > diff.y && diff.x > diff.z) {
        rounded.x = -rounded.y - rounded.z;
    } else if (diff.y > diff.z) {
        rounded.y = -rounded.x - rounded.z;
    } else {
        rounded.z = -rounded.x - rounded.y;
    }

    return rounded;
}

vec2 pixelToAxial(vec2 point)
{
    return vec2(
        0.57735026919 * point.x - 0.33333333333 * point.y,
        0.66666666667 * point.y
    );
}

vec3 axialToCube(vec2 axial)
{
    return vec3(axial.x, -axial.x - axial.y, axial.y);
}

vec2 axialToPixel(vec2 axial)
{
    return vec2(
        1.73205080757 * (axial.x + 0.5 * axial.y),
        1.5 * axial.y
    );
}

float sdHex(vec2 point)
{
    vec2 p = abs(point);
    return max(p.x * 0.86602540378 + p.y * 0.5, p.y) - 1.0;
}

float squareGridAlpha(vec2 world)
{
    vec2 gridCoord = world / max(uGridSize, 0.0001);
    vec2 localCell = fract(gridCoord);
    vec2 dist = min(localCell, 1.0 - localCell);
    vec2 aa = vec2(max(0.0015, 1.25 / max(uZoom * uGridSize, 1.0)));
    float styleAmount = clamp(uGridStyleAmount, 0.0, 1.0);

    float vertical = 1.0 - smoothstep(0.0, aa.x * 1.25, dist.x);
    float horizontal = 1.0 - smoothstep(0.0, aa.y * 1.25, dist.y);

    if (uGridStyle < 0.5) {
        return max(vertical, horizontal);
    }

    float dashCount = mix(1.0, 5.0, styleAmount);
    float dashWidth = mix(0.42, 0.10, styleAmount);
    float dashEdge = 0.12;

    float verticalPhase = fract(localCell.y * dashCount);
    float horizontalPhase = fract(localCell.x * dashCount);
    float verticalMask = 1.0 - smoothstep(dashWidth, dashWidth + dashEdge, abs(verticalPhase - 0.5));
    float horizontalMask = 1.0 - smoothstep(dashWidth, dashWidth + dashEdge, abs(horizontalPhase - 0.5));

    vertical *= verticalMask;
    horizontal *= horizontalMask;

    return max(vertical, horizontal);
}

float hexGridAlpha(vec2 world)
{
    vec2 normalized = world / max(uGridSize, 0.0001);
    vec2 axial = pixelToAxial(normalized);
    vec3 roundedCube = cubeRound(axialToCube(axial));
    vec2 center = axialToPixel(vec2(roundedCube.x, roundedCube.z));
    vec2 local = normalized - center;

    float edgeDistance = abs(sdHex(local));
    float aa = max(0.002, 1.75 / max(uZoom * uGridSize, 1.0));
    float border = 1.0 - smoothstep(0.0, aa, edgeDistance);
    return border;
}

void main(void)
{
    if (uGridEnabled < 0.5) {
        finalColor = vec4(0.0);
        return;
    }

    vec2 screen = gl_FragCoord.xy;
    // Flip Y coordinate: WebGL uses bottom-left origin, but screen coordinates use top-left
    screen.y = uResolution.y - screen.y;
    vec2 world = (screen / uZoom) + uCamera + uGridOffset;

    float alpha = uGridType > 0.5
        ? hexGridAlpha(world)
        : squareGridAlpha(world);

    // FIX: Use discard to explicitly drop non-grid pixels instead of relying on alpha blending
    // This ensures pixels outside grid lines are fully transparent
    // Use discard for non-grid pixels to avoid tinting, but ensure full alpha for grid lines
    if (alpha <= 0.0) {
        discard;
    }
    
    // Use straight alpha for proper transparency independent of color brightness
    // Don't multiply RGB by alpha - keep full color values and control opacity only via alpha channel
    finalColor = vec4(
        uGridColor.rgb,
        uGridOpacity
    );
}
`;

const styleToIndex = (style: GridStyle): number => {
  switch (style) {
    case 'dashed':
      return 1;
    case 'dotted':
      return 2;
    case 'solid':
    default:
      return 0;
  }
};

const hexToRgba = (hex: number, alpha = 1): [number, number, number, number] => {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
    alpha,
  ];
};

export class GridOverlay {
  private app: PIXI.Application;
  private sprite: PIXI.Sprite;
  private filter: PIXI.Filter;
  private resizeHandler: () => void;
  private _enabled = true;

  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1;

  constructor(app: PIXI.Application, config?: Partial<GridConfig>) {
    this.app = app;

    this.filter = PIXI.Filter.from({
      gl: {
        name: 'grid-overlay-filter',
        vertex: GRID_VERTEX_SHADER,
        fragment: GRID_FRAGMENT_SHADER,
      },
      resources: {
        gridUniforms: {
          uCamera: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
          uZoom: { value: 1, type: 'f32' },
          uGridSize: { value: config?.gridSize ?? 50, type: 'f32' },
          uResolution: { value: new Float32Array([app.screen.width, app.screen.height]), type: 'vec2<f32>' },
          uGridOffset: {
            value: new Float32Array([config?.gridOffsetX ?? 0, config?.gridOffsetY ?? 0]),
            type: 'vec2<f32>'
          },
          uGridColor: {
            value: new Float32Array(hexToRgba(config?.gridColor ?? 0x444444, 1)),
            type: 'vec4<f32>'
          },
          uGridEnabled: { value: config?.gridEnabled ?? true ? 1 : 0, type: 'f32' },
          uGridType: { value: config?.gridType === 'hex' ? 1 : 0, type: 'f32' },
          uGridStyle: { value: styleToIndex(config?.gridStyle ?? 'solid'), type: 'f32' },
          uGridStyleAmount: { value: config?.gridStyleAmount ?? 0.5, type: 'f32' },
          uGridOpacity: { value: config?.gridOpacity ?? 0.55, type: 'f32' },
        },
      },
    });

    this.sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.sprite.eventMode = 'none';
    this.sprite.filters = [this.filter];
    this.sprite.zIndex = 2;
    this.sprite.filterArea = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);
    this.syncSize();

    this._enabled = config?.gridEnabled ?? true;
    this.sprite.visible = this._enabled;

    this.resizeHandler = () => {
      this.syncSize();
    };

    window.addEventListener('resize', this.resizeHandler);
  }

  getContainer(): PIXI.Sprite {
    return this.sprite;
  }

  getEnabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.sprite.visible = enabled;
    this.uniforms.uGridEnabled = enabled ? 1 : 0;
  }

  updateCamera(cameraX: number, cameraY: number, zoom: number): void {
    this.cameraX = cameraX;
    this.cameraY = cameraY;
    this.zoom = zoom;

    const worldCameraX = -cameraX / Math.max(zoom, 0.0001);
    const worldCameraY = -cameraY / Math.max(zoom, 0.0001);
    const uniform = this.uniforms.uCamera as Float32Array;

    uniform[0] = worldCameraX;
    uniform[1] = worldCameraY;
    this.uniforms.uZoom = zoom;

    const safeZoom = Math.max(zoom, 0.0001);
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    const textureWidth = this.sprite.texture.width || 1;
    const textureHeight = this.sprite.texture.height || 1;

    // Scale sprite to cover the visible area in world space
    // As zoom increases, sprite gets smaller in screen space, showing less of the world
    this.sprite.scale.set(
      screenWidth / textureWidth / safeZoom,
      screenHeight / textureHeight / safeZoom,
    );
    
    // Position sprite to move with the stage
    // This keeps the grid anchored to the world, not the screen
    this.sprite.position.set(-cameraX / safeZoom, -cameraY / safeZoom);
  }

  setGridSize(size: number): void {
    this.uniforms.uGridSize = Math.max(1, size);
  }

  setGridOffset(offsetX: number, offsetY: number): void {
    const uniform = this.uniforms.uGridOffset as Float32Array;
    uniform[0] = offsetX;
    uniform[1] = offsetY;
  }

  setGridColor(color: number): void {
    const uniform = this.uniforms.uGridColor as Float32Array;
    const rgba = hexToRgba(color, 1);
    uniform[0] = rgba[0];
    uniform[1] = rgba[1];
    uniform[2] = rgba[2];
    uniform[3] = rgba[3];
  }

  setGridType(type: GridType): void {
    this.uniforms.uGridType = type === 'hex' ? 1 : 0;
  }

  setGridStyle(style: GridStyle): void {
    this.uniforms.uGridStyle = styleToIndex(style);
  }

  setGridStyleAmount(amount: number): void {
    this.uniforms.uGridStyleAmount = Math.max(0, Math.min(1, amount));
  }

  setGridOpacity(opacity: number): void {
    this.uniforms.uGridOpacity = opacity;
  }

  updateConfig(config: Partial<GridConfig>): void {
    if (config.gridSize !== undefined) {
      this.setGridSize(config.gridSize);
    }

    if (config.gridOffsetX !== undefined || config.gridOffsetY !== undefined) {
      this.setGridOffset(
        config.gridOffsetX ?? (this.uniforms.uGridOffset as Float32Array)[0],
        config.gridOffsetY ?? (this.uniforms.uGridOffset as Float32Array)[1],
      );
    }

    if (config.gridColor !== undefined) {
      this.setGridColor(config.gridColor);
    }

    if (config.gridEnabled !== undefined) {
      this.setEnabled(config.gridEnabled);
    }

    if (config.gridType !== undefined) {
      this.setGridType(config.gridType);
    }

    if (config.gridStyle !== undefined) {
      this.setGridStyle(config.gridStyle);
    }

    if (config.gridStyleAmount !== undefined) {
      this.setGridStyleAmount(config.gridStyleAmount);
    }

    if (config.gridOpacity !== undefined) {
      this.setGridOpacity(config.gridOpacity);
    }

    this.updateCamera(this.cameraX, this.cameraY, this.zoom);
  }

  destroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.sprite.destroy({ children: true });
    this.filter.destroy();
  }

  private syncSize(): void {
    this.sprite.filterArea = new PIXI.Rectangle(0, 0, this.app.screen.width, this.app.screen.height);

    const resolution = this.uniforms.uResolution as Float32Array;
    resolution[0] = this.app.screen.width;
    resolution[1] = this.app.screen.height;

    this.updateCamera(this.cameraX, this.cameraY, this.zoom);
  }

  private get uniforms(): {
    uCamera: Float32Array;
    uZoom: number;
    uGridSize: number;
    uResolution: Float32Array;
    uGridOffset: Float32Array;
    uGridColor: Float32Array;
    uGridEnabled: number;
    uGridType: number;
    uGridStyle: number;
    uGridStyleAmount: number;
    uGridOpacity: number;
  } {
    return this.filter.resources.gridUniforms.uniforms as {
      uCamera: Float32Array;
      uZoom: number;
      uGridSize: number;
      uResolution: Float32Array;
      uGridOffset: Float32Array;
      uGridColor: Float32Array;
      uGridEnabled: number;
      uGridType: number;
      uGridStyle: number;
      uGridStyleAmount: number;
      uGridOpacity: number;
    };
  }
}

export function createGridOverlay(app: PIXI.Application, config?: Partial<GridConfig>): GridOverlay {
  const gridOverlay = new GridOverlay(app, config);
  app.stage.addChild(gridOverlay.getContainer());
  return gridOverlay;
}
