import {
  resolveTheme,
  sampleThemeColor,
  type EffectTheme,
  type ThemeName,
} from './themes.js'

export type ContourStyle = 'ridgeline' | 'isoline' | 'flow-field'

export interface ContourLinesOptions {
  canvas: HTMLCanvasElement
  imageSrc: string
  style?: ContourStyle
  lineSpacing?: number
  elevation?: number
  strokeWidth?: number
  theme?: ThemeName | EffectTheme
  cursorRadius?: number
  scale?: number
}

export interface ContourLinesController {
  (): void
  pause: () => void
  resume: () => void
  replay: () => void
  triggerGlitch: () => void
  setOptions: (next: Partial<ContourLinesOptions>) => void
  exportDataURL: (type?: string) => string
  destroy: () => void
}

export function createContourLines(opts: ContourLinesOptions): ContourLinesController {
  const canvas = opts.canvas
  const ctx = canvas.getContext('2d')!

  let state = {
    imageSrc: opts.imageSrc,
    style: opts.style ?? ('ridgeline' as ContourStyle),
    lineSpacing: opts.lineSpacing ?? 8,
    elevation: opts.elevation ?? 26,
    strokeWidth: opts.strokeWidth ?? 1.25,
    theme: resolveTheme(opts.theme),
    cursorRadius: opts.cursorRadius ?? 130,
    scale: opts.scale ?? 1.1,
  }

  let w = 0
  let h = 0
  let sampleW = 180
  let sampleH = 180
  let lumGrid = new Float32Array(0)
  let rafId = 0
  let paused = false
  let elapsed = 0
  let pulseEnergy = 0
  let cursorX = -1000
  let cursorY = -1000
  let smoothX = -1000
  let smoothY = -1000

  const sourceImg = new Image()
  sourceImg.crossOrigin = 'anonymous'

  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    cursorX = e.clientX - rect.left
    cursorY = e.clientY - rect.top
  }

  const onMouseLeave = () => {
    cursorX = -1000
    cursorY = -1000
  }

  canvas.addEventListener('mousemove', onMouseMove, { passive: true })
  canvas.addEventListener('mouseleave', onMouseLeave, { passive: true })

  function setup() {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    w = Math.max(100, Math.round(rect.width || canvas.width || 600))
    h = Math.max(100, Math.round(rect.height || canvas.height || 520))
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    sampleW = Math.max(80, Math.floor(w / 3))
    sampleH = Math.max(80, Math.floor(h / 3))
    sampleSource()
  }

  function sampleSource() {
    if (!sourceImg.complete || !sourceImg.naturalWidth) return
    const off = document.createElement('canvas')
    off.width = sampleW
    off.height = sampleH
    const oc = off.getContext('2d')!
    const dw = sampleW * state.scale
    const dh = sampleH * state.scale
    oc.drawImage(
      sourceImg,
      0,
      0,
      sourceImg.naturalWidth,
      sourceImg.naturalHeight,
      (sampleW - dw) / 2,
      (sampleH - dh) / 2,
      dw,
      dh,
    )
    const raw = oc.getImageData(0, 0, sampleW, sampleH).data
    lumGrid = new Float32Array(sampleW * sampleH)
    for (let i = 0; i < sampleW * sampleH; i++) {
      const pi = i * 4
      const a = raw[pi + 3]! / 255
      const lum =
        (raw[pi]! * 0.299 + raw[pi + 1]! * 0.587 + raw[pi + 2]! * 0.114) / 255
      lumGrid[i] = lum * a
    }
  }

  function sampleLuminance(nx: number, ny: number): number {
    if (lumGrid.length === 0) return 0
    const gx = Math.max(0, Math.min(sampleW - 1, Math.floor(nx * sampleW)))
    const gy = Math.max(0, Math.min(sampleH - 1, Math.floor(ny * sampleH)))
    return lumGrid[gy * sampleW + gx]!
  }

  function drawRidgelines() {
    const spacing = Math.max(4, state.lineSpacing)
    const stepX = 4
    const maxProgressX = Math.min(w, elapsed * 580)

    ctx.lineWidth = state.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let baseY = spacing * 2; baseY < h - spacing; baseY += spacing) {
      const ny = baseY / h
      ctx.beginPath()
      let started = false
      let rowPeak = 0

      for (let x = 0; x <= maxProgressX; x += stepX) {
        const nx = x / w
        const lum = sampleLuminance(nx, ny)
        if (lum > rowPeak) rowPeak = lum

        let disp = lum * state.elevation
        const cDist = Math.hypot(x - smoothX, baseY - smoothY)
        if (cDist < state.cursorRadius) {
          const factor = 1 - cDist / state.cursorRadius
          disp += Math.sin(cDist * 0.12 - elapsed * 8) * factor * 12
        }
        if (pulseEnergy > 0.02) {
          disp +=
            Math.sin(x * 0.08 + baseY * 0.15 + elapsed * 22) * pulseEnergy * 9
        }

        const py = baseY - disp
        if (!started) {
          ctx.moveTo(x, py)
          started = true
        } else {
          ctx.lineTo(x, py)
        }
      }

      const alpha = Math.min(0.95, 0.16 + rowPeak * 0.82)
      ctx.strokeStyle = sampleThemeColor(
        state.theme,
        Math.min(1, 0.25 + rowPeak * 0.85),
        alpha,
      )
      ctx.stroke()
    }
  }

  function drawIsolines() {
    const step = Math.max(4, Math.round(state.lineSpacing * 0.75))
    const bands = Math.max(4, Math.round(state.elevation * 0.35))
    const maxRadius = elapsed * 420
    const cx = w * 0.5
    const cy = h * 0.5
    ctx.lineWidth = state.strokeWidth

    for (let y = step; y < h - step; y += step) {
      for (let x = step; x < w - step; x += step) {
        if (Math.hypot(x - cx, y - cy) > maxRadius) continue
        const lum = sampleLuminance(x / w, y / h)
        if (lum < 0.04) continue

        const rightLum = sampleLuminance((x + step) / w, y / h)
        const downLum = sampleLuminance(x / w, (y + step) / h)
        const q0 = Math.floor(lum * bands)
        const qR = Math.floor(rightLum * bands)
        const qD = Math.floor(downLum * bands)

        if (q0 !== qR || q0 !== qD) {
          let ox = 0
          let oy = 0
          const cDist = Math.hypot(x - smoothX, y - smoothY)
          if (cDist < state.cursorRadius && cDist > 0.1) {
            const push = (1 - cDist / state.cursorRadius) * 8
            ox = ((x - smoothX) / cDist) * push
            oy = ((y - smoothY) / cDist) * push
          }
          ctx.strokeStyle = sampleThemeColor(
            state.theme,
            Math.min(1, lum * 1.3),
            0.85,
          )
          ctx.beginPath()
          ctx.moveTo(x + ox, y + oy)
          if (q0 !== qR) ctx.lineTo(x + step + ox, y + oy)
          if (q0 !== qD) ctx.lineTo(x + ox, y + step + oy)
          ctx.stroke()
        }
      }
    }
  }

  function drawFlowField() {
    const spacing = Math.max(6, state.lineSpacing + 2)
    const maxRadius = elapsed * 420
    const cx = w * 0.5
    const cy = h * 0.5
    ctx.lineWidth = state.strokeWidth
    ctx.lineCap = 'round'

    for (let y = spacing; y < h - spacing; y += spacing) {
      for (let x = spacing; x < w - spacing; x += spacing) {
        if (Math.hypot(x - cx, y - cy) > maxRadius) continue
        const nx = x / w
        const ny = y / h
        const lum = sampleLuminance(nx, ny)
        if (lum < 0.05) continue

        const gx =
          sampleLuminance(nx + 0.01, ny) - sampleLuminance(nx - 0.01, ny)
        const gy =
          sampleLuminance(nx, ny + 0.01) - sampleLuminance(nx, ny - 0.01)
        let angle =
          Math.atan2(gy, gx) +
          Math.PI * 0.5 +
          Math.sin(elapsed * 1.4 + lum * 4) * 0.25

        const cDist = Math.hypot(x - smoothX, y - smoothY)
        if (cDist < state.cursorRadius) {
          const pointerAngle = Math.atan2(y - smoothY, x - smoothX)
          const blend = 1 - cDist / state.cursorRadius
          angle = angle * (1 - blend) + pointerAngle * blend
        }

        const len = spacing * 0.45 + lum * (state.elevation * 0.35)
        const dx = Math.cos(angle) * len * 0.5
        const dy = Math.sin(angle) * len * 0.5

        ctx.strokeStyle = sampleThemeColor(
          state.theme,
          Math.min(1, lum * 1.35),
          0.25 + lum * 0.75,
        )
        ctx.beginPath()
        ctx.moveTo(x - dx, y - dy)
        ctx.lineTo(x + dx, y + dy)
        ctx.stroke()
      }
    }
  }

  function draw() {
    if (paused) return
    if (lumGrid.length === 0) {
      rafId = requestAnimationFrame(draw)
      return
    }

    elapsed += 1 / 60
    pulseEnergy *= 0.9
    smoothX += (cursorX - smoothX) * 0.14
    smoothY += (cursorY - smoothY) * 0.14

    ctx.clearRect(0, 0, w, h)

    if (state.style === 'ridgeline') {
      drawRidgelines()
    } else if (state.style === 'isoline') {
      drawIsolines()
    } else {
      drawFlowField()
    }

    rafId = requestAnimationFrame(draw)
  }

  sourceImg.onload = () => {
    setup()
    if (!paused && rafId === 0) {
      rafId = requestAnimationFrame(draw)
    }
  }

  sourceImg.src = state.imageSrc
  if (sourceImg.complete && sourceImg.naturalWidth) {
    sourceImg.onload(new Event('load'))
  }

  window.addEventListener('resize', setup)

  const destroy = () => {
    paused = true
    cancelAnimationFrame(rafId)
    rafId = 0
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    window.removeEventListener('resize', setup)
  }

  const controller = (() => {
    destroy()
  }) as ContourLinesController

  controller.pause = () => {
    paused = true
    cancelAnimationFrame(rafId)
    rafId = 0
  }

  controller.resume = () => {
    if (!paused) return
    paused = false
    rafId = requestAnimationFrame(draw)
  }

  controller.replay = () => {
    elapsed = 0
    if (paused) {
      paused = false
      rafId = requestAnimationFrame(draw)
    }
  }

  controller.triggerGlitch = () => {
    pulseEnergy = 1
  }

  controller.setOptions = (next: Partial<ContourLinesOptions>) => {
    const prevImg = state.imageSrc
    if (next.style !== undefined) state.style = next.style
    if (next.lineSpacing !== undefined) state.lineSpacing = next.lineSpacing
    if (next.elevation !== undefined) state.elevation = next.elevation
    if (next.strokeWidth !== undefined) state.strokeWidth = next.strokeWidth
    if (next.theme !== undefined) state.theme = resolveTheme(next.theme)
    if (next.cursorRadius !== undefined) state.cursorRadius = next.cursorRadius
    if (next.scale !== undefined) state.scale = next.scale

    if (next.imageSrc && next.imageSrc !== prevImg) {
      state.imageSrc = next.imageSrc
      elapsed = 0
      sourceImg.src = next.imageSrc
    } else if (next.scale !== undefined) {
      sampleSource()
    }
  }

  controller.exportDataURL = (type = 'image/png') => canvas.toDataURL(type)
  controller.destroy = destroy

  return controller
}
