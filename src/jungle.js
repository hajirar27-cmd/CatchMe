import * as THREE from '../vendor/three.module.min.js';

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

const TILE = 40;
const TILES = 5;
const GROUND_D = 80; // tile depth along z, centred on z=15 (so z -25..55)

// Props the ninja interacts with. layer: fg = between camera and path, mid = on the path, bg = behind it.
const SPECS = {
  house: { w: 6.4, d: 3.8, h: 4.2, roofY: 5.95, cueY: 6.6 },
  tent: { w: 4.4, d: 4.4, h: 3.8, cueY: 4.6 },
  canopy: { w: 6.2, d: 3.8, h: 3.9, cueY: 4.7 },
  tree: { w: 2.4, d: 2.4, h: 13, branchY: 5.4, cueY: 5.4 },
  pond: { w: 7.6, d: 5.0, h: 0 },
  bush: { w: 3.4, d: 1.8, h: 2.4, cueY: 3.0 },
};

export class Jungle {
  constructor(scene) {
    this.scene = scene;
    this.props = [];
    this.cursor = 14;
    this.lastType = '';
    this.tiles = [];
    this.gates = [];
    this.time = 0;
    this.ripples = [];

    this.makeMaterials();
    this.makeGeometry();

    for (let i = 0; i < TILES; i++) {
      const t = this.buildTile();
      t.position.x = (i - 1) * TILE;
      scene.add(t);
      this.tiles.push(t);
    }
    this.buildForest();
    this.buildUnderstory();
    this.buildFireflies();
  }

  // ---------- assets ----------
  makeMaterials() {
    const ground = canvasTex(1024, 2048, (g, w, h) => {
      g.fillStyle = '#15321d';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) {
        g.fillStyle = `rgba(${20 + Math.random() * 50},${60 + Math.random() * 80},${30 + Math.random() * 40},${0.25 + Math.random() * 0.4})`;
        const s = 3 + Math.random() * 8;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, s);
      }
      // dirt path band between z -3 .. 3.5 (canvas top = near camera)
      const y0 = (22 / 80) * h; // z=-3
      const y1 = (28.5 / 80) * h; // z=3.5
      g.fillStyle = '#4b3a27';
      g.fillRect(0, y0, w, y1 - y0);
      for (let i = 0; i < 140; i++) {
        const x = Math.random() * w;
        g.fillStyle = '#4b3a27';
        g.beginPath(); g.arc(x, y0 + (Math.random() - 0.5) * 28, 14 + Math.random() * 20, 0, 7); g.fill();
        g.beginPath(); g.arc(x, y1 + (Math.random() - 0.5) * 28, 14 + Math.random() * 20, 0, 7); g.fill();
      }
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 50},${40 + Math.random() * 30},${Math.random() * 0.5})`;
        g.fillRect(Math.random() * w, y0 + Math.random() * (y1 - y0), 2 + Math.random() * 4, 2);
      }
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
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(TILE, GROUND_D), this.m.ground);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(TILE / 2, 0, 15);
    g.add(plane);
    return g;
  }

  buildForest() {
    this.forestN = 130;
    const N = this.forestN;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 18, 7);
    trunkGeo.translate(0, 9, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const mk = (geo, color, emissive) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, emissive }), N);
      im.frustumCulled = false;
      this.scene.add(im);
      return im;
    };
    this.fTrunk = mk(trunkGeo, 0xffffff, 0x14100a);
    this.fCrownA = mk(crownGeo, 0xffffff, 0x081a0f);
    this.fCrownB = mk(crownGeo, 0xffffff, 0x081a0f);
    this.slots = [];
    this.forestMax = -40;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.slots.push({ x: 0, z: 0, s: 1 });
      this.fTrunk.setColorAt(i, col.setHex(0x4a3a2a).offsetHSL(0, 0, rand(-0.03, 0.04)));
      this.fCrownA.setColorAt(i, col.setHex(pick([0x1f5a36, 0x28683f, 0x1a4a2d])));
      this.fCrownB.setColorAt(i, col.setHex(pick([0x246238, 0x2f7a47, 0x1c5232])));
    }
    this.fTrunk.instanceColor.needsUpdate = true;
    this.fCrownA.instanceColor.needsUpdate = true;
    this.fCrownB.instanceColor.needsUpdate = true;
    for (let i = 0; i < N; i++) this.placeTree(i, (this.forestMax += rand(0.6, 1.9)));
  }

  placeTree(i, x) {
    const s = this.slots[i];
    s.x = x;
    s.z = rand(6.5, 32);
    s.s = rand(0.7, 1.4);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, 6), 0));
    m.compose(new THREE.Vector3(x, 0, s.z), q, new THREE.Vector3(s.s, rand(0.9, 1.3), s.s));
    this.fTrunk.setMatrixAt(i, m);
    const top = 11 * s.s + 1.5;
    m.compose(new THREE.Vector3(x + rand(-1, 1), top, s.z), q, new THREE.Vector3(4 * s.s, 3 * s.s, 4 * s.s));
    this.fCrownA.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x + rand(-2, 2), top + 3.5 * s.s, s.z + rand(-1, 1)), q, new THREE.Vector3(3.2 * s.s, 2.6 * s.s, 3.2 * s.s));
    this.fCrownB.setMatrixAt(i, m);
    this.forestMax = Math.max(this.forestMax, x);
  }

  buildUnderstory() {
    const N = 240;
    this.uN = N;
    this.under = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x0a2414 }),
      N
    );
    this.under.frustumCulled = false;
    this.scene.add(this.under);
    this.uSlots = new Array(N).fill(0);
    this.uMax = -40;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.under.setColorAt(i, col.setHex(pick([0x2a7a46, 0x226a3c, 0x338a50, 0x1c5a34])));
      this.placeUnder(i, (this.uMax += rand(0.2, 0.9)));
    }
    this.under.instanceColor.needsUpdate = true;
  }

  placeUnder(i, x) {
    this.uSlots[i] = x;
    const front = Math.random() < 0.55;
    const z = front ? rand(-15, -9.5) : rand(4.5, 15);
    const sc = front ? rand(0.45, 1.05) : rand(1.0, 2.6);
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(x, sc * 0.3, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, 6), 0)),
      new THREE.Vector3(sc * rand(1.2, 1.8), sc * rand(0.5, 0.9), sc * rand(1.0, 1.5))
    );
    this.under.setMatrixAt(i, m);
    this.uMax = Math.max(this.uMax, x);
  }

  buildFireflies() {
    const n = 70;
    this.ffBase = [];
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.ffBase.push({ x: rand(-30, 30), y: rand(0.5, 6), z: rand(-12, 14), p: rand(0, 6) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: this.glowTex, color: 0xd8ff7a, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  // ---------- gameplay props ----------
  makeProp(type, x, layer) {
    const spec = SPECS[type];
    const z = { house: layer === 'bg' ? 4.8 : -4.6, tent: layer === 'bg' ? 4.4 : -4.0, canopy: -2.6, tree: layer === 'fg' ? -4.4 : 1.9, pond: 0.4, bush: -1.9 }[type];
    const g = new THREE.Group();
    g.userData.occ = [];
    g.position.set(x, 0, z);
    const m = this.m;
    const geo = this.geo;

    if (type === 'house') {
      this.mesh(geo.box, m.plank, 5.4, 4.2, 3.8, 0, 2.1, 0, g, true);
      const rise = 1.75, run = 2.6, len = Math.hypot(rise, run);
      const ang = Math.atan2(rise, run);
      const a = this.mesh(geo.box, m.thatch, 6.4, 0.3, len, 0, 4.2 + rise / 2, -run / 2, g, true);
      a.rotation.x = -ang;
      const b = this.mesh(geo.box, m.thatch, 6.4, 0.3, len, 0, 4.2 + rise / 2, run / 2, g, true);
      b.rotation.x = ang;
      this.mesh(geo.box, m.dark, 1.1, 2.3, 0.12, -1.2, 1.15, -1.95, g);
      this.mesh(geo.box, m.warm, 0.9, 0.8, 0.1, 1.2, 2.5, -1.95, g);
      this.mesh(geo.box, m.dark, 1.2, 0.12, 0.12, 1.2, 2.5, -2.0, g);
      this.glow(g, -2.2, 3.2, -2.4, 3.6);
      this.mesh(geo.box, m.stone, 6.0, 0.3, 0.9, 0, 0.15, -2.3, g);
    } else if (type === 'tent') {
      const t = this.mesh(geo.cone4, m.stripe, 3.1, 3.8, 3.1, 0, 1.9, 0, g, true);
      t.rotation.y = Math.PI / 4;
      this.mesh(geo.cyl, m.dark, 0.05, 1.0, 0.05, 0, 4.2, 0, g);
      const flag = this.mesh(geo.cone4, m.cloth, 0.22, 0.5, 0.05, 0.2, 4.55, 0, g);
      flag.rotation.z = -Math.PI / 2;
      this.mesh(geo.box, m.dark, 1.0, 1.7, 0.1, 0, 0.85, -2.1 + 0.55, g);
      this.glow(g, 0, 1.2, -2.2, 3.4);
    } else if (type === 'canopy') {
      for (const px of [-2.8, 2.8]) for (const pz of [-1.6, 1.6]) this.mesh(geo.cyl, m.trunk, 0.1, 3.7, 0.1, px, 1.85, pz, g);
      const cloth = this.mesh(geo.box, m.stripe, 6.2, 0.12, 4.1, 0, 3.85, 0, g, true);
      cloth.rotation.x = 0.16;
      this.mesh(geo.box, m.plank, 5.2, 2.3, 1.0, 0, 1.15, -1.3, g, true);
      this.mesh(geo.box, m.dark, 0.8, 0.6, 0.8, -1.6, 2.6, -1.3, g);
      this.mesh(geo.box, m.dark, 0.7, 0.5, 0.7, 0.4, 2.55, -1.3, g);
      this.mesh(geo.cyl, m.stone, 0.4, 0.5, 0.4, 1.8, 2.55, -1.3, g);
      this.mesh(geo.box, m.plank, 1.4, 1.2, 1.2, 2.0, 0.6, 1.0, g);
      this.glow(g, 0, 3.1, -1.9, 4.0);
    } else if (type === 'tree') {
      this.mesh(geo.cyl, m.trunk, 1.05, 13, 1.05, 0, 6.5, 0, g, true);
      this.mesh(geo.cyl, m.trunk, 1.7, 1.6, 1.7, 0, 0.8, 0, g, true);
      const br = this.mesh(geo.cyl, m.trunk, 0.36, 7.4, 0.36, 0, SPECS.tree.branchY - 0.4, -1.45, g, true);
      br.rotation.z = Math.PI / 2;
      for (const sx of [-3.4, 3.4]) this.mesh(geo.ico, m.leaf[1], 1.1, 0.7, 1.1, sx, SPECS.tree.branchY - 0.1, -1.45, g);
      for (const [cx, cy, cz, r] of [[0, 13.5, 0, 4.2], [-2.5, 12.5, 0.6, 3.2], [2.8, 12.8, -0.4, 3.4], [0.5, 15.5, 0.3, 3.0]]) {
        this.mesh(geo.ico, pick(m.leaf), r, r * 0.75, r, cx, cy, cz, g);
      }
      for (let i = 0; i < 6; i++) this.mesh(geo.cyl, m.leaf[2], 0.04, rand(2.5, 5), 0.04, rand(-3, 3), 9.5, rand(-1.8, -0.8), g);
    } else if (type === 'pond') {
      const bank = this.mesh(geo.circle, m.bank, spec.w / 2 + 0.35, spec.d / 2 + 0.35, 1, 0, 0.03, 0, g);
      bank.rotation.x = -Math.PI / 2;
      const water = this.mesh(geo.circle, m.water, spec.w / 2, spec.d / 2, 1, 0, 0.06, 0, g);
      water.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const pad = this.mesh(geo.circle, m.pad, rand(0.25, 0.45), rand(0.25, 0.45), 1, rand(-3, 3), 0.09, rand(-1.6, 1.6), g);
        pad.rotation.x = -Math.PI / 2;
      }
      for (let i = 0; i < 9; i++) {
        const a = rand(0.1, Math.PI - 0.1);
        this.mesh(geo.cone4, m.leaf[2], 0.12, rand(1.1, 1.9), 0.12, Math.cos(a) * (spec.w / 2 + 0.2), 0.7, Math.sin(a) * (spec.d / 2 + 0.3) + 0.3, g);
      }
      for (let i = 0; i < 2; i++) {
        const r = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.4, depthWrite: false }));
        r.rotation.x = -Math.PI / 2;
        r.position.set(rand(-2, 2), 0.1, rand(-1, 1));
        g.add(r);
        this.ripples.push({ m: r, t: rand(0, 2) });
      }
    } else if (type === 'bush') {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const r = rand(0.8, 1.2);
        this.mesh(geo.ico, pick(m.leaf), r * 1.1, r * 1.05, r, (i / (n - 1) - 0.5) * 2.4, 0.85 + rand(0, 0.5), rand(-0.3, 0.3), g, true);
      }
    }

    const p = { type, layer, x, z, w: spec.w, d: spec.d, h: spec.h, roofY: spec.roofY, branchY: spec.branchY, cueY: spec.cueY || 3, group: g, rolled: false };
    this.scene.add(g);
    return p;
  }

  spawnProps(upTo, exitX, level) {
    while (this.cursor < upTo) {
      // keep the exit gate area clear
      if (this.cursor > exitX - 9 && this.cursor < exitX + 10) { this.cursor = exitX + 10; continue; }
      let type;
      do {
        type = pick(['house', 'house', 'tent', 'tent', 'canopy', 'tree', 'tree', 'pond', 'bush', 'bush']);
      } while (type === this.lastType);
      this.lastType = type;
      const spec = SPECS[type];
      let layer = 'mid';
      if (type === 'house' || type === 'tent') layer = Math.random() < 0.75 ? 'fg' : 'bg';
      else if (type === 'canopy' || type === 'bush') layer = 'fg';
      else if (type === 'tree') layer = Math.random() < 0.3 ? 'fg' : 'mid';
      const x = this.cursor + spec.w / 2;
      this.props.push(this.makeProp(type, x, layer));
      this.cursor = x + spec.w / 2 + rand(5.5, 9) - Math.min(level, 6) * 0.35;
    }
  }

  nextProp(fromX) {
    for (const p of this.props) if (p.x - p.w / 2 > fromX) return p;
    return null;
  }

  occluders(nearX) {
    const out = [];
    for (const p of this.props) if (Math.abs(p.x - nearX) < 14) out.push(...p.group.userData.occ);
    return out;
  }

  addGate(x) {
    const g = new THREE.Group();
    g.position.set(x, 0, 3.2);
    const m = this.m;
    for (const sx of [-2.6, 2.6]) {
      this.mesh(this.geo.box, m.stone, 1.0, 6.2, 1.0, sx, 3.1, 0, g);
      this.mesh(this.geo.ico, m.stone, 0.8, 0.5, 0.8, sx, 6.3, 0, g);
    }
    this.mesh(this.geo.box, m.stone, 6.6, 0.9, 1.1, 0, 6.2, 0, g);
    const portal = new THREE.Mesh(
      this.geo.circle,
      new THREE.MeshBasicMaterial({ color: 0x8a6bff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    portal.scale.set(2.5, 2.7, 1);
    portal.position.set(0, 3.0, 0.05);
    g.add(portal);
    this.glow(g, 0, 3.0, -0.3, 11, 0x8a6bff);
    this.scene.add(g);
    this.gates.push({ x, g, portal });
  }

  reset(fromX, level) {
    for (const p of this.props) this.scene.remove(p.group);
    this.props.length = 0;
    this.ripples.length = 0;
    for (const gt of this.gates) this.scene.remove(gt.g);
    this.gates.length = 0;
    this.cursor = fromX + 16;
    this.lastType = '';
  }

  update(camX, dt, exitX, level) {
    this.time += dt;
    for (const t of this.tiles) {
      if (t.position.x + TILE < camX - 45) t.position.x += TILE * TILES;
    }
    // forest recycle
    let dirty = false;
    for (let i = 0; i < this.forestN; i++) {
      if (this.slots[i].x < camX - 40) {
        this.placeTree(i, this.forestMax + rand(0.6, 1.9));
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
      if (this.uSlots[i] < camX - 40) { this.placeUnder(i, this.uMax + rand(0.2, 0.9)); ud = true; }
    }
    if (ud) this.under.instanceMatrix.needsUpdate = true;
    this.spawnProps(camX + 75, exitX, level);
    this.props = this.props.filter((p) => {
      if (p.x + p.w < camX - 38) { this.scene.remove(p.group); return false; }
      return true;
    });
    this.gates = this.gates.filter((gt) => {
      if (gt.x < camX - 40) { this.scene.remove(gt.g); return false; }
      gt.portal.scale.y = 2.7 + Math.sin(this.time * 4) * 0.08;
      return true;
    });
    for (const r of this.ripples) {
      r.t = (r.t + dt * 0.5) % 1;
      r.m.scale.setScalar(0.3 + r.t * 1.4);
      r.m.material.opacity = 0.4 * (1 - r.t);
    }
    // fireflies drift around the camera
    const pos = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.ffBase.length; i++) {
      const f = this.ffBase[i];
      pos.setXYZ(i, camX + f.x + Math.sin(this.time * 0.5 + f.p) * 1.2, f.y + Math.sin(this.time * 0.8 + f.p * 2) * 0.5, f.z + Math.cos(this.time * 0.4 + f.p) * 1.0);
    }
    pos.needsUpdate = true;
  }
}
