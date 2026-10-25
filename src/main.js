import * as THREE from '../vendor/three.module.min.js';
import { World } from './world.js';
import { createRunner, createNinja, animate } from './characters.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { G, LANE_W } from './constants.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const app = $('app');

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const SKY = 0x0a0f24;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 30, 115);

const camera = new THREE.PerspectiveCamera(70, 0.5, 0.1, 400);

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep a fixed horizontal view on tall phones so all 3 lanes always fit
  camera.fov = camera.aspect < 1 ? (2 * Math.atan(Math.tan((21 * Math.PI) / 180) / camera.aspect) * 180) / Math.PI : 60;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app);

scene.add(new THREE.HemisphereLight(0x6a7fc8, 0x151a30, 1.0));
const moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.9);
moonLight.position.set(-12, 22, -8);
scene.add(moonLight);
const lamps = [0, 1, 2].map(() => {
  const l = new THREE.PointLight(0xffa24a, 55, 26, 2);
  scene.add(l);
  return l;
});

// stars + moon follow the camera
const sky = new THREE.Group();
scene.add(sky);
{
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 1.2 + 0.15;
    const r = 220;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pos[i * 3 + 1] = Math.sin(e) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false })));

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,240,1)');
  gr.addColorStop(0.28, 'rgba(255,255,235,1)');
  gr.addColorStop(0.32, 'rgba(190,205,255,0.35)');
  gr.addColorStop(1, 'rgba(120,150,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false }));
  moon.scale.setScalar(80);
  moon.position.set(30, 130, 190);
  sky.add(moon);
}

const world = new World(scene);
const fx = new Effects(scene);
const sfx = new Sfx();

const runner = createRunner();
const ninjaRig = createNinja();
scene.add(runner.root, ninjaRig.root);

// ---------- state ----------
const S = {
  mode: 'menu', // menu | play | caught | over
  level: 1,
  catches: 0,
  score: 0,
  time: 0,
  sinceSpawn: 0,
  caughtT: 0,
  timeScale: 1,
  shake: 0,
  toastT: 0,
};

const player = { x: 0, z: 0, y: 0, vy: 0, lane: 0, speed: 0, phase: 0, stumble: 0, inv: 0, stamina: 1, exhausted: false, dashing: false };

const ninja = {
  x: 0, z: 0, y: 0, vy: 0, lane: 0, targetLane: 0, speed: 0, phase: 0,
  state: 'run', // run | hide | startle
  timer: 0, cooldown: 4, burstT: 0, burstCd: 6, laneCd: 0, crouch: 0,
  hideObs: null, hideZ: 0, alertDist: 5, wisp: 0,
};

const hud = {
  score: $('score'), level: $('level'), caught: $('caught'),
  gap: $('gap'), gapfill: $('gapfill'), gaplabel: $('gaplabel'),
  toast: $('toast'), dash: $('dash'), flash: $('flash'),
};
const hudCache = {};
function setText(el, v) {
  if (hudCache[el.id] !== v) { hudCache[el.id] = v; el.textContent = v; }
}
function toast(msg, secs = 1.4) {
  hud.toast.textContent = msg;
  hud.toast.classList.add('show');
  S.toastT = secs;
}
function flash() {
  hud.flash.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => hud.flash.classList.remove('on')));
}

// ---------- input ----------
const playing = () => S.mode === 'play' || S.mode === 'caught';
const input = new Input(app, hud.dash, {
  left: () => { if (playing()) { player.lane = Math.max(-1, player.lane - 1); sfx.swipe(); } },
  right: () => { if (playing()) { player.lane = Math.min(1, player.lane + 1); sfx.swipe(); } },
  jump: () => {
    if (playing() && player.y <= 0.001) { player.vy = G.JUMP; sfx.jump(); }
  },
  confirm: () => { if (S.mode === 'menu') startGame(); else if (S.mode === 'over' && overReady) startGame(); },
});

// ---------- game flow ----------
let overReady = false;
const bestKey = 'catchme.best';
function getBest() { try { return +localStorage.getItem(bestKey) || 0; } catch (e) { return 0; } }
function setBest(v) { try { localStorage.setItem(bestKey, String(v)); } catch (e) { /* storage unavailable */ } }

function spawnNinja() {
  const n = ninja;
  n.lane = n.targetLane = [-1, 0, 1][(Math.random() * 3) | 0];
  n.x = n.lane * LANE_W;
  n.z = player.z + G.START_GAP;
  n.y = n.vy = 0;
  n.speed = Math.min(G.NINJA_BASE + (S.level - 1) * G.NINJA_PER_LEVEL, G.NINJA_MAX);
  n.state = 'run';
  n.crouch = 0;
  n.cooldown = Math.max(2.5, 6 - S.level * 0.5);
  n.burstT = 0;
  n.burstCd = rand(4, 7);
  n.laneCd = 0;
  world.removeNear(n.z - 6, n.z + 6);
  ninjaRig.root.visible = true;
  S.sinceSpawn = 0;
  fx.puff(n.x, 0.2, n.z, 12);
}

function startGame() {
  sfx.unlock();
  app.classList.remove('is-menu');
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  Object.assign(S, { mode: 'play', level: 1, catches: 0, score: 0, time: 0, caughtT: 0, timeScale: 1, shake: 0 });
  Object.assign(player, { x: 0, y: 0, vy: 0, lane: 0, speed: G.BASE * 0.5, stumble: 0, inv: 0, stamina: 1, exhausted: false });
  world.reset(player.z);
  spawnNinja();
  toast('CATCH HIM!', 1.2);
}

function gameOver() {
  S.mode = 'over';
  sfx.lose();
  const best = Math.max(getBest(), S.score);
  if (best === S.score && S.score > 0) setBest(best);
  $('finalCaught').textContent = S.catches;
  $('finalScore').textContent = S.score;
  $('best').textContent = S.score >= best && S.score > 0 ? 'NEW BEST!' : `BEST ${best}`;
  overReady = false;
  setTimeout(() => { overReady = true; }, 600);
  $('over').classList.remove('hidden');
}

function onCatch() {
  S.mode = 'caught';
  S.caughtT = 1.5;
  S.timeScale = 0.3;
  S.catches++;
  const pts = 100 + S.level * 20 + Math.max(0, Math.round((25 - S.sinceSpawn) * 4));
  S.score += pts;
  fx.puff(ninja.x, 0.5, ninja.z, 26, 0xb8c4ff, 4);
  fx.sparks(ninja.x, 1.4, ninja.z, 24);
  ninjaRig.root.visible = false;
  flash();
  sfx.caught();
  S.shake = 0.35;
  toast(`CAUGHT!  +${pts}`, 1.4);
}

$('start').addEventListener('click', startGame);
$('retry').addEventListener('click', () => { if (overReady) startGame(); });

// ---------- update ----------
function updatePlayer(dt) {
  const p = player;
  // dash + stamina
  p.dashing = input.dash && !p.exhausted && p.stamina > 0 && S.mode === 'play';
  if (p.dashing) {
    p.stamina = Math.max(0, p.stamina - G.STAMINA_DRAIN * dt);
    if (p.stamina <= 0) p.exhausted = true;
  } else if (!input.dash || p.exhausted) {
    p.stamina = Math.min(1, p.stamina + G.STAMINA_REGEN * dt);
    if (p.exhausted && p.stamina > 0.25) p.exhausted = false;
  }

  p.stumble = Math.max(0, p.stumble - dt);
  p.inv = Math.max(0, p.inv - dt);
  const stumbleF = p.stumble > 0 ? 0.3 + 0.7 * (1 - p.stumble / G.STUMBLE_TIME) : 1;
  const target = (G.BASE + (p.dashing ? G.DASH_BONUS : 0)) * stumbleF;
  p.speed += (target - p.speed) * Math.min(1, dt * (target > p.speed ? 4 : 10));
  p.z += p.speed * dt;
  p.x += (p.lane * LANE_W - p.x) * Math.min(1, dt * 14);

  p.vy -= G.GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; }

  // obstacle collision
  for (const o of world.obstacles) {
    if (Math.abs(o.z - p.z) > o.hd + 0.5 || Math.abs(o.x - p.x) > o.hw + 0.35) continue;
    if (o.kind === 'low' && p.y > o.h - 0.05) continue;
    p.z = o.z - o.hd - 0.5;
    if (p.inv <= 0) {
      p.stumble = G.STUMBLE_TIME;
      p.inv = G.STUMBLE_TIME + 0.2;
      p.speed = 0;
      S.shake = 0.3;
      sfx.stumble();
      fx.puff(p.x, 0.6, p.z + 0.5, 6, 0xc9b79a, 1.5);
    }
  }
  p.phase += p.speed * dt * 0.85;
}

function pickFreeLane(n, look) {
  const free = [-1, 0, 1].filter((l) => l !== n.targetLane && !world.firstAhead(l, n.z - 1.8, n.z + look + 4, true));
  if (!free.length) return null;
  free.sort((a, b) => Math.abs(a - n.targetLane) - Math.abs(b - n.targetLane) || Math.random() - 0.5);
  return free[0];
}

function updateNinja(dt) {
  const n = ninja;
  const gap = n.z - player.z;
  n.cooldown -= dt;
  n.burstCd -= dt;
  n.laneCd -= dt;
  S.sinceSpawn += dt;

  const base = Math.min(G.NINJA_BASE + (S.level - 1) * G.NINJA_PER_LEVEL, G.NINJA_MAX);

  if (n.state === 'hide') {
    n.speed = 0;
    n.timer -= dt;
    n.z += (n.hideZ - n.z) * Math.min(1, dt * 12);
    n.wisp -= dt;
    if (n.wisp <= 0) {
      // the tell: wisps of smoke rising above his hiding spot
      n.wisp = 0.2;
      fx.emit(n.x + rand(-0.25, 0.25), n.hideObs.h + 0.2, n.z - 0.8, { vy: 1.3, life: 1.3, size: 0.8, grow: 0.9, color: 0xa9bbff, opacity: 0.55 });
    }
    if (gap < n.alertDist || n.timer <= 0) {
      n.state = 'startle';
      n.timer = 0.3;
      fx.puff(n.x, 0.3, n.z, 10);
      sfx.startle();
      toast('FOUND HIM!', 0.8);
    }
  } else if (n.state === 'startle') {
    n.speed = 0;
    n.timer -= dt;
    if (n.timer <= 0) {
      n.state = 'run';
      n.burstT = 1.4;
      n.cooldown = Math.max(3, 8 - S.level * 0.6);
      const next = pickFreeLane(n, 8);
      if (next !== null) n.targetLane = next;
    }
  } else {
    let target = base;
    if (n.burstT > 0) { n.burstT -= dt; target = base + 6; }
    else if (n.burstCd <= 0) { n.burstT = 1.0; n.burstCd = rand(5, 9); }
    n.speed += (target - n.speed) * Math.min(1, dt * 5);
    n.z += n.speed * dt;

    // dodge obstacles in the way
    const look = 3.5 + n.speed * 0.4;
    const blocking = world.firstAhead(n.targetLane, n.z - 0.3, n.z + look);
    if (blocking) {
      if (blocking.kind === 'low') {
        if (n.y <= 0.001 && blocking.z - blocking.hd - n.z < 3.4) n.vy = G.JUMP;
      } else if (n.laneCd <= 0) {
        const l = pickFreeLane(n, look);
        if (l !== null) { n.targetLane = l; n.laneCd = 0.3; }
      }
    }
    // weave away from the hunter
    if (gap < 11 && player.lane === n.targetLane && n.laneCd <= 0 && Math.random() < dt * 1.5) {
      const l = pickFreeLane(n, look);
      if (l !== null) { n.targetLane = l; n.laneCd = 0.6; }
    }

    // slip behind a tall obstacle he just passed
    if (n.cooldown <= 0 && gap > 13) {
      for (const o of world.obstacles) {
        if (o.rolled || o.kind !== 'tall') continue;
        const past = n.z - (o.z + o.hd);
        if (past < 0.3 || past > 2.2 || o.z - o.hd < player.z + 8) continue;
        o.rolled = true;
        if (Math.random() > Math.min(0.4 + S.level * 0.08, 0.85)) continue;
        n.state = 'hide';
        n.hideObs = o;
        n.targetLane = o.lane;
        n.hideZ = o.z + o.hd + 1.0;
        n.timer = rand(4, 5.5);
        n.alertDist = rand(4, 5.5);
        n.wisp = 0;
        fx.puff(n.x, 0.3, n.z, 10);
        sfx.poof();
        toast('Where did he go?!', 1.6);
        break;
      }
    }
  }

  n.lane = n.targetLane;
  n.x += (n.targetLane * LANE_W - n.x) * Math.min(1, dt * (n.state === 'hide' ? 16 : 10));
  n.vy -= G.GRAVITY * dt;
  n.y += n.vy * dt;
  if (n.y <= 0) { n.y = 0; n.vy = 0; }
  n.phase += Math.max(n.speed, 4) * dt * 0.95;
  n.crouch += ((n.state === 'hide' ? 1 : 0) - n.crouch) * Math.min(1, dt * 9);
}

function updateCamera(dt) {
  const p = player;
  const tx = p.x * 0.6;
  const k = Math.min(1, dt * 6);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (5.9 + p.y * 0.35 - camera.position.y) * k;
  camera.position.z += (p.z - 10.6 - camera.position.z) * Math.min(1, dt * 12);
  let sx = 0, sy = 0;
  if (S.shake > 0) {
    S.shake = Math.max(0, S.shake - dt);
    sx = (Math.random() - 0.5) * S.shake * 0.7;
    sy = (Math.random() - 0.5) * S.shake * 0.7;
  }
  camera.position.x += sx;
  camera.position.y += sy;
  camera.lookAt(p.x * 0.4, 1.2, p.z + 12);
  camera.position.x -= sx;
  camera.position.y -= sy;
  sky.position.copy(camera.position);
  lamps.forEach((l, i) => l.position.set(0, 4, p.z + 6 + i * 16));
}

function updateHud() {
  setText(hud.score, String(S.score));
  setText(hud.level, String(S.level));
  setText(hud.caught, String(S.catches));
  const gap = ninja.z - player.z;
  const closeness = clamp(1 - gap / G.ESCAPE_GAP, 0, 1);
  hud.gapfill.style.width = `${closeness * 100}%`;
  const danger = gap > G.ESCAPE_GAP * 0.72;
  hud.gap.classList.toggle('danger', danger && S.mode === 'play');
  hud.gap.classList.toggle('hiding', ninja.state === 'hide' && !danger);
  setText(hud.gaplabel, danger ? 'ESCAPING!' : ninja.state === 'hide' ? 'HIDING...' : 'NINJA');
  hud.dash.style.setProperty('--st', String(Math.round(player.stamina * 100)));
  hud.dash.classList.toggle('empty', player.exhausted);
}

function step(rawDt) {
  const dt = Math.min(rawDt, 0.05) * S.timeScale;
  S.time += dt;

  if (S.mode === 'menu') {
    // attract mode: the ninja just keeps running through the night
    player.speed = 8;
    player.z += player.speed * dt;
    player.phase += player.speed * dt * 0.85;
    ninja.z = player.z + 14;
    ninja.x = 0; ninja.speed = 8; ninja.crouch = 0;
    ninja.phase += 8 * dt * 0.95;
    world.removeNear(player.z - 2, player.z + 30);
  } else if (S.mode === 'play') {
    updatePlayer(dt);
    updateNinja(dt);
    const dz = ninja.z - player.z;
    if (Math.abs(dz) < G.CATCH_DZ && Math.abs(ninja.x - player.x) < G.CATCH_DX) onCatch();
    else if (dz > G.ESCAPE_GAP) gameOver();
  } else if (S.mode === 'caught') {
    updatePlayer(dt);
    S.caughtT -= dt;
    if (S.timeScale < 1) S.timeScale = Math.min(1, S.timeScale + rawDt * 0.9);
    if (S.caughtT <= 0) {
      S.level++;
      S.mode = 'play';
      S.timeScale = 1;
      spawnNinja();
      toast(`LEVEL ${S.level}`, 1.2);
    }
  } else if (S.mode === 'over') {
    player.speed *= 1 - Math.min(1, dt * 3);
    player.z += player.speed * dt;
    ninja.phase += 3 * dt;
  }

  world.update(player.z, S.level);

  const air = clamp(player.y / 0.6, 0, 1);
  runner.root.position.set(player.x, player.y, player.z);
  animate(runner, player.phase, air, 0, S.time);
  runner.root.rotation.z = (player.lane * LANE_W - player.x) * -0.06;

  const nair = clamp(ninja.y / 0.6, 0, 1);
  ninjaRig.root.position.set(ninja.x, ninja.y, ninja.z);
  animate(ninjaRig, ninja.phase, nair, ninja.crouch, S.time);

  if (S.toastT > 0) {
    S.toastT -= rawDt;
    if (S.toastT <= 0) hud.toast.classList.remove('show');
  }

  fx.update(dt);
  updateCamera(rawDt);
  updateHud();
}

// start with the camera in place so the first frame isn't empty
camera.position.set(0, 5.9, -10.6);
resize();

let last = performance.now();
function frame(now) {
  step((now - last) / 1000);
  last = now;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging / automated tests
window.__catchme = { S, player, ninja, world, step, startGame, input, THREE };
