import * as THREE from '../vendor/three.module.min.js';

const lam = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });

function limb(len, w, mat, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  m.position.y = -len / 2;
  pivot.add(m);
  return pivot;
}

// Simple blocky humanoid, feet at y=0, facing +z.
function humanoid({ body, bodyEm, limbs, limbsEm, skin, skinEm = 0x000000 }) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const bodyMat = lam(body, bodyEm);
  const limbMat = lam(limbs, limbsEm);
  const skinMat = lam(skin, skinEm);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.78, 0.38), bodyMat);
  torso.position.y = 1.17;
  rig.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), skinMat);
  head.position.y = 1.8;
  rig.add(head);

  const legL = limb(0.8, 0.24, limbMat, -0.17, 0.8);
  const legR = limb(0.8, 0.24, limbMat, 0.17, 0.8);
  const armL = limb(0.72, 0.2, bodyMat, -0.42, 1.52);
  const armR = limb(0.72, 0.2, bodyMat, 0.42, 1.52);
  rig.add(legL, legR, armL, armR);

  root.scale.setScalar(1.3);
  return { root, rig, torso, head, legs: [legL, legR], arms: [armL, armR] };
}

export function createRunner() {
  const h = humanoid({
    body: 0xf08a24, bodyEm: 0x2a1400,
    limbs: 0x2b3a67, limbsEm: 0x060b1a,
    skin: 0xe0ac84, skinEm: 0x120a05,
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xeeeeee, 0x222222));
  cap.position.y = 1.82;
  h.rig.add(cap);

  // Catch net held in the right hand.
  const net = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), lam(0x8b6a3d, 0x1a1208));
  pole.rotation.x = Math.PI / 2;
  pole.position.set(0, -0.55, 0.7);
  net.position.x = 0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), lam(0xcccccc, 0x333333));
  ring.position.set(0, -0.55, 1.5);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  mesh.position.copy(ring.position);
  net.add(pole, ring, mesh);
  h.arms[1].add(net);
  h.netArm = h.arms[1];
  return h;
}

export function createNinja() {
  const h = humanoid({
    body: 0x161a2e, bodyEm: 0x0c1334,
    limbs: 0x12162a, limbsEm: 0x0a1030,
    skin: 0x161a2e, skinEm: 0x0c1334,
  });

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.285, 0.285, 0.1, 16),
    new THREE.MeshLambertMaterial({ color: 0xd8213c, emissive: 0x8a0f24 })
  );
  band.position.y = 1.84;
  h.rig.add(band);

  // Trailing scarf: a chain of segments that wave in update.
  const scarfMat = new THREE.MeshLambertMaterial({ color: 0xd8213c, emissive: 0x8a0f24, side: THREE.DoubleSide });
  const scarfRoot = new THREE.Group();
  scarfRoot.position.set(0, 1.84, -0.28);
  h.rig.add(scarfRoot);
  const scarf = [];
  let parent = scarfRoot;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -0.34;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.34), scarfMat);
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
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.25, 0.08), lam(0xd8213c, 0x6a0a1c));
  hilt.position.y = -0.65;
  sword.add(blade, hilt);
  h.rig.add(sword);

  h.scarf = scarf;
  h.ninja = true;
  return h;
}

// phase: run cycle angle; air: 0..1 jump pose; crouch: 0..1; t: time for scarf wave
export function animate(h, phase, air, crouch, t) {
  const swing = Math.sin(phase) * 0.95 * (1 - air);
  h.legs[0].rotation.x = swing * (1 - crouch * 0.6) + air * -0.9;
  h.legs[1].rotation.x = -swing * (1 - crouch * 0.6) + air * 0.5;
  if (h.ninja) {
    // classic ninja run: arms swept back
    h.arms[0].rotation.x = 1.25 + Math.sin(phase + 1) * 0.12;
    h.arms[1].rotation.x = 1.25 + Math.sin(phase + 2) * 0.12;
    h.scarf.forEach((s, i) => {
      s.rotation.y = Math.sin(t * 11 + i * 0.9) * 0.3;
      s.rotation.x = -0.1 + Math.sin(t * 9 + i) * 0.1;
    });
  } else {
    h.arms[0].rotation.x = -swing + air * -2.4;
    h.arms[1].rotation.x = -1.1 + Math.sin(phase) * 0.12 + air * -0.6; // net arm held out ahead
  }
  h.rig.scale.y = 1 - 0.45 * crouch;
  h.rig.rotation.x = 0.12 + crouch * 0.35;
  h.rig.position.y = Math.abs(Math.sin(phase)) * 0.06 * (1 - air);
}
