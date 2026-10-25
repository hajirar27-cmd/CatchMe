import * as THREE from '../vendor/three.module.min.js';
import { Jungle } from './jungle.js';
import { createNinja, animateNinja } from './characters.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { G } from './constants.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const app = $('app');
const canvas = $('c');

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const SKY = 0x0b1c22;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 32, 88);

const camera = new THREE.PerspectiveCamera(50, 0.5, 0.1, 400);
function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const hf = (G.HFOV * Math.PI) / 180;
  camera.fov = camera.aspect < 1 ? (2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180) / Math.PI : 46;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app);

scene.add(new THREE.HemisphereLight(0x8fb8c8, 0x1a2a1c, 1.05));
const moonLight = new THREE.DirectionalLight(0xbcd6ff, 1.0);
moonLight.position.set(-10, 26, -22);
scene.add(moonLight);
// a soft moonbeam that follows the ninja so he stays readable in the dark
const beam = new THREE.PointLight(0xa9d0ff, 40, 18, 2);
scene.add(beam);

const sky = new THREE.Group();
scene.add(sky);
{
  const n = 220;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI;
    const e = Math.random() * 0.8 + 0.25;
    const r = 230;
    pos[i * 3] = Math.cos(a) * r * 1.2 - r * 0.2;
    pos[i * 3 + 1] = Math.sin(e) * r * 0.8;
    pos[i * 3 + 2] = 120 + Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 1.6, sizeAttenuation: false, fog: false })));

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)');
  gr.addColorStop(0.28, 'rgba(255,255,235,1)');
  gr.addColorStop(0.32, 'rgba(190,225,255,0.35)');
  gr.addColorStop(1, 'rgba(120,180,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false }));
  moon.scale.setScalar(70);
  moon.position.set(-30, 120, 190);
  sky.add(moon);
}

const world = new Jungle(scene);
const fx = new Effects(scene);
const sfx = new Sfx();
const rig = createNinja();
scene.add(rig.root);

// decoy logs left behind when he vanishes
const decoys = [];
const logMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a, emissive: 0x1a1008 });
const logGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.7, 10);
const logEnd = new THREE.MeshLambertMaterial({ color: 0xb08a58, emissive: 0x2a2010 });

// ---------- state ----------
const S = {
  mode: 'menu', // menu | play | caught | over
  level: 1,
  catches: 0,
  score: 0,
  nets: G.NETS,
  time: 0,
  sinceSpawn: 0,
  caughtT: 0,
  overT: 0,
  timeScale: 1,
  shake: 0,
  toastT: 0,
  startX: 0,
  exitX: Infinity,
  escaping: false,
};

const ninja = {
  x: 0, y: 0, z: 0, vis: 1,
  pose: 'run', // run | air | roll | crouch | hide | vanish | skim | startle
  phase: 0, rollAng: 0, crouch: 0, air: 0, roll: 0,
  seg: null, queue: [], hideProp: null, wisp: 0, trail: 0, lastVanish: -9,
};

const cam = { x: 0 };

const hud = {
  score: $('score'), level: $('level'), nets: [...$('nets').children],
  gap: $('gap'), gapfill: $('gapfill'), gaplabel: $('gaplabel'),
  toast: $('toast'), flash: $('flash'),
};
const hudCache = {};
function setText(el, v) { if (hudCache[el.id] !== v) { hudCache[el.id] = v; el.textContent = v; } }
function toast(msg, secs = 1.4) {
  hud.toast.textContent = msg;
  hud.toast.classList.add('show');
  S.toastT = secs;
}
function flash() {
  hud.flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => hud.flash.classList.remove('on')));
}

// ---------- ninja movement: a queue of timed segments ----------
const speed = () => Math.min(G.SPEED + (S.level - 1) * G.SPEED_PER_LEVEL, G.SPEED_MAX) * (ninja.boost > 0 ? 1.3 : 1);
const hideDur = () => Math.max(0.9, rand(1.7, 2.8) - 0.12 * S.level);

function seg(c, to, o) {
  const s = {
    t: 0, dur: Math.max(0.05, o.dur),
    x0: c.x, y0: c.y, z0: c.z,
    x1: to.x ?? c.x, y1: to.y ?? c.y, z1: to.z ?? c.z,
    arc: o.arc || 0, pose: o.pose || 'run', vis: o.vis ?? 1, spin: o.spin || 0,
    onStart: o.onStart, onEnd: o.onEnd,
  };
  c.x = s.x1; c.y = s.y1; c.z = s.z1;
  ninja.queue.push(s);
  return s;
}
const runTo = (c, x, z = c.z) => seg(c, { x, z }, { dur: Math.hypot(x - c.x, z - c.z) / speed(), pose: 'run' });
const skimTo = (c, x) => seg(c, { x }, { dur: Math.abs(x - c.x) / speed(), pose: 'skim' });
const leapTo = (c, to, arc, dur) => seg(c, to, { dur, arc, pose: 'air' });
const rollTo = (c, x, z = c.z) => {
  const d = Math.abs(x - c.x);
  return seg(c, { x, z }, { dur: d / (speed() * 1.7), pose: 'roll', spin: d * 1.25 });
};
const holdHide = (c, prop, dur) => seg(c, {}, { dur, pose: 'hide', onStart: () => { ninja.hideProp = prop; }, onEnd: () => { ninja.hideProp = null; } });
const vanishTo = (c, x, dur) =>
  seg(c, { x, y: 0 }, {
    dur, pose: 'vanish', vis: 0,
    onStart: () => vanishFx(true),
    onEnd: () => vanishFx(false),
  });

function vanishFx(start) {
  const n = ninja;
  fx.puff(n.x, n.y + 1.0, n.z, 16, 0xb8c4ff, 3);
  sfx.poof();
  if (start && S.level >= 2 && S.mode !== 'menu') addDecoy(n.x, n.y, n.z);
  if (!start) n.vis = 1;
}

function addDecoy(x, y, z) {
  const g = new THREE.Group();
  const log = new THREE.Mesh(logGeo, logMat);
  log.rotation.z = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10), logEnd);
  cap.position.y = 0.86;
  log.add(cap);
  const cap2 = cap.clone();
  cap2.position.y = -0.86;
  cap2.rotation.x = Math.PI;
  log.add(cap2);
  log.position.y = 0.4;
  g.add(log);
  g.position.set(x, y, z);
  scene.add(g);
  decoys.push({ g, x, y: y + 0.4, z, t: 2.6 });
}

// Pick what he does next based on what's ahead of him.
function planNext() {
  const n = ninja;
  const c = { x: n.x, y: 0, z: 0 };
  const L = S.level;
  const P = world.nextProp(n.x + 1.2);
  const leftEdge = P ? P.x - P.w / 2 : n.x + 30;
  const gap = leftEdge - n.x;

  // near the exit: head for the portal
  if (n.x > S.exitX - 12 && !S.escaping && S.mode === 'play') {
    runTo(c, S.exitX - 1.2);
    const s = leapTo(c, { x: S.exitX, y: 2.6, z: 3.2 }, 1.0, 0.6);
    s.onStart = () => { S.escaping = true; };
    s.onEnd = () => { ninja.vis = 0; fx.puff(S.exitX, 2.6, 3.2, 20, 0xb8a4ff, 4); escaped(); };
    return;
  }

  // vanish in the open between obstacles
  if (gap > 8 && S.time - n.lastVanish > 5 && Math.random() < 0.2 + L * 0.06) {
    n.lastVanish = S.time;
    runTo(c, n.x + 1.2);
    vanishTo(c, Math.min(leftEdge - 2.5, n.x + rand(5, 8)), rand(0.8, 1.3));
    return;
  }
  if (!P) { runTo(c, n.x + 12); return; }

  const wHide = 2 + L * 0.3;
  const choices = [];
  const add = (w, fn) => choices.push([w, fn]);
  const edgeL = P.x - P.w / 2;
  const edgeR = P.x + P.w / 2;
  const behind = () => {
    runTo(c, P.x - P.w * 0.12);
    holdHide(c, P, hideDur());
    rollTo(c, edgeR + 2.6);
  };

  switch (P.type) {
    case 'house':
      if (P.layer === 'fg') add(wHide + 1, behind);
      add(2, () => {
        runTo(c, edgeL - 0.9);
        leapTo(c, { x: edgeL + 0.8, y: P.roofY, z: P.z }, 1.3, 0.55);
        runTo(c, edgeR - 0.8);
        leapTo(c, { x: edgeR + 2.4, y: 0, z: 0 }, 1.2, 0.65);
      });
      if (L >= 2) add(1 + L * 0.3, () => { runTo(c, edgeL - 0.4); vanishTo(c, edgeR + 1.8, rand(0.8, 1.2)); });
      add(1, () => runTo(c, edgeR + 2));
      break;
    case 'tent':
      if (P.layer === 'fg') add(wHide + 1, behind);
      if (L >= 2) add(1 + L * 0.3, () => { runTo(c, edgeL - 0.2); vanishTo(c, edgeR + 1.6, rand(0.8, 1.2)); });
      add(1.5, () => rollTo(c, edgeR + 2.5));
      break;
    case 'canopy':
      add(wHide + 1, () => {
        runTo(c, edgeL + 0.4, -1.2);
        holdHide(c, P, hideDur());
        rollTo(c, edgeR + 2, 0);
      });
      if (L >= 2) add(1 + L * 0.3, () => { runTo(c, edgeL); vanishTo(c, edgeR + 1.6, rand(0.8, 1.2)); });
      add(1, () => runTo(c, edgeR + 2));
      break;
    case 'tree':
      add(2.5, () => {
        runTo(c, P.x - 2.5);
        leapTo(c, { x: P.x - 3.1, y: P.branchY, z: P.z - 1.45 }, 1.8, 0.65);
        runTo(c, P.x + 3.1);
        leapTo(c, { x: P.x + 4.7, y: 0, z: 0 }, 1.2, 0.7);
      });
      if (P.layer === 'mid') {
        add(wHide + 1, () => {
          runTo(c, P.x - 2.3);
          leapTo(c, { x: P.x, y: 0, z: P.z + 2.0 }, 0.9, 0.5);
          holdHide(c, P, hideDur());
          leapTo(c, { x: P.x + 3.4, y: 0, z: 0 }, 1.0, 0.55);
        });
      } else {
        add(wHide + 1, () => { runTo(c, P.x - 0.1); holdHide(c, P, hideDur()); rollTo(c, P.x + 3.4); });
      }
      add(1, () => rollTo(c, P.x + 3.2));
      break;
    case 'pond':
      add(2, () => {
        runTo(c, edgeL - 0.5);
        leapTo(c, { x: edgeR + 0.6, y: 0, z: 0 }, 2.6, 1.0);
      });
      add(2, () => { runTo(c, edgeL - 0.2); skimTo(c, edgeR + 0.3); });
      if (L >= 2) add(1 + L * 0.2, () => { runTo(c, edgeL - 0.3); vanishTo(c, edgeR + 0.8, rand(0.9, 1.3)); });
      break;
    case 'bush':
      add(wHide + 1, () => {
        rollTo(c, P.x);
        holdHide(c, P, hideDur() * 0.85);
        runTo(c, edgeR + 2.2);
      });
      add(1.5, () => runTo(c, edgeR + 1.8));
      break;
    default:
      runTo(c, edgeR + 2);
  }
  if (!choices.length) { runTo(c, edgeR + 2); return; }
  let total = choices.reduce((a, b) => a + b[0], 0);
  let r = Math.random() * total;
  for (const [w, fn] of choices) { r -= w; if (r <= 0) { fn(); return; } }
  choices[0][1]();
}

function startSeg(s) {
  ninja.seg = s;
  ninja.pose = s.pose;
  ninja.vis = s.vis;
  if (s.onStart) s.onStart();
}

function updateNinja(dt) {
  const n = ninja;
  n.boost = Math.max(0, (n.boost || 0) - dt);
  if (!n.seg) {
    if (!n.queue.length) planNext();
    if (n.queue.length) startSeg(n.queue.shift());
  }
  const s = n.seg;
  if (s) {
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    n.x = lerp(s.x0, s.x1, k);
    n.z = lerp(s.z0, s.z1, k);
    n.y = lerp(s.y0, s.y1, k) + s.arc * 4 * k * (1 - k);
    n.rollAng = s.spin * k;
    if (k >= 1) {
      const end = s.onEnd;
      n.seg = null;
      n.rollAng = 0;
      if (end) end();
    }
  }

  const pose = n.pose;
  const targetCrouch = pose === 'hide' || pose === 'crouch' ? 1 : 0;
  n.crouch = lerp(n.crouch, targetCrouch, Math.min(1, dt * 12));
  n.air = lerp(n.air, pose === 'air' || pose === 'startle' ? 1 : 0, Math.min(1, dt * 14));
  n.roll = lerp(n.roll, pose === 'roll' ? 1 : 0, Math.min(1, dt * 16));
  if (pose === 'run' || pose === 'skim') n.phase += speed() * dt * 1.15;

  // the tell: smoke wisps over his hiding spot
  if (pose === 'hide' && n.hideProp) {
    n.wisp -= dt;
    if (n.wisp <= 0) {
      n.wisp = 0.22;
      fx.emit(n.x + rand(-0.3, 0.3), n.hideProp.cueY, n.z - 0.4, { vy: 1.2, life: 1.4, size: 0.8, grow: 0.9, color: 0xb8caff, opacity: 0.55 });
    }
  }
  if (pose === 'vanish') {
    n.trail -= dt;
    if (n.trail <= 0) {
      n.trail = 0.16;
      fx.emit(n.x, n.y + 1.2, n.z, { vy: 0.4, life: 0.5, size: 0.5, grow: 0.5, color: 0x8da4ff, opacity: 0.22 });
    }
  }
  if (pose === 'skim') {
    n.trail -= dt;
    if (n.trail <= 0) {
      n.trail = 0.1;
      fx.emit(n.x, 0.2, n.z, { vy: 2.2, vx: -1, life: 0.5, size: 0.35, grow: 0.2, color: 0xbfeaff, opacity: 0.7 });
    }
  }
}

// ---------- tapping: throw a net that takes time to land ----------
const ray = new THREE.Raycaster();
const NET_FLIGHT = 0.3;
const flying = [];
let lastThrow = 0;

const netTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,233,168,0.95)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
  g.lineWidth = 1.5;
  for (let i = -3; i <= 3; i++) {
    g.beginPath(); g.moveTo(64 + i * 17, 4); g.lineTo(64 + i * 17, 124); g.stroke();
    g.beginPath(); g.moveTo(4, 64 + i * 17); g.lineTo(124, 64 + i * 17); g.stroke();
  }
  g.globalCompositeOperation = 'destination-in';
  g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
})();
const netGeo = new THREE.PlaneGeometry(2, 2);

function netRadius() { return Math.max(1.15, 1.75 - 0.05 * S.level); }
function ninjaHeight() { return G.NINJA_SCALE * 2.1 * (1 - 0.45 * ninja.crouch - 0.3 * ninja.roll); }

function project(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
}

// Is any part of him in line of sight of the camera?
function ninjaExposed() {
  const n = ninja;
  const H = ninjaHeight();
  const occ = world.occluders(n.x);
  for (const f of [0.2, 0.5, 0.85]) {
    const p = new THREE.Vector3(n.x, n.y + H * f, n.z);
    const dir = p.clone().sub(camera.position);
    const dist = dir.length();
    ray.set(camera.position, dir.normalize());
    ray.far = dist - 0.25;
    if (!ray.intersectObjects(occ, false).length) return true;
  }
  return false;
}

function ring(px, py, miss) {
  const el = document.createElement('div');
  el.className = 'tapring' + (miss ? ' miss' : '');
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  app.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

function useNet() {
  S.nets--;
  S.shake = 0.15;
  sfx.miss();
  if (S.nets <= 0 && S.mode === 'play') {
    S.mode = 'over';
    setTimeout(() => gameOver('OUT OF NETS!'), 800);
  }
}

function tap(px, py) {
  if (S.mode !== 'play' || S.escaping) return;
  const now = performance.now();
  if (now - lastThrow < 220) return;
  lastThrow = now;
  sfx.throwNet();
  ring(px, py, false);
  // where the tap lands in the ninja's depth plane (world space, so camera lag doesn't matter)
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), ninja.z);
  const pt = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, pt)) return;
  const mesh = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(mesh);
  flying.push({ t: 0, tx: pt.x, ty: pt.y, tz: pt.z, sx: cam.x, sy: 1.0, sz: G.CAM_Z + 5, mesh, landed: false });
}

function resolveNet(f) {
  const n = ninja;
  if (S.mode !== 'play' || S.escaping) return;
  const H = ninjaHeight();
  const dx = Math.abs(n.x - f.tx);
  const dy = Math.abs(n.y + H / 2 - f.ty);
  if (n.vis > 0.5 && dx < netRadius() && dy < H / 2 + 0.9) {
    const exposed = ninjaExposed();
    if (n.pose === 'hide' && !exposed) { flush(); return; }
    if (exposed && n.pose !== 'vanish') { caught(); return; }
  }
  for (const dc of decoys) {
    if (Math.abs(dc.x - f.tx) < 1.4 && Math.abs(dc.y - f.ty) < 1.5) {
      fx.puff(dc.x, 0.8, dc.z, 10, 0xc9b79a, 2);
      dc.t = 0;
      toast("It's a log!", 1.0);
      useNet();
      return;
    }
  }
  fx.puff(f.tx, Math.max(f.ty, 0.3), f.tz, 5, 0xd6c8a0, 1.5);
  useNet();
}

function updateNets(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt;
    const k = Math.min(1, f.t / NET_FLIGHT);
    f.mesh.position.set(lerp(f.sx, f.tx, k), lerp(f.sy, f.ty, k) + Math.sin(k * Math.PI) * 1.2, lerp(f.sz, f.tz, k));
    f.mesh.quaternion.copy(camera.quaternion);
    if (!f.landed) {
      f.mesh.scale.setScalar(lerp(0.35, netRadius(), k));
      if (k >= 1) { f.landed = true; resolveNet(f); }
    } else {
      f.mesh.scale.setScalar(netRadius() * (1 + (f.t - NET_FLIGHT) * 0.6));
      f.mesh.material.opacity = Math.max(0, 1 - (f.t - NET_FLIGHT) / 0.25);
      if (f.t - NET_FLIGHT > 0.25) { scene.remove(f.mesh); f.mesh.material.dispose(); flying.splice(i, 1); }
    }
  }
}

function flush() {
  const n = ninja;
  sfx.flush();
  fx.puff(n.x, 0.5, n.z, 12);
  toast('FOUND HIM!', 0.9);
  n.queue.length = 0;
  n.seg = null;
  n.hideProp = null;
  n.boost = 2.0;
  const c = { x: n.x, y: n.y, z: n.z };
  seg(c, { y: 5.2 }, { dur: 0.3, pose: 'startle' });
  seg(c, {}, { dur: 0.45, pose: 'startle' }); // hangs in the air: the window to catch him
  seg(c, { x: n.x + 3.5, y: 0, z: 0 }, { dur: 0.5, pose: 'air', arc: 0 });
  n.vis = 1;
}

function caught() {
  S.mode = 'caught';
  S.caughtT = 1.5;
  S.timeScale = 0.3;
  S.catches++;
  S.nets = Math.min(G.NETS, S.nets + 2);
  const progress = clamp((ninja.x - S.startX) / (S.exitX - S.startX), 0, 1);
  const pts = 100 + S.level * 20 + Math.round((1 - progress) * 60);
  S.score += pts;
  fx.puff(ninja.x, 1.2, ninja.z, 26, 0xb8c4ff, 4);
  fx.sparks(ninja.x, 1.6, ninja.z, 26);
  rig.root.visible = false;
  flash();
  sfx.caught();
  S.shake = 0.35;
  toast(`CAUGHT!  +${pts}`, 1.4);
}

function escaped() {
  if (S.mode === 'play') gameOver('HE GOT AWAY!');
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  const r = canvas.getBoundingClientRect();
  tap(e.clientX - r.left, e.clientY - r.top);
});
app.addEventListener('pointerdown', (e) => { if (e.target !== canvas && S.mode === 'play') e.preventDefault(); });

// ---------- game flow ----------
let overReady = false;
const bestKey = 'catchme.best';
function getBest() { try { return +localStorage.getItem(bestKey) || 0; } catch (e) { return 0; } }
function setBest(v) { try { localStorage.setItem(bestKey, String(v)); } catch (e) { /* storage unavailable */ } }

function spawnNinja() {
  const n = ninja;
  n.queue.length = 0;
  n.seg = null;
  n.x = cam.x + 5;
  n.y = 0; n.z = 0; n.vis = 1; n.pose = 'run'; n.hideProp = null; n.boost = 0;
  n.crouch = 0; n.air = 0; n.roll = 0; n.rollAng = 0;
  S.startX = n.x;
  S.exitX = n.x + G.LEVEL_LEN + (S.level - 1) * G.LEN_PER_LEVEL;
  S.escaping = false;
  S.sinceSpawn = 0;
  // clear props overlapping the start and put the exit gate in place
  world.props = world.props.filter((p) => {
    if (p.x + p.w / 2 > n.x - 4 && p.x - p.w / 2 < n.x + 14) { scene.remove(p.group); return false; }
    return true;
  });
  world.addGate(S.exitX);
  rig.root.visible = true;
  fx.puff(n.x, 0.4, n.z, 14);
}

function startGame() {
  sfx.unlock();
  app.classList.remove('is-menu');
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  Object.assign(S, { mode: 'play', level: 1, catches: 0, score: 0, nets: G.NETS, time: 0, caughtT: 0, timeScale: 1, shake: 0 });
  for (const d of decoys) scene.remove(d.g);
  decoys.length = 0;
  world.gates.forEach((gt) => scene.remove(gt.g));
  world.gates.length = 0;
  spawnNinja();
  toast('CATCH HIM!', 1.2);
}

function gameOver(title) {
  if (S.mode === 'menu') return;
  S.mode = 'over';
  sfx.lose();
  const best = Math.max(getBest(), S.score);
  if (S.score > 0 && S.score >= best) setBest(best);
  $('overTitle').textContent = title;
  $('finalCaught').textContent = S.catches;
  $('finalScore').textContent = S.score;
  $('best').textContent = S.score > 0 && S.score >= best ? 'NEW BEST!' : `BEST ${best}`;
  overReady = false;
  setTimeout(() => { overReady = true; }, 600);
  $('over').classList.remove('hidden');
}

$('start').addEventListener('click', startGame);
$('retry').addEventListener('click', () => { if (overReady) startGame(); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'Space') {
    if (S.mode === 'menu') startGame();
    else if (S.mode === 'over' && overReady) startGame();
  }
});

// ---------- per-frame ----------
function updateCamera(dt) {
  cam.x += (ninja.x - 0.8 - cam.x) * Math.min(1, dt * 2.6);
  let sx = 0, sy = 0;
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt);
    sx = (Math.random() - 0.5) * S.shake * 0.8;
    sy = (Math.random() - 0.5) * S.shake * 0.8;
  }
  camera.position.set(cam.x + sx, G.CAM_Y + sy, G.CAM_Z);
  camera.lookAt(cam.x, G.LOOK_Y, 0);
  sky.position.set(cam.x, 0, 0);
  beam.position.set(ninja.x - 2, 6, -8);
}

function updateHud() {
  setText(hud.score, String(S.score));
  setText(hud.level, String(S.level));
  hud.nets.forEach((el, i) => el.classList.toggle('used', i >= S.nets));
  const prog = clamp((ninja.x - S.startX) / (S.exitX - S.startX), 0, 1);
  hud.gapfill.style.width = `${(Number.isFinite(prog) ? prog : 0) * 100}%`;
  const danger = prog > 0.78 && S.mode === 'play';
  hud.gap.classList.toggle('danger', danger);
  hud.gap.classList.toggle('hiding', ninja.pose === 'hide' && !danger);
  setText(hud.gaplabel, danger ? 'ESCAPING!' : ninja.pose === 'hide' ? 'HIDING...' : ninja.pose === 'vanish' ? 'VANISHED!' : 'EXIT');
}

function step(rawDt) {
  const dt = Math.min(rawDt, 0.05) * S.timeScale;
  S.time += dt;

  if (S.mode === 'play' || S.mode === 'menu') {
    updateNinja(dt);
    S.sinceSpawn += dt;
  } else if (S.mode === 'caught') {
    S.caughtT -= dt;
    if (S.timeScale < 1) S.timeScale = Math.min(1, S.timeScale + rawDt * 0.9);
    if (S.caughtT <= 0) {
      S.level++;
      S.mode = 'play';
      S.timeScale = 1;
      spawnNinja();
      toast(`LEVEL ${S.level}`, 1.3);
    }
  } else if (S.mode === 'over') {
    updateNinja(dt);
  }

  for (let i = decoys.length - 1; i >= 0; i--) {
    decoys[i].t -= dt;
    if (decoys[i].t <= 0) { scene.remove(decoys[i].g); decoys.splice(i, 1); }
  }

  world.update(cam.x, dt, S.exitX, S.level);

  rig.root.position.set(ninja.x, ninja.y, ninja.z);
  rig.root.visible = ninja.vis > 0.5 && S.mode !== 'caught';
  animateNinja(rig, { phase: ninja.phase, air: ninja.air, crouch: ninja.crouch, roll: ninja.roll, rollAng: ninja.rollAng, t: S.time });

  if (S.toastT > 0) {
    S.toastT -= rawDt;
    if (S.toastT <= 0) hud.toast.classList.remove('show');
  }

  updateNets(rawDt);
  fx.update(dt);
  updateCamera(rawDt);
  updateHud();
}

// start with the world populated so the first frame isn't empty
world.spawnProps(80, Infinity, 1);
spawnNinja();
cam.x = ninja.x - 0.8;
resize();
camera.position.set(cam.x, G.CAM_Y, G.CAM_Z);

let last = performance.now();
function frame(now) {
  step((now - last) / 1000);
  last = now;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging / automated tests
window.__catchme = {
  S, ninja, world, camera, step, startGame, project, ninjaExposed,
  canvas,
};
