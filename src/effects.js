import * as THREE from '../vendor/three.module.min.js';

// Pooled soft sprites used for ninja smoke, wisps and catch bursts.
export class Effects {
  constructor(scene, size = 80) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.tex = new THREE.CanvasTexture(c);
    this.pool = [];
    this.next = 0;
    for (let i = 0; i < size; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, grow: 0, op: 1 });
    }
  }

  emit(x, y, z, o = {}) {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.life = p.max = o.life || 1;
    p.grow = o.grow || 0;
    p.op = o.opacity ?? 0.8;
    p.s.position.set(x, y, z);
    p.s.scale.setScalar(o.size || 1);
    p.s.material.color.setHex(o.color ?? 0xffffff);
    p.s.material.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.opacity = p.op;
    p.s.visible = true;
  }

  puff(x, y, z, n = 14, color = 0x8e9bd6, spread = 2.2) {
    for (let i = 0; i < n; i++) {
      this.emit(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 0.6, {
        vx: (Math.random() - 0.5) * spread,
        vy: 0.4 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * spread,
        life: 0.6 + Math.random() * 0.5,
        size: 0.8 + Math.random() * 0.8,
        grow: 2.2,
        color,
        opacity: 0.7,
      });
    }
  }

  sparks(x, y, z, n = 18, color = 0xffd36a) {
    for (let i = 0; i < n; i++) {
      this.emit(x, y, z, {
        vx: (Math.random() - 0.5) * 9,
        vy: Math.random() * 7,
        vz: (Math.random() - 0.5) * 9,
        life: 0.5 + Math.random() * 0.4,
        size: 0.35,
        grow: -0.2,
        color,
        opacity: 1,
        additive: true,
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const sc = Math.max(0.05, p.s.scale.x + p.grow * dt);
      p.s.scale.setScalar(sc);
      p.s.material.opacity = p.op * (p.life / p.max);
    }
  }
}
