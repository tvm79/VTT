# Chat Bar Dice Buttons Documentation

## Overview

The chat bar contains dice buttons (d4, d6, d8, d10, d12, d20) that allow users to quickly select dice for rolling.

## Files Involved

- `client/src/components/ChatPanel.tsx` - React component rendering the dice buttons
- `client/src/App.css` - Base styling (dynamic CSS is injected at runtime)

## Icon-Only Buttons

For small buttons that should display only icons (no text), use one of these CSS classes:

### Classes Available

| Class | Description | Icon Size |
|-------|-------------|-----------|
| `icon-only` | Generic icon-only button class | Inherited |
| `filter-btn` | Small 24x24 filter buttons (e.g., toolbar filters) | 14px |
| `tool-btn` | Standard toolbar buttons | 16px |

### Usage

```tsx
// Filter button (24x24)
<button className="filter-btn" title="Filter">
  <Icon name="filter" />
</button>

// Tool button
<button className="tool-btn" title="Tool">
  <Icon name="wrench" />
</button>

// Custom icon-only button
<button className="icon-only" title="Action">
  <Icon name="star" />
</button>
```

### How It Works

The CSS sets `font-size: 0` on these button classes, which hides any text content. The icon elements (SVG or elements with `.icon` class) have their font-size restored, so they remain visible.

### Adding New Icon-Only Buttons

When creating new small buttons (typically 24-32px), always use one of these classes to ensure they display only icons:

1. Use `filter-btn` for filter/toggle buttons in toolbars
2. Use `tool-btn` for general toolbar actions
3. Use `icon-only` for other small icon-only buttons

This ensures consistent styling and automatic icon-only behavior without needing to manually hide text.

## Auto Text Color for Buttons

For buttons with custom background colors (e.g., from themes), use the `getContrastTextColor` utility to automatically choose the appropriate text color:

```tsx
import { getContrastTextColor } from './utils/colorUtils';

// Example: Button with dynamic background
const MyButton = ({ backgroundColor, children }) => {
  const textColor = getContrastTextColor(backgroundColor);
  
  return (
    <button style={{ 
      background: backgroundColor, 
      color: textColor 
    }}>
      {children}
    </button>
  );
};

// Example: Using with theme colors
const themeAccent = '#6b8aff'; // Example bright blue
const textColor = getContrastTextColor(themeAccent);
// Returns '#000000' (dark text) for bright backgrounds

const themeDark = '#1a1a2e'; // Example dark purple
const textColor2 = getContrastTextColor(themeDark);
// Returns '#ffffff' (light text) for dark backgrounds
```

### How It Works

The utility uses the WCAG 2.0 relative luminance formula to calculate the brightness of the background color. If the luminance is above 0.5 (the ISO standard threshold), it returns dark text (#000000); otherwise, it returns light text (#ffffff).

You can customize the threshold and colors:
```tsx
// Custom threshold
const textColor = getContrastTextColor(backgroundColor, '#333', '#fff', 0.4);

// Custom text colors
const textColor = getContrastTextColor(backgroundColor, '#1a1a1a', '#f0f0f0');
```

## Adding New Dice Types

**To add a new die type (e.g., d100), you now only need to do TWO things:**

1. Add the number to the `DICE_TYPES` array in `ChatPanel.tsx`:
   ```ts
   const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100] as const;
   ```

2. Add the SVG file to `client/public/dice-icons/d100.svg`

That's it! The CSS is automatically generated based on the `DICE_TYPES` array.

## How It Works

### 1. Automatic CSS Generation

The component now generates the CSS for dice icons automatically:

```ts
const DICE_TYPES = [4, 6, 8, 10, 12, 20] as const;

function generateDiceIconCSS(): string {
  return DICE_TYPES.map(sides => `
  .chat-dice-btn[data-sides="${sides}"]::before {
    mask-image: url('/dice-icons/d${sides}.svg');
    -webkit-mask-image: url('/dice-icons/d${sides}.svg');
  }`).join('');
}
```

This CSS is injected into a `<style>` tag when the component mounts via `useEffect`.

### 2. Button Rendering (ChatPanel.tsx)

The dice buttons are rendered using the DICE_TYPES constant:

```tsx
{[4, 6, 8, 10, 12, 20].map(sides => {
  const count = selectedDice.filter(d => d === sides).length;
  return (
    <button
      key={sides}
      className={`chat-dice-btn ${count > 0 ? 'selected' : ''}`}
      data-sides={sides}
      onClick={() => handleAddDie(sides)}
      onContextMenu={(e) => {
        e.preventDefault();
        handleRemoveDie(sides);
      }}
    >
      {count > 1 && (
        <span className="chat-dice-count">{count}</span>
      )}
    </button>
  );
})}
```

- **Click**: Adds one die of that type
- **Right-click**: Removes one die of that type
- **Count badge**: Shows when more than 1 of the same die type is selected

### 2. Icon Coloring (CSS mask-image)

The dice icons are colored using CSS `mask-image` on a `::before` pseudo-element. This approach was chosen because:

1. It allows the icon color to be controlled via CSS (`color: var(--accent)`)
2. The badge remains visible (unlike applying mask directly to the button)

**Key CSS (App.css):**

```css
.chat-dice-btn {
  color: var(--accent);  /* Controls the dice icon color */
}

.chat-dice-btn::before {
  content: '';
  position: absolute;
  width: 22px;
  height: 22px;
  background-color: currentColor;  /* Uses the parent's color */
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

/* Each dice type has its own SVG mask */
.chat-dice-btn[data-sides="4"]::before {
  mask-image: url('/dice-icons/d4.svg');
  -webkit-mask-image: url('/dice-icons/d4.svg');
}

/* Repeat for d6, d8, d10, d12, d20 */
```

### 3. Badge Styling

The count badge is a child element, so it's not affected by the parent's mask:

```css
.chat-dice-count {
  position: absolute;
  top: -6px;
  right: -6px;
  background-color: var(--accent);
  color: white;
  font-size: 11px;
  font-weight: bold;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;  /* Ensures badge appears above everything */
}
```

## Common Issues & Solutions

### Issue: Badge not visible
**Cause**: Using `mask-image` directly on the button element would mask child elements including the badge.

**Solution**: Apply the mask to a `::before` pseudo-element instead of the button itself.

### Issue: Icons not colored
**Cause**: Missing `color` property on `.chat-dice-btn` or incorrect `mask-image` paths.

**Solution**: 
1. Ensure `.chat-dice-btn` has `color: var(--accent)`
2. Verify SVG paths in CSS match the actual file locations (`/dice-icons/d*.svg`)

### Issue: Icons appear black
**Cause**: The SVG files might have their own fill colors that override the mask.

**Solution**: The SVG files should be single-color (black on transparent). If they have colors, use a different approach or modify the SVGs.

## Modifying the Color

To change the dice icon color, modify the `--accent` CSS variable in `:root`:

```css
:root {
  --accent: #e94560;  /* Default pinkish-red */
}
```

Or set it directly on `.chat-dice-btn`:

```css
.chat-dice-btn {
  color: #your-color-here;
}
```

## Legacy: Adding New Dice Types (Manual CSS)

The CSS now auto-generates from DICE_TYPES, but there's also manual CSS in App.css as a fallback. To add a new die type manually:

1. Add the number to the array in ChatPanel.tsx
2. Add the CSS rule in App.css:
   ```css
   .chat-dice-btn[data-sides="100"]::before {
     mask-image: url('/dice-icons/d100.svg');
     -webkit-mask-image: url('/dice-icons/d100.svg');
   }
   ```
3. Add the SVG file to `client/public/dice-icons/d100.svg`
