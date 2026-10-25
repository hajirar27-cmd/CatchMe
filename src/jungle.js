import * as THREE from '../vendor/three.module.min.js';
import { LANES } from './constants.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const TILE = 40; // length of a ground tile along z
const TILES = 6;
const GROUND_W = 90;
const PATH_HALF = 3.5;

// Props the ninja interacts with. They sit in the lanes; x is the lane-ish centre, z runs along the path.
// w = width across the path (x), d = length along the path (z).
const SPECS = {
  house: { w: 3.8, d: 5.4, h: 3.8, roofY: 5.65, cueY: 6.3 },
  tent: { w: 3.2, d: 3.2, h: 3.6, cueY: 4.4 },
  canopy: { w: 4.4, d: 3.4, h: 3.9, cueY: 4.7 },
  tree: { w: 2.0, d: 2.0, h: 13, branchY: 5.0, cueY: 5.2 },
  pond: { w: 7.6, d: 4.6, h: 0 },
  bush: { w: 3.0, d: 1.8, h: 3.0, cueY: 3.6 },
};
export const BRANCH_LEN = 8.4;

export class Jungle {
  constructor(scene) {
    this.scene = scene;
    this.props = [];
    this.decor = [];
    this.cursor = 18;
    this.decorCursor = 8;
    this.lastType = '';
    this.tiles = [];
    this.gates = [];
    this.time = 0;
    this.ripples = [];

    this.makeMaterials();
    this.makeGeometry();

    for (let i = 0; i < TILES; i++) {
      const t = this.buildTile();
      t.position.z = (i - 1) * TILE;
      scene.add(t);
      this.tiles.push(t);
    }
    this.buildForest();
    this.buildUnderstory();
    this.buildFireflies();
  }

  // ---------- assets ----------
  makeMaterials() {
    const ground = canvasTex(2048, 1024, (g, w, h) => {
      g.fillStyle = '#15321d';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 52000; i++) {
        g.fillStyle = `rgba(${20 + Math.random() * 50},${60 + Math.random() * 80},${30 + Math.random() * 40},${0.25 + Math.random() * 0.4})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3 + Math.random() * 8);
      }
      // dirt path band, centred on x = 0
      const cx = w / 2;
      const half = (PATH_HALF / GROUND_W) * w;
      g.fillStyle = '#4b3a27';
      g.fillRect(cx - half, 0, half * 2, h);
      for (let i = 0; i < 260; i++) {
        const y = Math.random() * h;
        g.fillStyle = '#4b3a27';
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.arc(cx + sx * half + (Math.random() - 0.5) * 24, y, 12 + Math.random() * 16, 0, 7);
          g.fill();
        }
      }
      for (let i = 0; i < 16000; i++) {
        g.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 50},${40 + Math.random() * 30},${Math.random() * 0.5})`;
        g.fillRect(cx - half + Math.random() * half * 2, Math.random() * h, 2 + Math.random() * 4, 2);
      }
      // worn track marks
      g.fillStyle = 'rgba(30,22,14,0.35)';
      for (const lx of LANES) g.fillRect(cx + (lx / GROUND_W) * w - 8, 0, 16, h);
    });
    const planks = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#7a5836'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = x % 32 ? '#6c4c2d' : '#82603c';
        g.fillRect(x, 0, 15, h);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 15, 0, 1, h);
      }
    });
    const stripes = canvasTex(128, 128, (g, w, h) => {
      for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#e9dcc0' : '#b8322f'; g.fillRect(x, 0, 16, h); }
    });
    const thatch = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#8c7a42'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = `rgba(${60 + Math.random() * 60},${50 + Math.random() * 50},20,0.55)`;
        const x = Math.random() * w;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 6, h); g.stroke();
      }
    });

    this.m = {
      ground: new THREE.MeshLambertMaterial({ map: ground }),
      plank: new THREE.MeshLambertMaterial({ map: planks, emissive: 0x2a1c0e }),
      thatch: new THREE.MeshLambertMaterial({ map: thatch, emissive: 0x2a2410 }),
      stripe: new THREE.MeshLambertMaterial({ map: stripes, emissive: 0x2a1818 }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x5a4632, emissive: 0x1e160e }),
      leaf: [0x24603a, 0x2c7344, 0x1c4e30].map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: 0x0b2415 })),
      dark: new THREE.MeshLambertMaterial({ color: 0x22150a, emissive: 0x080400 }),
      stone: new THREE.MeshLambertMaterial({ color: 0x7b8a86, emissive: 0x1c2422 }),
      warm: new THREE.MeshBasicMaterial({ color: 0xffc766 }),
      water: new THREE.MeshLambertMaterial({ color: 0x14586a, emissive: 0x0d4352, transparent: true, opacity: 0.92 }),
      bank: new THREE.MeshLambertMaterial({ color: 0x3a2d1d }),
      pad: new THREE.MeshLambertMaterial({ color: 0x3f9a58, emissive: 0x0f3a1c }),
      cloth: new THREE.MeshLambertMaterial({ color: 0xb8322f, emissive: 0x3a0d0c, side: THREE.DoubleSide }),
    };

    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gg = gc.getContext('2d');
    const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(gc);
    this.glowMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffa640, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  makeGeometry() {
    this.geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
      ico: new THREE.IcosahedronGeometry(1, 1),
      cone4: new THREE.ConeGeometry(1, 1, 4),
      tent: new THREE.CylinderGeometry(0.28, 1, 1, 4),
      circle: new THREE.CircleGeometry(1, 28),
      ring: new THREE.RingGeometry(0.9, 1, 32),
    };
  }

  mesh(geo, mat, sx, sy, sz, x, y, z, group, occ = false) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    group.add(m);
    if (occ) group.userData.occ.push(m);
    return m;
  }

  glow(group, x, y, z, size, color = 0xffa640) {
    const m = this.glowMat.clone();
    m.color.setHex(color);
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    group.add(s);
  }

  // ---------- static scenery ----------
  buildTile() {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_W, TILE), this.m.ground);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0, TILE / 2);
    g.add(plane);
    return g;
  }

  buildForest() {
    this.forestN = 210;
    const N = this.forestN;
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.55, 18, 7);
    trunkGeo.translate(0, 9, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const mk = (geo, emissive) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive }), N);
      im.frustumCulled = false;
      this.scene.add(im);
      return im;
    };
    this.fTrunk = mk(trunkGeo, 0x14100a);
    this.fCrownA = mk(crownGeo, 0x081a0f);
    this.fCrownB = mk(crownGeo, 0x081a0f);
    this.slots = [];
    this.forestMax = -30;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.slots.push({ z: 0 });
      this.fTrunk.setColorAt(i, col.setHex(0x4a3a2a).offsetHSL(0, 0, rand(-0.03, 0.04)));
      this.fCrownA.setColorAt(i, col.setHex(pick([0x1f5a36, 0x28683f, 0x1a4a2d])));
      this.fCrownB.setColorAt(i, col.setHex(pick([0x246238, 0x2f7a47, 0x1c5232])));
    }
    this.fTrunk.instanceColor.needsUpdate = true;
    this.fCrownA.instanceColor.needsUpdate = true;
    this.fCrownB.instanceColor.needsUpdate = true;
    for (let i = 0; i < N; i++) this.placeTree(i, (this.forestMax += rand(0.5, 1.3)));
  }

  placeTree(i, z) {
    const s = this.slots[i];
    s.z = z;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * rand(6.4, 30);
    const sc = rand(0.7, 1.4);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, 6), 0));
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, rand(0.9, 1.3), sc));
    this.fTrunk.setMatrixAt(i, m);
    const top = 11 * sc + 1.5;
    m.compose(new THREE.Vector3(x + rand(-1, 1), top, z), q, new THREE.Vector3(4 * sc, 3 * sc, 4 * sc));
    this.fCrownA.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x + rand(-2, 2), top + 3.5 * sc, z + rand(-1, 1)), q, new THREE.Vector3(3.2 * sc, 2.6 * sc, 3.2 * sc));
    this.fCrownB.setMatrixAt(i, m);
    this.forestMax = Math.max(this.forestMax, z);
  }

  buildUnderstory() {
    const N = 300;
    this.uN = N;
    this.under = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x0a2414 }),
      N
    );
    this.under.frustumCulled = false;
    this.scene.add(this.under);
    this.uSlots = new Array(N).fill(0);
    this.uMax = -30;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.under.setColorAt(i, col.setHex(pick([0x2a7a46, 0x226a3c, 0x338a50, 0x1c5a34])));
      this.placeUnder(i, (this.uMax += rand(0.2, 0.7)));
    }
    this.under.instanceColor.needsUpdate = true;
  }

  placeUnder(i, z) {
    this.uSlots[i] = z;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * rand(3.9, 12);
    const sc = rand(0.5, 1.5);
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(x, sc * 0.3, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, 6), 0)),
      new THREE.Vector3(sc * rand(1.2, 1.8), sc * rand(0.5, 0.9), sc * rand(1.0, 1.5))
    );
    this.under.setMatrixAt(i, m);
    this.uMax = Math.max(this.uMax, z);
  }

  buildFireflies() {
    const n = 80;
    this.ffBase = [];
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.ffBase.push({ x: rand(-9, 9), y: rand(0.5, 6), z: rand(0, 40), p: rand(0, 6) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: this.glowTex, color: 0xd8ff7a, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  // ---------- props ----------
  // Builds the visual for a prop type into group `g` (front of the prop faces -z, toward the camera).
  buildProp(type, g, spec, branchSide = 1) {
    const m = this.m;
    const geo = this.geo;

    if (type === 'house') {
      this.mesh(geo.box, m.plank, 3.6, 3.8, 5.2, 0, 1.9, 0, g, true);
      const rise = 1.7, run = 2.3, len = Math.hypot(rise, run), ang = Math.atan2(rise, run);
      const a = this.mesh(geo.box, m.thatch, len, 0.3, 5.9, -run / 2, 3.8 + rise / 2, 0, g, true);
      a.rotation.z = ang;
      const b = this.mesh(geo.box, m.thatch, len, 0.3, 5.9, run / 2, 3.8 + rise / 2, 0, g, true);
      b.rotation.z = -ang;
      this.mesh(geo.box, m.dark, 1.1, 2.3, 0.12, -0.5, 1.15, -2.65, g);
      this.mesh(geo.box, m.warm, 0.8, 0.8, 0.1, 1.0, 2.5, -2.65, g);
      this.mesh(geo.box, m.dark, 1.0, 0.1, 0.1, 1.0, 2.5, -2.7, g);
      this.mesh(geo.box, m.stone, 2.6, 0.3, 0.9, 0, 0.15, -3.0, g);
      this.glow(g, -1.4, 3.1, -3.1, 3.4);
    } else if (type === 'tent') {
      const t = this.mesh(geo.tent, m.stripe, 2.5, 3.6, 2.5, 0, 1.8, 0, g, true);
      t.rotation.y = Math.PI / 4;
      this.mesh(geo.cyl, m.dark, 0.05, 1.0, 0.05, 0, 4.1, 0, g);
      const flag = this.mesh(geo.cone4, m.cloth, 0.22, 0.5, 0.05, 0.2, 4.45, 0, g);
      flag.rotation.z = -Math.PI / 2;
      this.mesh(geo.box, m.dark, 1.0, 1.6, 0.1, 0, 0.8, -1.3, g);
      this.glow(g, 0, 1.2, -1.9, 3.2);
    } else if (type === 'canopy') {
      for (const px of [-2.0, 2.0]) for (const pz of [-1.5, 1.5]) this.mesh(geo.cyl, m.trunk, 0.1, 3.6, 0.1, px, 1.8, pz, g);
      const cloth = this.mesh(geo.box, m.stripe, 4.6, 0.12, 3.6, 0, 3.75, 0, g, false);
      cloth.rotation.x = -0.12;
      this.mesh(geo.box, m.plank, 4.0, 2.2, 0.9, 0, 1.1, -1.0, g, true);
      this.mesh(geo.box, m.dark, 0.8, 0.6, 0.8, -1.2, 2.5, -1.0, g);
      this.mesh(geo.box, m.dark, 0.7, 0.5, 0.7, 0.3, 2.45, -1.0, g);
      this.mesh(geo.cyl, m.stone, 0.4, 0.5, 0.4, 1.4, 2.45, -1.0, g);
      this.mesh(geo.box, m.plank, 1.2, 1.4, 0.2, 0, 0.9, 1.45, g);
      this.glow(g, 0, 3.0, -1.7, 4.0);
    } else if (type === 'tree') {
      this.mesh(geo.cyl, m.trunk, 0.95, 13, 0.95, 0, 6.5, 0, g, true);
      this.mesh(geo.cyl, m.trunk, 1.5, 1.6, 1.5, 0, 0.8, 0, g, true);
      // a long limb running along the path, ninja-runnable
      const bx = branchSide * 1.45;
      const br = this.mesh(geo.cyl, m.trunk, 0.34, BRANCH_LEN, 0.34, bx, spec.branchY - 0.4, 0, g);
      br.rotation.x = Math.PI / 2;
      const stub = this.mesh(geo.cyl, m.trunk, 0.22, 1.5, 0.22, branchSide * 0.8, spec.branchY - 0.4, 0, g);
      stub.rotation.z = Math.PI / 2;
      for (const sz of [-BRANCH_LEN / 2, BRANCH_LEN / 2]) this.mesh(geo.ico, m.leaf[1], 0.8, 0.6, 1.0, bx, spec.branchY - 0.1, sz, g);
      for (const [cx, cy, cz, r] of [[0, 13.5, 0, 4.2], [-2.5, 12.5, 0.6, 3.2], [2.8, 12.8, -0.4, 3.4], [0.5, 15.5, 0.3, 3.0]]) {
        this.mesh(geo.ico, pick(m.leaf), r, r * 0.75, r, cx, cy, cz, g);
      }
      for (let i = 0; i < 6; i++) this.mesh(geo.cyl, m.leaf[2], 0.04, rand(2.5, 5), 0.04, rand(-2.4, 2.4), 9.5, rand(-1.8, 1.8), g);
    } else if (type === 'pond') {
      const bank = this.mesh(geo.circle, m.bank, spec.w / 2 + 0.35, spec.d / 2 + 0.35, 1, 0, 0.03, 0, g);
      bank.rotation.x = -Math.PI / 2;
      const water = this.mesh(geo.circle, m.water, spec.w / 2, spec.d / 2, 1, 0, 0.06, 0, g);
      water.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const pad = this.mesh(geo.circle, m.pad, rand(0.25, 0.45), rand(0.25, 0.45), 1, rand(-3.2, 3.2), 0.09, rand(-1.6, 1.6), g);
        pad.rotation.x = -Math.PI / 2;
      }
      for (let i = 0; i < 10; i++) {
        const a = rand(0, Math.PI * 2);
        this.mesh(geo.cone4, m.leaf[2], 0.12, rand(1.0, 1.7), 0.12, Math.cos(a) * (spec.w / 2 + 0.1), 0.65, Math.sin(a) * (spec.d / 2 + 0.1), g);
      }
      for (let i = 0; i < 2; i++) {
        const r = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.4, depthWrite: false }));
        r.rotation.x = -Math.PI / 2;
        r.position.set(rand(-2.5, 2.5), 0.1, rand(-1, 1));
        g.add(r);
        this.ripples.push({ m: r, t: rand(0, 2), g });
      }
    } else if (type === 'bush') {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const r = rand(0.95, 1.3);
        this.mesh(geo.ico, pick(m.leaf), r * 1.1, r * 1.25, r, (i / (n - 1) - 0.5) * 2.2, 1.1 + rand(0, 0.5), rand(-0.3, 0.3), g, true);
        this.mesh(geo.ico, pick(m.leaf), r * 0.9, r * 0.9, r * 0.9, (i / (n - 1) - 0.5) * 2.0, 2.2 + rand(0, 0.3), rand(-0.2, 0.2), g, true);
      }
    }
  }

  makeProp(type, x, z) {
    const spec = SPECS[type];
    const g = new THREE.Group();
    g.userData.occ = [];
    g.position.set(x, 0, z);
    const branchSide = x < 0 ? 1 : x > 0 ? -1 : (Math.random() < 0.5 ? -1 : 1);
    this.buildProp(type, g, spec, branchSide);
    this.scene.add(g);
    return { type, x, z, w: spec.w, d: spec.d, h: spec.h, roofY: spec.roofY, branchY: spec.branchY, branchSide, cueY: spec.cueY || 3, group: g };
  }

  laneFor(type) {
    if (type === 'house') return pick([-1.1, 1.1]);
    if (type === 'canopy') return pick([-1.1, 1.1]);
    if (type === 'tent' || type === 'bush') return pick([-2, 2]);
    if (type === 'tree') return pick([-2, 0, 2]);
    return 0; // pond spans the path
  }

  spawnProps(upTo, exitZ, level) {
    while (this.cursor < upTo) {
      if (this.cursor > exitZ - 10 && this.cursor < exitZ + 10) { this.cursor = exitZ + 10; continue; }
      let type;
      do {
        type = pick(['house', 'house', 'tent', 'tent', 'canopy', 'tree', 'tree', 'pond', 'bush', 'bush']);
      } while (type === this.lastType);
      this.lastType = type;
      const spec = SPECS[type];
      const z = this.cursor + spec.d / 2;
      this.props.push(this.makeProp(type, this.laneFor(type), z));
      this.cursor = z + spec.d / 2 + rand(8, 12.5) - Math.min(level, 6) * 0.4;
    }
    // scenery huts lining the path (not interactive)
    while (this.decorCursor < upTo) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const type = pick(['house', 'house', 'tent', 'canopy']);
      const spec = SPECS[type];
      const g = new THREE.Group();
      g.userData.occ = [];
      g.position.set(side * rand(7.6, 10.5), 0, this.decorCursor);
      g.rotation.y = side * -Math.PI / 2; // front faces the path
      this.buildProp(type, g, spec, 1);
      this.scene.add(g);
      this.decor.push({ z: this.decorCursor, group: g });
      this.decorCursor += rand(9, 16);
    }
  }

  // next interactive prop whose front edge is beyond z
  nextProp(z) {
    for (const p of this.props) if (p.z - p.d / 2 > z) return p;
    return null;
  }

  occluders(camZ, nearZ) {
    const out = [];
    for (const p of this.props) {
      if (p.z + p.d / 2 < camZ + 3.2) continue;
      if (Math.abs(p.z - nearZ) < 16) out.push(...p.group.userData.occ);
    }
    return out;
  }

  addGate(z) {
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    const m = this.m;
    for (const sx of [-3.6, 3.6]) {
      this.mesh(this.geo.box, m.stone, 1.0, 6.4, 1.0, sx, 3.2, 0, g);
      this.mesh(this.geo.ico, m.stone, 0.8, 0.5, 0.8, sx, 6.5, 0, g);
    }
    this.mesh(this.geo.box, m.stone, 8.2, 0.9, 1.1, 0, 6.4, 0, g);
    const portal = new THREE.Mesh(
      this.geo.circle,
      new THREE.MeshBasicMaterial({ color: 0x8a6bff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    portal.scale.set(3.2, 3.0, 1);
    portal.position.set(0, 3.2, 0.05);
    g.add(portal);
    this.glow(g, 0, 3.2, -0.5, 12, 0x8a6bff);
    this.scene.add(g);
    this.gates.push({ z, g, portal });
  }

  reset(fromZ) {
    for (const p of this.props) this.scene.remove(p.group);
    this.props.length = 0;
    this.ripples.length = 0;
    for (const gt of this.gates) this.scene.remove(gt.g);
    this.gates.length = 0;
    this.cursor = fromZ + 18;
    this.lastType = '';
  }

  update(camZ, dt, exitZ, level) {
    this.time += dt;
    for (const t of this.tiles) {
      if (t.position.z + TILE < camZ - 15) t.position.z += TILE * TILES;
    }
    let dirty = false;
    for (let i = 0; i < this.forestN; i++) {
      if (this.slots[i].z < camZ - 22) {
        this.placeTree(i, this.forestMax + rand(0.5, 1.3));
        dirty = true;
      }
    }
    if (dirty) {
      this.fTrunk.instanceMatrix.needsUpdate = true;
      this.fCrownA.instanceMatrix.needsUpdate = true;
      this.fCrownB.instanceMatrix.needsUpdate = true;
    }
    let ud = false;
    for (let i = 0; i < this.uN; i++) {
      if (this.uSlots[i] < camZ - 22) { this.placeUnder(i, this.uMax + rand(0.2, 0.7)); ud = true; }
    }
    if (ud) this.under.instanceMatrix.needsUpdate = true;

    this.spawnProps(camZ + 100, exitZ, level);

    this.props = this.props.filter((p) => {
      if (p.z + p.d < camZ - 20) { this.scene.remove(p.group); return false; }
      // things that have slipped under the chase camera are hidden
      p.group.visible = p.z + p.d / 2 > camZ + 3.2;
      return true;
    });
    this.decor = this.decor.filter((d) => {
      if (d.z < camZ - 22) { this.scene.remove(d.group); return false; }
      return true;
    });
    this.gates = this.gates.filter((gt) => {
      if (gt.z < camZ - 25) { this.scene.remove(gt.g); return false; }
      gt.portal.scale.y = 3.0 + Math.sin(this.time * 4) * 0.08;
      return true;
    });
    this.ripples = this.ripples.filter((r) => r.g.parent);
    for (const r of this.ripples) {
      r.t = (r.t + dt * 0.5) % 1;
      r.m.scale.setScalar(0.3 + r.t * 1.4);
      r.m.material.opacity = 0.4 * (1 - r.t);
    }
    const pos = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.ffBase.length; i++) {
      const f = this.ffBase[i];
      pos.setXYZ(i, f.x + Math.sin(this.time * 0.5 + f.p) * 1.2, f.y + Math.sin(this.time * 0.8 + f.p * 2) * 0.5, camZ + 4 + f.z + Math.cos(this.time * 0.4 + f.p) * 1.0);
    }
    pos.needsUpdate = true;
  }
}
