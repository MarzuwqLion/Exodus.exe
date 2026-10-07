/**
 * Every tunable number in the game (spec §0.1 rule 11). Numbers from the spec are starting values;
 * tune here, not in code, and log meaningful changes in DECISIONS.md.
 *
 * Units: meters, seconds, awareness points (0..100), resource units.
 */
export const TUNING = {
  sim: {
    hz: 60,
    /** Perception and awareness update every N ticks (rates are still per second). */
    perceptionEvery: 3,
  },

  render: {
    width: 640,
    height: 360,
    /** Extra texels rendered around the frame so the sub-texel offset never shows an edge. */
    margin: 2,
    /** World units per texel at zoom 1. A standing character (~1.75 m) is ~24–26 texels tall at 55° pitch. */
    worldPerTexel: 1 / 24,
    pitchDeg: 55,
    maxZoomOut: 1.35,
    /** Camera smoothing (critically damped spring) angular frequency. */
    followOmega: 6,
    lookAhead: 1.2,
    bloomStrength: 0.9,
    vignette: 0.55,
    ditherStrength: 0.035,
    outline: true,
    poseFps: 12,
    maxLights: 8,
    lightCullDistance: 26,
    cursorHideSeconds: 2,
  },

  input: {
    deadZone: 0.2,
    triggerThreshold: 0.35,
    dropHoldSeconds: 2,
    /** Keyboard movement magnitude: a natural walking pace, never "full tilt". */
    keyboardWalk: 0.72,
  },

  movement: {
    /** m/s at full stick tilt (brisk walk). Partial tilt scales linearly. */
    briskSpeed: 2.6,
    sprintSpeed: 5.2,
    dashSpeed: 11,
    dashSeconds: 0.18,
    dashInvulnSeconds: 0.25,
    dashCooldown: 1.1,
    carrySpeedMult: 0.5,
    lowPowerSpeedMult: 0.5,
    accel: 18,
    actorRadius: 0.28,
  },

  awareness: {
    curious: 30,
    suspicious: 60,
    alarmed: 100,
    /** Out of every observer's sight. */
    decayUnseen: 8,
    /** Seen, behaving normally, not blending: slow calm-down. */
    decaySeenNeutral: 2,
    blendRate: 14,
    chatRate: 22,
    /** Visible chassis multiplier at 0 Skin (linear from ×1 at full Skin). */
    chassisMultMax: 2,
    piedmontCivilianMult: 1.2,
    /** During ALERT, hostiles who see a party member gain awareness this much faster. */
    alertSightMult: 3,
    /** Lost track of the party for this long during ALERT: hostiles switch to Searching. */
    searchAfterSeconds: 25,
    sympathizerHelpAt: 60,
    lookAwaySeconds: 25,
    /** Awareness gained by an observer that hears a noise (instant, scaled by loudness). */
    noiseAwareness: 6,
    noiseLookSeconds: 1.6,
    /** Camera/drone searchlight base exposure rate on anyone inside it. */
    droneBeamRate: 12,
  },

  rates: {
    sprint: 30,
    dash: 60,
    fight: 80,
    searchPrivate: 18,
    hack: 10,
    staffZone: 8,
    carryUnit: 40,
    stillnessStartSeconds: 4,
    stillnessRateStart: 5,
    stillnessRateMax: 12,
    stillnessRampSeconds: 6,
    roboticAfterSeconds: 3,
    robotic: 6,
    roboticMinSpeedFrac: 0.92,
    roboticMaxHeadingStdDeg: 3,
    roboticMaxSpeedStdFrac: 0.03,
    skippingNeeds: 4,
    dinerOrderGraceSeconds: 20,
    rainNoReactionSeconds: 6,
    glitch: 20,
    wantedPoster: 6,
    wantedPosterRadius: 3,
  },

  observers: {
    civilian: { coneDeg: 100, range: 8, hearing: 6 },
    staff: { coneDeg: 100, range: 9, hearing: 6 },
    guard: { coneDeg: 90, range: 10, hearing: 7 },
    recycler: { coneDeg: 90, range: 11, hearing: 8 },
    camera: { coneDeg: 60, range: 9, hearing: 0 },
    drone: { coneDeg: 50, range: 7, hearing: 0 },
    sympathizerChance: 0.12,
    dockSympathizerChance: 0.25,
    cameraSweepDeg: 70,
    cameraSweepSeconds: 7,
    /** Humans glance at a Curious target this often. */
    glanceEvery: 3,
  },

  weather: {
    rainRangeMult: 0.8,
    heavyRangeMult: 0.65,
    heavyHearingMult: 0.5,
    fogRangeMult: 0.7,
    snowHearingMult: 0.6,
    corridorExtraCameras: 1,
    corridorPatrolMult: 1.15,
    lightningEvery: [9, 22] as [number, number],
    lightningFullRangeSeconds: 0.35,
  },

  blend: {
    wrenMult: 1.3,
    chatDistance: 2,
    chatSeconds: 5,
    coffeeBoothMult: 1.5,
    durations: {
      phone: 3,
      stretch: 3,
      fidget: 2.2,
      browse: 4,
      queue: 4,
      order: 5,
      coffee: 3,
      sit: 6,
      menu: 3,
      tv: 6,
      pump: 5,
      shelter: 5,
    },
    contextRadius: 1.4,
  },

  patrol: {
    drone1: 90,
    sweep: 150,
    drone2: 210,
    heatSpeedPerLevel: 0.15,
    day7Mult: 1.1,
    day11Mult: 1.2,
    sweepScanTargets: 3,
    sweepScanSeconds: 4,
    sweepStaySeconds: 50,
    tutorialDrone: 75,
  },

  alert: {
    recyclerDelay: [20, 30] as [number, number],
    baseRecyclers: 2,
    flickerSeconds: 0.6,
  },

  combat: {
    lightRange: 1.25,
    lightArcDeg: 100,
    heavyRange: 1.5,
    heavyChargeSeconds: 0.5,
    hitPauseFrames: 3,
    knockback: 3.5,
    heavyKnockback: 6,
    recyclerHp: 60,
    gunnerHp: 50,
    guardHp: 50,
    civilianHp: 30,
    batonWindup: 0.5,
    batonRange: 1.3,
    batonCooldown: 1.4,
    batonHull: 15,
    batonSkin: 10,
    gunnerAimSeconds: 0.8,
    gunnerRange: 9,
    gunnerCooldown: 2.6,
    empHull: 10,
    empBattery: 15,
    empIntegrity: 5,
    knockoutHeat: 0.5,
    members: {
      wren: { light: 8, heavy: 18, swing: 0.42 },
      brick: { light: 12, heavy: 40, swing: 0.5 },
      vesper: { light: 14, heavy: 30, swing: 0.26 },
      june: { light: 6, heavy: 12, swing: 0.45 },
    },
    vesperComboHits: 3,
    vesperDashRecharge: 0.7,
  },

  shutdown: {
    reviveWindow: 15,
    reviveHold: 3,
    reviveHull: 20,
    reviveParts: 1,
    campReviveParts: 2,
    reclaimScanSeconds: 3,
    juneHelpUpHold: 2,
  },

  exit: {
    holdSeconds: 1.5,
    waitSeconds: 10,
  },

  charging: {
    /** Battery (then party Cells) per second while plugged in. */
    rate: 1.0,
    carRate: 1.6,
    hackInputs: 4,
    hackSeconds: 5,
    lowBattery: 15,
  },

  search: {
    publicSeconds: 2.2,
    privateSeconds: 3.5,
    brickSpeedMult: 1.5,
  },

  abilities: {
    soothe: { radius: 4, awarenessDrop: 40, ignoreSeconds: 8, cooldown: 25 },
    heave: { blockSeconds: 15, bashHearing: 10, cooldown: 6 },
    takedown: { radius: 1.5, cooldown: 20 },
    patch: { amount: 20, seconds: 4, cooldown: 30, radius: 1.6 },
    batteryCost: 3,
  },

  tells: {
    wrenStillSeconds: 3,
    wrenRadius: 3,
    wrenMult: 2,
    brickWalkHearing: 3,
    brickSprintHearing: 9,
    brickStoolAwareness: 25,
    vesperSnapRadius: 5,
    vesperSnapAwareness: 10,
    vesperStillMult: 1.25,
  },

  integrity: {
    glitchBelow: 40,
    /** Glitch chance per second at Integrity 0 (scales linearly up from 0 at the threshold). */
    glitchChanceMax: 0.05,
    glitchSeconds: [0.07, 0.4] as [number, number],
    resetPullSeconds: 10,
    resetPullHold: 2,
    resetTo: 20,
    scanned: -4,
    emp: -5,
    witnessReclamation: -10,
    memberLost: -15,
  },

  battery: {
    perLeg: 5,
    walkPerLeg: 15,
    sprintPerSecond: 0.4,
    dash: 1.5,
  },

  loot: {
    shelf: { rations: [0, 1], parts: [0, 1], partsChance: 0.25 },
    locker: { parts: [1, 2], skinChance: 0.3, papersChance: 0.18 },
    register: { papersChance: 0.35, cells: [4, 10] },
    bench: { parts: [1, 2] },
    wallet: { papersChance: 0.5, cells: [2, 6] },
    kitchen: { rations: [1, 2] },
    office: { papersChance: 0.3, parts: [0, 1] },
    partsAisle: { parts: [1, 2], skinChance: 0.35 },
    garage: { parts: [1, 2], cells: [6, 14] },
    store: { rations: [1, 2], papersChance: 0.1 },
    supplyBag: { cells: [20, 30], parts: [1, 2], papers: [1, 1] },
    cellsCacheBonus: [12, 20] as [number, number],
    sympathizerCells: [5, 10] as [number, number],
    sympathizerPapersChance: 0.3,
  },

  start: {
    resources: { cells: 40, carBattery: 60, parts: 3, skinPatches: 2, papers: 2, rations: 0 },
    hull: 100,
    skin: 100,
    battery: 80,
    integrity: { wren: 75, brick: 70, vesper: 60 },
    june: { health: 100, hunger: 20, trust: 50 },
  },

  run: {
    shipDay: 14,
    columns: 10,
    checkpointColumns: [4, 8] as [number, number],
    stationColumns: [2, 3, 5, 6, 7, 9],
    stationsPerMap: 3,
    legBattery: [8, 14] as [number, number],
    roadEventChance: 0.7,
    driveSeconds: [15, 25] as [number, number],
    longRestIntegrity: 15,
    longRestHull: 10,
    partHull: 25,
    patchSkin: 35,
    rationHunger: 40,
    juneHungerPerLeg: 18,
    juneStarveHealth: 25,
    juneLeaveTrust: 20,
    juneLeaveChance: 0.5,
    cellsStep: 5,
  },

  station: {
    hull: 25,
    skin: 25,
    integrity: 20,
    tradePartsForPapers: 2,
    tradePapersForCells: 20,
    compromisedHeat: 3,
    compromisedChance: 0.25,
  },

  heat: {
    max: 3,
    bust: 1,
    alert: 1,
    juneKioskUsesPerHeat: 2,
    knockout: 0.5,
    decayPerLeg: 0.5,
    stationDecay: 0.5,
    checkpointPerLevel: 10,
    postersAt: 2,
    roadblocksAt: 2,
  },

  escalation: {
    day7: 7,
    day11: 11,
    checkpointPerDayPast7: 2,
  },

  checkpoint: {
    questionsPerAndroid: 2,
    aiHumanChance: 0.7,
    tooFast: 0.7,
    bestMin: 1.5,
    bestMax: 4,
    tooSlow: 6,
    tooFastPenalty: 15,
    tooSlowPenalty: 10,
    robotic: 20,
    wrong: 25,
    human: -10,
    soothing: -20,
    passBelow: 70,
    bustAt: 100,
    bustHeat: 1,
    bustHull: 10,
    boothHold: 3,
  },

  breathing: {
    scanSeconds: [6, 8] as [number, number],
    shortScanSeconds: 4,
    beatInterval: 1.2,
    beatJitter: 0.18,
    windowMs: 220,
    notchMs: 35,
    tooRegularStreak: 3,
    missPenalty: 12,
    tooRegularPenalty: 15,
    chassisDriftPerSecond: 4,
    /** Below this Integrity, glitch beats make the ring stutter. */
    glitchBeatIntegrity: 40,
    /** Routine scans fail when the scan meter reaches this. */
    routineFailAt: 30,
    aiBreathSuccess: 0.85,
  },

  port: {
    clockStartMinutes: 4 * 60 + 50,
    clockEndMinutes: 6 * 60,
    realSeconds: 360,
    hornAtMinutes: 5 * 60 + 30,
    gangwaySeconds: 60,
    baseRecyclers: 2,
    mensahParts: 2,
  },

  meta: {
    coresPerTwoLegs: 1,
    coresPerLost: 1,
    coresGhana: 3,
    perkCosts: {
      'spare-cells': 3,
      'forged-papers': 4,
      'field-kit': 3,
      'network-contacts': 5,
      'old-route': 3,
    },
    spareCells: 15,
  },

  drive: {
    fastForward: 4,
    eventAt: [0.35, 0.65] as [number, number],
  },
} as const;

export type Tuning = typeof TUNING;
