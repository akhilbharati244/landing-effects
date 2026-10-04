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
  const uCursorPx = gl.getUniformLocation(prog, 'u_cursorPx')!
  const uCursorActive = gl.getUniformLocation(prog, 'u_cursorActive')!
  const uCursorRadius = gl.getUniformLocation(prog, 'u_cursorRadius')!
  const uCursorMode = gl.getUniformLocation(prog, 'u_cursorMode')!
  const uNumChars = gl.getUniformLocation(prog, 'u_numChars')!
  const uBrightnessBoost = gl.getUniformLocation(prog, 'u_brightnessBoost')!
  const uPosterize = gl.getUniformLocation(prog, 'u_posterize')!
  const uRevealT = gl.getUniformLocation(prog, 'u_revealT')!
  const uRevealMode = gl.getUniformLocation(prog, 'u_revealMode')!
  const uParallaxX = gl.getUniformLocation(prog, 'u_parallaxX')!
  const uParallaxY = gl.getUniformLocation(prog, 'u_parallaxY')!
  const uGlitchSeed = gl.getUniformLocation(prog, 'u_glitchSeed')!
  const uGlitchIntensity = gl.getUniformLocation(prog, 'u_glitchIntensity')!
  const uScale = gl.getUniformLocation(prog, 'u_scale')!
  const uInvert = gl.getUniformLocation(prog, 'u_invert')!
  const uColorLow = gl.getUniformLocation(prog, 'u_colorLow')!
  const uColorHigh = gl.getUniformLocation(prog, 'u_colorHigh')!
  const uImage = gl.getUniformLocation(prog, 'u_image')!
  const uGlyphs = gl.getUniformLocation(prog, 'u_glyphs')!

  const imageTex = gl.createTexture()!
  const glyphTex = gl.createTexture()!

  function initTex(tex: WebGLTexture, unit: number) {
    gl!.activeTexture(gl!.TEXTURE0 + unit)
    gl!.bindTexture(gl!.TEXTURE_2D, tex)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST)
  }

  initTex(imageTex, 0)
  initTex(glyphTex, 1)
  gl.uniform1i(uImage, 0)
  gl.uniform1i(uGlyphs, 1)

  function createScratchCanvas(cw: number, ch: number): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(cw, ch)
    }
    const c = document.createElement('canvas')
    c.width = cw
    c.height = ch
    return c
  }

  function setup() {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    w = rect.width || canvas.width || 400
    h = rect.height || canvas.height || 400
    canvas.width = w * dpr
    canvas.height = h * dpr
    gl!.viewport(0, 0, canvas.width, canvas.height)

    const mc = createScratchCanvas(100, 100)
    const mctx = mc.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    mctx.font = \`\${state.fontSize}px \${state.fontFamily}\`
    charW = Math.max(4, mctx.measureText('0').width)
    charH = state.fontSize
    cols = Math.ceil(w / charW)
    rows = Math.ceil(h / charH)

    buildGlyphAtlas()
  }

  function buildGlyphAtlas() {
    const cw = Math.max(1, Math.ceil(charW))
    const ch = Math.max(1, charH + 2)
    const atlas = createScratchCanvas(cw * state.chars.length, ch)
    const ac = atlas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
    ac.font = \`\${state.fontSize}px \${state.fontFamily}\`
    ac.textBaseline = 'top'
    ac.fillStyle = '#fff'
    for (let i = 0; i < state.chars.length; i++) {
      ac.fillText(state.chars[i], i * cw, 1)
    }
    gl!.activeTexture(gl!.TEXTURE1)
    gl!.bindTexture(gl!.TEXTURE_2D, glyphTex)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, atlas as TexImageSource)
  }

  const sourceImg = new Image()
  sourceImg.crossOrigin = 'anonymous'

  function loadSourceImage(src: string) {
    imageLoaded = false
    sourceImg.src = src
  }

  sourceImg.onload = () => {
    gl!.activeTexture(gl!.TEXTURE0)
    gl!.bindTexture(gl!.TEXTURE_2D, imageTex)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, sourceImg)
    imageLoaded = true
    setup()
  }

  loadSourceImage(state.imageSrc)
  if (sourceImg.complete && sourceImg.naturalWidth) {
    sourceImg.onload(new Event('load'))
  }

  function triggerGlitchBurst() {
    glitchSeed = Math.random() * 1000 + 1
    clearTimeout(glitchTimeoutId)
    glitchTimeoutId = setTimeout(() => {
      glitchSeed = -1
    }, 90 + Math.random() * 120)
  }

  function draw() {
    if (paused) return
    if (!imageLoaded) {
      rafId = requestAnimationFrame(draw)
      return
    }

    cursorNX += (targetNX - cursorNX) * 0.06
    cursorNY += (targetNY - cursorNY) * 0.06
    revealT += 1 / 60

    if (revealT > nextGlitchTime && state.glitchIntensity > 0) {
      triggerGlitchBurst()
      nextGlitchTime = revealT + 0.25 + Math.random() * 0.65
    }

    gl!.clearColor(0, 0, 0, 0)
    gl!.clear(gl!.COLOR_BUFFER_BIT)

    gl!.uniform2f(uResolution, w, h)
    gl!.uniform2f(uCellSize, charW, charH)
    gl!.uniform2f(uGridSize, cols, rows)
    gl!.uniform2f(uCursorPx, cursorPxX, cursorPxY)
    gl!.uniform1f(uCursorActive, cursorActive)
    gl!.uniform1f(uCursorRadius, state.cursorRadius)
    gl!.uniform1f(uCursorMode, cursorModeToFloat(state.cursorEffect))
    gl!.uniform1f(uNumChars, state.chars.length)
    gl!.uniform1f(uBrightnessBoost, state.brightnessBoost)
    gl!.uniform1f(uPosterize, state.posterize)
    gl!.uniform1f(uRevealT, revealT)
    gl!.uniform1f(uRevealMode, revealModeToFloat(state.revealMode))
    gl!.uniform1f(uParallaxX, cursorNX * state.parallaxStrength)
    gl!.uniform1f(uParallaxY, cursorNY * state.parallaxStrength)
    gl!.uniform1f(uGlitchSeed, glitchSeed)
    gl!.uniform1f(uGlitchIntensity, state.glitchIntensity)
    gl!.uniform1f(uScale, state.scale)
    gl!.uniform1f(uInvert, state.invertLuminance ? 1 : 0)
    gl!.uniform3f(
      uColorLow,
      state.theme.lowRGB[0],
      state.theme.lowRGB[1],
      state.theme.lowRGB[2],
    )
    gl!.uniform3f(
      uColorHigh,
      state.theme.highRGB[0],
      state.theme.highRGB[1],
      state.theme.highRGB[2],
    )

    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)

    rafId = requestAnimationFrame(draw)
  }

  rafId = requestAnimationFrame(draw)
  window.addEventListener('resize', setup)

  const destroy = () => {
    paused = true
    cancelAnimationFrame(rafId)
    clearTimeout(glitchTimeoutId)
    document.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    window.removeEventListener('resize', setup)
  }

  const controller = (() => {
    destroy()
  }) as AsciiController

  controller.pause = () => {
    paused = true
    cancelAnimationFrame(rafId)
  }

  controller.resume = () => {
    if (!paused) return
    paused = false
    rafId = requestAnimationFrame(draw)
  }

  controller.replay = () => {
    revealT = 0
    nextGlitchTime = 0
    if (paused) {
      paused = false
      rafId = requestAnimationFrame(draw)
    }
  }

  controller.triggerGlitch = () => {
    triggerGlitchBurst()
  }

  controller.setOptions = (next: Partial<AsciiOptions>) => {
    const prevFont = \`\${state.fontSize}:\${state.fontFamily}:\${state.chars}\`
    const prevImg = state.imageSrc

    if (next.charsetPreset) {
      state.chars = CHARSET_PRESETS[next.charsetPreset]
    } else if (next.chars !== undefined) {
      state.chars = next.chars
    }
    if (next.theme !== undefined) state.theme = resolveTheme(next.theme)
    if (next.fontSize !== undefined) state.fontSize = next.fontSize
    if (next.fontFamily !== undefined) state.fontFamily = next.fontFamily
    if (next.brightnessBoost !== undefined) state.brightnessBoost = next.brightnessBoost
    if (next.posterize !== undefined) state.posterize = next.posterize
    if (next.parallaxStrength !== undefined) state.parallaxStrength = next.parallaxStrength
    if (next.scale !== undefined) state.scale = next.scale
    if (next.revealMode !== undefined) state.revealMode = next.revealMode
    if (next.cursorEffect !== undefined) state.cursorEffect = next.cursorEffect
    if (next.cursorRadius !== undefined) state.cursorRadius = next.cursorRadius
    if (next.glitchIntensity !== undefined) state.glitchIntensity = next.glitchIntensity
    if (next.invertLuminance !== undefined) state.invertLuminance = next.invertLuminance

    if (next.imageSrc && next.imageSrc !== prevImg) {
      state.imageSrc = next.imageSrc
      revealT = 0
      loadSourceImage(next.imageSrc)
    } else if (\`\${state.fontSize}:\${state.fontFamily}:\${state.chars}\` !== prevFont) {
      setup()
    }
  }

  controller.exportDataURL = (type = 'image/png') => {
    return canvas.toDataURL(type)
  }

  controller.destroy = destroy

  return controller
}

interface InternalAsciiState {
  imageSrc: string
  chars: string
  theme: EffectTheme
  fontSize: number
  fontFamily: string
  brightnessBoost: number
  posterize: number
  parallaxStrength: number
  scale: number
  revealMode: AsciiRevealMode
  cursorEffect: AsciiCursorEffect
  cursorRadius: number
  glitchIntensity: number
  invertLuminance: boolean
  colorFn?: (luminance: number, distFromCenter: number) => string
}

function createCanvas2DRenderer(
  canvas: HTMLCanvasElement,
  state: InternalAsciiState,
): AsciiController {
  const ctx = canvas.getContext('2d')!
  let w = 0
  let h = 0
  let charW = 0
  let charH = 0
  let cols = 0
  let rows = 0
  let pixelData: Uint8ClampedArray | null = null
  let sampleW = 0
  let revealT = 0
  let paused = false
  let cursorNX = 0
  let cursorNY = 0
  let targetNX = 0
  let targetNY = 0
  let cellSeed = new Float32Array(0)
  const glitchRows = new Map<number, number>()
  let nextGlitchTime = 0
  let rafId = 0

  const onMouseMove = (e: MouseEvent) => {
    targetNX = (e.clientX / window.innerWidth - 0.5) * 2
    targetNY = (e.clientY / window.innerHeight - 0.5) * 2
  }
  document.addEventListener('mousemove', onMouseMove, { passive: true })

  const sourceImg = new Image()
  sourceImg.crossOrigin = 'anonymous'
  sourceImg.src = state.imageSrc

  function setup() {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    w = rect.width || canvas.width || 400
    h = rect.height || canvas.height || 400
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${state.fontSize}px ${state.fontFamily}`
    charW = Math.max(4, ctx.measureText('0').width)
    charH = state.fontSize
    cols = Math.ceil(w / charW)
    rows = Math.ceil(h / charH)
    cellSeed = new Float32Array(cols * rows)
    for (let i = 0; i < cols * rows; i++) cellSeed[i] = Math.random()
    sampleSource()
  }

  function sampleSource() {
    if (!sourceImg.complete || !sourceImg.naturalWidth) return
    const off = document.createElement('canvas')
    off.width = cols
    off.height = rows
    const oc = off.getContext('2d')!
    const dw = cols * state.scale
    const dh = rows * state.scale
    oc.drawImage(
      sourceImg,
      0,
      0,
      sourceImg.naturalWidth,
      sourceImg.naturalHeight,
      (cols - dw) / 2,
      (rows - dh) / 2,
      dw,
      dh,
    )
    pixelData = oc.getImageData(0, 0, cols, rows).data
    sampleW = cols
  }

  function triggerGlitch() {
    glitchRows.clear()
    const count = Math.max(1, Math.round(rows * state.glitchIntensity * 0.4))
    for (let g = 0; g < count; g++) {
      const startRow = Math.floor(Math.random() * rows)
      const ht = 1 + Math.floor(Math.random() * 3)
      const offset = (Math.random() - 0.5) * charW * 6
      for (let r = startRow; r < Math.min(rows, startRow + ht); r++) {
        glitchRows.set(r, offset)
      }
    }
    setTimeout(() => glitchRows.clear(), 60 + Math.random() * 100)
  }

  function draw() {
    if (paused) return
    if (!pixelData) {
      rafId = requestAnimationFrame(draw)
      return
    }

    cursorNX += (targetNX - cursorNX) * 0.05
    cursorNY += (targetNY - cursorNY) * 0.05
    ctx.clearRect(0, 0, w, h)
    ctx.font = `${state.fontSize}px ${state.fontFamily}`
    ctx.textBaseline = 'top'
    revealT += 1 / 60

    if (revealT > nextGlitchTime && state.glitchIntensity > 0) {
      triggerGlitch()
      nextGlitchTime = revealT + 0.25 + Math.random() * 0.65
    }

    const midX = cols / 2
    const midY = rows / 2

    for (let row = 0; row < rows; row++) {
      const rowGlitch = glitchRows.get(row) || 0
      for (let col = 0; col < cols; col++) {
        const pi = (row * sampleW + col) * 4
        const r = pixelData[pi]!
        const g = pixelData[pi + 1]!
        const bv = pixelData[pi + 2]!
        const a = pixelData[pi + 3]!
        if (a < 10) continue
        let lum = (r * 0.299 + g * 0.587 + bv * 0.114) / 255
        if (state.invertLuminance) lum = 1 - lum
        lum = Math.min(1, lum * state.brightnessBoost * (a / 255))
        lum = Math.round(lum * state.posterize) / state.posterize
        if (lum < 0.03) continue

        const nx = col / cols
        const ny = row / rows
        let waveDist = Math.min(nx, 1 - nx)
        if (state.revealMode === 'center-out') {
          waveDist = Math.hypot(nx - 0.5, ny - 0.5) * 0.7
        } else if (state.revealMode === 'top-down') {
          waveDist = ny * 0.6
        } else if (state.revealMode === 'diagonal') {
          waveDist = (nx + ny) * 0.35
        }

        const cellIdx = row * cols + col
        const cellThreshold = waveDist + cellSeed[cellIdx]! * 0.15
        const revealWave = revealT * 0.35
        if (cellThreshold > revealWave) continue
        const cellReveal = Math.min(1, (revealWave - cellThreshold) * 6)
        const px = col * charW + cursorNX * state.parallaxStrength + rowGlitch
        const py = row * charH + cursorNY * state.parallaxStrength * 0.6
        const ci = Math.min(state.chars.length - 1, Math.floor(lum * (state.chars.length - 1)))
        const distFromCenter = Math.hypot((col - midX) / midX, (row - midY) / midY)
        const depthFade = Math.max(0.3, 1 - distFromCenter * 0.5)
        const bright = lum * cellReveal * depthFade

        ctx.fillStyle = state.colorFn
          ? state.colorFn(bright, distFromCenter)
          : sampleThemeColor(state.theme, bright)
        ctx.fillText(state.chars[ci]!, px, py)
      }
    }
    rafId = requestAnimationFrame(draw)
  }

  function onReady() {
    setup()
    rafId = requestAnimationFrame(draw)
  }
  sourceImg.onload = onReady
  if (sourceImg.complete && sourceImg.naturalWidth) onReady()
  window.addEventListener('resize', setup)

  const destroy = () => {
    paused = true
    cancelAnimationFrame(rafId)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', setup)
  }

  const controller = (() => {
    destroy()
  }) as AsciiController

  controller.pause = () => {
    paused = true
    cancelAnimationFrame(rafId)
  }
  controller.resume = () => {
    if (!paused) return
    paused = false
    rafId = requestAnimationFrame(draw)
  }
  controller.replay = () => {
    revealT = 0
    if (paused) {
      paused = false
      rafId = requestAnimationFrame(draw)
    }
  }
  controller.triggerGlitch = triggerGlitch
  controller.setOptions = (next: Partial<AsciiOptions>) => {
    if (next.charsetPreset) state.chars = CHARSET_PRESETS[next.charsetPreset]
    else if (next.chars !== undefined) state.chars = next.chars
    if (next.theme !== undefined) state.theme = resolveTheme(next.theme)
    if (next.fontSize !== undefined) state.fontSize = next.fontSize
    if (next.fontFamily !== undefined) state.fontFamily = next.fontFamily
    if (next.brightnessBoost !== undefined) state.brightnessBoost = next.brightnessBoost
    if (next.posterize !== undefined) state.posterize = next.posterize
    if (next.parallaxStrength !== undefined) state.parallaxStrength = next.parallaxStrength
    if (next.scale !== undefined) state.scale = next.scale
    if (next.revealMode !== undefined) state.revealMode = next.revealMode
    if (next.glitchIntensity !== undefined) state.glitchIntensity = next.glitchIntensity
    if (next.invertLuminance !== undefined) state.invertLuminance = next.invertLuminance
    if (next.colorFn !== undefined) state.colorFn = next.colorFn
    if (next.imageSrc && next.imageSrc !== state.imageSrc) {
      state.imageSrc = next.imageSrc
      revealT = 0
      sourceImg.src = next.imageSrc
    } else {
      setup()
    }
  }
  controller.exportDataURL = (type = 'image/png') => canvas.toDataURL(type)
  controller.destroy = destroy

  return controller
}
