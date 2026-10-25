# CatchMe

A mobile-first 3D game where **you** are the hunter and a **ninja** is escaping through a moonlit jungle.
You don't run - you **tap to throw a net**. He won't make it easy.

## Play

ES modules need a web server (not `file://`):

```bash
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000  (on a phone: http://<your-computer-ip>:8000)
```

Deployed with GitHub Pages: https://hajirar27-cmd.github.io/CatchMe/

### How it works
- **Tap** anywhere to throw a net at that spot. It takes a moment to land, so **lead the ninja** - aim where he *will* be.
- A hit **catches** him (+score, +2 nets, next level: faster, hides and vanishes more). A miss **costs a net**. Out of nets = game over.
- If he reaches the **portal** at the end of the level, he escapes.
- The ninja:
  - **hides** behind houses, tents, market stalls, bushes and tree trunks (he is truly out of sight - look for the **smoke wisps** over his hiding spot);
  - **rolls** between obstacles, **leaps onto roofs** and **tree branches**, jumps ponds and skims across the water;
  - **vanishes** in a puff of smoke and reappears further on, leaving a **decoy log** behind (don't net the log!).
- Tap right where a hiding ninja is and you **flush him out** - he leaps into the air for a split second: your chance.

## Layout
```
index.html        page + HUD/menu markup
css/style.css     UI styling
src/main.js       game loop, ninja AI (timed move segments), net throwing, camera, HUD
src/jungle.js     endless jungle: ground, forest, houses, tents, stalls, trees, ponds, exit portal
src/characters.js procedural ninja model + animation (run, leap, roll, crouch)
src/effects.js    pooled smoke/spark sprites
src/audio.js      tiny synthesized sound effects
src/constants.js  tuning values (speed, nets, level length, camera)
vendor/           three.js r170 (vendored, no build step)
```

Tuning lives in `src/constants.js`. The ninja's behaviour is `planNext()` in `src/main.js`: each prop type
offers a few "plans" (hide, roof run, branch run, vanish...) that get picked by weight, and the weights shift with level.

## Next ideas
Real character models & animations, music, more jungle (rivers, rope bridges, waterfalls), power-ups (slow-mo, wide net),
more ninja tricks (shadow clones, smoke bombs), daily challenges, and wrapping with Capacitor for iOS/Android store builds.
