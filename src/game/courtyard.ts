// Cozy dusk courtyard, shown only when passthrough is unavailable
// (desktop browser, emulator VR mode, or an opaque headset session).
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  ConeGeometry,
  TorusGeometry,
} from '@iwsdk/core';

function skyDome() {
  const geo = new SphereGeometry(40, 32, 16);
  const top = new Color(0x1d1b4a);
  const mid = new Color(0x8a3b5c);
  const hor = new Color(0xffa25a);
  const cols: number[] = [];
  const p = geo.attributes.position;
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 40;
    if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.6));
    else c.copy(hor).lerp(mid, Math.max(0, y / 0.25));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3));
  return new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false, fog: false }));
}

function floorTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const tiles = 4;
  const ts = S / tiles;
  for (let i = 0; i < tiles; i++)
    for (let j = 0; j < tiles; j++) {
      const v = 200 + Math.random() * 30;
      g.fillStyle = `rgb(${v},${v * 0.8},${v * 0.62})`;
      g.fillRect(i * ts, j * ts, ts, ts);
      for (let k = 0; k < 400; k++) {
        g.fillStyle = `rgba(90,50,30,${Math.random() * 0.12})`;
        g.fillRect(i * ts + Math.random() * ts, j * ts + Math.random() * ts, 2, 2);
      }
      g.strokeStyle = 'rgba(80,45,30,0.55)';
      g.lineWidth = 4;
      g.strokeRect(i * ts + 2, j * ts + 2, ts - 4, ts - 4);
    }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class Courtyard {
  group = new Group();
  private lights: Mesh[] = [];
  private flames: Mesh[] = [];

  constructor() {
    this.group.add(skyDome());
    const floor = new Mesh(
      new PlaneGeometry(12, 12),
      new MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // low sandstone walls with a jaali-like cap
    const wallMat = new MeshStandardMaterial({ color: 0xd99a6c, roughness: 0.85 });
    const capMat = new MeshStandardMaterial({ color: 0xf0d2a8, roughness: 0.7 });
    const walls: [number, number, number, number][] = [
      [0, -3.2, 6.4, 0],
      [-3.2, 0, 6.4, Math.PI / 2],
      [3.2, 0, 6.4, Math.PI / 2],
    ];
    for (const [x, z, len, rot] of walls) {
      const w = new Mesh(new BoxGeometry(len, 1.1, 0.25), wallMat);
      w.position.set(x, 0.55, z);
      w.rotation.y = rot;
      const cap = new Mesh(new BoxGeometry(len + 0.1, 0.08, 0.34), capMat);
      cap.position.set(x, 1.14, z);
      cap.rotation.y = rot;
      this.group.add(w, cap);
    }
    // arches on the back wall
    const archMat = new MeshStandardMaterial({ color: 0x8c3b3b, roughness: 0.8 });
    for (const x of [-1.6, 0, 1.6]) {
      const pillarL = new Mesh(new BoxGeometry(0.18, 2.2, 0.3), capMat);
      pillarL.position.set(x - 0.55, 1.1, -3.05);
      const pillarR = pillarL.clone();
      pillarR.position.x = x + 0.55;
      const arch = new Mesh(new TorusGeometry(0.55, 0.09, 8, 24, Math.PI), archMat);
      arch.position.set(x, 2.2, -3.05);
      this.group.add(pillarL, pillarR, arch);
    }

    // string lights (catenary) above
    const bulbGeo = new SphereGeometry(0.03, 8, 6);
    const warm = [0xffd27a, 0xffa94d, 0xff7aa2, 0x9ad0ff];
    const strands: [Vector3, Vector3][] = [
      [new Vector3(-3, 2.6, -3), new Vector3(3, 2.6, -3)],
      [new Vector3(-3, 2.7, -3), new Vector3(3, 2.5, 1.5)],
      [new Vector3(3, 2.7, -3), new Vector3(-3, 2.5, 1.5)],
    ];
    for (const [a, b] of strands) {
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.6;
      const curve = new CatmullRomCurve3([a, mid, b]);
      const n = 22;
      const pts = curve.getPoints(n);
      const wire = new BufferGeometry().setFromPoints(pts);
      void wire;
      pts.forEach((p, i) => {
        const m = new Mesh(bulbGeo, new MeshBasicMaterial({ color: warm[i % warm.length] }));
        m.position.copy(p);
        this.lights.push(m);
        this.group.add(m);
      });
    }

    // clay diyas along the wall base
    const clay = new MeshStandardMaterial({ color: 0xa4502a, roughness: 0.8 });
    const flameMat = new MeshBasicMaterial({ color: 0xffc04d });
    for (let i = 0; i < 14; i++) {
      const x = -2.8 + i * 0.43;
      const d = new Mesh(new CylinderGeometry(0.06, 0.035, 0.04, 12), clay);
      d.position.set(x, 0.02, -2.85);
      const f = new Mesh(new ConeGeometry(0.015, 0.05, 8), flameMat);
      f.position.set(x, 0.07, -2.85);
      this.flames.push(f);
      this.group.add(d, f);
    }
    // potted tulsi-like plants
    const pot = new MeshStandardMaterial({ color: 0xb5651d, roughness: 0.8 });
    const leaf = new MeshStandardMaterial({ color: 0x3f8f45, roughness: 0.9 });
    for (const [x, z] of [[-2.6, -2.4], [2.6, -2.4], [-2.7, 0.5], [2.7, 0.5]]) {
      const p = new Mesh(new CylinderGeometry(0.22, 0.16, 0.4, 16), pot);
      p.position.set(x, 0.2, z);
      const b = new Mesh(new SphereGeometry(0.32, 12, 10), leaf);
      b.position.set(x, 0.62, z);
      b.scale.y = 1.2;
      this.group.add(p, b);
    }
    // a low wooden chowki (table) under the board, sized for a seated player
    const wood = new MeshStandardMaterial({ color: 0x6b3d22, roughness: 0.7 });
    const top = new Mesh(new BoxGeometry(0.9, 0.04, 0.6), wood);
    top.name = 'chowki-top';
    this.group.add(top);
    this.chowki = top;
  }

  chowki: Mesh;

  update(t: number) {
    this.flames.forEach((f, i) => {
      const s = 1 + 0.18 * Math.sin(t * 13 + i * 1.7) + 0.08 * Math.sin(t * 29 + i);
      f.scale.set(1, s, 1);
    });
    this.lights.forEach((l, i) => {
      const m = l.material as MeshBasicMaterial;
      const k = 0.75 + 0.25 * Math.sin(t * 1.5 + i * 0.9);
      m.color.setHSL(((i % 4) * 0.08 + 0.05) % 1, 0.9, 0.55 + 0.15 * k);
    });
  }
}
