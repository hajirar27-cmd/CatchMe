// Swipe (touch/mouse) + keyboard input. Dash is a hold button.
const SWIPE_PX = 26;

export class Input {
  constructor(surface, dashButton, h) {
    this.dash = false;
    this.h = h;
    const swipes = new Map();

    surface.addEventListener('pointerdown', (e) => {
      swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, fired: false });
    });
    surface.addEventListener('pointermove', (e) => {
      const s = swipes.get(e.pointerId);
      if (!s || s.fired) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      s.fired = true;
      if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? h.left : h.right)();
      else if (dy < 0) h.jump();
    });
    const end = (e) => swipes.delete(e.pointerId);
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);

    const press = (v) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dash = v;
      dashButton.classList.toggle('held', v);
    };
    dashButton.addEventListener('pointerdown', press(true));
    dashButton.addEventListener('pointerup', press(false));
    dashButton.addEventListener('pointercancel', press(false));
    dashButton.addEventListener('pointerleave', press(false));
    dashButton.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': h.left(); break;
        case 'ArrowRight': case 'KeyD': h.right(); break;
        case 'ArrowUp': case 'KeyW': case 'Space': h.jump(); e.preventDefault(); break;
        case 'ShiftLeft': case 'ShiftRight': case 'ArrowDown': case 'KeyS': this.dash = true; break;
        case 'Enter': h.confirm && h.confirm(); break;
        default:
      }
    });
    window.addEventListener('keyup', (e) => {
      if (['ShiftLeft', 'ShiftRight', 'ArrowDown', 'KeyS'].includes(e.code)) this.dash = false;
    });
    window.addEventListener('blur', () => { this.dash = false; });
  }
}
