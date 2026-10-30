// Procedural canvas textures: powder grain, soft dots, text labels, glyphs.
import { CanvasTexture, SRGBColorSpace, RepeatWrapping, LinearFilter } from '@iwsdk/core';
import type { Powder } from './patterns.js';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let grainTex: CanvasTexture | null = null;
/** Grey-scale grainy powder texture, multiplied with the segment colour. */
export function grainTexture() {
  if (grainTex) return grainTex;
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 170 + Math.floor(Math.random() * 85);
    g.fillStyle = `rgb(${v},${v},${v})`;
    const s = Math.random() < 0.85 ? 1 : 2;
    g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  grainTex = new CanvasTexture(c);
  grainTex.wrapS = grainTex.wrapT = RepeatWrapping;
  grainTex.repeat.set(4, 4);
  grainTex.colorSpace = SRGBColorSpace;
  return grainTex;
}

let dotTex: CanvasTexture | null = null;
export function softDotTexture() {
  if (dotTex) return dotTex;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  dotTex = new CanvasTexture(c);
  return dotTex;
}

let tileTex: CanvasTexture | null = null;
/** Dark slate tile with a chalk border of dots (the rangoli "floor"). */
export function boardTexture() {
  if (tileTex) return tileTex;
  const S = 1024;
  const c = canvas(S, S);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#3a2a26');
  grd.addColorStop(1, '#231917');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 20000; i++) {
    const v = Math.random() * 30;
    g.fillStyle = `rgba(${255},${220},${190},${v / 600})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // chalk dotted rim
  g.fillStyle = 'rgba(255,240,220,0.55)';
  const n = 120;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * S * 0.485, S / 2 + Math.sin(a) * S * 0.485, 4, 0, Math.PI * 2);
    g.fill();
  }
  tileTex = new CanvasTexture(c);
  tileTex.colorSpace = SRGBColorSpace;
  return tileTex;
}

export function drawGlyph(
  g: CanvasRenderingContext2D,
  glyph: Powder['glyph'],
  cx: number,
  cy: number,
  r: number,
) {
  g.beginPath();
  switch (glyph) {
    case 'circle':
      g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      break;
    case 'triangle':
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.9, cy + r * 0.7);
      g.lineTo(cx - r * 0.9, cy + r * 0.7);
      g.closePath();
      break;
    case 'square':
      g.rect(cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44);
      break;
    case 'diamond':
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.75, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r * 0.75, cy);
      g.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      break;
    case 'drop':
      g.moveTo(cx, cy - r);
      g.quadraticCurveTo(cx + r, cy + r * 0.1, cx, cy + r * 0.85);
      g.quadraticCurveTo(cx - r, cy + r * 0.1, cx, cy - r);
      break;
    case 'plus':
      g.rect(cx - r * 0.25, cy - r * 0.85, r * 0.5, r * 1.7);
      g.rect(cx - r * 0.85, cy - r * 0.25, r * 1.7, r * 0.5);
      break;
  }
}

const glyphCache = new Map<string, CanvasTexture>();
export function glyphTexture(p: Powder, color = 'rgba(255,248,235,0.9)') {
  const key = p.glyph + color;
  if (glyphCache.has(key)) return glyphCache.get(key)!;
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  drawGlyph(g, p.glyph, 32, 32, 22);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  glyphCache.set(key, t);
  return t;
}

/** A reusable text canvas; call draw() to repaint. */
export class TextCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  constructor(public w: number, public h: number) {
    this.canvas = canvas(w, h);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
  }
  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, lw = 4) {
    const g = this.ctx;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.lineWidth = lw;
      g.strokeStyle = stroke;
      g.stroke();
    }
  }
  text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', weight = 700, font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif') {
    const g = this.ctx;
    g.font = `${weight} ${size}px ${font}`;
    // auto-shrink to fit inside the canvas (with margins)
    const maxW = this.w * 0.92;
    const mw = g.measureText(s).width;
    if (mw > maxW) {
      size = Math.floor((size * maxW) / mw);
      g.font = `${weight} ${size}px ${font}`;
    }
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
  }
  done() {
    this.texture.needsUpdate = true;
  }
}

export const SERIF = 'Georgia, "Times New Roman", serif';
