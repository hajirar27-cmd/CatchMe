import * as THREE from '../vendor/three.module.min.js';
import { G } from './constants.js';

const lam = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });

function limb(len, w, mat, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  m.position.y = -len / 2;
  pivot.add(m);
  return pivot;
}

// The ninja: blocky humanoid, feet at y=0, faces +z (runs away from the camera).
// root > pivot (body centre, used for rolling) > rig (feet origin, used for crouching)
export function createNinja() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 1.1;
  const rig = new THREE.Group();
  rig.position.y = -1.1;
  root.add(pivot);
  pivot.add(rig);

  const bodyMat = lam(0x1b2140, 0x10183c);
  const limbMat = lam(0x161b36, 0x0d1432);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.38), bodyMat);
  torso.position.y = 1.17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), bodyMat);
  head.position.y = 1.8;
  const legL = limb(0.8, 0.24, limbMat, -0.17, 0.8);
  const legR = limb(0.8, 0.24, limbMat, 0.17, 0.8);
  const armL = limb(0.72, 0.2, bodyMat, -0.42, 1.52);
  const armR = limb(0.72, 0.2, bodyMat, 0.42, 1.52);
  rig.add(torso, head, legL, legR, armL, armR);

  const red = new THREE.MeshLambertMaterial({ color: 0xe0243f, emissive: 0x9a1229, side: THREE.DoubleSide });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.1, 16), red);
  band.position.y = 1.84;
  rig.add(band);
  // eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  for (const ex of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.03), eyeMat);
    eye.position.set(ex, 1.84, 0.26);
    rig.add(eye);
  }

  const scarfRoot = new THREE.Group();
  scarfRoot.position.set(0, 1.84, -0.28);
  rig.add(scarfRoot);
  const scarf = [];
  let parent = scarfRoot;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -0.34;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.34), red);
    m.position.z = -0.17;
    seg.add(m);
    parent.add(seg);
    scarf.push(seg);
    parent = seg;
  }

  const sword = new THREE.Group();
  sword.position.set(0, 1.2, -0.26);
  sword.rotation.z = 0.75;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.05), lam(0x9aa6d8, 0x2a3358));
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.25, 0.08), red);
  hilt.position.y = -0.65;
  sword.add(blade, hilt);
  rig.add(sword);

  root.scale.setScalar(G.NINJA_SCALE);
  return { root, pivot, rig, legs: [legL, legR], arms: [armL, armR], scarf };
}

// o: { phase, air 0..1, crouch 0..1, roll 0..1 (tuck), rollAng (radians), t }
export function animateNinja(h, o) {
  const run = 1 - o.air - o.roll > 0 ? 1 - Math.max(o.air, o.roll) : 0;
  const swing = Math.sin(o.phase) * 0.95 * run;
  h.legs[0].rotation.x = swing - o.air * 0.9 - o.roll * 1.6;
  h.legs[1].rotation.x = -swing + o.air * 0.5 - o.roll * 1.6;
  let arm = 1.25 * (1 - o.air) + -0.5 * o.air; // arms swept back when running
  arm = arm * (1 - o.roll) + -1.3 * o.roll;
  h.arms[0].rotation.x = arm + Math.sin(o.phase + 1) * 0.12 * run;
  h.arms[1].rotation.x = arm + Math.sin(o.phase + 2) * 0.12 * run;
  h.scarf.forEach((s, i) => {
    s.rotation.y = Math.sin(o.t * 11 + i * 0.9) * 0.3;
    s.rotation.x = -0.1 + Math.sin(o.t * 9 + i) * 0.1;
  });
  h.rig.scale.y = 1 - 0.45 * o.crouch - 0.3 * o.roll;
  h.rig.rotation.x = 0.12 + o.crouch * 0.35;
  h.rig.position.y = -1.1 + Math.abs(Math.sin(o.phase)) * 0.06 * run;
  h.pivot.rotation.x = o.rollAng;
}
