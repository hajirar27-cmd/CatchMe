import * as THREE from '../vendor/three.module.min.js';
import { LANES, G } from './constants.js';
import {
  grassTex, dirtTex, pathMaskTex, barkTex, plankTex, thatchTex, fabricTex, stoneTex, leafTex,
  waterNormalTex, mistTex, shaftTex, lumpyGeometry,
} from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const TILE = 40; // length of a ground tile along z
const TILES = 6;
const GROUND_W = 90;
const PATH_W = 8.2;
export const PATH_HALF = 3.5;

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
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.shadows = opts.shadows !== false;
    this.props = [];
    this.decor = [];
    this.cursor = 18;
    this.decorCursor = 8;
    this.lastType = '';
    this.tiles = [];
    this.gates = [];
    this.time = 0;
    this.ripples = [];
    this.windU = { value: 0 };

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
    this.buildAtmosphere();
  }

  // ---------- assets ----------
  makeMaterials() {
    const grass = grassTex();
    grass.map.repeat.set(GROUND_W / 7, TILE / 7);
    grass.normalMap.repeat.set(GROUND_W / 7, TILE / 7);
    const dirt = dirtTex();
    dirt.map.repeat.set(PATH_W / 4, TILE / 4);
    dirt.normalMap.repeat.set(PATH_W / 4, TILE / 4);
    const mask = pathMaskTex();
    mask.repeat.set(1, TILE / 10);
    const bark = barkTex();
    bark.map.repeat.set(2, 2);
    bark.normalMap.repeat.set(2, 2);
    const plank = plankTex();
    plank.map.repeat.set(1.5, 1.5);
    plank.normalMap.repeat.set(1.5, 1.5);
    const thatch = thatchTex();
    thatch.map.repeat.set(2, 2);
    thatch.normalMap.repeat.set(2, 2);
    const stripe = fabricTex([196, 52, 46], [232, 220, 192], 8);
    const cloth2 = fabricTex([60, 110, 140], [200, 190, 160], 6);
    const stone = stoneTex();
    stone.map.repeat.set(1.5, 1.5);
    stone.normalMap.repeat.set(1.5, 1.5);
    const leaf = leafTex();
    const waterN = waterNormalTex();
    waterN.normalMap.repeat.set(3, 2);
    this.waterN = waterN.normalMap;

    const S = (o) => new THREE.MeshStandardMaterial(o);
    this.m = {
      grass: S({ map: grass.map, normalMap: grass.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 0.95, metalness: 0 }),
      dirt: S({
        map: dirt.map, normalMap: dirt.normalMap, alphaMap: mask, transparent: true, depthWrite: false, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
      plank: S({ map: plank.map, normalMap: plank.normalMap, roughness: 0.85, emissive: 0x1a1008 }),
      thatch: S({ map: thatch.map, normalMap: thatch.normalMap, roughness: 1, emissive: 0x1a1608 }),
      stripe: S({ map: stripe.map, normalMap: stripe.normalMap, roughness: 0.9, emissive: 0x201010, side: THREE.DoubleSide }),
      cloth2: S({ map: cloth2.map, normalMap: cloth2.normalMap, roughness: 0.9, side: THREE.DoubleSide }),
      bark: S({ map: bark.map, normalMap: bark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, emissive: 0x120d08 }),
      stone: S({ map: stone.map, normalMap: stone.normalMap, roughness: 0.9, emissive: 0x0c100e }),
      leaf: [0xffffff, 0xd6f0cc, 0xb4dca8].map((c) => S({ map: leaf.map, normalMap: leaf.normalMap, color: c, roughness: 0.8, emissive: 0x0b2a14 })),
      dark: S({ color: 0x241a12, roughness: 0.9, emissive: 0x060402 }),
      iron: S({ color: 0x2c2f36, roughness: 0.5, metalness: 0.8 }),
      warm: new THREE.MeshBasicMaterial({ color: 0xffcf7a }),
      lamp: S({ color: 0xffb35a, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.4 }),
      water: S({
        color: 0x0b3b48, roughness: 0.06, metalness: 0.15, normalMap: waterN.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
        transparent: true, opacity: 0.93, envMapIntensity: 2.4,
      }),
      bank: S({ color: 0x3a2d1d, roughness: 1 }),
      pad: S({ color: 0x3f9a58, roughness: 0.6, emissive: 0x0f3a1c, side: THREE.DoubleSide }),
      flower: S({ color: 0xf2a6c0, roughness: 0.5, emissive: 0x4a1a2a }),
      fruitA: S({ color: 0xe8862a, roughness: 0.5, emissive: 0x2a1204 }),
      fruitB: S({ color: 0x7ac043, roughness: 0.5, emissive: 0x10240a }),
      rope: S({ color: 0x8a7650, roughness: 1 }),
      vine: S({ color: 0x1f4a2a, roughness: 0.8, emissive: 0x06160a }),
      blade: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    };
    // grass sways in the wind
    this.m.blade.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windU;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float hh = position.y;
         float ph = instanceMatrix[3].x * 0.55 + instanceMatrix[3].z * 0.45;
         transformed.x += (sin(uTime * 1.7 + ph) * 0.16 + sin(uTime * 3.1 + ph * 2.0) * 0.05) * hh * hh;
         transformed.z += cos(uTime * 1.3 + ph) * 0.1 * hh * hh;`
      );
    };

    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gg = gc.getContext('2d');
    const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
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
      cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
      sphere: new THREE.SphereGeometry(1, 14, 10),
      lumpy: lumpyGeometry(2, 0.24, 5),
      lumpyLow: lumpyGeometry(1, 0.28, 9),
      cone4: new THREE.ConeGeometry(1, 1, 4),
      cone: new THREE.ConeGeometry(1, 1, 8),
      tent: new THREE.CylinderGeometry(0.28, 1, 1, 4),
      circle: new THREE.CircleGeometry(1, 36),
      ring: new THREE.RingGeometry(0.9, 1, 36),
    };
    // a grass tuft: curved ribbon with a pointed tip
    const b = new THREE.BufferGeometry();
    const P = [-0.5, 0, 0, 0.5, 0, 0, -0.38, 0.45, 0.04, 0.38, 0.45, 0.04, 0, 1, 0.14];
    const Cc = [0.02, 0.06, 0.03, 0.02, 0.06, 0.03, 0.06, 0.16, 0.06, 0.06, 0.16, 0.06, 0.14, 0.3, 0.1];
    b.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    b.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Cc), 3));
    b.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    b.computeVertexNormals();
    this.geo.blade = b;
  }

  mesh(geo, mat, sx, sy, sz, x, y, z, group, occ = false, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (shadow && this.shadows) { m.castShadow = true; m.receiveShadow = true; }
    group.add(m);
    if (occ) group.userData.occ.push(m);
    return m;
  }

  glow(group, x, y, z, size, color = 0xffa640, opacity = 0.6) {
    const m = this.glowMat.clone();
    m.color.setHex(color);
    m.opacity = opacity;
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.position.set(x, y, z);
    group.add(s);
  }

  // ---------- static scenery ----------
  buildTile() {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_W, TILE), this.m.grass);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0, TILE / 2);
    plane.receiveShadow = this.shadows;
    g.add(plane);

    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(PATH_W, TILE), this.m.dirt);
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, 0.02, TILE / 2);
    dirt.receiveShadow = this.shadows;
    dirt.renderOrder = 1;
    g.add(dirt);

    // wind-blown grass tufts, denser toward the path edges
    const N = 2600;
    const blades = new THREE.InstancedMesh(this.geo.blade, this.m.blade, N);
    blades.frustumCulled = false;
    blades.receiveShadow = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (PATH_HALF + 0.2 + Math.pow(Math.random(), 1.8) * 38);
      const h = rand(0.35, 0.8);
      e.set(0, rand(0, Math.PI * 2), 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 0, Math.random() * TILE), q, new THREE.Vector3(rand(0.22, 0.4), h, 1));
      blades.setMatrixAt(i, m);
    }
    g.add(blades);
    return g;
  }

  buildForest() {
    this.forestN = 190;
    const N = this.forestN;
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, 18, 9);
    trunkGeo.translate(0, 9, 0);
    const mk = (geo, mat) => {
      const im = new THREE.InstancedMesh(geo, mat, N);
      im.frustumCulled = false;
      im.castShadow = false;
      this.scene.add(im);
      return im;
    };
    this.fTrunk = mk(trunkGeo, this.m.bark);
    this.fCrownA = mk(this.geo.lumpyLow, this.m.leaf[0]);
    this.fCrownB = mk(this.geo.lumpyLow, this.m.leaf[1]);
    this.slots = [];
    this.forestMax = -30;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.slots.push({ z: 0 });
      this.fTrunk.setColorAt(i, col.setHex(0xffffff).multiplyScalar(rand(0.7, 1.05)));
      this.fCrownA.setColorAt(i, col.setHSL(rand(0.28, 0.4), rand(0.4, 0.6), rand(0.32, 0.52)));
      this.fCrownB.setColorAt(i, col.setHSL(rand(0.27, 0.38), rand(0.4, 0.6), rand(0.34, 0.55)));
    }
    this.fTrunk.instanceColor.needsUpdate = true;
    this.fCrownA.instanceColor.needsUpdate = true;
    this.fCrownB.instanceColor.needsUpdate = true;
    for (let i = 0; i < N; i++) this.placeTree(i, (this.forestMax += rand(0.55, 1.5)));
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
    const N = 260;
    this.uN = N;
    this.under = new THREE.InstancedMesh(this.geo.lumpyLow, this.m.leaf[1], N);
    this.under.frustumCulled = false;
    this.scene.add(this.under);
    this.uSlots = new Array(N).fill(0);
    this.uMax = -30;
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.under.setColorAt(i, col.setHSL(rand(0.28, 0.4), rand(0.4, 0.65), rand(0.3, 0.5)));
      this.placeUnder(i, (this.uMax += rand(0.25, 0.8)));
    }
    this.under.instanceColor.needsUpdate = true;
  }

  placeUnder(i, z) {
    this.uSlots[i] = z;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * rand(4.0, 12);
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
    const n = 90;
    this.ffBase = [];
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.ffBase.push({ x: rand(-9, 9), y: rand(0.5, 6), z: rand(0, 40), p: rand(0, 6) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: this.glowTex, color: 0xd8ff7a, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  // low mist drifting over the ground + soft moonlight shafts through the canopy
  buildAtmosphere() {
    const mist = mistTex();
    this.mists = [];
    for (let i = 0; i < 3; i++) {
      const t = mist.clone();
      t.needsUpdate = true;
      t.repeat.set(3 + i, 2 + i);
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.075, depthWrite: false, color: 0x9cc4d0 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(110, 90), mat);
      p.rotation.x = -Math.PI / 2;
      p.position.y = 0.12 + i * 0.22;
      p.renderOrder = 2;
      this.scene.add(p);
      this.mists.push({ p, t, sp: 0.004 + i * 0.002 });
    }
    const st = shaftTex();
    this.shafts = [];
    const dir = new THREE.Vector3(...G.MOON_DIR).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (let i = 0; i < 7; i++) {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        map: st, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xa8c8ff, side: THREE.DoubleSide,
      });
      for (let k = 0; k < 2; k++) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(rand(2.5, 5), 46), mat);
        pl.rotation.y = (k * Math.PI) / 2;
        grp.add(pl);
      }
      grp.quaternion.copy(quat);
      grp.userData = { x: rand(-13, 13), z: rand(8, 70), s: rand(0, 6) };
      this.scene.add(grp);
      this.shafts.push(grp);
    }
  }

  // ---------- props ----------
  // Builds the visual for a prop type into group `g` (front of the prop faces -z, toward the camera).
  buildProp(type, g, spec, branchSide = 1) {
    const m = this.m;
    const geo = this.geo;

    if (type === 'house') {
      this.mesh(geo.box, m.stone, 3.9, 0.5, 5.5, 0, 0.25, 0, g, true);
      this.mesh(geo.box, m.plank, 3.6, 3.4, 5.2, 0, 2.2, 0, g, true);
      // timber frame
      for (const sx of [-1.8, 1.8]) for (const sz of [-2.6, 2.6]) this.mesh(geo.box, m.dark, 0.2, 3.5, 0.2, sx, 2.25, sz, g);
      this.mesh(geo.box, m.dark, 3.7, 0.16, 0.16, 0, 3.9, -2.62, g);
      this.mesh(geo.box, m.dark, 0.16, 0.16, 5.3, -1.82, 3.9, 0, g);
      this.mesh(geo.box, m.dark, 0.16, 0.16, 5.3, 1.82, 3.9, 0, g);
      // roof: two thick thatch slabs, a ridge and a ragged front fringe
      const rise = 1.75, run = 2.35, len = Math.hypot(rise, run), ang = Math.atan2(rise, run);
      const a = this.mesh(geo.box, m.thatch, len, 0.42, 6.0, -run / 2, 3.9 + rise / 2, 0, g, true);
      a.rotation.z = ang;
      const b = this.mesh(geo.box, m.thatch, len, 0.42, 6.0, run / 2, 3.9 + rise / 2, 0, g, true);
      b.rotation.z = -ang;
      const ridge = this.mesh(geo.cyl, m.thatch, 0.3, 6.1, 0.3, 0, 3.9 + rise + 0.05, 0, g, true);
      ridge.rotation.x = Math.PI / 2;
      for (let i = 0; i < 9; i++) {
        const fx = -2.2 + i * 0.55;
        const tt = this.mesh(geo.cone4, m.thatch, 0.16, rand(0.35, 0.6), 0.1, fx, 3.95 + (1 - Math.abs(fx) / 2.4) * rise * 0.9, -3.0, g);
        tt.rotation.x = Math.PI;
      }
      // door with frame, window with open shutters
      this.mesh(geo.box, m.dark, 1.3, 2.5, 0.16, -0.55, 1.5, -2.66, g);
      this.mesh(geo.box, m.plank, 1.0, 2.2, 0.1, -0.55, 1.4, -2.74, g);
      this.mesh(geo.sphere, m.iron, 0.07, 0.07, 0.07, -0.2, 1.4, -2.82, g);
      this.mesh(geo.box, m.warm, 0.8, 0.8, 0.08, 1.0, 2.6, -2.68, g);
      this.mesh(geo.box, m.dark, 1.0, 0.1, 0.12, 1.0, 2.6, -2.72, g);
      this.mesh(geo.box, m.dark, 0.1, 1.0, 0.12, 1.0, 2.6, -2.72, g);
      for (const sx of [0.4, 1.6]) {
        const sh = this.mesh(geo.box, m.plank, 0.4, 0.9, 0.06, sx, 2.6, -2.8, g);
        sh.rotation.y = sx < 1 ? 0.9 : -0.9;
      }
      // hanging lantern + crates by the door
      this.mesh(geo.cyl, m.dark, 0.03, 0.6, 0.03, -1.55, 3.0, -2.75, g);
      this.mesh(geo.sphere, m.lamp, 0.17, 0.2, 0.17, -1.55, 2.62, -2.9, g);
      this.glow(g, -1.55, 2.62, -2.9, 4.2);
      this.mesh(geo.box, m.plank, 0.7, 0.7, 0.7, 1.3, 0.85, -3.2, g);
      this.mesh(geo.cyl, m.plank, 0.35, 0.85, 0.35, 0.5, 0.45, -3.3, g);
      this.mesh(geo.box, m.stone, 2.4, 0.22, 0.8, -0.55, 0.12, -3.1, g);
    } else if (type === 'tent') {
      const t = this.mesh(geo.tent, m.stripe, 2.5, 3.6, 2.5, 0, 1.8, 0, g, true);
      t.rotation.y = Math.PI / 4;
      this.mesh(geo.cyl, m.dark, 0.05, 1.1, 0.05, 0, 4.15, 0, g);
      const flag = this.mesh(geo.cone4, m.stripe, 0.22, 0.6, 0.05, 0.25, 4.5, 0, g);
      flag.rotation.z = -Math.PI / 2;
      // door flap and glowing interior
      this.mesh(geo.box, m.dark, 1.0, 1.7, 0.1, 0, 0.85, -1.3, g);
      this.mesh(geo.box, m.warm, 0.5, 1.1, 0.04, 0, 0.8, -1.37, g);
      this.glow(g, 0, 1.0, -1.9, 3.6, 0xffa640, 0.5);
      // guy ropes, pegs and a couple of crates
      for (const [px, pz] of [[-2.1, -1.6], [2.1, -1.6], [-2.1, 1.6], [2.1, 1.6]]) {
        const top = new THREE.Vector3(0, 3.4, 0), peg = new THREE.Vector3(px, 0.2, pz);
        const dir = peg.clone().sub(top);
        const rope = this.mesh(geo.cyl, m.rope, 0.02, dir.length(), 0.02, (top.x + peg.x) / 2, (top.y + peg.y) / 2, (top.z + peg.z) / 2, g, false, false);
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        this.mesh(geo.cyl, m.dark, 0.04, 0.35, 0.04, px, 0.15, pz, g);
      }
      this.mesh(geo.box, m.plank, 0.7, 0.6, 0.7, 1.7, 0.3, -2.0, g);
      this.mesh(geo.box, m.plank, 0.55, 0.5, 0.55, 1.8, 0.85, -2.0, g);
    } else if (type === 'canopy') {
      for (const px of [-2.0, 2.0]) for (const pz of [-1.5, 1.5]) this.mesh(geo.cyl, m.bark, 0.1, 3.6, 0.1, px, 1.8, pz, g);
      const cloth = this.mesh(geo.box, m.cloth2, 4.8, 0.1, 3.8, 0, 3.78, 0, g, false);
      cloth.rotation.x = -0.12;
      // scalloped front edge
      for (let i = 0; i < 8; i++) {
        const sc = this.mesh(geo.cone4, m.cloth2, 0.3, 0.4, 0.06, -2.1 + i * 0.6, 3.55, -1.95, g);
        sc.rotation.x = Math.PI;
      }
      this.mesh(geo.box, m.plank, 4.0, 2.1, 0.9, 0, 1.05, -1.0, g, true);
      this.mesh(geo.box, m.dark, 4.1, 0.1, 1.0, 0, 2.15, -1.0, g);
      // goods: fruit and crates on the counter
      for (let i = 0; i < 14; i++) this.mesh(geo.sphere, i % 3 ? m.fruitA : m.fruitB, 0.13, 0.13, 0.13, -1.5 + (i % 7) * 0.22, 2.3 + (i < 7 ? 0 : 0.18), -1.1 + (i < 7 ? 0 : 0.1), g);
      this.mesh(geo.box, m.plank, 0.7, 0.5, 0.7, 0.9, 2.45, -1.0, g);
      this.mesh(geo.cyl, m.plank, 0.32, 0.5, 0.32, 1.5, 2.45, -1.0, g);
      this.mesh(geo.box, m.plank, 1.2, 1.4, 0.2, 0, 0.9, 1.45, g);
      this.mesh(geo.sphere, m.lamp, 0.15, 0.18, 0.15, -1.2, 3.1, -1.7, g);
      this.glow(g, -1.2, 3.1, -1.7, 4.0);
      this.mesh(geo.sphere, m.lamp, 0.15, 0.18, 0.15, 1.2, 3.1, -1.7, g);
      this.glow(g, 1.2, 3.1, -1.7, 4.0);
    } else if (type === 'tree') {
      this.mesh(geo.cyl, m.bark, 0.95, 13, 0.95, 0, 6.5, 0, g, true);
      // buttress roots
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rand(-0.2, 0.2);
        const r = this.mesh(geo.cone, m.bark, 0.42, 1.8, 0.42, Math.cos(a) * 0.95, 0.7, Math.sin(a) * 0.95, g, true);
        r.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      }
      // a long limb running along the path, ninja-runnable
      const bx = branchSide * 1.45;
      const br = this.mesh(geo.cyl, m.bark, 0.34, BRANCH_LEN, 0.34, bx, spec.branchY - 0.4, 0, g);
      br.rotation.x = Math.PI / 2;
      const stub = this.mesh(geo.cyl, m.bark, 0.22, 1.5, 0.22, branchSide * 0.8, spec.branchY - 0.4, 0, g);
      stub.rotation.z = Math.PI / 2;
      for (const sz of [-BRANCH_LEN / 2, BRANCH_LEN / 2]) this.mesh(geo.lumpyLow, m.leaf[1], 0.9, 0.65, 1.1, bx, spec.branchY - 0.1, sz, g);
      for (const [cx, cy, cz, r] of [[0, 13.5, 0, 4.2], [-2.5, 12.5, 0.6, 3.2], [2.8, 12.8, -0.4, 3.4], [0.5, 15.5, 0.3, 3.0]]) {
        this.mesh(geo.lumpy, pick(m.leaf), r, r * 0.75, r, cx, cy, cz, g);
      }
      // hanging vines
      for (let i = 0; i < 7; i++) {
        const x0 = rand(-2.4, 2.4), z0 = rand(-1.8, 1.8), len = rand(3, 6);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x0, 11, z0), new THREE.Vector3(x0 + rand(-0.3, 0.3), 11 - len * 0.5, z0 + rand(-0.3, 0.3)), new THREE.Vector3(x0 + rand(-0.4, 0.4), 11 - len, z0),
        ]);
        const v = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.035, 5), m.vine);
        g.add(v);
      }
    } else if (type === 'pond') {
      const bank = this.mesh(geo.circle, m.bank, spec.w / 2 + 0.4, spec.d / 2 + 0.4, 1, 0, 0.03, 0, g, false, false);
      bank.rotation.x = -Math.PI / 2;
      const water = this.mesh(geo.circle, m.water, spec.w / 2, spec.d / 2, 1, 0, 0.08, 0, g, false, false);
      water.rotation.x = -Math.PI / 2;
      this.waters = this.waters || [];
      this.waters.push(water);
      for (let i = 0; i < 8; i++) {
        const pad = this.mesh(geo.circle, m.pad, rand(0.25, 0.45), rand(0.25, 0.45), 1, rand(-3.2, 3.2), 0.12, rand(-1.6, 1.6), g, false, false);
        pad.rotation.x = -Math.PI / 2;
        if (i % 3 === 0) this.mesh(geo.cone, m.flower, 0.1, 0.16, 0.1, pad.position.x, 0.2, pad.position.z, g, false, false);
      }
      for (let i = 0; i < 14; i++) {
        const a = rand(0, Math.PI * 2);
        const rock = this.mesh(geo.lumpyLow, m.stone, rand(0.2, 0.5), rand(0.15, 0.35), rand(0.2, 0.45), Math.cos(a) * (spec.w / 2 + 0.25), 0.1, Math.sin(a) * (spec.d / 2 + 0.25), g);
        rock.rotation.y = rand(0, 6);
      }
      for (let i = 0; i < 16; i++) {
        const a = rand(0, Math.PI * 2);
        const reed = this.mesh(geo.cone4, m.pad, 0.07, rand(1.0, 1.9), 0.07, Math.cos(a) * (spec.w / 2 + 0.1), 0.65, Math.sin(a) * (spec.d / 2 + 0.1), g, false, false);
        reed.rotation.set(rand(-0.15, 0.15), 0, rand(-0.15, 0.15));
      }
      for (let i = 0; i < 2; i++) {
        const r = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.4, depthWrite: false }));
        r.rotation.x = -Math.PI / 2;
        r.position.set(rand(-2.5, 2.5), 0.12, rand(-1, 1));
        g.add(r);
        this.ripples.push({ m: r, t: rand(0, 2), g });
      }
    } else if (type === 'bush') {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const r = rand(0.95, 1.3);
        const b1 = this.mesh(geo.lumpy, pick(m.leaf), r * 1.1, r * 1.2, r, (i / (n - 1) - 0.5) * 2.3, 1.1 + rand(0, 0.5), rand(-0.3, 0.3), g, true);
        b1.rotation.y = rand(0, 6);
        const b2 = this.mesh(geo.lumpy, pick(m.leaf), r * 0.9, r * 0.9, r * 0.9, (i / (n - 1) - 0.5) * 2.0, 2.2 + rand(0, 0.3), rand(-0.2, 0.2), g, true);
        b2.rotation.y = rand(0, 6);
      }
      for (let i = 0; i < 9; i++) this.mesh(geo.sphere, m.flower, 0.08, 0.08, 0.08, rand(-1.4, 1.4), rand(1.2, 2.8), -0.95 + rand(-0.1, 0.1), g, false, false);
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
      this.mesh(this.geo.box, m.stone, 1.1, 6.4, 1.1, sx, 3.2, 0, g);
      this.mesh(this.geo.lumpyLow, m.stone, 0.9, 0.55, 0.9, sx, 6.5, 0, g);
      for (let i = 0; i < 4; i++) this.mesh(this.geo.cone4, m.leaf[1], 0.25, rand(0.8, 1.6), 0.1, sx + rand(-0.4, 0.4), 0.9 + i * 1.2, -0.58, g, false, false).rotation.z = Math.PI;
    }
    this.mesh(this.geo.box, m.stone, 8.4, 0.95, 1.2, 0, 6.4, 0, g);
    const portal = new THREE.Mesh(
      this.geo.circle,
      new THREE.MeshBasicMaterial({ color: 0x9a7bff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    portal.scale.set(3.2, 3.0, 1);
    portal.position.set(0, 3.2, 0.05);
    g.add(portal);
    this.glow(g, 0, 3.2, -0.5, 12, 0x8a6bff, 0.9);
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
    this.windU.value = this.time;
    for (const t of this.tiles) {
      if (t.position.z + TILE < camZ - 15) t.position.z += TILE * TILES;
    }
    let dirty = false;
    for (let i = 0; i < this.forestN; i++) {
      if (this.slots[i].z < camZ - 22) {
        this.placeTree(i, this.forestMax + rand(0.55, 1.5));
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
      if (this.uSlots[i] < camZ - 22) { this.placeUnder(i, this.uMax + rand(0.25, 0.8)); ud = true; }
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
    this.waterN.offset.x = (this.time * 0.02) % 1;
    this.waterN.offset.y = (this.time * 0.013) % 1;

    const pos = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.ffBase.length; i++) {
      const f = this.ffBase[i];
      pos.setXYZ(i, f.x + Math.sin(this.time * 0.5 + f.p) * 1.2, f.y + Math.sin(this.time * 0.8 + f.p * 2) * 0.5, camZ + 4 + f.z + Math.cos(this.time * 0.4 + f.p) * 1.0);
    }
    pos.needsUpdate = true;

    for (const mm of this.mists) {
      mm.p.position.set(0, mm.p.position.y, camZ + 28);
      mm.t.offset.x = (this.time * mm.sp) % 1;
      mm.t.offset.y = (camZ * 0.002 + this.time * mm.sp * 0.5) % 1;
    }
    for (const s of this.shafts) {
      const u = s.userData;
      const zz = ((u.z - camZ * 0.0 - (camZ % 60) + 60) % 60) + camZ - 6;
      s.position.set(u.x + Math.sin(this.time * 0.1 + u.s) * 1.5, 17, zz);
      s.children[0].material.opacity = 0.05 + 0.03 * (0.5 + 0.5 * Math.sin(this.time * 0.4 + u.s));
    }
  }
}
