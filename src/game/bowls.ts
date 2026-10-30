// Brass bowls heaped with coloured powder. Pinch inside a bowl to load powder.
import {
  Color,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  RingGeometry,
  DoubleSide,
} from '@iwsdk/core';
import { POWDERS, type PowderId } from './patterns.js';
import { glyphTexture, grainTexture } from './textures.js';

const brass = new MeshStandardMaterial({ color: 0xc89b3c, metalness: 0.85, roughness: 0.32 });

function bowlGeometry() {
  const pts: Vector2[] = [];
  const R = 0.05;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new Vector2(0.018 + Math.sin(t * Math.PI * 0.5) * (R - 0.018), -0.03 + t * 0.03));
  }
  pts.push(new Vector2(R + 0.004, 0.002));
  pts.push(new Vector2(R - 0.002, 0.003));
  return new LatheGeometry(pts, 40);
}

let bowlGeo: LatheGeometry | null = null;

export class Bowl {
  group = new Group();
  powder: PowderId;
  mound: Mesh;
  halo: Mesh;
  gazeT = 0;
  hover = 0;
  pulse = 0;
  tutorialPulse = false;
  radius = 0.065;

  constructor(id: PowderId) {
    this.powder = id;
    const p = POWDERS[id];
    bowlGeo ??= bowlGeometry();
    const bowl = new Mesh(bowlGeo, brass);
    this.group.add(bowl);
    const moundMat = new MeshStandardMaterial({
      color: new Color(p.color),
      map: grainTexture(),
      roughness: 1,
      metalness: 0,
      emissive: new Color(p.color),
      emissiveIntensity: 0.25,
    });
    this.mound = new Mesh(new SphereGeometry(0.046, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), moundMat);
    this.mound.scale.y = 0.55;
    this.mound.position.y = -0.006;
    this.group.add(this.mound);
    // glyph tag on the rim, facing the player
    const tag = new Mesh(
      new PlaneGeometry(0.022, 0.022),
      new MeshBasicMaterial({ map: glyphTexture(p, '#2a1a12'), transparent: true }),
    );
    const tagBg = new Mesh(
      new PlaneGeometry(0.028, 0.028),
      new MeshBasicMaterial({ color: 0xf6e7c8 }),
    );
    tagBg.position.set(0, -0.016, 0.052);
    tag.position.set(0, -0.016, 0.0525);
    tagBg.rotation.x = tag.rotation.x = -0.3;
    this.group.add(tagBg, tag);
    // selection halo
    this.halo = new Mesh(
      new RingGeometry(0.056, 0.064, 40),
      new MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }),
    );
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.004;
    this.group.add(this.halo);
  }

  /** world-space pick centre (top of the powder mound) */
  center(out: Vector3) {
    return this.mound.getWorldPosition(out).add(new Vector3(0, 0.012, 0));
  }

  update(dt: number, t: number) {
    const m = this.halo.material as MeshBasicMaterial;
    const target = Math.max(this.hover, this.gazeT > 0 ? 0.6 : 0, this.tutorialPulse ? 0.5 + 0.5 * Math.sin(t * 6) : 0);
    m.opacity += (target - m.opacity) * Math.min(1, dt * 12);
    const ms = this.mound.material as MeshStandardMaterial;
    ms.emissiveIntensity = 0.25 + target * 0.5 + this.pulse * 0.8;
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 3);
    const s = 1 + 0.06 * target + this.pulse * 0.1;
    this.mound.scale.set(s, 0.55 * s, s);
  }
}
