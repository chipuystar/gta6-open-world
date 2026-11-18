// Pedestrians: walk the sidewalks between random block corners, swing their
// arms as they go, and run from a speeding car. A hit pedestrian is a crime
// (the game loop reports it); a scared one just flees.
import { CFG } from './config.js';

export class Pedestrians {
  constructor(render, city, rng) {
    this.render = render;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < CFG.pedCount; i += 1) this.spawnPed(true);
  }

  randomSidewalkPoint() {
    const rng = this.rng;
    const i = rng.int(0, 5);
    const j = rng.int(0, 5);
    const r = this.city.blockRect(i, j);
    const side = rng.int(0, 3);
    if (side === 0) return { x: rng.range(r.x0 - 2, r.x1 + 2), z: r.z0 - 2.5 };
    if (side === 1) return { x: rng.range(r.x0 - 2, r.x1 + 2), z: r.z1 + 2.5 };
    if (side === 2) return { x: r.x0 - 2.5, z: rng.range(r.z0 - 2, r.z1 + 2) };
    return { x: r.x1 + 2.5, z: rng.range(r.z0 - 2, r.z1 + 2) };
  }

  spawnPed(anywhere) {
    const p = anywhere ? this.randomSidewalkPoint() : this.randomSidewalkPoint();
    const ped = {
      x: p.x,
      z: p.z,
      heading: this.rng.range(0, Math.PI * 2),
      speed: CFG.pedSpeed * this.rng.range(0.8, 1.3),
      target: this.randomSidewalkPoint(),
      state: 'walk',
      fleeTimer: 0,
      phase: this.rng.range(0, 6),
      mesh: this.render.makePedMesh(this.rng.pick(CFG.pedShirts)),
      down: false,
      downTimer: 0,
    };
    this.render.scene.add(ped.mesh);
    this.peds.push(ped);
    return ped;
  }

  update(dt, playerPos, playerSpeed, inCar) {
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.down = false;
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          ped.state = 'flee';
          ped.fleeTimer = 2;
        }
        continue;
      }
      const dxp = ped.x - playerPos.x;
      const dzp = ped.z - playerPos.z;
      const distP = Math.hypot(dxp, dzp);
      if (inCar && playerSpeed > 6 && distP < 11) {
        ped.state = 'flee';
        ped.fleeTimer = 1.5;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const away = Math.atan2(dxp, dzp);
        ped.heading = away;
        const sp = CFG.pedFleeSpeed;
        ped.x += Math.sin(away) * sp * dt;
        ped.z += Math.cos(away) * sp * dt;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        const dx = ped.target.x - ped.x;
        const dz = ped.target.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          ped.target = this.randomSidewalkPoint();
        } else {
          ped.heading = Math.atan2(dx, dz);
          ped.x += Math.sin(ped.heading) * ped.speed * dt;
          ped.z += Math.cos(ped.heading) * ped.speed * dt;
        }
      }
      const fixed = this.city.collideCircle(ped.x, ped.z, 0.5);
      ped.x = fixed.x;
      ped.z = fixed.z;
      ped.phase += dt * (ped.state === 'flee' ? 11 : 6);
      const swing = Math.sin(ped.phase) * 0.5;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      ped.mesh.userData.armL.rotation.x = -swing * 0.7;
      ped.mesh.userData.armR.rotation.x = swing * 0.7;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  // Called when a car hits a pedestrian: they go down, then get up and run.
  knockDown(ped) {
    ped.down = true;
    ped.downTimer = 2.2;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.3;
  }
}
