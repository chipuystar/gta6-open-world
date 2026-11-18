// Screenshot staging: plays the real rules forward from a fresh seeded
// world for a fixed number of steps, steered by a simple autopilot, so each
// frame is what a short game really looks like and the same seed always
// gives the same frame. Driving follows road waypoints (never through
// buildings); the chase is composed after the sim so the player's car reads
// clearly with police visible behind it. Scenes: chase (cover), onfoot,
// mission, vista.
import { CFG } from './config.js';

const STEP = 1 / 60;

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Drive toward a point: steer at it, reverse out when facing away.
function driveToward(game, target) {
  const p = game.player;
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  const want = Math.atan2(dx, dz);
  const diff = normAngle(want - p.heading);
  const steer = clamp(diff * 1.8, -1, 1);
  const throttle = Math.abs(diff) > 1.3 ? -0.6 : 1;
  return { forward: throttle, strafe: steer, sprint: false, brake: false };
}

// Drive a route of road waypoints in order, then keep driving at the last one.
function driveRoute(game, waypoints) {
  let idx = 0;
  return (g) => {
    while (idx < waypoints.length - 1) {
      const w = waypoints[idx];
      if (Math.hypot(w.x - g.player.pos.x, w.z - g.player.pos.z) < 12) idx += 1;
      else break;
    }
    return driveToward(g, waypoints[idx]);
  };
}

// Walk toward a point: face it and walk.
function walkToward(game, target) {
  const p = game.player;
  const dx = target.x - p.pos.x;
  const dz = target.z - p.pos.z;
  p.heading = Math.atan2(dx, dz);
  return { forward: 1, strafe: 0, sprint: false, brake: false };
}

// Step the simulation with an autopilot, including a stuck recovery: if the
// car barely moves for a second while driving, reverse briefly.
function runSim(game, seconds, pilot) {
  let lastX = game.player.pos.x;
  let lastZ = game.player.pos.z;
  let stuckTime = 0;
  let reversing = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    let axes = pilot(game);
    if (reversing > 0) {
      reversing -= STEP;
      axes = { forward: -0.7, strafe: -axes.strafe, sprint: false, brake: false };
    } else if (game.player.car) {
      const moved = Math.hypot(game.player.pos.x - lastX, game.player.pos.z - lastZ);
      if (moved < 0.004) {
        stuckTime += STEP;
        if (stuckTime > 1) { reversing = 0.8; stuckTime = 0; }
      } else {
        stuckTime = 0;
      }
      lastX = game.player.pos.x;
      lastZ = game.player.pos.z;
    }
    game.stepFixed(STEP, axes);
  }
}

export function stageShot(name, game) {
  const lm = game.city.landmarks;
  if (name === 'chase') {
    // Cover: police chase — player car fleeing down the avenue, police
    // visible behind it, wanted stars, minimap and mission objective on HUD.
    game.startGameSilent(2);
    game.putPlayerInCar('sports', 0xd23c2e, 0, -140, 0);
    game.police.setWanted(3, true);
    runSim(game, 7, driveRoute(game, [{ x: 0, z: 200 }]));
    // Compose: police flanking the player where the chase camera can see
    // them — ahead in the next lanes and one right on the bumper — not
    // hidden behind the camera.
    const p = game.player;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const rx = Math.cos(p.heading);
    const rz = -Math.sin(p.heading);
    const spots = [
      { along: 12, side: -4.5 },
      { along: 20, side: 4.5 },
      { along: -6, side: 0 },
    ];
    game.police.cars.forEach((car, i) => {
      const s = spots[i % spots.length];
      car.x = p.pos.x + fx * s.along + rx * s.side;
      car.z = p.pos.z + fz * s.along + rz * s.side;
      car.heading = p.heading;
      car.speed = p.speed;
      car.syncMesh();
    });
    game.render.snapCamera({ x: p.pos.x, y: 1.2, z: p.pos.z }, p.heading, 'drive');
    return;
  }
  if (name === 'onfoot') {
    // On foot in the city: walk the avenue toward Rosa's Garage, pedestrians
    // and traffic around, HUD and minimap visible.
    game.startGameSilent(0);
    game.putPlayerOnFoot(-48, 72, -Math.PI / 2);
    runSim(game, 8, (g) => walkToward(g, { x: -108, z: 72 }));
    return;
  }
  if (name === 'mission') {
    // Mission in progress: delivery run along the roads toward the Marina,
    // timer ticking, marker ahead.
    game.startGameSilent(1);
    game.putPlayerInCar('sedan', 0x2e6fd2, lm.garage.x, lm.garage.z + 8, Math.PI / 2);
    runSim(game, 10, driveRoute(game, [
      { x: -108, z: 72 },
      { x: 216, z: 72 },
      { x: 216, z: -72 },
      { x: 228, z: -60 },
    ]));
    return;
  }
  // Vista (default): title screen over the city at sunset, camera orbiting.
  game.state = 'title';
  game.hud.showScreen('title-screen');
  game.render.setBeacon(0, 0, false);
  for (let i = 0; i < Math.round(6 / STEP); i += 1) {
    game.stepAmbient(STEP);
  }
}
