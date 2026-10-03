import { resolveTheme, type EffectTheme, type ThemeName } from './themes.js'

export type PixelRevealPattern = 'random' | 'radial' | 'wave' | 'scanline'
export type PixelBlockShape = 'square' | 'dot' | 'diamond'

export interface PixelRevealOptions {
  canvas: HTMLCanvasElement
  imageSrc: string
  blockSize?: number
  pixelsPerFrame?: number
  glitchRegion?: number
  delay?: number
  pattern?: PixelRevealPattern
  blockShape?: PixelBlockShape
  theme?: ThemeName | EffectTheme
  tintStrength?: number
  chromaticAberration?: boolean
  hoverGlitch?: boolean
  onComplete?: () => void
}

export interface PixelRevealController {
  (): void
  pause: () => void
  resume: () => void
  replay: () => void
  setOptions: (next: Partial<PixelRevealOptions>) => void
  exportDataURL: (type?: string) => string
  destroy: () => void
}

interface HoverCell {
  gx: number
  gy: number
  energy: number
  ox: number
}

export function createPixelReveal(opts: PixelRevealOptions): PixelRevealController {
  const canvas = opts.canvas
  const ctx = canvas.getContext('2d')!

  let state = {
    imageSrc: opts.imageSrc,
    blockSize: opts.blockSize ?? 8,
    pixelsPerFrame: opts.pixelsPerFrame ?? 120,
    glitchRegion: opts.glitchRegion ?? 0.36,
    delay: opts.delay ?? 200,
    pattern: opts.pattern ?? ('random' as PixelRevealPattern),
    blockShape: opts.blockShape ?? ('square' as PixelBlockShape),
    theme: opts.theme ? resolveTheme(opts.theme) : undefined,
    tintStrength: opts.tintStrength ?? 0.25,
    chromaticAberration: opts.chromaticAberration ?? true,
    hoverGlitch: opts.hoverGlitch ?? true,
    onComplete: opts.onComplete,
  }

  let rafId = 0
  let delayTimer: ReturnType<typeof setTimeout> | undefined
  let paused = false
  let w = canvas.width || 400
  let h = canvas.height || 400
  let imgData: ImageData | null = null
  let blocks: number[] = []
  let cols = 0
  let rows = 0
  let startTime = 0
  let revealed = 0
  let phase = 0
  let phaseOneStart = 0
  const hoverCells = new Map<string, HoverCell>()

  const img = new Image()
  img.crossOrigin = 'anonymous'

  function drawBlockShape(x: number, y: number, size: number) {
    if (state.blockShape === 'dot') {
      ctx.beginPath()
      ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.46, 0, Math.PI * 2)
      ctx.fill()
    } else if (state.blockShape === 'diamond') {
      const half = size * 0.5
      ctx.beginPath()
      ctx.moveTo(x + half, y)
      ctx.lineTo(x + size, y + half)
      ctx.lineTo(x + half, y + size)
      ctx.lineTo(x, y + half)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(x, y, size, size)
    }
  }

  function formatPixelColor(r: number, g: number, b: number, a: number, tintFactor: number): string {
    if (!state.theme || tintFactor <= 0) {
      return `rgba(${r},${g},${b},${a / 255})`
    }
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255
    const tr = state.theme.lowRGB[0] + (state.theme.highRGB[0] - state.theme.lowRGB[0]) * lum
    const tg = state.theme.lowRGB[1] + (state.theme.highRGB[1] - state.theme.lowRGB[1]) * lum
    const tb = state.theme.lowRGB[2] + (state.theme.highRGB[2] - state.theme.lowRGB[2]) * lum
    const k = Math.min(1, tintFactor * state.tintStrength)
    const fr = Math.round(r * (1 - k) + tr * k)
    const fg = Math.round(g * (1 - k) + tg * k)
    const fb = Math.round(b * (1 - k) + tb * k)
    return `rgba(${fr},${fg},${fb},${a / 255})`
  }

  function buildBlockOrder() {
    if (!imgData) return
    const bs = state.blockSize
    cols = Math.ceil(w / bs)
    rows = Math.ceil(h / bs)
    blocks = []

    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        const sx = Math.min(bx * bs + Math.floor(bs / 2), w - 1)
        const sy = Math.min(by * bs + Math.floor(bs / 2), h - 1)
        if (imgData.data[(sy * w + sx) * 4 + 3]! > 20) {
          blocks.push(by * cols + bx)
        }
      }
    }

    if (state.pattern === 'random') {
      for (let i = blocks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = blocks[i]!
        blocks[i] = blocks[j]!
        blocks[j] = tmp
      }
    } else if (state.pattern === 'radial') {
      const cx = cols / 2
      const cy = rows / 2
      blocks.sort((a, b) => {
        const ax = (a % cols) - cx
        const ay = Math.floor(a / cols) - cy
        const bx = (b % cols) - cx
        const by = Math.floor(b / cols) - cy
        return Math.hypot(ax, ay) - Math.hypot(bx, by) + (Math.random() - 0.5) * 3.5
      })
    } else if (state.pattern === 'wave') {
      blocks.sort((a, b) => {
        const ax = a % cols
        const ay = Math.floor(a / cols)
        const bx = b % cols
        const by = Math.floor(b / cols)
        const wa = ax + ay + Math.sin(ay * 0.35) * 4 + (Math.random() - 0.5) * 3
        const wb = bx + by + Math.sin(by * 0.35) * 4 + (Math.random() - 0.5) * 3
        return wa - wb
      })
    } else if (state.pattern === 'scanline') {
      blocks.sort((a, b) => a - b + (Math.random() - 0.5) * 2.5)
    }
  }

  function prepareImage() {
    if (!img.complete || !img.naturalWidth) return
    const rect = canvas.getBoundingClientRect()
    w = canvas.width || Math.round(rect.width) || 400
    h = canvas.height || Math.round(rect.height) || 400
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const oc = off.getContext('2d')!
    oc.drawImage(img, 0, 0, w, h)
    imgData = oc.getImageData(0, 0, w, h)
    buildBlockOrder()
  }

  function resetAnimation() {
    cancelAnimationFrame(rafId)
    clearTimeout(delayTimer)
    ctx.clearRect(0, 0, w, h)
    startTime = 0
    revealed = 0
    phase = 0
    phaseOneStart = 0
    hoverCells.clear()
    buildBlockOrder()
    delayTimer = setTimeout(() => {
      if (!paused) {
        rafId = requestAnimationFrame(draw)
      }
    }, state.delay)
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!state.hoverGlitch || phase < 2 || !imgData) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = w / (rect.width || w)
    const scaleY = h / (rect.height || h)
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY
    if (mx < 0 || mx > w || my < 0 || my > h) return

    const bs = state.blockSize
    const centerGx = Math.floor(mx / bs)
    const centerGy = Math.floor(my / bs)
    const radiusBlocks = 4

    for (let dy = -radiusBlocks; dy <= radiusBlocks; dy++) {
      for (let dx = -radiusBlocks; dx <= radiusBlocks; dx++) {
        const dist = Math.hypot(dx, dy)
        if (dist > radiusBlocks) continue
        const gx = centerGx + dx
        const gy = centerGy + dy
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue
        const key = `${gx}:${gy}`
        hoverCells.set(key, {
          gx,
          gy,
          energy: Math.min(1, (1 - dist / radiusBlocks) * 0.95),
          ox: (Math.random() - 0.5) * 14,
        })
      }
    }

    if (rafId === 0 && !paused) {
      rafId = requestAnimationFrame(drawHoverLoop)
    }
  }

  canvas.addEventListener('mousemove', onMouseMove, { passive: true })

  function drawHoverLoop() {
    if (paused || phase < 2 || !imgData) {
      rafId = 0
      return
    }
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    const bs = state.blockSize
    for (const [key, cell] of hoverCells.entries()) {
      cell.energy -= 0.045
      if (cell.energy <= 0) {
        hoverCells.delete(key)
        continue
      }

      const sx = Math.min(cell.gx * bs + Math.floor(bs / 2), w - 1)
      const sy = Math.min(cell.gy * bs + Math.floor(bs / 2), h - 1)
      const pi = (sy * w + sx) * 4
      const a = imgData.data[pi + 3]!
      if (a < 20) continue
      const r = imgData.data[pi]!
      const g = imgData.data[pi + 1]!
      const b = imgData.data[pi + 2]!

      ctx.clearRect(cell.gx * bs, cell.gy * bs, bs, bs)
      ctx.fillStyle = formatPixelColor(r, g, b, a, cell.energy)
      drawBlockShape(cell.gx * bs + cell.ox * cell.energy, cell.gy * bs, bs)
    }

    if (hoverCells.size > 0) {
      rafId = requestAnimationFrame(drawHoverLoop)
    } else {
      rafId = 0
    }
  }

  function draw(time: number) {
    if (paused || !imgData) return
    if (!startTime) startTime = time
    const elapsed = (time - startTime) / 1000
    const bs = state.blockSize

    if (phase === 0) {
      const batch = Math.min(revealed + state.pixelsPerFrame, blocks.length)
      for (let i = revealed; i < batch; i++) {
        const idx = blocks[i]!
        const bx = idx % cols
        const by = Math.floor(idx / cols)
        const sx = Math.min(bx * bs + Math.floor(bs / 2), w - 1)
        const sy = Math.min(by * bs + Math.floor(bs / 2), h - 1)
        const pi = (sy * w + sx) * 4
        ctx.fillStyle = formatPixelColor(
          imgData.data[pi]!,
          imgData.data[pi + 1]!,
          imgData.data[pi + 2]!,
          imgData.data[pi + 3]!,
          1
        )
        drawBlockShape(bx * bs, by * bs, bs)
      }
      revealed = batch
      if (revealed >= blocks.length) {
        phase = 1
        phaseOneStart = elapsed
      }
    } else if (phase === 1) {
      const glitchProgress = Math.min(1, (elapsed - phaseOneStart) / 1.5)
      const currentBs = Math.max(1, Math.floor(bs * (1 - glitchProgress)))
      const glitchBoundary = h * state.glitchRegion

      ctx.clearRect(0, 0, w, h)

      ctx.drawImage(
        img,
        0,
        glitchBoundary,
        w,
        h - glitchBoundary,
        0,
        glitchBoundary,
        w,
        h - glitchBoundary
      )

      const gc = Math.ceil(w / currentBs)
      const gr = Math.ceil(glitchBoundary / currentBs)
      for (let gy = 0; gy < gr; gy++) {
        for (let gx = 0; gx < gc; gx++) {
          const sx = Math.min(gx * currentBs + Math.floor(currentBs / 2), w - 1)
          const sy = Math.min(gy * currentBs + Math.floor(currentBs / 2), h - 1)
          const pi = (sy * w + sx) * 4
          const a = imgData.data[pi + 3]!
          if (a < 20) continue

          let ox = 0
          const isGlitchBlock = Math.random() < 0.06 * (1 - glitchProgress)
          if (isGlitchBlock) {
            ox = (Math.random() - 0.5) * 26 * (1 - glitchProgress)
          }
          const r = imgData.data[pi]!
          const g = imgData.data[pi + 1]!
          const b = imgData.data[pi + 2]!

          if (state.chromaticAberration && isGlitchBlock) {
            ctx.fillStyle = `rgba(${r}, 40, 40, 0.55)`
            ctx.fillRect(gx * currentBs + ox - 4, gy * currentBs, currentBs, currentBs)
            ctx.fillStyle = `rgba(40, 40, ${b}, 0.55)`
            ctx.fillRect(gx * currentBs + ox + 4, gy * currentBs, currentBs, currentBs)
          }
          ctx.fillStyle = formatPixelColor(r, g, b, a, 1 - glitchProgress)
          drawBlockShape(gx * currentBs + ox, gy * currentBs, currentBs)
        }
      }

      if (glitchProgress >= 1) phase = 2
    } else {
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      rafId = 0
      state.onComplete?.()
      return
    }

    rafId = requestAnimationFrame(draw)
  }

  img.onload = () => {
    prepareImage()
    resetAnimation()
  }
  img.src = state.imageSrc
  if (img.complete && img.naturalWidth) {
    img.onload(new Event('load'))
  }

  const destroy = () => {
    paused = true
    cancelAnimationFrame(rafId)
    clearTimeout(delayTimer)
    canvas.removeEventListener('mousemove', onMouseMove)
  }

  const controller = (() => {
    destroy()
  }) as PixelRevealController

  controller.pause = () => {
    paused = true
    cancelAnimationFrame(rafId)
  }
  controller.resume = () => {
    if (!paused) return
    paused = false
    if (phase < 2) {
      rafId = requestAnimationFrame(draw)
    }
  }
  controller.replay = () => {
    paused = false
    resetAnimation()
  }
  controller.setOptions = (next: Partial<PixelRevealOptions>) => {
    const prevImg = state.imageSrc
    if (next.blockSize !== undefined) state.blockSize = next.blockSize
    if (next.pixelsPerFrame !== undefined) state.pixelsPerFrame = next.pixelsPerFrame
    if (next.glitchRegion !== undefined) state.glitchRegion = next.glitchRegion
    if (next.delay !== undefined) state.delay = next.delay
    if (next.pattern !== undefined) state.pattern = next.pattern
    if (next.blockShape !== undefined) state.blockShape = next.blockShape
    if (next.theme !== undefined) state.theme = resolveTheme(next.theme)