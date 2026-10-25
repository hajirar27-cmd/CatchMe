# CatchMe

A mobile-first 3D endless chase: the opposite of Subway Surfers. **You** are the hunter, the **ninja** is the runner.

Night city street, three lanes. The ninja dodges obstacles, bursts ahead, and **slips behind obstacles to hide**.
Spot the rising smoke, pick the right lane, and swing past to grab him before he escapes.

## Play

ES modules need a web server (not `file://`):

```bash
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000  (on a phone: http://<your-computer-ip>:8000)
```

Works great hosted on GitHub Pages / any static host.

### Controls
| Action | Touch | Keyboard |
|---|---|---|
| Change lane | swipe left / right | `A` `D` / arrows |
| Jump low fences | swipe up | `W` / `Space` / `↑` |
| Dash | hold **DASH** button | hold `Shift` / `S` |

### Rules
- Get within reach of the ninja (same or adjacent lane) to **catch** him. Each catch levels him up (faster, hides more).
- Crates, barrels and walls make you **stumble**. Low red fences can be jumped.
- Dashing drains stamina; it refills while you run normally.
- If he gets too far ahead (the **NINJA** bar turns red), he **escapes** and the game ends.
- When he vanishes (**HIDING...**), look for **smoke wisps** rising above an obstacle. He's crouched right behind it.
  Run in an *adjacent* lane (running into his obstacle makes you stumble) and he'll bolt - dash to grab him.

## Layout
```
index.html        page + HUD/menu markup
css/style.css     UI styling
src/main.js       game loop, player, ninja AI, camera, HUD
src/world.js      endless street tiles, obstacle spawning
src/characters.js procedural player/ninja models + run animation
src/effects.js    pooled smoke/spark sprites
src/input.js      swipe + keyboard input
src/audio.js      tiny synthesized sound effects
src/constants.js  tuning values (speeds, lane width, catch reach...)
vendor/           three.js r170 (vendored, no build step)
```

Tuning lives in `src/constants.js` (`G`). The ninja hide logic is `updateNinja()` in `src/main.js`.

## Next ideas
Real character models & animations, music, more ninja tricks (smoke bombs, shuriken, rooftops), power-ups, daily challenges,
and wrapping with Capacitor for iOS/Android store builds.
