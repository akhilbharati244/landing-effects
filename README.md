# landing-effects

This TypeScript library provides five HTML5 canvas visual effects for web pages. It has no external runtime dependencies and works with any web framework.

```bash
npm install landing-effects
```

## Theme Presets

All five effects support six curated theme palettes:

- `amber-gold`: Warm amber and gold palette (default).
- `emerald-phosphor`: Phosphor green terminal palette.
- `crimson-infrared`: High-contrast crimson infrared palette.
- `arctic-cyan`: Cool glacier cyan palette.
- `monochrome-ink`: Neutral monochrome silver palette.
- `solar-warm`: Deep solar orange and gold palette.

## Effects

### 1. ASCII Renderer (`createAsciiRenderer`)

The `createAsciiRenderer` function converts an image into interactive ASCII art with WebGL shaders, mouse parallax, cursor spotlight, cursor repulsion, and glitch bands.

```ts
import { createAsciiRenderer } from 'landing-effects'

const ascii = createAsciiRenderer({
  canvas: document.getElementById('ascii-canvas') as HTMLCanvasElement,
  imageSrc: '/assets/sculpture.jpg',
  theme: 'amber-gold',
  charsetPreset: 'matrix',
  revealMode: 'center-out',
  cursorEffect: 'both',
})
```

### 2. Pixel Reveal (`createPixelReveal`)

The `createPixelReveal` function animates an image across three stages: block fill, glitch refinement with chromatic split, and crisp final display.

```ts
import { createPixelReveal } from 'landing-effects'

const reveal = createPixelReveal({
  canvas: document.getElementById('pixel-canvas') as HTMLCanvasElement,
  imageSrc: '/assets/sculpture.jpg',
  pattern: 'radial',
  blockShape: 'square',
  theme: 'amber-gold',
  glitchRegion: 0.4,
})
```

### 3. Halftone Wave (`createHalftoneWave`)

The `createHalftoneWave` function renders an image as a geometric halftone grid with a sine-wave displacement field and a magnetic cursor lens.

```ts
import { createHalftoneWave } from 'landing-effects'

const halftone = createHalftoneWave({
  canvas: document.getElementById('halftone-canvas') as HTMLCanvasElement,
  imageSrc: '/assets/sculpture.jpg',
  theme: 'emerald-phosphor',
  shape: 'circle',
  gridSpacing: 10,
})
```

### 4. Dither Matrix (`createDitherMatrix`)

The `createDitherMatrix` function renders an image with ordered Bayer or stipple threshold matrices, radial entrance sweep, and a pointer brightness lens.

```ts
import { createDitherMatrix } from 'landing-effects'

const dither = createDitherMatrix({
  canvas: document.getElementById('dither-canvas') as HTMLCanvasElement,
  imageSrc: '/assets/sculpture.jpg',
  theme: 'monochrome-ink',
  algorithm: 'bayer-8x8',
  pixelScale: 3,
})
```

### 5. Contour Lines (`createContourLines`)

The `createContourLines` function renders an image as topographic ridgeline waveforms, isoline elevation contours, or directional vector needles.

```ts
import { createContourLines } from 'landing-effects'

const contour = createContourLines({
  canvas: document.getElementById('contour-canvas') as HTMLCanvasElement,
  imageSrc: '/assets/sculpture.jpg',
  theme: 'arctic-cyan',
  style: 'ridgeline',
  lineSpacing: 8,
  elevation: 26,
})
```

## Interactive Controller Methods

Each renderer function returns a controller object with these methods:

- `controller()` or `controller.destroy()`: Stop the animation loop and remove event listeners.
- `controller.pause()`: Pause the animation frame loop.
- `controller.resume()`: Resume a paused animation loop.
- `controller.replay()`: Restart the entrance animation from the first frame.
- `controller.setOptions(partialOptions)`: Update options at runtime without recreation of the canvas.
- `controller.exportDataURL(type?)`: Export the current canvas frame as a PNG data URL.

## Author

Akhil Bharati

## License

MIT
