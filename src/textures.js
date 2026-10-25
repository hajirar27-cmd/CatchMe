import * as THREE from '../vendor/three.module.min.js';

// Procedural, tileable PBR-ish textures (colour + normal), generated once at startup.

function hash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

// tileable value noise: (u,v) in [0,1), fx/fy are integer lattice periods
function vnoise(u, v, fx, fy, seed) {
  const x = u * fx, y = v * fy;
  const ix = Math.floor(x), iy = Math.floor(y);
  const tx = smooth(x - ix), ty = smooth(y - iy);
  const x0 = ((ix % fx) + fx) % fx, x1 = (x0 + 1) % fx;
  const y0 = ((iy % fy) + fy) % fy, y1 = (y0 + 1) % fy;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export function fbm(u, v, fx, fy, oct = 4, seed = 1) {
  let s = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(u, v, fx << i, fy << i, seed + i * 17);
    tot += amp;
    amp *= 0.5;
  }
  return s / tot;
}

// cellular noise (tileable) -> [distance to nearest point, distance to second nearest]
export function cells(u, v, n, seed = 3) {
  const x = u * n, y = v * n;
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
      const px = cx + hash(wx, wy, seed), py = cy + hash(wx, wy, seed + 5);
      const d = Math.hypot(px - x, py - y);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  }
  return [d1, d2];
}

// px(u, v) -> [r, g, b, height]  (rgb 0..255, height 0..1)
export function makeTex({ w, h, px, normal = 2.5, repeat = true, srgb = true }) {
  const color = new Uint8ClampedArray(w * h * 4);
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = px(x / w, y / h, x, y);
      const i = y * w + x;
      color[i * 4] = r[0]; color[i * 4 + 1] = r[1]; color[i * 4 + 2] = r[2]; color[i * 4 + 3] = r[4] ?? 255;
      height[i] = r[3];
    }
  }
  const mk = (data) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  const map = mk(color);
  map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const nd = new Uint8ClampedArray(w * h * 4);
  const H = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * normal;
      const dy = (H(x, y + 1) - H(x, y - 1)) * normal;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      nd[i] = (-dx * inv * 0.5 + 0.5) * 255;
      nd[i + 1] = (dy * inv * 0.5 + 0.5) * 255; // flip: canvas y points down, uv v up
      nd[i + 2] = (inv * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }
  const normalMap = mk(nd);
  normalMap.colorSpace = THREE.NoColorSpace;
  return { map, normalMap };
}

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function grassTex() {
  return makeTex({
    w: 512, h: 512, normal: 3.5,
    px: (u, v) => {
      const n = fbm(u, v, 4, 4, 5, 1);
      const blades = fbm(u, v, 96, 24, 2, 9); // fine, slightly vertical streaks
      const clump = fbm(u, v, 12, 12, 3, 4);
      const base = mix3([14, 38, 20], [38, 84, 40], clamp01(n * 1.2 + blades * 0.35));
      const dry = clamp01((clump - 0.55) * 3);
      const c = mix3(base, [66, 70, 36], dry * 0.45);
      const k = 0.72 + blades * 0.5;
      return [c[0] * k, c[1] * k, c[2] * k, 0.5 + blades * 0.5 + n * 0.3];
    },
  });
}

export function dirtTex() {
  return makeTex({
    w: 512, h: 512, normal: 2.6,
    px: (u, v) => {
      const n = fbm(u, v, 6, 6, 5, 21);
      const fine = fbm(u, v, 64, 64, 3, 25);
      const [d1] = cells(u, v, 70, 31);
      const pebble = clamp01(1 - d1 * 3.4) * (fbm(u, v, 9, 9, 2, 29) > 0.5 ? 1 : 0.35);
      const litter = fbm(u, v, 36, 36, 2, 5) > 0.72 ? 1 : 0;
      let c = mix3([78, 54, 34], [128, 96, 64], n * 0.8 + fine * 0.4);
      c = mix3(c, [150, 138, 120], pebble * 0.45);
      c = mix3(c, [52, 34, 20], litter * 0.45 + (1 - fine) * 0.12);
      return [c[0], c[1], c[2], n * 0.45 + fine * 0.35 + pebble * 0.5];
    },
  });
}

export function pathMaskTex() {
  // soft, noisy edges across the width of the dirt strip (u), tiled along its length (v)
  const w = 256, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const edge = 1 - Math.abs(u - 0.5) * 2; // 0 at the edges, 1 in the middle
      const n = fbm(u, v, 8, 16, 4, 77);
      const a = clamp01((edge - 0.1 - n * 0.35) * 5);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function barkTex() {
  return makeTex({
    w: 256, h: 512, normal: 4,
    px: (u, v) => {
      const ridge = fbm(u, v, 7, 3, 4, 41);
      const fine = fbm(u, v, 28, 6, 3, 43);
      const fissure = clamp01(1 - Math.abs(ridge - 0.5) * 7);
      let c = mix3([46, 36, 28], [104, 88, 70], fine);
      c = mix3(c, [20, 14, 10], fissure * 0.7);
      const moss = clamp01((fbm(u, v, 5, 5, 3, 51) - 0.6) * 4) * (0.4 + v * 0.0);
      c = mix3(c, [46, 84, 42], moss * 0.6);
      return [c[0], c[1], c[2], ridge * 0.8 + fine * 0.3 - fissure * 0.4];
    },
  });
}

export function plankTex() {
  const planks = 6;
  return makeTex({
    w: 256, h: 256, normal: 3,
    px: (u, v) => {
      const p = Math.floor(u * planks);
      const pu = u * planks - p;
      const off = hash(p, 3, 7);
      const grain = fbm((u * planks) % 1, (v + off) % 1, 2, 24, 3, 60 + p);
      const knots = Math.max(0, 1 - cells((u * 3 + off) % 1, v, 3, 12 + p)[0] * 5) * 0.4;
      const gap = pu < 0.04 || pu > 0.97 ? 1 : 0;
      let c = mix3([92, 62, 36], [148, 106, 66], grain);
      c = mix3(c, [58, 38, 22], knots);
      if (gap) c = [22, 14, 8];
      return [c[0], c[1], c[2], gap ? 0 : 0.6 + grain * 0.3 - knots * 0.3];
    },
  });
}

export function thatchTex() {
  return makeTex({
    w: 256, h: 256, normal: 3.5,
    px: (u, v) => {
      const a = fbm(u, v, 60, 5, 3, 81); // long vertical straws
      const band = Math.sin(v * Math.PI * 14) * 0.5 + 0.5;
      const s = fbm(u, v, 14, 14, 3, 85);
      let c = mix3([88, 70, 38], [176, 150, 88], a);
      c = mix3(c, [60, 54, 34], (1 - band) * 0.35 + s * 0.15);
      return [c[0], c[1], c[2], a * 0.8 + band * 0.3];
    },
  });
}

export function fabricTex(c1, c2, stripes = 8) {
  return makeTex({
    w: 256, h: 256, normal: 2,
    px: (u, v, x, y) => {
      const s = Math.floor(u * stripes) % 2;
      const weave = ((x & 1) ^ (y & 1)) * 0.5 + fbm(u, v, 30, 30, 2, 93) * 0.5;
      const fold = fbm(u, v, 3, 2, 3, 95);
      const base = s ? c1 : c2;
      const k = 0.75 + weave * 0.25 + (fold - 0.5) * 0.5;
      return [base[0] * k, base[1] * k, base[2] * k, weave * 0.3 + fold * 0.9];
    },
  });
}

export function clothTex() {
  // dark ninja cloth: fine weave
  return makeTex({
    w: 128, h: 128, normal: 2.5,
    px: (u, v, x, y) => {
      const weave = ((x & 1) ^ (y & 1)) * 0.5 + fbm(u, v, 16, 16, 2, 101) * 0.5;
      const k = 0.7 + weave * 0.5;
      return [30 * k, 36 * k, 66 * k, weave];
    },
  });
}

export function stoneTex() {
  return makeTex({
    w: 256, h: 256, normal: 3.5,
    px: (u, v) => {
      const [d1, d2] = cells(u, v, 5, 111);
      const edge = clamp01(1 - (d2 - d1) * 5);
      const n = fbm(u, v, 8, 8, 4, 113);
      let c = mix3([92, 100, 98], [150, 156, 148], n);
      const moss = clamp01((fbm(u, v, 6, 6, 3, 117) - 0.55) * 4);
      c = mix3(c, [58, 96, 52], moss * 0.65);
      c = mix3(c, [30, 34, 34], edge * 0.8);
      return [c[0], c[1], c[2], n * 0.7 - edge * 0.5];
    },
  });
}

export function leafTex() {
  return makeTex({
    w: 256, h: 256, normal: 3,
    px: (u, v) => {
      const n = fbm(u, v, 6, 6, 4, 131);
      const [d1, d2] = cells(u, v, 14, 133);
      const vein = clamp01(1 - (d2 - d1) * 9);
      const speck = fbm(u, v, 48, 48, 2, 137);
      let c = mix3([18, 52, 30], [56, 120, 58], n * 0.7 + speck * 0.5);
      c = mix3(c, [90, 140, 62], vein * 0.35);
      return [c[0], c[1], c[2], n * 0.6 + speck * 0.4 + vein * 0.3];
    },
  });
}

export function waterNormalTex() {
  return makeTex({
    w: 256, h: 256, normal: 5, srgb: false,
    px: (u, v) => {
      const a = fbm(u, v, 6, 6, 4, 141);
      const b = fbm(u + 0.37, v + 0.11, 12, 12, 3, 143);
      return [20, 70, 90, a * 0.7 + b * 0.5];
    },
  });
}

export function mistTex() {
  const w = 256, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = fbm(u, v, 4, 4, 5, 151);
      const a = clamp01((n - 0.38) * 2.2);
      const i = (y * w + x) * 4;
      img.data[i] = 190; img.data[i + 1] = 215; img.data[i + 2] = 225;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a soft vertical gradient used for light shafts
export function shaftTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const gv = g.createLinearGradient(0, 0, 0, 256);
  gv.addColorStop(0, 'rgba(0,0,0,0)');
  gv.addColorStop(0.25, 'rgba(0,0,0,1)');
  gv.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gv;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

// slightly lumpy sphere used for foliage masses and bushes (smooth-shaded)
export function lumpyGeometry(detail = 2, amp = 0.22, seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = vnoise((Math.atan2(v.z, v.x) / Math.PI + 1) / 2, (v.y + 1) / 2, 7, 5, seed) * 0.6 + vnoise(v.x * 0.5 + 0.5, v.z * 0.5 + 0.5, 13, 13, seed + 3) * 0.4;
    v.multiplyScalar(1 + (n - 0.5) * 2 * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('normal');
  // IcosahedronGeometry is non-indexed; merge vertices via hashing positions for smooth shading
  const merged = mergeVerticesSimple(g);
  merged.computeVertexNormals();
  // spherical-ish UVs for the leaf texture
  const uv = new Float32Array(merged.attributes.position.count * 2);
  const q = new THREE.Vector3();
  for (let i = 0; i < merged.attributes.position.count; i++) {
    q.fromBufferAttribute(merged.attributes.position, i).normalize();
    uv[i * 2] = (Math.atan2(q.z, q.x) / Math.PI + 1) * 1.5;
    uv[i * 2 + 1] = (q.y + 1) * 1.5;
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return merged;
}

function mergeVerticesSimple(geo) {
  const pos = geo.attributes.position;
  const map = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    index.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  out.setIndex(index);
  return out;
}
