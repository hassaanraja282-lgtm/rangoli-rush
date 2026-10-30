// The rangoli board: a slate tile with a chalk-outlined pattern made of
// segments (petals, leaves, bands, dots). Each segment has a target powder.
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  CylinderGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
  PlaneGeometry,
} from '@iwsdk/core';
import { BOARD_RADIUS, POWDERS, type PatternDef, type PowderId, type RingDef } from './patterns.js';
import { boardTexture, grainTexture, glyphTexture } from './textures.js';

export interface Segment {
  id: number;
  ring: number;
  index: number;
  color: PowderId;
  def: RingDef;
  angle: number;
  centroid: Vector3; // board-local
  filled: boolean;
  progress: number;
  wrongT: number;
  flash: number;
  pop: number;
  fill: Mesh;
  rim: Mesh;
  glyph: Mesh;
}

const TAU = Math.PI * 2;

function petalShape(r0: number, r1: number, halfAngle: number, leaf: boolean) {
  const s = new Shape();
  const rm = (r0 + r1) / 2;
  const w = Math.sin(halfAngle) * rm * (leaf ? 1.25 : 1.05);
  s.moveTo(0, r0);
  if (leaf) {
    s.quadraticCurveTo(w * 1.3, rm, 0, r1);
    s.quadraticCurveTo(-w * 1.3, rm, 0, r0);
  } else {
    s.bezierCurveTo(w * 1.5, r0 + (r1 - r0) * 0.35, w * 0.6, r1 - (r1 - r0) * 0.08, 0, r1);
    s.bezierCurveTo(-w * 0.6, r1 - (r1 - r0) * 0.08, -w * 1.5, r0 + (r1 - r0) * 0.35, 0, r0);
  }
  return new ShapeGeometry(s, 16);
}

function starShape(r: number, points: number) {
  const s = new Shape();
  for (let i = 0; i <= points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * 0.62 : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return new ShapeGeometry(s);
}

function segmentGeometry(def: RingDef, i: number): { geo: BufferGeometry; angle: number } {
  const off = def.offset ?? 0;
  const step = TAU / def.count;
  const angle = Math.PI / 2 + (i + off) * step;
  let geo: BufferGeometry;
  switch (def.shape) {
    case 'center':
      geo = starShape(def.r1, 8);
      break;
    case 'petal':
    case 'leaf': {
      geo = petalShape(def.r0, def.r1, step / 2, def.shape === 'leaf');
      geo.rotateZ(angle - Math.PI / 2);
      break;
    }
    case 'band': {
      const gap = 0.06 * step;
      geo = new RingGeometry(def.r0, def.r1, 10, 1, angle - step / 2 + gap / 2, step - gap);
      break;
    }
    case 'dot': {
      const rr = Math.min((def.r1 - def.r0) / 2, Math.sin(step / 2) * ((def.r0 + def.r1) / 2) * 0.85);
      geo = new CircleGeometry(rr, 20);
      const rm = (def.r0 + def.r1) / 2;
      geo.translate(Math.cos(angle) * rm, Math.sin(angle) * rm, 0);
      break;
    }
  }
  return { geo, angle };
}

export class Board {
  group = new Group();
  surface: Group = new Group(); // pattern lives here (local XY plane, +Z up)
  segments: Segment[] = [];
  pattern: PatternDef | null = null;
  highlight: Segment | null = null;
  private tile: Mesh;
  private base: Mesh;

  constructor() {
    // round slate tile on a thin wooden plinth
    const tileMat = new MeshStandardMaterial({ map: boardTexture(), roughness: 0.95, metalness: 0 });
    this.tile = new Mesh(new CircleGeometry(BOARD_RADIUS + 0.025, 64), tileMat);
    this.tile.renderOrder = 0;
    this.surface.add(this.tile);
    const base = new Mesh(
      new CylinderGeometry(BOARD_RADIUS + 0.035, BOARD_RADIUS + 0.04, 0.018, 64),
      new MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.6, metalness: 0.1 }),
    );
    base.rotation.x = Math.PI / 2;
    base.position.z = -0.0095;
    this.base = base;
    this.surface.add(base);
    // decorative brass dots around the plinth
    const dotMat = new MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.9, roughness: 0.3 });
    const dg = new CircleGeometry(0.005, 10);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const d = new Mesh(dg, dotMat);
      d.position.set(Math.cos(a) * (BOARD_RADIUS + 0.03), Math.sin(a) * (BOARD_RADIUS + 0.03), 0.0005);
      this.surface.add(d);
    }
    this.group.add(this.surface);
  }

  build(p: PatternDef) {
    this.clear();
    this.pattern = p;
    let id = 0;
    p.rings.forEach((def, ri) => {
      for (let i = 0; i < def.count; i++) {
        const color = def.colors[i % def.colors.length];
        const powder = POWDERS[color];
        const { geo, angle } = segmentGeometry(def, i);
        geo.computeBoundingBox();
        const c = new Vector3();
        geo.boundingBox!.getCenter(c);
        c.z = 0;
        geo.translate(-c.x, -c.y, 0);
        const fillMat = new MeshBasicMaterial({
          color: new Color(powder.color).multiplyScalar(0.55),
          map: grainTexture(),
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          side: DoubleSide,
        });
        const fill = new Mesh(geo, fillMat);
        fill.position.set(c.x, c.y, 0.002);
        fill.renderOrder = 3;
        const rimMat = new MeshBasicMaterial({
          color: 0xfff1d6,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: DoubleSide,
        });
        const rim = new Mesh(geo, rimMat);
        rim.position.set(c.x, c.y, 0.001);
        const s = def.shape === 'dot' ? 1.3 : def.shape === 'center' ? 1.18 : 1.12;
        rim.scale.setScalar(s);
        rim.renderOrder = 2;
        const gsize = Math.min(0.022, Math.max(0.011, (def.r1 - def.r0) * 0.38));
        const glyph = new Mesh(
          new PlaneGeometry(gsize, gsize),
          new MeshBasicMaterial({ map: glyphTexture(powder), transparent: true, opacity: 0.55, depthWrite: false }),
        );
        glyph.position.set(c.x, c.y, 0.003);
        glyph.renderOrder = 4;
        this.surface.add(rim, fill, glyph);
        this.segments.push({
          id: id++,
          ring: ri,
          index: i,
          color,
          def,
          angle,
          centroid: c.clone(),
          filled: false,
          progress: 0,
          wrongT: 0,
          flash: 0,
          pop: 0,
          fill,
          rim,
          glyph,
        });
      }
    });
  }

  clear() {
    for (const s of this.segments) {
      this.surface.remove(s.fill, s.rim, s.glyph);
      s.fill.geometry.dispose();
      (s.fill.material as MeshBasicMaterial).dispose();
      (s.rim.material as MeshBasicMaterial).dispose();
      s.glyph.geometry.dispose();
      (s.glyph.material as MeshBasicMaterial).dispose();
    }
    this.segments = [];
    this.pattern = null;
  }

  /** Find the segment under a board-local point (forgiving hit areas). */
  hit(x: number, y: number): Segment | null {
    const r = Math.hypot(x, y);
    if (r > BOARD_RADIUS + 0.02) return null;
    let a = Math.atan2(y, x);
    let best: Segment | null = null;
    let bestD = Infinity;
    for (const s of this.segments) {
      const def = s.def;
      if (r < def.r0 - 0.008 || r > def.r1 + 0.008) continue;
      if (def.shape === 'center') return s;
      let da = a - s.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const step = TAU / def.count;
      if (Math.abs(da) > step / 2) continue;
      const d = Math.abs(da) / step + Math.abs(r - (def.r0 + def.r1) / 2) * 3;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  remaining() {
    return this.segments.filter((s) => !s.filled).length;
  }

  setFill(s: Segment, k: number) {
    const m = s.fill.material as MeshBasicMaterial;
    const base = new Color(POWDERS[s.color].color);
    m.color.copy(base).multiplyScalar(0.55 + 0.45 * k);
    m.opacity = 0.25 + 0.75 * k;
  }

  complete(s: Segment) {
    s.filled = true;
    s.progress = 1;
    s.pop = 1;
    this.setFill(s, 1);
    (s.rim.material as MeshBasicMaterial).color.set(0xffd27a);
    s.glyph.visible = false;
  }

  update(dt: number, t: number) {
    for (const s of this.segments) {
      const rm = s.rim.material as MeshBasicMaterial;
      if (!s.filled) {
        const hl = this.highlight === s ? 1 : 0;
        rm.opacity = 0.35 + 0.25 * Math.sin(t * 3 + s.id * 0.7) * 0.5 + 0.25 * hl;
        if (s.flash > 0) {
          s.flash = Math.max(0, s.flash - dt * 2.5);
          rm.color.setRGB(1, 0.25 + 0.75 * (1 - s.flash), 0.25 + 0.6 * (1 - s.flash));
        } else {
          rm.color.set(hl ? 0xffffff : 0xfff1d6);
        }
        // decay unfinished progress slowly
        if (s.progress > 0 && s.wrongT <= 0) {
          this.setFill(s, s.progress);
        }
      } else {
        rm.opacity = 0.8;
        if (s.pop > 0) {
          s.pop = Math.max(0, s.pop - dt * 3);
          const k = 1 + Math.sin(s.pop * Math.PI) * 0.18;
          s.fill.scale.setScalar(k);
        }
      }
    }
  }

  /** Celebration pulse used on level complete. */
  celebrate(t: number) {
    for (const s of this.segments) {
      const k = 1 + 0.06 * Math.sin(t * 6 - s.ring * 1.2);
      s.fill.scale.setScalar(k);
    }
  }
}
