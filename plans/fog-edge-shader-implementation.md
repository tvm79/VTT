
# Fog Edge Billowing Implementation (WebGL2 / PixiJS)

## Objective
Modify the existing fog shader so that animated fog only appears near the fog‑of‑war reveal boundary, creating a billowing fog edge instead of rendering fog everywhere.

The current shader already produces procedural fog using FBM noise. The missing piece is sampling the fog-of-war visibility mask and generating a soft edge gradient from it.

The implementation must remain GPU‑efficient and compatible with PixiJS Filter architecture.

---

# Rendering Architecture

Current system:

Map
Tokens
Lighting
FogMask
FogShader

Target system:

Map
Tokens
Lighting
VisibilityMaskTexture
FogEdgeShader

Visibility mask format:

0.0 = hidden
1.0 = revealed

Fog should appear only where hidden pixels border revealed pixels.

---

# Shader Modifications

## 1. Add New Uniforms

Add to the fragment shader:

uniform sampler2D visibilityMask;
uniform float edgeWidth;

Purpose:

visibilityMask → fog‑of‑war mask texture  
edgeWidth → width of fog expansion from reveal edge

Typical value:

edgeWidth = 0.02

---

## 2. Detect Reveal Edge

Inside main() after:

vec2 uv = vTextureCoord;

Add:

vec2 texel = 1.0 / resolution;

float center = texture2D(visibilityMask, uv).r;

float neighbors =
      texture2D(visibilityMask, uv + vec2(texel.x, 0.0)).r +
      texture2D(visibilityMask, uv - vec2(texel.x, 0.0)).r +
      texture2D(visibilityMask, uv + vec2(0.0, texel.y)).r +
      texture2D(visibilityMask, uv - vec2(0.0, texel.y)).r;

neighbors *= 0.25;

This samples adjacent pixels to detect the fog boundary.

---

## 3. Compute Edge Falloff

Add:

float edge = smoothstep(0.0, edgeWidth, neighbors - center);

Meaning:

edge = 0 → deep fog  
edge = 0 → fully revealed  
edge = 1 → reveal boundary

---

## 4. Keep Existing Fog Noise

Reuse existing fog generation:

vec2 wind = time * speed;
float n = fbm(uv * 3.0 + wind);
float fog = smoothstep(0.2, 0.8, n);

---

## 5. Apply Fog Only On Edge

Replace final color with:

float finalFog = fog * edge * alpha;

gl_FragColor = vec4(1.0, 1.0, 1.0, finalFog);

This restricts fog rendering to the reveal boundary.

---

# TypeScript Changes

Add the new uniforms when creating the filter:

const uniforms = {
  time: { value: 0, type: '1f' },
  alpha: { value: 0.5, type: '1f' },
  resolution: { value: { x: width, y: height }, type: 'v2' },
  speed: { value: { x: 0.7, y: 0.4 }, type: 'v2' },

  visibilityMask: { value: fogMaskTexture, type: 'sampler2D' },
  edgeWidth: { value: 0.02, type: '1f' }
};

Where:

fogMaskTexture = RenderTexture containing the fog‑of‑war reveal mask.

---

# Runtime Update

Each frame:

filter.uniforms.time += delta * 0.01;

The mask texture must update whenever fog changes:

- token movement
- light movement
- GM reveal tools

---

# Performance Constraints

Target GPU cost:

- ~5 texture samples
- 1 smoothstep
- existing fbm noise

Optional optimization:

if(center > 0.99) discard;

---

# Acceptance Criteria

Implementation is correct when:

1. Fog only appears near fog‑of‑war reveal boundaries
2. Fog animation remains identical to current shader
3. Hidden areas remain opaque
4. Revealed areas remain clear
5. Effect remains stable during pan and zoom
6. Performance impact is negligible
