import * as THREE from '../vendor/three.module.min.js';
import { G } from './constants.js';
import { clothTex } from './textures.js';

function limb(geo, mat, x, y, ox = 0, oy = 0, oz = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(ox, oy, oz);
  m.castShadow = true;
  pivot.add(m);
  return { pivot, mesh: m };
}

const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

// The ninja, feet at y=0, faces +z (runs away from the camera).
// root > pivot (body centre, used for rolling) > rig (feet origin, used for crouching)
export function createNinja() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 1.1;
  const rig = new THREE.Group();
  rig.position.y = -1.1;
  root.add(pivot);
  pivot.add(rig);

  const cloth = clothTex();
  cloth.map.repeat.set(3, 3);
  cloth.normalMap.repeat.set(3, 3);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const clothMat = std({ map: cloth.map, normalMap: cloth.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82, metalness: 0, color: 0xffffff, emissive: 0x070c20 });
  const darkMat = std({ color: 0x0f1328, roughness: 0.7, metalness: 0.05, emissive: 0x04060f });
  const wrapMat = std({ color: 0x2a2f52, roughness: 0.85, emissive: 0x080a18 });
  const redMat = std({ color: 0xa8142c, roughness: 0.65, emissive: 0x2a040a, side: THREE.DoubleSide });
  const metalMat = std({ color: 0xaeb8d8, roughness: 0.25, metalness: 0.9 });
  const leatherMat = std({ color: 0x3a2618, roughness: 0.7 });

  // torso: tapered capsule + sash
  const torso = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.36, 6, 14), clothMat));
  torso.scale.set(1.3, 1, 0.82);
  torso.position.y = 1.2;
  const chest = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), clothMat));
  chest.scale.set(1.15, 0.8, 0.8);
  chest.position.set(0, 1.4, 0);
  const sash = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 8, 20), redMat));
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(1.1, 0.8, 1);
  sash.position.y = 0.95;
  const knot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.1), redMat));
  knot.position.set(0.12, 0.92, -0.24);
  const tail1 = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.02), redMat));
  tail1.position.set(0.12, 0.7, -0.27);
  tail1.rotation.z = 0.15;
  const pouch = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.1), leatherMat));
  pouch.position.set(-0.26, 0.9, -0.06);
  rig.add(torso, chest, sash, knot, tail1, pouch);

  // head: hood + face mask + eye slit; neck
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.255, 20, 16), darkMat));
  head.scale.set(1, 1.08, 1.05);
  head.position.y = 1.82;
  const neck = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 10), clothMat));
  neck.position.y = 1.66;
  const eyeBand = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.075, 0.1), std({ color: 0xd7b48a, roughness: 0.6 }));
  eyeBand.position.set(0, 1.84, 0.2);
  eyeBand.rotation.x = 0;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  for (const ex of [-0.085, 0.085]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.02), eyeMat);
    eye.position.set(ex, 1.845, 0.255);
    rig.add(eye);
  }
  const band = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.04, 8, 24), redMat));
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.93;
  rig.add(head, neck, eyeBand, band);

  // limbs
  const legGeo = new THREE.CapsuleGeometry(0.13, 0.52, 6, 12);
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.5, 6, 12);
  const L0 = limb(legGeo, clothMat, -0.17, 0.82, 0, -0.4);
  const L1 = limb(legGeo, clothMat, 0.17, 0.82, 0, -0.4);
  for (const l of [L0, L1]) {
    const shin = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.3, 10), wrapMat));
    shin.position.y = -0.52;
    const boot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.3), darkMat));
    boot.position.set(0, -0.78, 0.06);
    l.pivot.add(shin, boot);
  }
  const A0 = limb(armGeo, clothMat, -0.4, 1.56, 0, -0.34);
  const A1 = limb(armGeo, clothMat, 0.4, 1.56, 0, -0.34);
  for (const a of [A0, A1]) {
    const wrap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.22, 10), wrapMat));
    wrap.position.y = -0.5;
    const hand = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), std({ color: 0xc89a72, roughness: 0.6 })));
    hand.position.y = -0.68;
    a.pivot.add(wrap, hand);
  }
  rig.add(L0.pivot, L1.pivot, A0.pivot, A1.pivot);

  // scarf: a chain of cloth strips that waves
  const scarfRoot = new THREE.Group();
  scarfRoot.position.set(0, 1.9, -0.26);
  rig.add(scarfRoot);
  const scarf = [];
  let parent = scarfRoot;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.z = i === 0 ? 0 : -0.3;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2 - i * 0.015, 0.3), redMat);
    m.rotation.x = Math.PI / 2;
    m.position.z = -0.15;
    m.castShadow = true;
    seg.add(m);
    parent.add(seg);
    scarf.push(seg);
    parent = seg;
  }

  // katana on the back
  const sword = new THREE.Group();
  sword.position.set(0, 1.25, -0.24);
  sword.rotation.z = 0.75;
  const sheath = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), std({ color: 0x14121a, roughness: 0.35, metalness: 0.2 })));
  const guard = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 12), metalMat));
  guard.position.y = 0.56;
  const grip = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), redMat));
  grip.position.y = 0.7;
  sword.add(sheath, guard, grip);
  rig.add(sword);

  root.scale.setScalar(G.NINJA_SCALE);
  return { root, pivot, rig, legs: [L0.pivot, L1.pivot], arms: [A0.pivot, A1.pivot], scarf };
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
    s.rotation.x = -0.1 + Math.sin(o.t * 9 + i) * 0.12;
  });
  h.rig.scale.y = 1 - 0.45 * o.crouch - 0.3 * o.roll;
  h.rig.rotation.x = 0.12 + o.crouch * 0.35;
  h.rig.position.y = -1.1 + Math.abs(Math.sin(o.phase)) * 0.06 * run;
  h.pivot.rotation.x = o.rollAng;
}
