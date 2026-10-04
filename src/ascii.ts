import {
  CHARSET_PRESETS,
  resolveTheme,
  sampleThemeColor,
  type CharsetPreset,
  type EffectTheme,
  type ThemeName,
} from './themes.js'

export type AsciiRevealMode = 'edges' | 'center-out' | 'top-down' | 'diagonal'
export type AsciiCursorEffect = 'parallax' | 'spotlight' | 'repel' | 'both'

export interface AsciiOptions {
  canvas: HTMLCanvasElement
  imageSrc: string
  chars?: string
  charsetPreset?: CharsetPreset
  theme?: ThemeName | EffectTheme
  fontSize?: number
  fontFamily?: string
  brightnessBoost?: number
  posterize?: number
  parallaxStrength?: number
  scale?: number
  revealMode?: AsciiRevealMode
  cursorEffect?: AsciiCursorEffect
  cursorRadius?: number
  glitchIntensity?: number
  invertLuminance?: boolean
  colorFn?: (luminance: number, distFromCenter: number) => string
}

export interface AsciiController {
  (): void
  pause: () => void
  resume: () => void
  replay: () => void
  triggerGlitch: () => void
  setOptions: (next: Partial<AsciiOptions>) => void
  exportDataURL: (type?: string) => string
  destroy: () => void
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_glyphs;
uniform vec2 u_resolution;
uniform vec2 u_cellSize;
uniform vec2 u_gridSize;
uniform vec2 u_cursorPx;
uniform float u_cursorActive;
uniform float u_cursorRadius;
uniform float u_cursorMode;
uniform float u_numChars;
uniform float u_brightnessBoost;
uniform float u_posterize;
uniform float u_revealT;
uniform float u_revealMode;
uniform float u_parallaxX;
uniform float u_parallaxY;
uniform float u_glitchSeed;
uniform float u_glitchIntensity;
uniform float u_scale;
uniform float u_invert;
uniform vec3 u_colorLow;
uniform vec3 u_colorHigh;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 px = v_uv * u_resolution;

  if (u_cursorMode == 0.0 || u_cursorMode == 3.0) {
    px -= vec2(u_parallaxX, u_parallaxY * 0.6);
  }

  if (u_cursorActive > 0.5 && (u_cursorMode == 2.0 || u_cursorMode == 3.0)) {
    vec2 delta = px - u_cursorPx;
    float dist = length(delta);
    if (dist < u_cursorRadius && dist > 0.001) {
      float push = pow(1.0 - dist / u_cursorRadius, 2.0) * 18.0;
      px -= normalize(delta) * push;
    }
  }

  float rowIdx = floor(px.y / u_cellSize.y);
  if (u_glitchSeed > 0.0 && u_glitchIntensity > 0.0) {
    float glitchH = hash(vec2(rowIdx, u_glitchSeed));
    float glitchActive = step(1.0 - u_glitchIntensity, glitchH);
    float glitchOffset = (hash(vec2(rowIdx + 100.0, u_glitchSeed)) - 0.5) * u_cellSize.x * 8.0;
    px.x -= glitchActive * glitchOffset;
  }

  vec2 cellIdx = floor(px / u_cellSize);
  vec2 cellFrac = fract(px / u_cellSize);

  if (cellIdx.x < 0.0 || cellIdx.y < 0.0 || cellIdx.x >= u_gridSize.x || cellIdx.y >= u_gridSize.y) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 imageUV = (cellIdx + 0.5) / u_gridSize;
  imageUV = (imageUV - 0.5) / u_scale + 0.5;
  if (imageUV.x < 0.0 || imageUV.x > 1.0 || imageUV.y < 0.0 || imageUV.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec4 texColor = texture2D(u_image, imageUV);
  if (texColor.a < 0.04) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
  if (u_invert > 0.5) {
    lum = 1.0 - lum;
  }
  lum = min(1.0, lum * u_brightnessBoost * texColor.a);

  if (u_cursorActive > 0.5 && (u_cursorMode == 1.0 || u_cursorMode == 3.0)) {
    vec2 cellCenterPx = (cellIdx + 0.5) * u_cellSize;
    float cDist = length(cellCenterPx - u_cursorPx);
    if (cDist < u_cursorRadius) {
      float spot = (1.0 - cDist / u_cursorRadius) * 0.38;
      lum = min(1.0, lum + spot);
    }
  }

  lum = floor(lum * u_posterize + 0.5) / u_posterize;
  if (lum < 0.03) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 normCell = cellIdx / u_gridSize;
  float waveDist = min(normCell.x, 1.0 - normCell.x);
  if (u_revealMode == 1.0) {
    waveDist = length(normCell - vec2(0.5)) * 0.7;
  } else if (u_revealMode == 2.0) {
    waveDist = normCell.y * 0.6;
  } else if (u_revealMode == 3.0) {
    waveDist = (normCell.x + normCell.y) * 0.35;
  }

  float cellSeed = hash(cellIdx) * 0.15;
  float threshold = waveDist + cellSeed;
  float revealWave = u_revealT * 0.38;
  if (threshold > revealWave) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float cellReveal = min(1.0, (revealWave - threshold) * 6.0);

  vec2 mid = u_gridSize * 0.5;
  float distFromCenter = length((cellIdx - mid) / mid);
  float depthFade = max(0.3, 1.0 - distFromCenter * 0.5);
  float bright = clamp(lum * cellReveal * depthFade, 0.0, 1.0);

  float charF = floor(min(1.0, lum) * (u_numChars - 1.0));
  float atlasU = (charF + cellFrac.x) / u_numChars;
  float glyphA = texture2D(u_glyphs, vec2(atlasU, cellFrac.y)).a;

  if (glyphA < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 rgb = mix(u_colorLow, u_colorHigh, bright) / 255.0;
  gl_FragColor = vec4(rgb * glyphA, glyphA);
}`

function revealModeToFloat(mode: AsciiRevealMode): number {
  if (mode === 'center-out') return 1
  if (mode === 'top-down') return 2
  if (mode === 'diagonal') return 3
  return 0
}

function cursorModeToFloat(mode: AsciiCursorEffect): number {
  if (mode === 'spotlight') return 1
  if (mode === 'repel') return 2
  if (mode === 'both') return 3
  return 0
}

export function createAsciiRenderer(opts: AsciiOptions): AsciiController {
  let state = {
    imageSrc: opts.imageSrc,
    chars:
      opts.charsetPreset
        ? CHARSET_PRESETS[opts.charsetPreset]
        : opts.chars ?? CHARSET_PRESETS.numeric,
    theme: resolveTheme(opts.theme),
    fontSize: opts.fontSize ?? 9,
    fontFamily: opts.fontFamily ?? 'DM Mono, monospace',
    brightnessBoost: opts.brightnessBoost ?? 2.2,
    posterize: opts.posterize ?? 32,
    parallaxStrength: opts.parallaxStrength ?? 8,
    scale: opts.scale ?? 1.15,
    revealMode: opts.revealMode ?? ('edges' as AsciiRevealMode),
    cursorEffect: opts.cursorEffect ?? ('both' as AsciiCursorEffect),
    cursorRadius: opts.cursorRadius ?? 140,
    glitchIntensity: opts.glitchIntensity ?? 0.08,
    invertLuminance: opts.invertLuminance ?? false,
    colorFn: opts.colorFn,
  }

  const canvas = opts.canvas
  if (state.colorFn) {
    return createCanvas2DRenderer(canvas, state)
  }

  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  })

  if (!gl) {
    return createCanvas2DRenderer(canvas, state)
  }

  let w = 0
  let h = 0
  let charW = 0
  let charH = 0
  let cols = 0
  let rows = 0
  let rafId = 0
  let paused = false
  let revealT = 0
  let cursorNX = 0
  let cursorNY = 0
  let targetNX = 0
  let targetNY = 0
  let cursorPxX = -1000
  let cursorPxY = -1000
  let cursorActive = 0
  let nextGlitchTime = 0
  let glitchSeed = -1
  let glitchTimeoutId: ReturnType<typeof setTimeout> | undefined
  let imageLoaded = false

  const onMouseMove = (e: MouseEvent) => {
    targetNX = (e.clientX / window.innerWidth - 0.5) * 2
    targetNY = (e.clientY / window.innerHeight - 0.5) * 2
    const rect = canvas.getBoundingClientRect()
    cursorPxX = e.clientX - rect.left
    cursorPxY = e.clientY - rect.top
    cursorActive =
      cursorPxX >= 0 &&
      cursorPxX <= rect.width &&
      cursorPxY >= 0 &&
      cursorPxY <= rect.height
        ? 1
        : 0
  }

  const onMouseLeave = () => {
    cursorActive = 0
  }

  document.addEventListener('mousemove', onMouseMove, { passive: true })
  canvas.addEventListener('mouseleave', onMouseLeave, { passive: true })

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  function compile(src: string, type: number): WebGLShader {
    const s = gl!.createShader(type)!
    gl!.shaderSource(s, src)
    gl!.compileShader(s)
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      throw new Error(gl!.getShaderInfoLog(s)!)
    }
    return s
  }

  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(VERT, gl.VERTEX_SHADER))
  gl.attachShader(prog, compile(FRAG, gl.FRAGMENT_SHADER))
  gl.linkProgram(prog)
  gl.useProgram(prog)

  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const aPos = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uResolution = gl.getUniformLocation(prog, 'u_resolution')!
  const uCellSize = gl.getUniformLocation(prog, 'u_cellSize')!
  const uGridSize = gl.getUniformLocation(prog, 'u_gridSize')!
