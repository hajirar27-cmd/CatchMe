import * as THREE from '../vendor/three.module.min.js';
import { Jungle, BRANCH_LEN } from './jungle.js';
import { createNinja, animateNinja } from './characters.js';
import { Effects } from './effects.js';
import { Sfx } from './audio.js';
import { G, LANES } from './constants.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const app = $('app');
const canvas = $('c');

// ---------- renderer / scene ----------
const params = new URLSearchParams(location.search);
const forcedQ = params.has('q') ? clamp(+params.get('q') || 0, 0, 2) : null;
// quality: 2 = shadows + bloom + MSAA, 1 = lighter, 0 = no shadows/post (auto-steps down on slow devices)
let quality = forcedQ ?? 2;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = window.devicePixelRatio || 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const SKY = 0x0c1e26;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.FogExp2(SKY, 0.017);

const camera = new THREE.PerspectiveCamera(70, 0.5, 0.1, 400);

// post-processing: bloom for lanterns/fireflies/portal, then tone-map + a light colour grade
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.65, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c * vec3(0.9, 1.02, 1.1), c * vec3(1.08, 1.03, 0.94), smoothstep(0.15, 0.75, l));
      c = mix(vec3(l), c, 1.08);
      vec2 d = (vUv - 0.5) * vec2(1.0, 1.1);
      c *= mix(0.55, 1.0, smoothstep(0.85, 0.2, length(d)));
      float g = fract(sin(dot(vUv * vec2(1234.5, 987.6) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (g - 0.5) * 0.022;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(gradePass);

function applyQuality() {
  const pr = quality >= 2 ? Math.min(DPR, 2) : quality === 1 ? Math.min(DPR, 1.5) : Math.min(DPR, 1.25);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = quality >= 2 ? 4 : 0; t.dispose(); }
  bloom.enabled = quality >= 1;
  moonLight.castShadow = quality >= 1;
  moonLight.shadow.mapSize.set(quality >= 2 ? 2048 : 1024, quality >= 2 ? 2048 : 1024);
  if (moonLight.shadow.map) { moonLight.shadow.map.dispose(); moonLight.shadow.map = null; }
  resize();
}

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
  camera.aspect = w / h;
  const hf = (G.HFOV * Math.PI) / 180;
  camera.fov = camera.aspect < 1 ? (2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180) / Math.PI : 62;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app);

const MOON = new THREE.Vector3(...G.MOON_DIR);
scene.add(new THREE.HemisphereLight(0x7fa4c4, 0x1a2a1c, 0.7));
const moonLight = new THREE.DirectionalLight(0xbcd2ff, 2.6);
moonLight.shadow.bias = -0.0005;
moonLight.shadow.normalBias = 0.05;
{
  const sc = moonLight.shadow.camera;
  sc.left = -19; sc.right = 19; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 140;
}
scene.add(moonLight, moonLight.target);
// a soft cool fill that follows the ninja so he stays readable against the dark path
const beam = new THREE.PointLight(0x9fc4ff, 14, 22, 1.6);
scene.add(beam);

// reflections / ambient light from a procedural night sky
{
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#16345e');
  gr.addColorStop(0.45, '#2c5a6e');
  gr.addColorStop(0.55, '#16343a');
  gr.addColorStop(1, '#07120e');
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 10, 12) }));
  moon.position.copy(MOON).normalize().multiplyScalar(44);
  env.add(moon);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.85;
  pm.dispose();
}

const sky = new THREE.Group();
scene.add(sky);
{
  const n = 220;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 380;
    pos[i * 3 + 1] = 40 + Math.random() * 130;
    pos[i * 3 + 2] = 120 + Math.random() * 120;
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
  moon.scale.setScalar(60);
  moon.position.set(-30, 85, 170);
  sky.add(moon);
}

const tLoad = performance.now();
const world = new Jungle(scene, { shadows: true });
const loadMs = Math.round(performance.now() - tLoad);
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
  caughtT: 0,
  timeScale: 1,
  shake: 0,
  toastT: 0,
  startZ: 0,
  exitZ: Infinity,
  escaping: false,
};

const ninja = {
  x: 0, y: 0, z: 0, vis: 1, heading: 0,
  pose: 'run', // run | air | roll | crouch | hide | vanish | skim | startle
  phase: 0, rollAng: 0, crouch: 0, air: 0, roll: 0, boost: 0,
  seg: null, queue: [], hideProp: null, wisp: 0, trail: 0, lastVanish: -9,
};

const cam = { x: 0, z: 0 };

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
const dist2 = (c, x, z) => Math.hypot(x - c.x, z - c.z);
const runTo = (c, x, z) => seg(c, { x, z }, { dur: dist2(c, x, z) / speed(), pose: 'run' });
const skimTo = (c, z) => seg(c, { z }, { dur: Math.abs(z - c.z) / speed(), pose: 'skim' });
const leapTo = (c, to, arc, dur) => seg(c, to, { dur, arc, pose: 'air' });
const rollTo = (c, x, z) => {
  const d = dist2(c, x, z);
  return seg(c, { x, z }, { dur: d / (speed() * 1.7), pose: 'roll', spin: d * 1.25 });
};
const holdHide = (c, prop, dur) => seg(c, {}, { dur, pose: 'hide', onStart: () => { ninja.hideProp = prop; }, onEnd: () => { ninja.hideProp = null; } });
const vanishTo = (c, x, z, dur) =>
  seg(c, { x, z, y: 0 }, {
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

// lanes the prop doesn't block
function freeLanes(P) { return LANES.filter((l) => Math.abs(l - P.x) > P.w / 2 + 0.65); }
function nearestLane(P) {
  const f = freeLanes(P);
  if (!f.length) return null;
  f.sort((a, b) => Math.abs(a - ninja.x) - Math.abs(b - ninja.x));
  return f[0];
}

// Pick what he does next based on what's ahead of him.
function planNext() {
  const n = ninja;
  const c = { x: n.x, y: 0, z: n.z };
  const L = S.level;
  const P = world.nextProp(n.z + 1.0);

  // near the exit: head for the portal
  if (n.z > S.exitZ - 14 && !S.escaping && S.mode === 'play') {
    runTo(c, 0, S.exitZ - 1.6);
    const s = leapTo(c, { x: 0, y: 2.6, z: S.exitZ + 0.4 }, 1.0, 0.6);
    s.onStart = () => { S.escaping = true; };
    s.onEnd = () => { ninja.vis = 0; fx.puff(0, 2.6, S.exitZ, 20, 0xb8a4ff, 4); escaped(); };
    return;
  }

  const zf = P ? P.z - P.d / 2 : n.z + 40;
  const zb = P ? P.z + P.d / 2 : n.z + 40;
  const room = zf - n.z;

  // vanish in the open between obstacles
  if (room > 9 && S.time - n.lastVanish > 5 && Math.random() < 0.2 + L * 0.06) {
    n.lastVanish = S.time;
    const lane = pickOf(LANES);
    runTo(c, n.x, n.z + 1.2);
    vanishTo(c, lane, Math.min(zf - 3.5, n.z + rand(6, 9)), rand(0.8, 1.3));
    return;
  }
  if (!P) { runTo(c, n.x, n.z + 14); return; }

  const wHide = 2 + L * 0.3;
  const choices = [];
  const add = (w, fn) => choices.push([w, fn]);
  const lane = nearestLane(P);
  const approach = (ln) => runTo(c, ln, Math.max(c.z + 1.0, zf - 3.4));
  const roomOk = room > 5.0;

  // slip in behind the prop (beyond it as seen from the camera) after passing it in a free lane
  const behind = (spotX, dz = 1.6) => {
    approach(lane);
    runTo(c, lane, zb + 0.3);
    rollTo(c, spotX, zb + dz);
    holdHide(c, P, hideDur());
    rollTo(c, spotX, zb + 5.5);
  };
  const pass = () => { approach(lane); runTo(c, lane, zb + 2.0); };
  const vanishPast = () => { approach(lane); runTo(c, lane, zf - 0.6); vanishTo(c, lane, zb + 1.8, rand(0.8, 1.2)); };

  switch (P.type) {
    case 'house':
      if (roomOk) add(wHide + 1, () => behind(P.x));
      if (roomOk) {
        add(2.2, () => {
          approach(lane);
          runTo(c, lane, zf - 0.6);
          leapTo(c, { x: P.x, y: P.roofY, z: zf + 0.9 }, 1.3, 0.55);
          runTo(c, P.x, zb - 0.9);
          leapTo(c, { x: pickOf(LANES), y: 0, z: zb + 2.8 }, 1.3, 0.7);
        });
      }
      if (L >= 2 && roomOk) add(1 + L * 0.3, vanishPast);
      add(1, pass);
      break;
    case 'tent':
      if (roomOk) add(wHide + 1, () => behind(P.x));
      if (L >= 2 && roomOk) add(1 + L * 0.3, vanishPast);
      add(1.5, () => { approach(lane); rollTo(c, lane, zb + 2.0); });
      break;
    case 'canopy': {
      const spotX = P.x + (lane < P.x ? -1 : 1) * 1.0;
      if (roomOk) {
        add(wHide + 1, () => {
          approach(lane);
          runTo(c, lane, zf + 1.2);
          rollTo(c, spotX, zf + 1.2);
          holdHide(c, P, hideDur());
          rollTo(c, spotX, zb + 3.2);
        });
      }
      if (L >= 2 && roomOk) add(1 + L * 0.3, vanishPast);
      add(1, pass);
      break;
    }
    case 'tree': {
      const bl = P.x + P.branchSide * 2;
      if (P.z - BRANCH_LEN / 2 - 2.2 > n.z + 1.0) {
        add(2.5, () => {
          runTo(c, bl, P.z - BRANCH_LEN / 2 - 2.2);
          leapTo(c, { x: P.x + P.branchSide * 1.45, y: P.branchY - 0.05, z: P.z - BRANCH_LEN / 2 + 0.6 }, 1.6, 0.65);
          runTo(c, P.x + P.branchSide * 1.45, P.z + BRANCH_LEN / 2 - 0.6);
          leapTo(c, { x: bl, y: 0, z: P.z + BRANCH_LEN / 2 + 2.4 }, 1.2, 0.7);
        });
      }
      if (roomOk) add(wHide + 1, () => behind(P.x, 1.7));
      add(1, () => { approach(lane); rollTo(c, lane, zb + 2.2); });
      break;
    }
    case 'pond': {
      const ln = LANES.reduce((a, b) => (Math.abs(b - n.x) < Math.abs(a - n.x) ? b : a));
      add(2, () => { runTo(c, ln, Math.max(c.z + 0.8, zf - 0.8)); leapTo(c, { z: zb + 0.9 }, 2.4, 1.0); });
      add(2, () => { runTo(c, ln, Math.max(c.z + 0.8, zf - 0.3)); skimTo(c, zb + 0.4); });
      if (L >= 2) add(1 + L * 0.2, () => { runTo(c, ln, Math.max(c.z + 0.8, zf - 0.3)); vanishTo(c, ln, zb + 1.0, rand(0.9, 1.3)); });
      break;
    }
    case 'bush':
      if (roomOk) add(wHide + 1, () => behind(P.x, 1.3));
      add(1.5, pass);
      break;
    default:
      runTo(c, n.x, zb + 2);
  }
  if (lane === null && P.type !== 'pond') { runTo(c, n.x, zb + 2); return; }
  const total = choices.reduce((a, b) => a + b[0], 0);
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
  n.boost = Math.max(0, n.boost - dt);
  if (!n.seg) {
    if (!n.queue.length) planNext();
    if (n.queue.length) startSeg(n.queue.shift());
  }
  const s = n.seg;
  let vx = 0;
  if (s) {
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    n.x = lerp(s.x0, s.x1, k);
    n.z = lerp(s.z0, s.z1, k);
    n.y = lerp(s.y0, s.y1, k) + s.arc * 4 * k * (1 - k);
    n.rollAng = s.spin * k;
    vx = (s.x1 - s.x0) / s.dur;
    if (k >= 1) {
      const end = s.onEnd;
      n.seg = null;
      n.rollAng = 0;
      if (end) end();
    }
  }
  // lean into lane changes
  n.heading = lerp(n.heading, clamp(vx * 0.12, -0.7, 0.7), Math.min(1, dt * 10));

  const pose = n.pose;
  n.crouch = lerp(n.crouch, pose === 'hide' || pose === 'crouch' ? 1 : 0, Math.min(1, dt * 12));
  n.air = lerp(n.air, pose === 'air' || pose === 'startle' ? 1 : 0, Math.min(1, dt * 14));
  n.roll = lerp(n.roll, pose === 'roll' ? 1 : 0, Math.min(1, dt * 16));
  if (pose === 'run' || pose === 'skim') n.phase += speed() * dt * 1.15;

  // the tell: smoke wisps over his hiding spot
  if (pose === 'hide' && n.hideProp) {
    n.wisp -= dt;
    if (n.wisp <= 0) {
      n.wisp = 0.22;
      fx.emit(n.x + rand(-0.3, 0.3), n.hideProp.cueY, n.z - 0.2, { vy: 1.2, life: 1.4, size: 0.8, grow: 0.9, color: 0xb8caff, opacity: 0.55 });
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
      fx.emit(n.x + rand(-0.3, 0.3), 0.2, n.z, { vy: 2.2, life: 0.5, size: 0.35, grow: 0.2, color: 0xbfeaff, opacity: 0.7 });
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

// the net's footprint on the ground plane (z is foreshortened on screen, so it's taller than it is wide)
function netRX() { return Math.max(0.95, 1.35 - 0.03 * S.level); }
function netRZ() { return Math.max(1.25, 1.85 - 0.05 * S.level); }
function ninjaHeight() { return G.NINJA_SCALE * 2.1 * (1 - 0.45 * ninja.crouch - 0.3 * ninja.roll); }

function project(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
}

// Is any part of him in line of sight of the camera?
function ninjaExposed() {
  const n = ninja;
  const H = ninjaHeight();
  const occ = world.occluders(camera.position.z, n.z);
  for (const m of occ) m.updateWorldMatrix(true, false);
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
  // where the tap lands on the ninja's mid-body height plane (world space, so camera motion doesn't matter)
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(ninja.y + ninjaHeight() / 2));
  const pt = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, pt)) return;
  const mesh = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
  flying.push({ t: 0, tx: pt.x, ty: pt.y, tz: pt.z, sx: cam.x, sy: 3.4, sz: cam.z + 4, mesh, landed: false });
}

function resolveNet(f) {
  const n = ninja;
  if (S.mode !== 'play' || S.escaping) return;
  const H = ninjaHeight();
  const ex = (n.x - f.tx) / netRX();
  const ez = (n.z - f.tz) / netRZ();
  if (n.vis > 0.5 && ex * ex + ez * ez < 1 && Math.abs(n.y + H / 2 - f.ty) < H / 2 + 1.6) {
    const exposed = ninjaExposed();
    if (n.pose === 'hide' && !exposed) { flush(); return; }
    if (exposed && n.pose !== 'vanish') { caught(); return; }
  }
  for (const dc of decoys) {
    if (Math.abs(dc.x - f.tx) < 1.5 && Math.abs(dc.z - f.tz) < 2.2) {
      fx.puff(dc.x, 0.8, dc.z, 10, 0xc9b79a, 2);
      dc.t = 0;
      toast("It's a log!", 1.0);
      useNet();
      return;
    }
  }
  fx.puff(f.tx, 0.4, f.tz, 5, 0xd6c8a0, 1.5);
  useNet();
}

function updateNets(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt;
    const k = Math.min(1, f.t / NET_FLIGHT);
    f.mesh.position.set(lerp(f.sx, f.tx, k), lerp(f.sy, f.ty, k) + Math.sin(k * Math.PI) * 2.2, lerp(f.sz, f.tz, k));
    if (!f.landed) {
      const sc = lerp(0.3, 1, k);
      f.mesh.scale.set(netRX() * sc, netRZ() * sc, 1);
      if (k >= 1) { f.landed = true; resolveNet(f); }
    } else {
      const e = (f.t - NET_FLIGHT) / 0.25;
      f.mesh.scale.set(netRX() * (1 + e * 0.3), netRZ() * (1 + e * 0.3), 1);
      f.mesh.material.opacity = Math.max(0, 1 - e);
      if (e > 1) { scene.remove(f.mesh); f.mesh.material.dispose(); flying.splice(i, 1); }
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
  seg(c, { y: 5.4 }, { dur: 0.3, pose: 'startle' });
  seg(c, {}, { dur: 0.45, pose: 'startle' }); // hangs in the air: the window to catch him
  seg(c, { x: n.x, y: 0, z: n.z + 3.5 }, { dur: 0.5, pose: 'air' });
  n.vis = 1;
}

function caught() {
  S.mode = 'caught';
  S.caughtT = 1.5;
  S.timeScale = 0.3;
  S.catches++;
  S.nets = Math.min(G.NETS, S.nets + 2);
  const progress = clamp((ninja.z - S.startZ) / (S.exitZ - S.startZ), 0, 1);
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

// ---------- game flow ----------
let overReady = false;
const bestKey = 'catchme.best';
function getBest() { try { return +localStorage.getItem(bestKey) || 0; } catch (e) { return 0; } }
function setBest(v) { try { localStorage.setItem(bestKey, String(v)); } catch (e) { /* storage unavailable */ } }

function spawnNinja() {
  const n = ninja;
  n.queue.length = 0;
  n.seg = null;
  n.x = pickOf(LANES);
  n.z = cam.z + 12.5;
  n.y = 0; n.vis = 1; n.pose = 'run'; n.hideProp = null; n.boost = 0; n.heading = 0;
  n.crouch = 0; n.air = 0; n.roll = 0; n.rollAng = 0;
  S.startZ = n.z;
  S.exitZ = n.z + G.LEVEL_LEN + (S.level - 1) * G.LEN_PER_LEVEL;
  S.escaping = false;
  // clear props overlapping the start, then put the exit portal in place
  world.props = world.props.filter((p) => {
    if (p.z + p.d / 2 > n.z - 6 && p.z - p.d / 2 < n.z + 16) { scene.remove(p.group); return false; }
    return true;
  });
  world.addGate(S.exitZ);
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
  cam.z += (ninja.z - G.CAM_BACK - cam.z) * Math.min(1, dt * 2.6);
  cam.x += (ninja.x * 0.5 - cam.x) * Math.min(1, dt * 4);
  let sx = 0, sy = 0;
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt);
    sx = (Math.random() - 0.5) * S.shake * 0.8;
    sy = (Math.random() - 0.5) * S.shake * 0.8;
  }
  camera.position.set(cam.x + sx, G.CAM_Y + sy, cam.z);
  camera.lookAt(cam.x * 0.7, 1.2, cam.z + G.LOOK_AHEAD);
  sky.position.set(camera.position.x, 0, camera.position.z);
  beam.position.set(ninja.x, 8, ninja.z - 7);
  // moonlight (and its shadow frustum) follows the action
  moonLight.target.position.set(cam.x, 0, ninja.z + 6);
  moonLight.position.copy(moonLight.target.position).add(MOON);
  gradePass.uniforms.uTime.value = S.time;
}

function updateHud() {
  setText(hud.score, String(S.score));
  setText(hud.level, String(S.level));
  hud.nets.forEach((el, i) => el.classList.toggle('used', i >= S.nets));
  const prog = clamp((ninja.z - S.startZ) / (S.exitZ - S.startZ), 0, 1);
  hud.gapfill.style.width = `${(Number.isFinite(prog) ? prog : 0) * 100}%`;
  const danger = prog > 0.78 && S.mode === 'play';
  hud.gap.classList.toggle('danger', danger);
  hud.gap.classList.toggle('hiding', ninja.pose === 'hide' && !danger);
  setText(hud.gaplabel, danger ? 'ESCAPING!' : ninja.pose === 'hide' ? 'HIDING...' : ninja.pose === 'vanish' ? 'VANISHED!' : 'EXIT');
}

function step(rawDt) {
  const dt = Math.min(rawDt, 0.05) * S.timeScale;
  S.time += dt;

  if (S.mode === 'play' || S.mode === 'menu' || S.mode === 'over') {
    updateNinja(dt);
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
  }

  for (let i = decoys.length - 1; i >= 0; i--) {
    decoys[i].t -= dt;
    if (decoys[i].t <= 0) { scene.remove(decoys[i].g); decoys.splice(i, 1); }
  }

  world.update(cam.z, dt, S.exitZ, S.level);

  rig.root.position.set(ninja.x, ninja.y, ninja.z);
  rig.root.rotation.y = ninja.heading;
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
cam.z = -12;
world.spawnProps(100, Infinity, 1);
spawnNinja();
cam.z = ninja.z - G.CAM_BACK;
cam.x = ninja.x * 0.5;
resize();
camera.position.set(cam.x, G.CAM_Y, cam.z);

let last = performance.now();
let frames = 0, acc = 0;
function frame(now) {
  const dt = (now - last) / 1000;
  step(dt);
  last = now;
  composer.render();
  // step quality down on slow devices (after a short warm-up), unless it was forced via ?q=
  frames++;
  if (forcedQ === null && frames > 90 && quality > 0) {
    acc += dt;
    if (frames % 60 === 0) {
      if (acc / 60 > 0.032) { quality--; applyQuality(); frames = 60; }
      acc = 0;
    }
  }
  requestAnimationFrame(frame);
}
applyQuality();
requestAnimationFrame(frame);

// handy for debugging / automated tests
window.__catchme = { loadMs, S, ninja, world, camera, step, startGame, project, ninjaExposed, canvas };
