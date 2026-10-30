// Unified input: tracked hands (primary), controllers (optional), mouse (desktop).
// Hand pinch is detected from raw WebXR joint poses (thumb tip <-> index tip).
import { Object3D, Raycaster, Vector2, Vector3, Camera } from '@iwsdk/core';

export type HandKey = 'left' | 'right' | 'mouse';

export class HandState {
  tracked = false;
  kind: 'hand' | 'controller' | 'mouse' = 'hand';
  tip = new Vector3(); // index fingertip (poke)
  point = new Vector3(); // pinch point (between thumb & index)
  pinching = false;
  pinchStart = false;
  pinchEnd = false;
  pinchDist = 1;
  velocity = new Vector3();
  private last = new Vector3();
  private hasLast = false;
  ray = new Raycaster();
  constructor(public key: HandKey) {}

  setPose(tip: Vector3, point: Vector3, dt: number) {
    this.tip.copy(tip);
    this.point.copy(point);
    if (this.hasLast && dt > 0) {
      const v = point.clone().sub(this.last).divideScalar(dt);
      this.velocity.lerp(v, 0.5);
    }
    this.last.copy(point);
    this.hasLast = true;
  }

  setPinch(p: boolean) {
    this.pinchStart = p && !this.pinching;
    this.pinchEnd = !p && this.pinching;
    this.pinching = p;
  }

  lost() {
    this.tracked = false;
    this.hasLast = false;
    this.velocity.set(0, 0, 0);
    this.setPinch(false);
  }
}

const PINCH_ON = 0.022;
const PINCH_OFF = 0.04;

export class InputHub {
  left = new HandState('left');
  right = new HandState('right');
  mouse = new HandState('mouse');
  /** desktop mouse state */
  mouseNdc = new Vector2(0, 0);
  mouseDown = false;
  mouseInside = false;
  gaze = new Raycaster();
  headPos = new Vector3();
  headDir = new Vector3(0, 0, -1);
  private t = new Vector3();
  private t2 = new Vector3();

  constructor(canvas: HTMLElement) {
    this.mouse.kind = 'mouse';
    const upd = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.mouseNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.mouseInside = true;
    };
    canvas.addEventListener('pointermove', upd);
    canvas.addEventListener('pointerdown', (e) => {
      upd(e);
      this.mouseDown = true;
    });
    window.addEventListener('pointerup', () => (this.mouseDown = false));
    canvas.addEventListener('pointerleave', () => (this.mouseInside = false));
  }

  hands() {
    return [this.left, this.right];
  }

  update(frame: XRFrame | null, ref: XRReferenceSpace | null, origin: Object3D, head: Object3D, camera: Camera, dt: number, inXR: boolean) {
    // gaze (head ray)
    head.getWorldPosition(this.headPos);
    head.getWorldDirection(this.headDir);
    // Object3D.getWorldDirection returns +Z for cameras' local; cameras look down -Z
    if ((head as any).isCamera) {
      // cameras: getWorldDirection already returns the look direction
    } else {
      this.headDir.negate();
    }
    this.gaze.set(this.headPos, this.headDir);

    const seen = { left: false, right: false };
    if (inXR && frame && ref) {
      origin.updateMatrixWorld();
      for (const src of frame.session.inputSources) {
        const hand = src.handedness === 'left' ? this.left : src.handedness === 'right' ? this.right : null;
        if (!hand) continue;
        if (src.hand) {
          const tipJ = src.hand.get('index-finger-tip');
          const thJ = src.hand.get('thumb-tip');
          if (!tipJ || !thJ) continue;
          const tp = frame.getJointPose?.(tipJ, ref);
          const th = frame.getJointPose?.(thJ, ref);
          if (!tp || !th) continue;
          const a = this.t.set(tp.transform.position.x, tp.transform.position.y, tp.transform.position.z);
          const b = this.t2.set(th.transform.position.x, th.transform.position.y, th.transform.position.z);
          const dist = a.distanceTo(b);
          hand.pinchDist = dist;
          const mid = a.clone().add(b).multiplyScalar(0.5);
          origin.localToWorld(a);
          origin.localToWorld(mid);
          hand.kind = 'hand';
          hand.tracked = true;
          hand.setPose(a, mid, dt);
          hand.setPinch(hand.pinching ? dist < PINCH_OFF : dist < PINCH_ON);
          seen[src.handedness as 'left' | 'right'] = true;
        } else if (src.gripSpace || src.targetRaySpace) {
          const pose = frame.getPose(src.gripSpace ?? src.targetRaySpace, ref);
          if (!pose) continue;
          const p = this.t.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
          // tool tip ~6cm ahead of the grip, along the controller's forward
          const o = pose.transform.orientation;
          const fwd = new Vector3(0, 0, -1).applyQuaternion({ x: o.x, y: o.y, z: o.z, w: o.w } as any);
          const tip = p.clone().addScaledVector(fwd, 0.06);
          origin.localToWorld(tip);
          hand.kind = 'controller';
          hand.tracked = true;
          hand.setPose(tip, tip, dt);
          const pressed = !!src.gamepad && (src.gamepad.buttons[0]?.pressed || src.gamepad.buttons[1]?.pressed);
          hand.setPinch(!!pressed);
          seen[src.handedness as 'left' | 'right'] = true;
        }
      }
    }
    if (!seen.left) this.left.lost();
    if (!seen.right) this.right.lost();

    // desktop mouse
    if (!inXR && this.mouseInside) {
      this.mouse.tracked = true;
      this.mouse.ray.setFromCamera(this.mouseNdc, camera);
      this.mouse.setPinch(this.mouseDown);
    } else {
      this.mouse.lost();
    }
  }
}
