// Rangoli Rush game system: state machine, layout, interaction rules, scoring.
import {
  Color,
  createSystem,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Plane,
  SphereGeometry,
  Vector3,
  Quaternion,
  Euler,
  Raycaster,
  Sphere,
  VisibilityState,
} from '@iwsdk/core';
import { sfx } from './audio.js';
import { Board, type Segment } from './board.js';
import { Bowl } from './bowls.js';
import { Courtyard } from './courtyard.js';
import { HandState, InputHub } from './input.js';
import { GrainLayer, ParticlePool } from './particles.js';
import {
  BOARD_RADIUS,
  LEVELS,
  POWDERS,
  TUTORIAL,
  dailyPattern,
  dateKey,
  paletteOf,
  type PatternDef,
  type PowderId,
} from './patterns.js';
import * as store from './storage.js';
import { SERIF, drawGlyph } from './textures.js';
import { Button, Label } from './ui3d.js';

type Mode = 'menu' | 'tutorial' | 'playing' | 'result';

const BOWL_SLOTS: [number, number][] = [
  [-0.28, -0.26],
  [0.28, -0.26],
  [-0.31, -0.43],
  [0.31, -0.43],
  [-0.24, -0.1],
  [0.24, -0.1],
];

const TILT = 0.52; // board tilt toward the player (rad from horizontal)

interface Loaded {
  color: PowderId;
  orb: Mesh;
}

interface Flick {
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  color: PowderId;
  seg: Segment | null;
}

const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpC = new Color();

export class RangoliGame extends createSystem({}) {
  rig!: Group;
  board!: Board;
  bowls: Bowl[] = [];
  courtyard!: Courtyard;
  hands!: InputHub;
  fx!: ParticlePool;
  sparkle!: ParticlePool;
  grains!: GrainLayer;
  hudPivot!: Group;
  hud!: Label;
  hint!: Label;
  title!: Label;
  result!: Label;
  menuGroup!: Group;
  resultGroup!: Group;
  buttons: Button[] = [];
  menuButtons: Button[] = [];
  resultButtons: Button[] = [];
  skipBtn!: Button;
  floaters: { label: Label; t: number; v: Vector3 }[] = [];
  loaded = new Map<string, Loaded>();
  flicks: Flick[] = [];

  mode: Mode = 'menu';
  pattern: PatternDef | null = null;
  timeLeft = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  lastFill = -10;
  clock = 0;
  tutStep = 0;
  tutTimer = 0;
  resultInfo: { won: boolean; stars: number; score: number; streak?: number; best?: number } | null = null;
  anchored = false;
  inXR = false;
  passthrough = false;
  lastTickSec = -1;
  hudDirtyT = 0;
  lastHudKey = '';
  gazeTarget: Bowl | Button | null = null;
  stats = { fills: 0, wrong: 0, flicks: 0 };
  boundRef: XRReferenceSpace | null = null;

  init() {
    const scene = this.world.scene;
    this.rig = new Group();
    this.rig.name = 'rangoli-rig';
    scene.add(this.rig);

    const hemi = new HemisphereLight(0xfff1dd, 0x553322, 1.4);
    const sun = new DirectionalLight(0xffe2b8, 1.6);
    sun.position.set(0.6, 2, 1);
    scene.add(hemi, sun);

    this.courtyard = new Courtyard();
    scene.add(this.courtyard.group);

    this.board = new Board();
    this.board.group.position.set(0, -0.4, -0.37);
    this.board.group.rotation.x = -Math.PI / 2 + TILT;
    this.rig.add(this.board.group);

    this.grains = new GrainLayer(9000);
    this.board.surface.add(this.grains.points);
    this.fx = new ParticlePool(2500);
    this.sparkle = new ParticlePool(800, true);
    scene.add(this.fx.points, this.sparkle.points);

    // HUD + hints lazily follow head yaw (FoV-aware)
    this.hudPivot = new Group();
    this.rig.add(this.hudPivot);
    this.hud = new Label(0.36, 0.075, 1024);
    this.hud.mesh.position.set(0, -0.06, -0.62);
    this.hud.mesh.rotation.x = -0.1;
    this.hint = new Label(0.4, 0.07, 1024);
    this.hint.mesh.position.set(0, 0.035, -0.64);
    this.hudPivot.add(this.hud.mesh, this.hint.mesh);
    this.skipBtn = new Button(0.09, 0.03, { title: 'Skip ›' }, () => this.finishTutorial(true));
    this.skipBtn.group.position.set(0.24, 0.035, -0.63);
    this.hudPivot.add(this.skipBtn.group);
    this.buttons.push(this.skipBtn);

    // menu
    this.menuGroup = new Group();
    this.rig.add(this.menuGroup);
    this.title = new Label(0.44, 0.15, 1024);
    this.title.mesh.position.set(0, 0.03, -0.66);
    this.menuGroup.add(this.title.mesh);
    this.drawTitle();

    // result
    this.resultGroup = new Group();
    this.rig.add(this.resultGroup);
    this.result = new Label(0.42, 0.2, 1024);
    this.result.mesh.position.set(0, 0.0, -0.64);
    this.resultGroup.add(this.result.mesh);

    // floaters
    for (let i = 0; i < 6; i++) {
      const l = new Label(0.12, 0.04, 384);
      l.mesh.visible = false;
      scene.add(l.mesh);
      this.floaters.push({ label: l, t: 0, v: new Vector3() });
    }

    this.hands = new InputHub(this.world.renderer.domElement);

    this.world.visibilityState.subscribe((s) => {
      const xr = s !== VisibilityState.NonImmersive;
      if (xr !== this.inXR) {
        this.inXR = xr;
        this.anchored = false;
        this.onEnvironmentChange();
      }
    });

    this.buildMenu();
    this.showMenu();
    this.placeDesktop();
    this.onEnvironmentChange();

    (window as any).__rr = this; // automation & debugging hook
    document.dispatchEvent(new CustomEvent('rangoli-ready'));
  }

  // ---------------- layout ----------------

  placeDesktop() {
    this.rig.position.set(0, 1.2, 0);
    this.rig.rotation.set(0, 0, 0);
    const cam = this.world.camera;
    cam.position.set(0, 1.47, 0.38);
    const look = new Vector3(0, 0.95, -0.5);
    cam.lookAt(look);
    this.layoutCourtyard();
  }

  anchorToHead(frame: XRFrame | null, ref: XRReferenceSpace | null): boolean {
    let p: Vector3;
    let dir: Vector3;
    const pose = frame && ref ? frame.getViewerPose(ref) : null;
    if (pose) {
      const t = pose.transform;
      const origin = this.world.player;
      origin.updateMatrixWorld();
      p = origin.localToWorld(new Vector3(t.position.x, t.position.y, t.position.z));
      const q = new Quaternion(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      q.premultiply(origin.getWorldQuaternion(new Quaternion()));
      dir = new Vector3(0, 0, -1).applyQuaternion(q);
    } else {
      return false;
    }
    const yaw = Math.atan2(-dir.x, -dir.z);
    this.rig.position.copy(p);
    this.rig.rotation.set(0, yaw, 0);
    this.hudPivot.rotation.set(0, 0, 0);
    this.anchored = true;
    this.layoutCourtyard();
    return true;
  }

  /** Re-anchor the play space in front of the player (e.g. after a recenter). */
  recenter() {
    this.anchored = false;
  }

  layoutCourtyard() {
    // the courtyard floor follows the rig horizontally; chowki sits under board + bowls
    const ch = this.courtyard.chowki;
    const p = new Vector3(0, -0.52, -0.3);
    this.rig.localToWorld(p);
    ch.position.copy(p);
    ch.rotation.y = this.rig.rotation.y;
    this.courtyard.group.position.set(this.rig.position.x, 0, this.rig.position.z);
    ch.position.sub(this.courtyard.group.position);
    this.courtyard.group.rotation.set(0, 0, 0);
  }

  onEnvironmentChange() {
    const session = this.world.session;
    const blend = session?.environmentBlendMode;
    this.passthrough = !!session && blend !== undefined && blend !== 'opaque';
    // courtyard sky/walls hidden in passthrough; the chowki stays as an anchor
    this.courtyard.group.visible = !this.passthrough;
  }

  // ---------------- menus ----------------

  drawTitle() {
    const tc = this.title.tc;
    const { w, h } = tc;
    tc.clear();
    tc.roundRect(8, 8, w - 16, h - 16, 60, 'rgba(36,16,20,0.82)', '#ffb347', 6);
    // mini rangoli emblem
    const g = tc.ctx;
    const cx = 150, cy = h / 2;
    const cols = ['#ff7417', '#ffc22e', '#e8336d', '#00b3ad'];
    for (let i = 0; i < 8; i++) {
      g.save();
      g.translate(cx, cy);
      g.rotate((i * Math.PI) / 4);
      g.fillStyle = cols[i % 4];
      g.beginPath();
      g.ellipse(0, -60, 22, 50, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#fff1d6';
    g.beginPath();
    g.arc(cx, cy, 24, 0, Math.PI * 2);
    g.fill();
    tc.text('Rangoli Rush', w / 2 + 80, h * 0.4, 104, '#fff4e0', 'center', 700, SERIF);
    tc.text('Pinch powder · brush petals · light it up', w / 2 + 80, h * 0.74, 36, '#ffcf8a', 'center', 500);
    tc.done();
  }

  buildMenu() {
    const mk = (w: number, h: number, x: number, y: number, z: number, cb: () => void) => {
      const b = new Button(w, h, { title: '' }, cb);
      b.group.position.set(x, y, z);
      b.group.rotation.x = -0.35;
      this.menuGroup.add(b.group);
      this.buttons.push(b);
      this.menuButtons.push(b);
      return b;
    };
    mk(0.2, 0.06, -0.11, -0.115, -0.44, () => this.onPlay());
    mk(0.2, 0.06, 0.11, -0.115, -0.44, () => this.startPattern(dailyPattern()));
    LEVELS.forEach((lv, i) => mk(0.13, 0.05, (i - 1) * 0.14, -0.19, -0.42, () => this.startPattern(lv)));
    // result buttons
    const r1 = new Button(0.17, 0.055, { title: 'Next' }, () => this.onResultPrimary());
    const r2 = new Button(0.17, 0.055, { title: 'Menu' }, () => this.showMenu());
    r1.group.position.set(-0.1, -0.13, -0.45);
    r2.group.position.set(0.1, -0.13, -0.45);
    r1.group.rotation.x = r2.group.rotation.x = -0.35;
    this.resultGroup.add(r1.group, r2.group);
    this.buttons.push(r1, r2);
    this.resultButtons.push(r1, r2);
  }

  refreshMenu() {
    const save = store.load();
    const streak = store.currentStreak();
    const [play, daily, ...lv] = this.menuButtons;
    play.setStyle({ title: save.tutorialDone ? 'Play' : 'Start', sub: save.tutorialDone ? 'Continue the journey' : '30-second hand tutorial', accent: '#ffb347' });
    const done = store.dailyDoneToday();
    daily.setStyle({
      title: 'Daily Rangoli',
      sub: done ? `Done today · streak ${streak}` : streak > 0 ? `Keep your ${streak}-day streak` : 'A new pattern every day',
      accent: '#e8336d',
      badge: done ? undefined : 'NEW',
    });
    LEVELS.forEach((l, i) => {
      const b = lv[i];
      const best = save.best[l.id];
      const unlocked = i === 0 || !!save.best[LEVELS[i - 1].id]?.stars;
      b.enabled = unlocked;
      b.setStyle({ title: `Level ${i + 1}`, sub: unlocked ? (best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : 'new') : 'locked', accent: '#00b3ad' });
    });
  }

  showMenu() {
    this.mode = 'menu';
    sfx.stopDrone();
    this.clearHands();
    this.menuGroup.visible = true;
    this.resultGroup.visible = false;
    this.hud.mesh.visible = false;
    this.hint.mesh.visible = false;
    this.skipBtn.group.visible = false;
    this.refreshMenu();
    // decorative preview: today's daily pattern, half-filled
    this.board.build(dailyPattern());
    this.board.segments.forEach((s, i) => {
      if (i % 2 === 0) this.board.complete(s);
    });
    this.grains.clear();
    this.setBowls(paletteOf(this.board.pattern!));
  }

  onPlay() {
    const save = store.load();
    if (!save.tutorialDone) return this.startTutorial();
    const next = LEVELS.find((l) => !save.best[l.id]?.stars) ?? LEVELS[LEVELS.length - 1];
    this.startPattern(next);
  }

  onResultPrimary() {
    if (!this.pattern) return this.showMenu();
    const idx = LEVELS.findIndex((l) => l.id === this.pattern!.id);
    if (this.resultInfo?.won && idx >= 0 && idx < LEVELS.length - 1) this.startPattern(LEVELS[idx + 1]);
    else if (this.resultInfo?.won && idx === LEVELS.length - 1) this.startPattern(dailyPattern());
    else if (this.resultInfo?.won && this.pattern.id.startsWith('daily')) this.showMenu();
    else this.startPattern(this.pattern);
  }

  setBowls(colors: PowderId[]) {
    for (const b of this.bowls) this.rig.remove(b.group);
    this.bowls = colors.map((c, i) => {
      const b = new Bowl(c);
      const [x, z] = BOWL_SLOTS[i % BOWL_SLOTS.length];
      b.group.position.set(x, -0.5, z);
      b.group.rotation.y = Math.atan2(-x, -z) + Math.PI;
      this.rig.add(b.group);
      return b;
    });
  }

  // ---------------- game flow ----------------

  resetRound(p: PatternDef) {
    sfx.ensure();
    this.pattern = p;
    this.board.build(p);
    this.grains.clear();
    this.setBowls(paletteOf(p));
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastFill = -10;
    this.timeLeft = p.seconds;
    this.stats = { fills: 0, wrong: 0, flicks: 0 };
    this.clearHands();
    this.menuGroup.visible = false;
    this.resultGroup.visible = false;
    this.hud.mesh.visible = true;
    this.lastHudKey = '';
  }

  startTutorial() {
    this.resetRound(TUTORIAL);
    this.mode = 'tutorial';
    this.tutStep = 0;
    this.tutTimer = 0;
    this.hint.mesh.visible = true;
    this.skipBtn.group.visible = true;
    this.hud.mesh.visible = false;
    sfx.startDrone();
  }

  finishTutorial(skipped = false) {
    const s = store.load();
    s.tutorialDone = true;
    store.save();
    this.skipBtn.group.visible = false;
    void skipped;
    this.startPattern(LEVELS[0]);
  }

  startPattern(p: PatternDef) {
    this.resetRound(p);
    this.mode = 'playing';
    this.hint.mesh.visible = true;
    this.skipBtn.group.visible = false;
    this.setHint(p.name, p.subtitle);
    this.hintTimer = 3;
    sfx.click();
    sfx.startDrone();
  }

  hintTimer = 0;

  endRound(won: boolean) {
    const p = this.pattern!;
    const frac = 1 - this.board.remaining() / this.board.segments.length;
    let stars = 0;
    if (won) {
      const tl = this.timeLeft / p.seconds;
      stars = tl >= 0.4 ? 3 : tl >= 0.15 ? 2 : 1;
      this.score += Math.round(this.timeLeft) * 10;
    } else stars = frac >= 0.85 ? 1 : 0;
    let streak: number | undefined;
    if (p.id.startsWith('daily')) {
      if (won) streak = store.recordDaily(this.score);
      else streak = store.currentStreak();
    } else if (stars > 0) store.recordLevel(p.id, this.score, stars);
    const best = p.id.startsWith('daily') ? store.load().daily.history[dateKey()] : store.load().best[p.id]?.score;
    this.resultInfo = { won, stars, score: this.score, streak, best };
    this.mode = 'result';
    sfx.stopDrone();
    if (won) {
      sfx.fanfare();
      this.burstAll();
    } else sfx.timeUp();
    this.clearHands();
    this.drawResult();
    this.resultGroup.visible = true;
    this.hint.mesh.visible = false;
    this.hud.mesh.visible = false;
    const [r1] = this.resultButtons;
    const idx = LEVELS.findIndex((l) => l.id === p.id);
    const isDaily = p.id.startsWith('daily');
    r1.setStyle({
      title: won ? (isDaily ? 'Done' : idx < LEVELS.length - 1 ? 'Next level' : 'Daily Rangoli') : 'Retry',
      accent: won ? '#ffb347' : '#e8336d',
    });
  }

  drawResult() {
    const r = this.resultInfo!;
    const p = this.pattern!;
    const tc = this.result.tc;
    const { w, h } = tc;
    tc.clear();
    tc.roundRect(8, 8, w - 16, h - 16, 50, 'rgba(36,16,20,0.9)', r.won ? '#ffd27a' : '#e8336d', 6);
    tc.text(r.won ? 'Rangoli complete!' : "Time's up", w / 2, h * 0.17, 76, '#fff4e0', 'center', 700, SERIF);
    // stars
    const g = tc.ctx;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < r.stars ? '#ffc22e' : 'rgba(255,255,255,0.18)';
      drawGlyph(g, 'star', w / 2 + (i - 1) * 90, h * 0.42, 38);
      g.fill();
    }
    tc.text(`Score ${r.score}   ·   best combo x${this.bestCombo}`, w / 2, h * 0.64, 40, '#ffcf8a', 'center', 600);
    let line = p.subtitle;
    if (p.id.startsWith('daily')) {
      const now = new Date();
      const mid = new Date(now);
      mid.setHours(24, 0, 0, 0);
      const mins = Math.max(0, Math.round((mid.getTime() - now.getTime()) / 60000));
      line = r.won
        ? `Streak ${r.streak} day${r.streak === 1 ? '' : 's'} · new pattern in ${Math.floor(mins / 60)}h ${mins % 60}m`
        : `Finish today's pattern to keep your streak`;
    } else if (r.best) line = `${p.name} · best ${r.best}`;
    tc.text(line, w / 2, h * 0.82, 36, '#e9d6c2', 'center', 500);
    tc.done();
  }

  setHint(main: string, sub = '') {
    const tc = this.hint.tc;
    const { w, h } = tc;
    tc.clear();
    tc.roundRect(6, 6, w - 12, h - 12, h * 0.4, 'rgba(36,16,20,0.78)', 'rgba(255,200,120,0.7)', 4);
    tc.text(main, w / 2, sub ? h * 0.36 : h / 2, sub ? 52 : 58, '#fff4e0', 'center', 700, SERIF);
    if (sub) tc.text(sub, w / 2, h * 0.74, 32, '#ffcf8a', 'center', 500);
    tc.done();
  }

  drawHud() {
    if (!this.pattern) return;
    const sec = Math.max(0, Math.ceil(this.timeLeft));
    const mult = Math.min(5, Math.max(1, this.combo));
    const left = this.board.remaining();
    const key = `${sec}|${this.score}|${mult}|${left}`;
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    const tc = this.hud.tc;
    const { w, h } = tc;
    tc.clear();
    tc.roundRect(4, 4, w - 8, h - 8, h * 0.45, 'rgba(30,14,16,0.72)');
    const frac = this.pattern.seconds ? this.timeLeft / this.pattern.seconds : 1;
    const urgent = sec <= 10;
    tc.roundRect(40, h - 30, (w - 80) * Math.max(0, frac), 12, 6, urgent ? '#e8336d' : '#ffb347');
    tc.text(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, 120, h * 0.42, 70, urgent ? '#ff8aa8' : '#fff4e0', 'center', 800);
    tc.text(`${this.score}`, w / 2, h * 0.42, 74, '#fff4e0', 'center', 800);
    tc.text(`${left} left`, w - 330, h * 0.42, 40, '#e9d6c2', 'center', 600);
    tc.text(`x${mult}`, w - 110, h * 0.42, 70, mult > 1 ? '#ffc22e' : '#8a7a70', 'center', 800);
    tc.done();
  }

  // ---------------- interactions ----------------

  clearHands() {
    for (const [k, l] of this.loaded) {
      this.world.scene.remove(l.orb);
      this.loaded.delete(k);
    }
    this.flicks = [];
  }

  loadHand(h: HandState, bowl: Bowl, viaGaze: boolean) {
    const prev = this.loaded.get(h.key);
    if (prev) this.world.scene.remove(prev.orb);
    const color = bowl.powder;
    const orb = new Mesh(
      new SphereGeometry(h.kind === 'mouse' ? 0.006 : 0.009, 12, 8),
      new MeshBasicMaterial({ color: POWDERS[color].color }),
    );
    this.world.scene.add(orb);
    this.loaded.set(h.key, { color, orb });
    bowl.pulse = 1;
    sfx.pick(paletteOf(this.pattern ?? TUTORIAL).indexOf(color));
    const c = bowl.center(new Vector3());
    tmpC.set(POWDERS[color].color);
    for (let i = 0; i < 26; i++) {
      const v = new Vector3((Math.random() - 0.5) * 0.25, Math.random() * 0.35, (Math.random() - 0.5) * 0.25);
      if (viaGaze) v.copy(h.point).sub(c).multiplyScalar(2.2 + Math.random()).add(new Vector3(0, 0.2, 0));
      this.fx.spawn(c, v, tmpC, 0.008 + Math.random() * 0.006, viaGaze ? 0.45 : 0.6, 3, -0.6);
    }
  }

  bowlAt(p: Vector3): Bowl | null {
    let best: Bowl | null = null;
    let bd = Infinity;
    for (const b of this.bowls) {
      const d = b.center(tmpV).distanceTo(p);
      if (d < b.radius && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  bowlOnRay(ray: Raycaster): Bowl | null {
    let best: Bowl | null = null;
    let bd = Infinity;
    for (const b of this.bowls) {
      const s = new Sphere(b.center(new Vector3()), 0.06);
      const hit = ray.ray.intersectSphere(s, tmpV2);
      if (hit) {
        const d = hit.distanceTo(ray.ray.origin);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
    }
    return best;
  }

  boardPlane(): Plane {
    const n = new Vector3(0, 0, 1).applyQuaternion(this.board.surface.getWorldQuaternion(new Quaternion()));
    const o = this.board.surface.getWorldPosition(new Vector3());
    return new Plane().setFromNormalAndCoplanarPoint(n, o);
  }

  playable() {
    return this.mode === 'playing' || this.mode === 'tutorial';
  }

  brush(h: HandState, local: Vector3, dt: number) {
    const l = this.loaded.get(h.key)!;
    const seg = this.board.hit(local.x, local.y);
    const correct = !!seg && seg.color === l.color;
    tmpC.set(POWDERS[l.color].color);
    // sprinkle grains along the path
    const n = h.kind === 'mouse' ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const jx = (Math.random() - 0.5) * 0.016;
      const jy = (Math.random() - 0.5) * 0.016;
      const temp = !seg || !correct || seg.filled;
      this.grains.add(local.x + jx, local.y + jy, 0.004, tmpC, 0.0032 + Math.random() * 0.002, temp && !!seg && !correct);
    }
    sfx.sprinkle();
    if (!seg || seg.filled) return;
    if (correct) {
      seg.wrongT = 0;
      seg.progress = Math.min(1, seg.progress + dt / 0.38);
      this.board.setFill(seg, seg.progress);
      if (seg.progress >= 1) this.completeSegment(seg);
    } else {
      seg.wrongT += dt;
      if (seg.wrongT > 0.22) this.wrongSegment(seg);
    }
  }

  completeSegment(seg: Segment) {
    if (seg.filled) return;
    this.board.complete(seg);
    this.stats.fills++;
    const now = this.clock;
    this.combo = now - this.lastFill < 3.2 ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastFill = now;
    const mult = Math.min(5, this.combo);
    const pts = 50 * mult;
    if (this.mode === 'playing') this.score += pts;
    sfx.fill(this.combo);
    const wp = this.board.surface.localToWorld(seg.centroid.clone().setZ(0.01));
    tmpC.set(POWDERS[seg.color].color);
    const nrm = new Vector3(0, 0, 1).applyQuaternion(this.board.surface.getWorldQuaternion(new Quaternion()));
    for (let i = 0; i < 40; i++) {
      const v = new Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5).addScaledVector(nrm, 0.35 + Math.random() * 0.3);
      this.fx.spawn(wp, v, tmpC, 0.006 + Math.random() * 0.006, 0.7 + Math.random() * 0.4, 3.5, -0.9);
    }
    const gold = new Color(0xffe8a8);
    for (let i = 0; i < 14; i++) {
      const v = nrm.clone().multiplyScalar(0.25).add(new Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      this.sparkle.spawn(wp, v, gold, 0.006, 0.9, 2, 0.05);
    }
    if (this.mode === 'playing') this.floatText(wp, `+${pts}${mult > 1 ? ' x' + mult : ''}`, mult > 1 ? '#ffc22e' : '#fff4e0');
    if (this.board.remaining() === 0) {
      if (this.mode === 'playing') this.endRound(true);
    }
  }

  wrongSegment(seg: Segment) {
    if (seg.flash > 0) return;
    seg.flash = 1;
    seg.wrongT = 0;
    this.stats.wrong++;
    this.combo = 0;
    sfx.wrong();
    const wp = this.board.surface.localToWorld(seg.centroid.clone().setZ(0.01));
    if (this.mode === 'playing') this.floatText(wp, `needs ${POWDERS[seg.color].name}`, '#ff8aa8');
  }

  floatText(p: Vector3, text: string, color: string) {
    const f = this.floaters.reduce((a, b) => (a.t < b.t ? a : b));
    const tc = f.label.tc;
    tc.clear();
    tc.text(text, tc.w / 2, tc.h / 2, 80, color, 'center', 800);
    tc.ctx.lineWidth = 6;
    tc.done();
    f.label.mesh.position.copy(p).add(new Vector3(0, 0.03, 0));
    f.label.mesh.visible = true;
    f.t = 1.1;
    f.v.set(0, 0.06, 0);
  }

  release(h: HandState) {
    const l = this.loaded.get(h.key);
    if (!l) return;
    if (h.kind === 'mouse') return; // mouse keeps its powder until a new bowl is picked
    this.world.scene.remove(l.orb);
    this.loaded.delete(h.key);
    const speed = h.velocity.length();
    tmpC.set(POWDERS[l.color].color);
    if (speed > 0.55 && this.playable()) {
      const dir = h.velocity.clone().normalize();
      const plane = this.boardPlane();
      const ray = new Raycaster(h.point.clone(), dir);
      const hit = ray.ray.intersectPlane(plane, new Vector3());
      if (hit && hit.distanceTo(h.point) < 0.9) {
        const local = this.board.surface.worldToLocal(hit.clone());
        if (Math.hypot(local.x, local.y) < BOARD_RADIUS + 0.02) {
          const seg = this.board.hit(local.x, local.y);
          this.flicks.push({ from: h.point.clone(), to: hit, t: 0, dur: 0.2 + hit.distanceTo(h.point) * 0.25, color: l.color, seg });
          this.stats.flicks++;
          sfx.whoosh();
          return;
        }
      }
    }
    // gentle drop puff
    for (let i = 0; i < 10; i++) {
      const v = new Vector3((Math.random() - 0.5) * 0.1, -0.05 - Math.random() * 0.1, (Math.random() - 0.5) * 0.1);
      this.fx.spawn(h.point, v, tmpC, 0.005, 0.5, 2, -1.5);
    }
  }

  updateFlicks(dt: number) {
    for (let i = this.flicks.length - 1; i >= 0; i--) {
      const f = this.flicks[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const p = f.from.clone().lerp(f.to, k);
      p.y += Math.sin(k * Math.PI) * 0.05;
      tmpC.set(POWDERS[f.color].color);
      for (let j = 0; j < 4; j++) this.fx.spawn(p, new Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1), tmpC, 0.007, 0.35, 3, -0.3);
      if (k >= 1) {
        this.flicks.splice(i, 1);
        const local = this.board.surface.worldToLocal(f.to.clone());
        for (let j = 0; j < 40; j++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.03;
          this.grains.add(local.x + Math.cos(a) * r, local.y + Math.sin(a) * r, 0.004, tmpC, 0.0035, !!f.seg && f.seg.color !== f.color);
        }
        if (f.seg && !f.seg.filled) {
          if (f.seg.color === f.color) this.completeSegment(f.seg);
          else this.wrongSegment(f.seg);
        }
      }
    }
  }

  burstAll() {
    for (const s of this.board.segments) {
      const wp = this.board.surface.localToWorld(s.centroid.clone().setZ(0.01));
      tmpC.set(POWDERS[s.color].color);
      for (let i = 0; i < 8; i++) {
        this.sparkle.spawn(wp, new Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3), tmpC, 0.008, 1.4, 1.5, -0.25);
      }
    }
  }

  handleHand(h: HandState, dt: number) {
    if (!h.tracked) return;
    let point = h.point;
    // mouse: derive a 3D point from its ray
    if (h.kind === 'mouse') {
      const bowl = this.bowlOnRay(h.ray);
      const hit = h.ray.ray.intersectPlane(this.boardPlane(), new Vector3());
      if (bowl) point = bowl.center(new Vector3());
      else if (hit && this.board.surface.worldToLocal(hit.clone()).length() < BOARD_RADIUS + 0.03) point = hit;
      else point = h.ray.ray.at(0.45, new Vector3());
      h.setPose(point, point, dt);
    }

    // UI: poke with fingertip, or (mouse) click
    if (this.mode !== 'playing') {
      for (const b of this.buttons) {
        if (!b.group.visible || !this.isShown(b)) continue;
        if (h.kind === 'hand' && b.poke(h.key, h.tip)) return this.press(b);
        if (h.kind === 'mouse' && b.rayHit(h.ray)) {
          b.hover = 1;
          if (h.pinchStart) return this.press(b);
        }
      }
    }
    if (h.kind === 'hand' || h.kind === 'controller') {
      // tutorial/round play
    }
    if (!this.playable()) {
      if (h.pinchStart && this.gazeTarget instanceof Button) this.press(this.gazeTarget);
      return;
    }

    const loaded = this.loaded.get(h.key);
    if (h.pinchStart) {
      const bowl = this.bowlAt(point);
      if (bowl) this.loadHand(h, bowl, false);
      else if (this.gazeTarget instanceof Bowl && !this.isOverBoard(point)) this.loadHand(h, this.gazeTarget, true);
      else if (this.gazeTarget instanceof Button) this.press(this.gazeTarget);
    }
    // hover feedback on bowls
    const near = this.bowlAt(point);
    if (near) near.hover = 1;
    if (h.pinchEnd) this.release(h);
    const l = this.loaded.get(h.key);
    if (l) {
      l.orb.position.copy(point);
      if (h.pinching || h.kind === 'mouse') {
        const local = this.board.surface.worldToLocal(point.clone());
        const over = Math.abs(local.z) < 0.055 && Math.hypot(local.x, local.y) < BOARD_RADIUS + 0.02;
        if (over && (h.kind !== 'mouse' || h.pinching)) this.brush(h, local, dt);
        else if (Math.random() < 0.3) {
          tmpC.set(POWDERS[l.color].color);
          this.fx.spawn(point, new Vector3((Math.random() - 0.5) * 0.02, -0.05, (Math.random() - 0.5) * 0.02), tmpC, 0.004, 0.6, 1, -0.8);
        }
      }
    }
    void loaded;
  }

  isOverBoard(p: Vector3) {
    const local = this.board.surface.worldToLocal(p.clone());
    return Math.abs(local.z) < 0.08 && Math.hypot(local.x, local.y) < BOARD_RADIUS + 0.04;
  }

  isShown(b: Button) {
    let o: any = b.group;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  press(b: Button) {
    if (!b.enabled) return;
    sfx.ensure();
    sfx.click();
    b.pressed = 1;
    b.onPress();
  }

  updateGaze() {
    // gaze picks a target among visible buttons and bowls
    const ray = this.hands.gaze;
    let target: Bowl | Button | null = null;
    for (const b of this.buttons) {
      b.gazed = false;
      if (this.isShown(b) && b.enabled && b.rayHit(ray)) target = b;
    }
    if (!target && this.playable()) target = this.bowlOnRay(ray);
    for (const b of this.bowls) b.gazeT = b === target ? 1 : 0;
    if (target instanceof Button) target.gazed = true;
    this.gazeTarget = this.inXR ? target : null;
    if (!this.inXR) for (const b of this.bowls) b.gazeT = 0;
    if (!this.inXR) for (const b of this.buttons) b.gazed = false;
  }

  updateTutorial(dt: number) {
    this.tutTimer += dt;
    const anyLoaded = this.loaded.size > 0;
    const segs = this.board.segments;
    const filled = segs.filter((s) => s.filled).length;
    const bowl = this.bowls[0];
    if (filled === 0) {
      if (!anyLoaded) {
        this.tutStep = 0;
        this.setHintOnce('Pinch the glowing bowl', 'Touch thumb + index finger inside it to scoop powder');
        bowl.tutorialPulse = true;
        this.board.highlight = null;
      } else {
        this.tutStep = 1;
        this.setHintOnce('Keep pinching and brush the petal', 'Sweep your pinched fingers just above the glowing petal');
        bowl.tutorialPulse = false;
        this.board.highlight = segs[0];
        // guide sparkles from bowl to petal
        if (Math.random() < 0.5) {
          const a = bowl.center(new Vector3());
          const b = this.board.surface.localToWorld(segs[0].centroid.clone().setZ(0.02));
          const k = (this.tutTimer * 0.8) % 1;
          const p = a.clone().lerp(b, k);
          p.y += Math.sin(k * Math.PI) * 0.06;
          this.sparkle.spawn(p, new Vector3(), new Color(0xfff1c0), 0.006, 0.5, 1, 0);
        }
      }
    } else if (filled < segs.length) {
      this.tutStep = 2;
      bowl.tutorialPulse = !anyLoaded;
      this.board.highlight = segs.find((s) => !s.filled) ?? null;
      this.setHintOnce('Beautiful! Fill the other petals', 'Tip: release with a quick flick to throw powder');
    } else {
      if (this.tutStep !== 3) {
        this.tutStep = 3;
        this.tutTimer = 0;
        sfx.fanfare();
        this.burstAll();
        this.setHintOnce("You're ready!", 'Match each petal to its powder before time runs out');
      }
      this.board.celebrate(this.clock);
      if (this.tutTimer > 2.6) this.finishTutorial();
    }
  }

  private hintKey = '';
  setHintOnce(a: string, b: string) {
    if (this.hintKey === a + b) return;
    this.hintKey = a + b;
    this.setHint(a, b);
  }

  updateHudPivot(dt: number) {
    if (!this.inXR) return;
    const dir = this.hands.headDir;
    const headYaw = Math.atan2(-dir.x, -dir.z) - this.rig.rotation.y;
    let d = headYaw - this.hudPivot.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const limit = 0.42;
    if (Math.abs(d) > limit) {
      this.hudPivot.rotation.y += (d - Math.sign(d) * limit) * Math.min(1, dt * 3);
    }
  }

  update(delta: number) {
    const dt = Math.min(0.05, Math.max(0, delta > 5 ? delta / 1000 : delta));
    this.clock += dt;
    const t = this.clock;
    const session = this.world.session;
    const inXR = !!session && this.world.visibilityState.value !== VisibilityState.NonImmersive;
    if (inXR !== this.inXR) {
      this.inXR = inXR;
      this.anchored = false;
      this.onEnvironmentChange();
      if (!inXR) this.placeDesktop();
    }
    const ref = this.world.xrReferenceSpace;
    if (ref && ref !== this.boundRef) {
      this.boundRef = ref;
      ref.addEventListener('reset', () => this.recenter());
    }
    if (inXR && !this.anchored && this.world.xrFrame) {
      if (this.anchorToHead(this.world.xrFrame, this.world.xrReferenceSpace)) this.onEnvironmentChange();
    }

    this.hands.update(this.world.xrFrame, this.world.xrReferenceSpace, this.world.player, this.world.camera, this.world.camera, dt, inXR);
    this.updateGaze();
    this.updateHudPivot(dt);

    for (const h of [this.hands.left, this.hands.right, this.hands.mouse]) this.handleHand(h, dt);
    this.updateFlicks(dt);

    if (this.mode === 'tutorial') this.updateTutorial(dt);
    if (this.mode === 'playing') {
      this.timeLeft -= dt;
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 10 && sec !== this.lastTickSec && sec > 0) sfx.tick(sec <= 5);
      this.lastTickSec = sec;
      if (this.hintTimer > 0) {
        this.hintTimer -= dt;
        if (this.hintTimer <= 0) this.hint.mesh.visible = false;
      }
      this.drawHud();
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRound(false);
      }
    }
    if (this.mode === 'result' && this.resultInfo?.won) this.board.celebrate(t);

    this.board.update(dt, t);
    for (const b of this.bowls) b.update(dt, t);
    for (const b of this.buttons) b.update(dt);
    this.courtyard.update(t);

    // floaters face the head
    for (const f of this.floaters) {
      if (f.t <= 0) continue;
      f.t -= dt;
      f.label.mesh.position.addScaledVector(f.v, dt);
      f.label.mesh.lookAt(this.hands.headPos);
      (f.label.mesh.material as MeshBasicMaterial).opacity = Math.min(1, f.t * 2);
      if (f.t <= 0) f.label.mesh.visible = false;
    }

    // particle point-size scale
    let scale = 600;
    if (inXR && session?.renderState.baseLayer) scale = session.renderState.baseLayer.framebufferHeight * 0.45;
    else scale = (this.world.renderer.domElement.height / 2) * 1.73;
    this.fx.update(dt, scale);
    this.sparkle.update(dt, scale);
    this.grains.update(dt, scale);
  }
}

// keep tree-shaking honest for unused imports in some toolchains
void Euler;
