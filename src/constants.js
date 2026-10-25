export const LANE_W = 2.0;
export const LANES = [-2, 0, 2];

export const G = {
  // ninja
  SPEED: 6.2,
  SPEED_PER_LEVEL: 0.45,
  SPEED_MAX: 9.5,
  // rounds
  NETS: 5,
  LEVEL_LEN: 120,
  LEN_PER_LEVEL: 12,
  // camera: behind and above the ninja, looking down the path (Subway Surfers style).
  // HFOV keeps the three lanes in view on tall phone screens.
  CAM_Y: 7.4,
  CAM_BACK: 10.8,
  LOOK_AHEAD: 22,
  HFOV: 44,
  // moonlight direction (from the scene towards the moon): ahead of the ninja, so he is rim-lit and shadows fall toward the camera
  MOON_DIR: [-18, 34, 38],
  // ninja model
  NINJA_SCALE: 1.25,
};
