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

float hexLineStyleMask(float edgeCoord, float edgeIndex)
{
    float styleAmount = clamp(uGridStyleAmount, 0.0, 1.0);

    if (uGridStyle < 0.5) {
        return 1.0;
    }

    float phase = fract(edgeCoord + edgeIndex * 0.137);

    if (uGridStyle < 1.5) {
        // Dashed: keep a long visible segment so the edge reads as a line.
        float onWidth = mix(0.96, 0.74, styleAmount);
        return step(phase, onWidth);
    }

    // Dotted: render compact dots centered along each edge.
    float dot = abs(phase - 0.5);
    float radius = mix(0.13, 0.05, styleAmount);
    return 1.0 - smoothstep(radius, radius + 0.04, dot);
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
        0.66666666667 * point.x,
        -0.33333333333 * point.x + 0.57735026919 * point.y
    );
}

vec3 axialToCube(vec2 axial)
{
    return vec3(axial.x, -axial.x - axial.y, axial.y);
}

vec2 axialToPixel(vec2 axial)
{
    return vec2(
        1.5 * axial.x,
        0.86602540378 * (2.0 * axial.y + axial.x)
    );
}

float sdSegment(vec2 p, vec2 a, vec2 b, out float t)
{
    vec2 pa = p - a;
    vec2 ba = b - a;
    float denom = max(dot(ba, ba), 0.000001);
    t = clamp(dot(pa, ba) / denom, 0.0, 1.0);
    return length(pa - ba * t);
}

float hexBoundaryDistance(vec2 p, out float edgeCoord, out float edgeIndex)
{
    const float H = 0.43301270189;
    const float S = 0.21650635095;

    vec2 v0 = vec2(0.0, -H);
    vec2 v1 = vec2(0.5, -S);
    vec2 v2 = vec2(0.5, S);
    vec2 v3 = vec2(0.0, H);
    vec2 v4 = vec2(-0.5, S);
    vec2 v5 = vec2(-0.5, -S);

    float best = 1e9;
    float t = 0.0;
    float d;

    d = sdSegment(p, v0, v1, t);
    if (d < best) { best = d; edgeCoord = t; edgeIndex = 0.0; }

    d = sdSegment(p, v1, v2, t);
    if (d < best) { best = d; edgeCoord = t; edgeIndex = 1.0; }

    d = sdSegment(p, v2, v3, t);
    if (d < best) { best = d; edgeCoord = t; edgeIndex = 2.0; }

    d = sdSegment(p, v3, v4, t);
    if (d < best) { best = d; edgeCoord = t; edgeIndex = 3.0; }

    d = sdSegment(p, v4, v5, t);
    if (d < best) { best = d; edgeCoord = t; edgeIndex = 4.0; }

    d = sdSegment(p, v5, v0, t);
    if (d < best) { best = d; edgeCoord = t; edgeIndex = 5.0; }

    return best;
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

    if (uGridStyle < 1.5) {
        // Dashed: apply dash pattern to the lines
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

    // Dotted: render circular dots repeated along each grid line,
    // with larger dots at the grid crossings (corners).
    // styleAmount increases density while reducing dot radius.
    float dotCount = mix(2.0, 14.0, styleAmount);
    float dotRadius = mix(0.090, 0.015, styleAmount);
    float lineDotRadius = mix(0.070, 0.012, styleAmount);

    // Anti-aliasing width in cell-space units.
    float aaCell = max(0.002, 1.35 / max(uZoom * uGridSize, 1.0));

    // Distances to nearest vertical/horizontal line in cell space.
    float dxLine = min(localCell.x, 1.0 - localCell.x);
    float dyLine = min(localCell.y, 1.0 - localCell.y);

    // Distance to the four corners of the cell (grid crossings).
    vec2 cellOrigin = floor(gridCoord);
    vec2 p0 = gridCoord - cellOrigin;           // bottom-left corner (0,0)
    vec2 p1 = gridCoord - (cellOrigin + vec2(1.0, 0.0)); // bottom-right
    vec2 p2 = gridCoord - (cellOrigin + vec2(0.0, 1.0)); // top-left
    vec2 p3 = gridCoord - (cellOrigin + vec2(1.0, 1.0)); // top-right
    
    float distToCorner0 = length(p0);
    float distToCorner1 = length(p1);
    float distToCorner2 = length(p2);
    float distToCorner3 = length(p3);
    
    // Minimum distance to any corner (the nearest crossing).
    float distToNearestCorner = min(min(distToCorner0, distToCorner1), min(distToCorner2, distToCorner3));

    // Larger dots at the grid crossings (corners).
    float cornerDots = 1.0 - smoothstep(dotRadius, dotRadius + aaCell, distToNearestCorner);

    // Along-line offsets to nearest dot center in cell-space units.
    float yPhase = fract(localCell.y * dotCount);
    float xPhase = fract(localCell.x * dotCount);
    float dyDot = abs(yPhase - 0.5) / dotCount;
    float dxDot = abs(xPhase - 0.5) / dotCount;

    // Circular distance fields for vertical and horizontal dotted lines.
    float verticalDist = length(vec2(dxLine, dyDot));
    float horizontalDist = length(vec2(dxDot, dyLine));

    // Use smaller radius for line dots.
    float verticalDots = 1.0 - smoothstep(lineDotRadius, lineDotRadius + aaCell, verticalDist);
    float horizontalDots = 1.0 - smoothstep(lineDotRadius, lineDotRadius + aaCell, horizontalDist);

    // Combine: larger crossing dots + smaller line dots.
    return max(cornerDots, max(verticalDots, horizontalDots));
}

float hexGridAlpha(vec2 world)
{
    vec2 normalized = world / max(uGridSize, 0.0001);

    vec2 axial = pixelToAxial(normalized);
    vec3 cube = cubeRound(axialToCube(axial));
    vec2 center = axialToPixel(vec2(cube.x, cube.z));

    vec2 local = normalized - center;
    float edgeCoord = 0.0;
    float edgeIndex = 0.0;
    float d = hexBoundaryDistance(local, edgeCoord, edgeIndex);
    float pixelScale = max(uZoom * uGridSize, 1.0);
    float styleAmount = clamp(uGridStyleAmount, 0.0, 1.0);
    float thickness = mix(0.9, 1.8, styleAmount) / pixelScale;
    float aa = 1.0 / pixelScale;

    // Render the SDF boundary as a thin line band.
    float line = 1.0 - smoothstep(thickness, thickness + aa, abs(d));

    if (uGridStyle > 0.5) {
        line *= hexLineStyleMask(edgeCoord, edgeIndex);
    }

    return line;
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
