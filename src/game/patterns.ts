// Rangoli pattern definitions: three hand-authored levels plus a
// deterministic "Daily Rangoli" generated from the local calendar date.

export type PowderId =
  | 'haldi'
  | 'marigold'
  | 'kumkum'
  | 'peacock'
  | 'indigo'
  | 'leaf'
  | 'chalk';

export interface Powder {
  id: PowderId;
  name: string;
  color: number;
  /** Shape glyph shown on bowls and unfilled segments (colour-blind aid). */
  glyph: 'circle' | 'triangle' | 'square' | 'diamond' | 'star' | 'drop' | 'plus';
}

export const POWDERS: Record<PowderId, Powder> = {
  haldi: { id: 'haldi', name: 'Haldi', color: 0xffc22e, glyph: 'circle' },
  marigold: { id: 'marigold', name: 'Marigold', color: 0xff7417, glyph: 'triangle' },
  kumkum: { id: 'kumkum', name: 'Kumkum', color: 0xe8336d, glyph: 'diamond' },
  peacock: { id: 'peacock', name: 'Peacock', color: 0x00b3ad, glyph: 'drop' },
  indigo: { id: 'indigo', name: 'Indigo', color: 0x4a5cf0, glyph: 'square' },
  leaf: { id: 'leaf', name: 'Leaf', color: 0x47c252, glyph: 'star' },
  chalk: { id: 'chalk', name: 'Chalk', color: 0xf7f0e4, glyph: 'plus' },
};

export type RingShape = 'center' | 'petal' | 'band' | 'dot' | 'leaf';

export interface RingDef {
  shape: RingShape;
  r0: number; // inner radius (m)
  r1: number; // outer radius (m)
  count: number;
  /** angular offset in fractions of one segment */
  offset?: number;
  /** colours repeat around the ring */
  colors: PowderId[];
}

export interface PatternDef {
  id: string;
  name: string;
  subtitle: string;
  seconds: number;
  rings: RingDef[];
}

export const BOARD_RADIUS = 0.2;

export const TUTORIAL: PatternDef = {
  id: 'tutorial',
  name: 'First Petals',
  subtitle: 'Pinch, brush, flick',
  seconds: 0,
  rings: [{ shape: 'petal', r0: 0.03, r1: 0.17, count: 4, colors: ['marigold'] }],
};

export const LEVELS: PatternDef[] = [
  {
    id: 'l1',
    name: 'Marigold Morning',
    subtitle: 'Level 1 · two powders',
    seconds: 60,
    rings: [
      { shape: 'center', r0: 0, r1: 0.035, count: 1, colors: ['haldi'] },
      { shape: 'petal', r0: 0.045, r1: 0.17, count: 8, colors: ['marigold', 'haldi'] },
    ],
  },
  {
    id: 'l2',
    name: 'Peacock Courtyard',
    subtitle: 'Level 2 · three powders',
    seconds: 75,
    rings: [
      { shape: 'center', r0: 0, r1: 0.03, count: 1, colors: ['indigo'] },
      { shape: 'petal', r0: 0.038, r1: 0.11, count: 6, colors: ['peacock'] },
      { shape: 'band', r0: 0.125, r1: 0.165, count: 12, colors: ['kumkum', 'peacock'] },
      { shape: 'dot', r0: 0.172, r1: 0.192, count: 6, offset: 0.5, colors: ['indigo'] },
    ],
  },
  {
    id: 'l3',
    name: 'Diwali Lotus',
    subtitle: 'Level 3 · four powders',
    seconds: 90,
    rings: [
      { shape: 'center', r0: 0, r1: 0.028, count: 1, colors: ['haldi'] },
      { shape: 'petal', r0: 0.034, r1: 0.095, count: 8, colors: ['kumkum'] },
      { shape: 'dot', r0: 0.1, r1: 0.118, count: 16, colors: ['chalk', 'marigold'] },
      { shape: 'leaf', r0: 0.122, r1: 0.19, count: 8, offset: 0.5, colors: ['kumkum', 'leaf'] },
    ],
  },
];

// ---------- deterministic daily pattern ----------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DAILY_NAMES = [
  'Lotus', 'Peacock', 'Diya', 'Mango Leaf', 'Kolam', 'Jasmine', 'Sun Wheel',
  'Paisley', 'Conch', 'Swan', 'Star Anise', 'Monsoon',
];

export function dailyPattern(key = dateKey()): PatternDef {
  const rnd = mulberry32(hashString('rangoli-rush:' + key));
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const all: PowderId[] = ['haldi', 'marigold', 'kumkum', 'peacock', 'indigo', 'leaf', 'chalk'];
  // choose a palette of 4 distinct powders
  const pal: PowderId[] = [];
  while (pal.length < 4) {
    const c = pick(all);
    if (!pal.includes(c)) pal.push(c);
  }
  const sym = pick([6, 8, 8, 12]);
  const rings: RingDef[] = [
    { shape: 'center', r0: 0, r1: 0.03, count: 1, colors: [pal[0]] },
  ];
  let r = 0.036;
  const layouts: RingShape[][] = [
    ['petal', 'dot', 'leaf'],
    ['petal', 'band', 'dot'],
    ['leaf', 'dot', 'band'],
    ['petal', 'leaf'],
  ];
  const layout = pick(layouts);
  for (let i = 0; i < layout.length; i++) {
    const shape = layout[i];
    const depth = shape === 'dot' ? 0.02 : shape === 'band' ? 0.038 : layout.length === 2 ? 0.07 : 0.055;
    const count = shape === 'dot' ? sym * 2 : shape === 'band' ? sym * 2 : sym;
    const twoTone = rnd() < 0.55;
    const c1 = pal[1 + ((i + Math.floor(rnd() * 3)) % 3)];
    let c2 = pal[1 + ((i + 1 + Math.floor(rnd() * 2)) % 3)];
    if (c2 === c1) c2 = pal[0];
    rings.push({
      shape,
      r0: r,
      r1: Math.min(r + depth, 0.192),
      count,
      offset: i % 2 ? 0.5 : 0,
      colors: twoTone ? [c1, c2] : [c1],
    });
    r = r + depth + 0.006;
  }
  return {
    id: 'daily-' + key,
    name: `Daily ${pick(DAILY_NAMES)}`,
    subtitle: `Daily Rangoli · ${key}`,
    seconds: 80,
    rings,
  };
}

export function paletteOf(p: PatternDef): PowderId[] {
  const out: PowderId[] = [];
  for (const ring of p.rings) for (const c of ring.colors) if (!out.includes(c)) out.push(c);
  return out;
}
