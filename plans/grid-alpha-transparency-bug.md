# Grid Alpha / Transparency Bug — Coding AI Instruction

## Objective
Investigate and fix the grid transparency behavior so that **alpha controls opacity independently of RGB color brightness**.

## Observed Bug
Current behavior suggests the app is not using alpha correctly:

- Grid color = full white
- Changing alpha from 100% down to values above 0% causes little or no visible change
- At 0% the grid disappears
- Grid color = bright red
- Changing alpha again causes little or no visible change
- But when the red color is darkened toward black, the grid appears more transparent

## What This Means
The render path appears to be using **color brightness as a proxy for opacity** instead of using the alpha channel correctly.

That usually means one or more of these is wrong:

1. The shader ignores alpha or hardcodes it to `1.0`
2. RGB and alpha are combined incorrectly
3. Premultiplied alpha is mismatched
4. Blend mode is wrong
5. The UI stores opacity, but the render path never applies it

## Expected Behavior
Opacity must be controlled **only** by the alpha slider.

Examples:

- White + 100% alpha = solid white grid
- White + 50% alpha = semi-transparent white grid
- White + 10% alpha = faint white grid
- Red + 50% alpha = semi-transparent red grid
- Dark red + 50% alpha = equally transparent dark red, just darker in color

Changing RGB should alter color only, not transparency.

## Required Investigation
Inspect the full path from UI to render output:

1. Grid settings state/store
2. Color picker output
3. Alpha slider output
4. Uniform preparation / graphics tint application
5. Shader fragment output
6. Blend mode and premultiplied alpha handling

## Specific Things To Check

### 1. Confirm alpha is actually passed to rendering
Find where grid color and opacity are sent into rendering.
Verify that opacity is not only stored in state, but actually used in the draw path.

Bad pattern:
```ts
shader.uniforms.uColor = [r, g, b];
```

Correct pattern:
```ts
shader.uniforms.uColor = [r, g, b];
shader.uniforms.uAlpha = opacity;
```

### 2. Check fragment shader output
Look for a bug like this:

```glsl
gl_FragColor = vec4(color.rgb, 1.0);
```

That would explain why alpha appears ignored except at some special case.

For straight alpha:
```glsl
gl_FragColor = vec4(color.rgb, alpha);
```

For premultiplied alpha:
```glsl
gl_FragColor = vec4(color.rgb * alpha, alpha);
```

### 3. Check for premultiplied alpha mismatch
If PixiJS expects premultiplied output but the shader outputs straight alpha, transparency can look wrong.

If using Pixi shader output for normal blending, prefer:
```glsl
vec3 premultiplied = uColor * uAlpha;
gl_FragColor = vec4(premultiplied, uAlpha);
```

### 4. Check blend mode
Ensure the grid uses normal alpha blending unless there is a deliberate reason not to.

Expected:
```ts
displayObject.blendMode = PIXI.BLEND_MODES.NORMAL;
```

Investigate if it is using additive or another custom blend mode.

### 5. Check whether tint/color multiplication is happening twice
If color is applied in both CPU code and shader, brightness-dependent transparency artifacts can appear.
Make sure the final RGB is not being multiplied in a way that visually simulates opacity.

### 6. Check whether alpha slider values are normalized correctly
Confirm the alpha slider value is converted from `0–100` to `0.0–1.0`.

Correct:
```ts
const alpha = sliderValue / 100;
```

Wrong:
```ts
const alpha = sliderValue;
```

Also confirm the render path does not clamp or overwrite alpha afterward.

## Fix Target
Refactor the grid render path so color and opacity are explicitly separate:

### CPU side
```ts
const rgb = hexToRgb(gridColor); // normalized 0..1
const alpha = gridOpacity;       // normalized 0..1

shader.uniforms.uColor = [rgb.r, rgb.g, rgb.b];
shader.uniforms.uAlpha = alpha;
```

### Shader side
```glsl
uniform vec3 uColor;
uniform float uAlpha;

// premultiplied alpha output
vec3 outRgb = uColor * uAlpha;
gl_FragColor = vec4(outRgb, uAlpha);
```

## Validation Checklist
After the fix, verify all of these:

- White at 100%, 75%, 50%, 25%, 10% visibly changes opacity
- Red at 100%, 75%, 50%, 25%, 10% visibly changes opacity
- Dark red at 50% is darker than bright red at 50%, but not more transparent
- Black at 50% remains 50% opacity, just visually dark
- Alpha behavior is identical regardless of hue
- Grid lines only change opacity, not unexpected scene coloration

## Add Temporary Debug Logging
Add logs at the point where render values are final:

```ts
console.log("gridColorHex", gridColor);
console.log("gridRGB", rgb);
console.log("gridOpacity", gridOpacity);
console.log("shader uniforms", shader.uniforms);
```

Expected example:
```ts
gridRGB = { r: 1, g: 1, b: 1 }
gridOpacity = 0.5
```

## Definition of Done
This task is complete only when:

1. Alpha slider produces visible transparency changes for all colors
2. Transparency no longer depends on RGB brightness
3. Shader/blend path is internally consistent
4. No regressions are introduced in grid rendering, zooming, or overlay composition
