// SOLMARINA — shared tuning constants for the whole game.
// One place for every number the systems agree on: city layout, car physics,
// wanted levels, mission rewards and the HUD palette.
export const CFG = {
  title: 'SOLMARINA',
  subtitle: 'Streets of Gold — an open-world crime story',
  saveKey: 'solmarina-save-v1',

  // City: a 432 m square of blocks on a 72 m pitch, beach and sea to the east.
  cityHalf: 216,
  blockSize: 60,
  roadWidth: 12,
  pitch: 72,
  beachX: 222,
  waterX: 252,
  worldHalf: 300,

  // Player on foot.
  walkSpeed: 6,
  runSpeed: 10.5,
  playerRadius: 0.7,
  playerHealth: 100,
  healthRegenDelay: 5,
  healthRegenRate: 6,

  // Cars: arcade physics, speeds in m/s.
  carAccel: 16,
  carBrake: 34,
  carReverseMax: 13,
  carMaxSpeed: 38,
  sportsMaxSpeed: 47,
  truckMaxSpeed: 30,
  carSteer: 1.85,
  carGrip: 7.5,
  carRadius: 1.6,
  handbrakeTurn: 2.6,

  // Traffic and pedestrians.
  trafficCount: 14,
  trafficSpeed: 9,
  pedCount: 26,
  pedSpeed: 1.6,
  pedFleeSpeed: 5.5,

  // Police and wanted level.
  maxWanted: 5,
  policeTopSpeed: 40,
  policeRamDamage: 8,
  bustDistance: 4,
  bustTime: 2.5,
  wantedDecayDelay: 8,
  wantedDecayGap: 45,

  // Combat.
  fireRate: 0.22,
  gunRange: 60,
  gunDamage: 34,
  enemyHealth: 100,
  enemyShotDelay: 1.6,
  enemyHitChance: 0.3,
  enemyDamage: 9,

  // Missions.
  missionRewards: [150, 300, 400, 500, 800],
  deliveryTime: 90,
  evadeTime: 60,
  bustFine: 100,

  // Look: golden-hour sun-soaked coast.
  skyTop: 0x2e4a7a,
  skyHorizon: 0xffb36b,
  fogColor: 0xf2a56b,
  sunColor: 0xffc27a,
  sunIntensity: 2.4,
  hemiSky: 0xffe0b3,
  hemiGround: 0x8a6f5a,

  buildingPalette: [
    0xf2e3c6, 0xe8b48a, 0xd98a6a, 0xc96f4a, 0xf7ead1, 0x9fc4d8,
    0x7fb3a3, 0xe5c07a, 0xb98a5e, 0xd8d3c8, 0xef9e7a, 0x8fa8c8,
  ],
  carPalette: [
    0xd23c2e, 0x2e6fd2, 0xe8b13c, 0x3aa655, 0x8a5fc0, 0xe8e4da,
    0x22242a, 0xd2702e, 0x37b6c9, 0xc92e7a,
  ],
  pedShirts: [
    0xe8e4da, 0x3aa655, 0x2e6fd2, 0xd2702e, 0xc92e7a, 0x37b6c9, 0xe8b13c, 0x8a5fc0,
  ],
};

// Mission definitions: id, title, briefing shown on the title card, objective
// line shown in the HUD tracker. Behaviour lives in missions.js.
export const MISSIONS = [
  {
    id: 1,
    title: 'Wheels for Rosa',
    briefing: 'Rosa needs wheels. Borrow any car on the street and bring it to her garage.',
    objective: 'Steal a car and drive to Rosa\u2019s Garage',
  },
  {
    id: 2,
    title: 'Marina Drop',
    briefing: 'A package for the marina, and the buyer does not wait. Ninety seconds. Go.',
    objective: 'Deliver the package to the Marina before the timer runs out',
  },
  {
    id: 3,
    title: 'Heat Wave',
    briefing: 'The cops are on you. Shake them off and lay low until the heat dies down.',
    objective: 'Lose the cops — get your wanted level back to zero',
  },
  {
    id: 4,
    title: 'Dockside Dust-Up',
    briefing: 'The Sharks are waiting at the docks. On foot. Settle it.',
    objective: 'Take out all four Sharks gunmen at the docks',
  },
  {
    id: 5,
    title: 'The Big Score',
    briefing: 'The Sharks\u2019 getaway car is running for the hideout. Ram it off the road — three good hits.',
    objective: 'Ram the getaway car 3 times to stop it',
  },
];
