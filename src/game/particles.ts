// Pooled GPU point particles for powder puffs, bursts and sparkles.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  AdditiveBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import { softDotTexture } from './textures.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uScale / max(0.05, -mv.z));
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}`;

export class ParticlePool {
  points: Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private next = 0;
  material: ShaderMaterial;

  constructor(public capacity: number, additive = false, public persistent = false) {
    const g = new BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: softDotTexture() }, uScale: { value: 700 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  spawn(p: Vector3, v: Vector3, color: Color, size: number, life: number, drag = 2.5, gravity = -1.2) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grav[i] = gravity;
  }

  clear() {
    this.alpha.fill(0);
    this.life.fill(0);
    this.size.fill(0);
    this.markDirty();
  }

  private markDirty() {
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }

  update(dt: number, scale: number) {
    this.material.uniforms.uScale.value = scale;
    const n = this.capacity;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) continue;
      if (this.persistent && this.maxLife[i] > 900) {
        // settled grain: fade in only
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, k * 1.6);
      this.size[i] = this.baseSize[i] * (0.6 + 0.4 * k);
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
      }
    }
    this.markDirty();
  }
}

/** Grains that settle on the board and stay (until the level is cleared). */
export class GrainLayer {
  points: Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private fade: Float32Array; // seconds remaining for temporary (wrong) grains; -1 = permanent
  private next = 0;
  material: ShaderMaterial;
  private dirty = false;

  constructor(public capacity: number) {
    const g = new BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.fade = new Float32Array(capacity);
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: softDotTexture() }, uScale: { value: 700 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  add(x: number, y: number, z: number, color: Color, size: number, temporary: boolean) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.alpha[i] = 0.95;
    this.fade[i] = temporary ? 1.6 : -1;
    this.dirty = true;
  }

  clear() {
    this.alpha.fill(0);
    this.size.fill(0);
    this.fade.fill(0);
    this.dirty = true;
  }

  update(dt: number, scale: number) {
    this.material.uniforms.uScale.value = scale;
    for (let i = 0; i < this.capacity; i++) {
      if (this.fade[i] > 0) {
        this.fade[i] -= dt;
        this.alpha[i] = Math.max(0, Math.min(0.95, this.fade[i]));
        if (this.fade[i] <= 0) this.size[i] = 0;
        this.dirty = true;
      }
    }
    if (this.dirty) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      this.dirty = false;
    }
  }
}
