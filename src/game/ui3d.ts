// Minimal world-space UI: canvas-textured panels and pokeable / gaze+pinch buttons.
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Raycaster, Vector3 } from '@iwsdk/core';
import { TextCanvas, SERIF } from './textures.js';

export class Label {
  mesh: Mesh;
  tc: TextCanvas;
  constructor(public w: number, public h: number, px = 1024) {
    this.tc = new TextCanvas(px, Math.round((px * h) / w));
    this.mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ map: this.tc.texture, transparent: true, depthWrite: false }),
    );
    this.mesh.renderOrder = 20;
  }
}

export interface ButtonStyle {
  title: string;
  sub?: string;
  accent?: string;
  badge?: string;
}

const tmp = new Vector3();

export class Button {
  group = new Group();
  label: Label;
  hover = 0;
  gazed = false;
  pressed = 0;
  enabled = true;
  private style: ButtonStyle;
  private lastDrawKey = '';
  /** finger was in front of button last frame (for poke edge detection) */
  private pokeArmed = new Map<string, boolean>();

  constructor(public w: number, public h: number, style: ButtonStyle, public onPress: () => void) {
    this.style = style;
    this.label = new Label(w, h, 640);
    this.group.add(this.label.mesh);
    this.draw();
  }

  setStyle(style: ButtonStyle) {
    this.style = style;
    this.draw();
  }

  draw() {
    const hl = this.hover > 0.5 || this.gazed;
    const key = JSON.stringify(this.style) + hl + this.enabled;
    if (key === this.lastDrawKey) return;
    this.lastDrawKey = key;
    const tc = this.label.tc;
    const { w, h } = tc;
    tc.clear();
    const accent = this.style.accent ?? '#ffb347';
    tc.roundRect(6, 6, w - 12, h - 12, h * 0.28, hl ? 'rgba(70,32,24,0.96)' : 'rgba(38,20,18,0.9)', hl ? '#ffe2a8' : accent, hl ? 10 : 6);
    const hasSub = !!this.style.sub;
    tc.text(this.style.title, this.style.badge ? w / 2 - h * 0.25 : w / 2, hasSub ? h * 0.38 : h / 2, h * (hasSub ? 0.28 : 0.36), this.enabled ? '#fff4e0' : '#9a8a80', 'center', 700, SERIF);
    if (hasSub) tc.text(this.style.sub!, w / 2, h * 0.72, h * 0.17, this.enabled ? '#ffcf8a' : '#8a7a70', 'center', 500);
    if (this.style.badge) {
      tc.roundRect(w - h * 0.78, h * 0.1, h * 0.6, h * 0.24, h * 0.12, '#e8336d');
      tc.text(this.style.badge, w - h * 0.48, h * 0.22, h * 0.15, '#fff', 'center', 800);
    }
    tc.done();
  }

  /** Poke: fingertip passes through the button plane from the front. */
  poke(handKey: string, worldTip: Vector3): boolean {
    if (!this.enabled || !this.group.visible) return false;
    this.label.mesh.worldToLocal(tmp.copy(worldTip));
    const inside = Math.abs(tmp.x) < this.w / 2 && Math.abs(tmp.y) < this.h / 2;
    const near = inside && tmp.z < 0.04 && tmp.z > -0.05;
    if (near) this.hover = 1;
    const front = inside && tmp.z > 0.004;
    const armed = this.pokeArmed.get(handKey) ?? false;
    let fired = false;
    if (armed && inside && tmp.z <= 0.004 && tmp.z > -0.05) {
      fired = true;
      this.pokeArmed.set(handKey, false);
    } else if (front && tmp.z < 0.06) {
      this.pokeArmed.set(handKey, true);
    } else if (!inside || tmp.z >= 0.06) {
      this.pokeArmed.set(handKey, false);
    }
    return fired;
  }

  rayHit(ray: Raycaster): boolean {
    if (!this.enabled || !this.group.visible) return false;
    return ray.intersectObject(this.label.mesh, false).length > 0;
  }

  update(dt: number) {
    if (this.pressed > 0) this.pressed = Math.max(0, this.pressed - dt * 4);
    const s = 1 + 0.05 * Math.max(this.hover, this.gazed ? 1 : 0) - 0.06 * this.pressed;
    this.group.scale.setScalar(s);
    this.draw();
    this.hover = Math.max(0, this.hover - dt * 6);
  }
}
