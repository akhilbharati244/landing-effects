export type ThemeName =
  | 'amber-gold'
  | 'emerald-phosphor'
  | 'crimson-infrared'
  | 'arctic-cyan'
  | 'monochrome-ink'
  | 'solar-warm'

export type CharsetPreset =
  | 'numeric'
  | 'matrix'
  | 'blocks'
  | 'minimal'
  | 'binary'
  | 'braille'

export interface EffectTheme {
  name: ThemeName
  label: string
  lowRGB: [number, number, number]
  highRGB: [number, number, number]
  accentHex: string
  surfaceHex: string
}

export const THEMES: Record<ThemeName, EffectTheme> = {
  'amber-gold': {
    name: 'amber-gold',
    label: 'Amber Gold',
    lowRGB: [158, 98, 24],
    highRGB: [255, 224, 130],
    accentHex: '#f5b041',
    surfaceHex: '#0d0b08',
  },
  'emerald-phosphor': {
    name: 'emerald-phosphor',
    label: 'Emerald Phosphor',
    lowRGB: [24, 138, 78],
    highRGB: [152, 255, 196],
    accentHex: '#2ecc71',
    surfaceHex: '#070d0a',
  },
  'crimson-infrared': {
    name: 'crimson-infrared',
    label: 'Crimson Infrared',
    lowRGB: [168, 34, 48],
    highRGB: [255, 160, 148],
    accentHex: '#e74c3c',
    surfaceHex: '#0e0708',
  },
  'arctic-cyan': {
    name: 'arctic-cyan',
    label: 'Arctic Cyan',
    lowRGB: [42, 132, 168],
    highRGB: [188, 246, 255],
    accentHex: '#38bdf8',
    surfaceHex: '#070b0e',
  },
  'monochrome-ink': {
    name: 'monochrome-ink',
    label: 'Monochrome Ink',
    lowRGB: [110, 114, 120],
    highRGB: [248, 249, 250],
    accentHex: '#e2e8f0',
    surfaceHex: '#09090b',
  },
  'solar-warm': {
    name: 'solar-warm',
    label: 'Solar Warm',
    lowRGB: [184, 72, 28],
    highRGB: [255, 212, 112],
    accentHex: '#fb923c',
    surfaceHex: '#0e0906',
  },
}

export const CHARSET_PRESETS: Record<CharsetPreset, string> = {
  numeric: '0123456789',
  matrix: '::==++**%6@',
  blocks: '░▒▓█',
  minimal: '·•○●',
  binary: '01',
  braille: '⠁⠃⠉⠙⠑⠋⠛',
}

// Return the selected theme object or the default amber-gold theme.
export function resolveTheme(theme?: ThemeName | EffectTheme): EffectTheme {
  if (!theme) return THEMES['amber-gold']
  if (typeof theme === 'string') return THEMES[theme] ?? THEMES['amber-gold']
  return theme
}

// Compute an RGBA CSS string from a theme and a normalized brightness value.
export function sampleThemeColor(
  theme: EffectTheme,
  brightness: number,
  alpha = 1
): string {
  const t = Math.max(0, Math.min(1, brightness))
  const r = Math.round(theme.lowRGB[0] + (theme.highRGB[0] - theme.lowRGB[0]) * t)
  const g = Math.round(theme.lowRGB[1] + (theme.highRGB[1] - theme.lowRGB[1]) * t)
  const b = Math.round(theme.lowRGB[2] + (theme.highRGB[2] - theme.lowRGB[2]) * t)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
