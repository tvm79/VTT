import * as PIXI from 'pixi.js';

// Fragment shader for fog - based on PIXI v3 example
const FOG_FRAGMENT = `
precision mediump float;

varying vec2 vTextureCoord;

uniform float time;
uniform float alpha;
uniform vec2 resolution;
uniform vec2 speed;

// Simple noise
float hash(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0,0.0));
    float c = hash(i + vec2(0.0,1.0));
    float d = hash(i + vec2(1.0,1.0));

    vec2 u = f*f*(3.0-2.0*f);

    return mix(a,b,u.x) +
           (c-a)*u.y*(1.0-u.x) +
           (d-b)*u.x*u.y;
}

// Fractal noise
float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;

    for(int i=0;i<5;i++){
        v += noise(p) * a;
        p *= 2.0;
        a *= 0.5;
    }

    return v;
}

void main(){
    vec2 uv = vTextureCoord;
    
    // Animated fog using time uniform
    vec2 wind = time * speed;
    float n = fbm(uv * 3.0 + wind);
    float fog = smoothstep(0.2, 0.8, n);
    
    // Output with alpha from uniform
    gl_FragColor = vec4(1.0, 1.0, 1.0, fog * alpha);
}
`;

// Smoke shader - Adapted from: https://codepen.io/davidhartley/pen/seEki
// Uses gl_FragCoord for screen-space rendering (fog stays fixed while world moves)
const SMOKE_FRAGMENT = `
precision mediump float;

uniform vec2      resolution;
uniform float     time;
uniform float     alpha;
uniform vec2      speed;
uniform float     shift;
uniform float     direction;
uniform vec3      color1;
uniform vec3      color2;

float rand(vec2 n) {
    //This is just a compounded expression to simulate a random number based on a seed given as n
    return fract(cos(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 n) {
    //Uses the rand function to generate noise
    const vec2 d = vec2(0.0, 1.0);
    vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
    return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

float fbm(vec2 n) {
    //fbm stands for "Fractal Brownian Motion" https://en.wikipedia.org/wiki/Fractional_Brownian_motion
    float total = 0.0, amplitude = 1.0;
    for (int i = 0; i < 4; i++) {
        total += noise(n) * amplitude;
        n += n;
        amplitude *= 0.5;
    }
    return total;
}

void main() {
    // Use user's customizable colors
    vec3 c1 = color1;
    vec3 c2 = color2;
    
    // This is how "packed" the smoke is in our area
    vec2 p = gl_FragCoord.xy * 8.0 / resolution.xx;
    // The fbm function takes p as its seed and time
    float q = fbm(p - time * 0.1);
    vec2 r = vec2(fbm(p + q + time * speed.x - p.x - p.y), fbm(p + q - time * speed.y));
    
    // Mix user colors based on noise - remove hardcoded overrides
    vec3 c = mix(c1, c2, fbm(p + r));
    
    // Vertical gradient based on shift (1.0 = full gradient, 0.0 = no gradient)
    float grad = gl_FragCoord.y / resolution.y;
    float shiftFactor = shift * 0.3; // Scale shift to reasonable range (0-1.5)
    float gradientBlend = clamp(grad * shiftFactor, 0.0, 1.0);
    
    // Apply vertical fade - darker at top, lighter at bottom
    c = mix(c, c * 0.2, gradientBlend);
    
    gl_FragColor = vec4(c, 1.0);
    // Apply alpha uniform
    gl_FragColor.a *= alpha;
}
`;

// Create fog filter using AbstractFilter approach (PIXI v3 style)
export function createFogFilter(width: number, height: number): PIXI.Filter | null {
  try {
    // Define uniforms with proper types
    const uniforms = {
      time: { value: 0, type: '1f' as const },
      alpha: { value: 0.5, type: '1f' as const },
      resolution: { value: { x: width, y: height }, type: 'v2' as const },
      speed: { value: { x: 0.7, y: 0.4 }, type: 'v2' as const }
    };
    
    // Use Filter class
    const FilterClass = PIXI.Filter as any;
    
    const filter = new FilterClass(undefined, FOG_FRAGMENT, uniforms);
    
    return filter as PIXI.Filter;
  } catch (e) {
    console.error('Failed to create fog filter:', e);
    return null;
  }
}

// Create smoke filter - PIXI v8 format
export function createSmokeFilter(width: number, height: number): PIXI.Filter | null {
  try {
    // PIXI v8 uses Filter.from() with resources for uniforms
    const filter = PIXI.Filter.from({
      gl: {
        name: 'smoke-filter',
        vertex: `
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
        `,
        fragment: SMOKE_FRAGMENT,
      },
      resources: {
        smokeUniforms: {
          resolution: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
          time: { value: 0, type: 'f32' },
          alpha: { value: 0.5, type: 'f32' },
          speed: { value: new Float32Array([0.7, 0.4]), type: 'vec2<f32>' },
          shift: { value: 1.6, type: 'f32' },
          direction: { value: 180, type: 'f32' },
          color1: { value: new Float32Array([0.494, 0.0, 0.38]), type: 'vec3<f32>' },
          color2: { value: new Float32Array([0.678, 0.0, 0.631]), type: 'vec3<f32>' },
        },
      },
    });
    
    return filter;
  } catch (e) {
    console.error('Failed to create smoke filter:', e);
    return null;
  }
}

// Create fog sprite with noise texture (fallback)
export function createFogSprite(width: number, height: number): PIXI.Sprite | null {
  try {
    // Create a canvas for noise
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    
    // Generate noise
    const imageData = ctx.createImageData(256, 256);
    const data = imageData.data;
    
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        let noise = Math.random();
        noise = noise * 0.7 + (Math.sin(x * 0.1) * Math.cos(y * 0.1) + 1) * 0.15;
        const value = noise > 0.35 && noise < 0.75 ? Math.floor(noise * 255) : 0;
        
        const idx = (y * 256 + x) * 4;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = value;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
    sprite.width = width;
    sprite.height = height;
    sprite.position.set(0, 0);
    sprite.alpha = 0.5;
    sprite.tint = 0x888888;
    sprite.eventMode = 'none';
    sprite.interactive = false;
    
    return sprite;
  } catch (e) {
    console.error('Failed to create fog sprite:', e);
    return null;
  }
}
