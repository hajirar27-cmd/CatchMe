import * as THREE from '../vendor/three.module.min.js';
import { LANE_W } from './constants.js';

const TILE_LEN = 40;
const TILES = 6;
const ROAD_W = 7.2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------- shared textures / materials ----------
function makeRoadTexture() {
  return canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#1a1e2c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${100 + Math.random() * 60},${130 + Math.random() * 60},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const px = (x) => ((x + ROAD_W / 2) / ROAD_W) * w;
    g.fillStyle = 'rgba(170,180,215,0.65)';
    for (const x of [-LANE_W / 2, LANE_W / 2]) {
      for (let k = 0; k < 8; k++) g.fillRect(px(x) - 3, k * 128 + 20, 6, 52);
    }
    g.fillStyle = 'rgba(200,205,230,0.5)';
    for (const x of [-ROAD_W / 2 + 0.25, ROAD_W / 2 - 0.25]) g.fillRect(px(x) - 3, 0, 6, h);
  });
}

function makeBuildingMaterial() {
  const cols = 8, rows = 16, cell = 16;
  const wall = pick(['#171c33', '#1c1730', '#14202e', '#1d1d2a']);
  const lit = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lit.push(Math.random() < 0.3);
  const map = canvasTex(cols * cell, rows * cell, (g, w, h) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0c1020';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.fillRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
  });
  const glow = canvasTex(cols * cell, rows * cell, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!lit[r * cols + c]) continue;
        g.fillStyle = Math.random() < 0.15 ? '#7fd6ff' : pick(['#ffcf6b', '#ffb347', '#ffe39a']);
        g.fillRect(c * cell + 3, r * cell + 3, cell - 6, cell - 6);
      }
    }
  });
  return new THREE.MeshLambertMaterial({ map, emissiveMap: glow, emissive: 0xffffff });
}

function woodTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6b4a2b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3d2814';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(6, 6); g.lineTo(w - 6, h - 6);
    g.moveTo(w - 6, 6); g.lineTo(6, h - 6);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let y = 16; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.nextRowZ = 30;
    this.tiles = [];

    this.roadMat = new THREE.MeshLambertMaterial({ map: makeRoadTexture() });
    this.groundMat = new THREE.MeshLambertMaterial({ color: 0x0d111f });
    this.walkMat = new THREE.MeshLambertMaterial({ color: 0x262b40 });
    this.buildingMats = [0, 1, 2, 3].map(makeBuildingMaterial);
    this.postMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });

    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gg = gc.getContext('2d');
    const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc), color: 0xffa640, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    const wood = woodTexture();
    this.mats = {
      crate: new THREE.MeshLambertMaterial({ map: wood, emissive: 0x1a1008 }),
      barrel: new THREE.MeshLambertMaterial({ color: 0x7a4f2a, emissive: 0x1a1008 }),
      ring: new THREE.MeshLambertMaterial({ color: 0x2c2f3a, emissive: 0x0a0a10 }),
      wall: new THREE.MeshLambertMaterial({ color: 0x4a4f66, emissive: 0x10121c }),
      roof: new THREE.MeshLambertMaterial({ color: 0x1d1f2e, emissive: 0x06060c }),
      fence: new THREE.MeshLambertMaterial({ color: 0xd8213c, emissive: 0x5a0c1a }),
      fencePost: new THREE.MeshLambertMaterial({ color: 0x6b4a2b, emissive: 0x1a1008 }),
    };
    this.geo = {
      crate: new THREE.BoxGeometry(1.5, 2.0, 1.5),
      barrel: new THREE.CylinderGeometry(0.75, 0.75, 1.9, 14),
      barrelRing: new THREE.CylinderGeometry(0.79, 0.79, 0.12, 14),
      wall: new THREE.BoxGeometry(1.7, 2.7, 0.5),
      roof: new THREE.BoxGeometry(2.0, 0.22, 0.85),
      post: new THREE.BoxGeometry(0.14, 0.85, 0.14),
      rail: new THREE.BoxGeometry(1.7, 0.16, 0.1),
    };

    for (let i = 0; i < TILES; i++) {
      const t = this.buildTile();
      t.position.z = (i - 1) * TILE_LEN;
      scene.add(t);
      this.tiles.push(t);
    }
  }

  buildTile() {
    const g = new THREE.Group();
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, TILE_LEN), this.roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = TILE_LEN / 2;
    g.add(road);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, TILE_LEN), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, TILE_LEN / 2);
    g.add(ground);

    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, TILE_LEN), this.walkMat);
      walk.position.set(side * (ROAD_W / 2 + 1.2), 0.1, TILE_LEN / 2);
      g.add(walk);

      const slots = 3;
      const slot = TILE_LEN / slots;
      for (let s = 0; s < slots; s++) {
        const w = rand(7, 11);
        const h = rand(9, 26);
        const d = slot - 0.5;
        const geom = new THREE.BoxGeometry(w, h, d);
        const uv = geom.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 8), uv.getY(i) * (h / 16));
        const b = new THREE.Mesh(geom, pick(this.buildingMats));
        b.position.set(side * (ROAD_W / 2 + 2.6 + w / 2 + rand(0, 1.2)), h / 2, s * slot + slot / 2);
        g.add(b);
      }

      for (const z of [6, 26]) {
        const x = side * (ROAD_W / 2 + 0.7);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), this.postMat);
        post.position.set(x, 1.7, z);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), this.lampMat);
        lamp.position.set(x, 3.5, z);
        const glow = new THREE.Sprite(this.glowMat);
        glow.scale.setScalar(4.2);
        glow.position.set(x, 3.5, z);
        g.add(post, lamp, glow);
      }
    }
    return g;
  }

  reset(fromZ) {
    for (const o of this.obstacles) this.scene.remove(o.mesh);
    this.obstacles.length = 0;
    this.nextRowZ = fromZ + 30;
  }

  removeNear(z0, z1) {
    this.obstacles = this.obstacles.filter((o) => {
      const hit = o.z + o.hd > z0 && o.z - o.hd < z1;
      if (hit) this.scene.remove(o.mesh);
      return !hit;
    });
  }

  // Nearest obstacle in `lane` overlapping [z0, z1]
  firstAhead(lane, z0, z1, tallOnly = false) {
    let best = null;
    for (const o of this.obstacles) {
      if (o.lane !== lane || (tallOnly && o.kind !== 'tall')) continue;
      if (o.z + o.hd > z0 && o.z - o.hd < z1 && (!best || o.z < best.z)) best = o;
    }
    return best;
  }

  makeObstacle(type, lane, z) {
    const x = lane * LANE_W;
    const m = new THREE.Group();
    let hw, hd, h, kind = 'tall';
    if (type === 'crate') {
      m.add(new THREE.Mesh(this.geo.crate, this.mats.crate));
      m.children[0].position.y = 1.0;
      hw = 0.75; hd = 0.75; h = 2.0;
    } else if (type === 'barrel') {
      const b = new THREE.Mesh(this.geo.barrel, this.mats.barrel);
      b.position.y = 0.95;
      m.add(b);
      for (const y of [0.45, 1.45]) {
        const r = new THREE.Mesh(this.geo.barrelRing, this.mats.ring);
        r.position.y = y;
        m.add(r);
      }
      hw = 0.75; hd = 0.75; h = 1.9;
    } else if (type === 'wall') {
      const w = new THREE.Mesh(this.geo.wall, this.mats.wall);
      w.position.y = 1.35;
      const r = new THREE.Mesh(this.geo.roof, this.mats.roof);
      r.position.y = 2.8;
      m.add(w, r);
      hw = 0.85; hd = 0.3; h = 2.7;
    } else {
      kind = 'low';
      for (const px of [-0.75, 0.75]) {
        const p = new THREE.Mesh(this.geo.post, this.mats.fencePost);
        p.position.set(px, 0.42, 0);
        m.add(p);
      }
      const rail = new THREE.Mesh(this.geo.rail, this.mats.fence);
      rail.position.y = 0.7;
      const rail2 = rail.clone();
      rail2.position.y = 0.4;
      m.add(rail, rail2);
      hw = 0.85; hd = 0.15; h = 0.85;
    }
    m.position.set(x, 0, z);
    this.scene.add(m);
    return { type, kind, lane, x, z, hw, hd, h, mesh: m, rolled: false };
  }

  spawnRows(upTo, level) {
    while (this.nextRowZ < upTo) {
      const z = this.nextRowZ;
      this.nextRowZ += rand(10, 15) - Math.min(level, 8) * 0.45;
      const r = Math.random();
      if (r < 0.16) {
        for (const lane of [-1, 0, 1]) this.obstacles.push(this.makeObstacle('fence', lane, z));
        continue;
      }
      const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
      const n = Math.random() < 0.4 + Math.min(level, 6) * 0.04 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.obstacles.push(this.makeObstacle(pick(['crate', 'crate', 'barrel', 'wall', 'wall']), lanes[i], z + rand(-0.8, 0.8)));
      }
      if (n === 1 && Math.random() < 0.35) this.obstacles.push(this.makeObstacle('fence', lanes[1], z + rand(-1, 1)));
    }
  }

  update(playerZ, level) {
    for (const t of this.tiles) {
      if (t.position.z + TILE_LEN < playerZ - 25) {
        const maxZ = Math.max(...this.tiles.map((x) => x.position.z));
        t.position.z = maxZ + TILE_LEN;
      }
    }
    this.spawnRows(playerZ + 105, level);
    this.obstacles = this.obstacles.filter((o) => {
      if (o.z < playerZ - 20) { this.scene.remove(o.mesh); return false; }
      // don't let passed obstacles swallow the chase camera
      o.mesh.visible = o.z > playerZ - 4;
      return true;
    });
  }
}
