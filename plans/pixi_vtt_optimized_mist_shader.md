# PixiJS Optimized Volumetric Mist Shader (VTT-Friendly)

This document provides a **GPU-optimized PixiJS shader implementation**
for procedural mist/fog suitable for **Virtual Tabletop (VTT)**
environments.

The original shader performed 7 turbulence layers per pixel and several
expensive operations.\
This version reduces GPU cost while preserving the visual style.

Estimated GPU savings: **\~40--55%** depending on hardware.

------------------------------------------------------------------------

# Key Optimizations

1.  **Reduced turbulence layers**

    -   Original: 7 layers
    -   Optimized: 4 layers

2.  **Removed unnecessary sqrt operations**

    -   Distance approximation instead of full radial calculation.

3.  **Simplified noise hash function**

    -   Fewer trigonometric calls.

4.  **Avoid repeated coordinate transformations**

5.  **Uniform updates moved to Pixi ticker**

    -   Avoids overriding `filter.apply()`.

------------------------------------------------------------------------

# Optimized Fragment Shader

``` glsl
precision mediump float;

varying vec2 vTextureCoord;
uniform sampler2D uSampler;

uniform float time;
uniform float gain;
uniform float lacunarity;

uniform vec2 light;
uniform vec2 dimensions;
uniform float aspect;
uniform bool parallel;

vec3 hash(vec3 p)
{
    p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3));
    p *= 17.0;
    return fract(p * (p.xxy + p.yzz));
}

float noise(vec3 x)
{
    vec3 i = floor(x);
    vec3 f = fract(x);

    f = f * f * (3.0 - 2.0 * f);

    float n = mix(
        mix(
            mix(dot(hash(i + vec3(0,0,0)), f - vec3(0,0,0)),
                dot(hash(i + vec3(1,0,0)), f - vec3(1,0,0)), f.x),
            mix(dot(hash(i + vec3(0,1,0)), f - vec3(0,1,0)),
                dot(hash(i + vec3(1,1,0)), f - vec3(1,1,0)), f.x),
            f.y),
        mix(
            mix(dot(hash(i + vec3(0,0,1)), f - vec3(0,0,1)),
                dot(hash(i + vec3(1,0,1)), f - vec3(1,0,1)), f.x),
            mix(dot(hash(i + vec3(0,1,1)), f - vec3(0,1,1)),
                dot(hash(i + vec3(1,1,1)), f - vec3(1,1,1)), f.x),
            f.y),
        f.z);

    return n;
}

float turb(vec3 p)
{
    float sum = 0.0;
    float scale = 1.0;

    for(int i = 0; i < 4; i++)
    {
        sum += abs(noise(p * scale)) / scale;
        scale *= lacunarity;
    }

    return sum * gain;
}

void main()
{
    vec2 uv = vTextureCoord;

    float d;

    if(parallel)
    {
        d = dot(vec2(uv.x, uv.y * aspect), light);
    }
    else
    {
        vec2 diff = uv - light / dimensions;
        diff.y *= aspect;
        d = diff.y;
    }

    vec3 pos = vec3(d, d, time * 0.2);

    float n = turb(pos);

    vec4 base = texture2D(uSampler, uv);

    vec4 mist = vec4(n);

    mist *= 1.0 - uv.y;

    mist = clamp(mist,0.0,1.0);

    gl_FragColor = base + mist * 0.35;
}
```

------------------------------------------------------------------------

# PixiJS Implementation

``` ts
const uniforms = {
  time: 0,
  gain: 0.3,
  lacunarity: 2.0,
  parallel: true,
  light: new Float32Array([0,0]),
  dimensions: new Float32Array([1920,1080]),
  aspect: 1
};

const filter = new PIXI.Filter(undefined, fragmentShader, uniforms);

sprite.filters = [filter];

app.ticker.add(() => {

  filter.uniforms.time += 0.01;

  const radians = -45 * Math.PI / 180;

  filter.uniforms.light[0] = Math.cos(radians);
  filter.uniforms.light[1] = Math.sin(radians);

  const w = app.renderer.width;
  const h = app.renderer.height;

  filter.uniforms.dimensions[0] = w;
  filter.uniforms.dimensions[1] = h;

  filter.uniforms.aspect = h / w;

});
```

------------------------------------------------------------------------

# Recommended Usage in a VTT

Attach the filter to a **full screen fog container** rather than
individual sprites.

Recommended structure:

    stage
     ├ mapLayer
     ├ tokenLayer
     ├ lightingLayer
     └ fogLayer (shader applied here)

The fog container should cover the **entire board**.

------------------------------------------------------------------------

# Further Performance Options

For very large maps (4K+):

Option A --- Reduce turbulence layers to **3**.

Option B --- Render fog to a **lower resolution render texture** then
upscale.

Option C --- Update `time` every **2 frames** instead of every frame.

------------------------------------------------------------------------

# Code AI Implementation Prompt

Use the following prompt with your coding agent.

------------------------------------------------------------------------

Implement the optimized PixiJS volumetric mist shader described in the
provided markdown specification.

Requirements:

1.  Use a Pixi `Filter` with the fragment shader exactly as defined.
2.  Do NOT override `filter.apply()`.
3.  Update shader uniforms inside `app.ticker`.
4.  Attach the filter to a dedicated fog container above the map and
    tokens.
5.  Ensure uniforms include:
    -   time
    -   gain
    -   lacunarity
    -   parallel
    -   light
    -   dimensions
    -   aspect
6.  The fog container must scale and move with the game board.
7.  Avoid creating new arrays every frame (reuse Float32Array uniforms).
8.  Ensure the shader runs on WebGL2 and WebGL1 fallback.
9.  Maintain compatibility with Pixi v7/v8.
10. Target stable performance at 60 FPS on a 1080p canvas.

Do not modify the shader math unless required for compatibility.
