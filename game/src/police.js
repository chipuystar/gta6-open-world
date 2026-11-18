// Wanted level and the police who answer it. Stars rise with crimes and
// fall when the player stays out of sight; police cars spawn on the roads,
// chase with a pursuit steer, ram the player, and bust them when they are
// slow and cornered.
import { CFG } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(render, city, rng, audio) {
    this.render = render;
    this.city = city;
    this.rng = rng;
    this.audio = audio;
    this.wanted = 0;
    this.cars = [];
    this.bustTimer = 0;
    this.decayTimer = 0;
    this.onBusted = null;
    this.onWantedChange = null;
  }

  setWanted(n, silent) {
    const clamped = Math.max(0, Math.min(CFG.maxWanted, n));
    if (clamped !== this.wanted) {
      this.wanted = clamped;
      this.decayTimer = 0;
      if (this.onWantedChange) this.onWantedChange(clamped);
      if (!silent && clamped > 0) this.audio.blip(880, 0.15, 'square', 0.12);
    }
    this.syncCars();
  }

  addWanted(n) {
    this.setWanted(this.wanted + n);
  }

  wantedCarCount() {
    if (this.wanted === 0) return 0;
    if (this.wanted <= 2) return 1;
    if (this.wanted === 3) return 2;
    return 3;
  }

  syncCars() {
    const want = this.wantedCarCount();
    while (this.cars.length < want) this.spawnPoliceCar();
    while (this.cars.length > want) {
      const car = this.cars.pop();
      car.destroy();
    }
  }

  spawnPoliceCar() {
    // On a road 60–110 m from the player, so the chase arrives, not teleports.
    const gp = this.game.playerPos;
    for (let tries = 0; tries < 12; tries += 1) {
      const p = this.city.randomRoadPoint(this.rng);
      const d = Math.hypot(p.x - gp.x, p.z - gp.z);
      if (d > 55 && d < 120) {
        const car = new Car(this.render, this.city, {
          x: p.x, z: p.z, heading: p.heading, isPolice: true, type: 'sedan',
        });
        car.maxSpeed = CFG.policeTopSpeed;
        this.cars.push(car);
        return car;
      }
    }
    const p = this.city.randomRoadPoint(this.rng);
    const car = new Car(this.render, this.city, { x: p.x, z: p.z, heading: p.heading, isPolice: true, type: 'sedan' });
    car.maxSpeed = CFG.policeTopSpeed;
    this.cars.push(car);
    return car;
  }

  update(dt, player) {
    const gp = player.pos;
    let nearest = Infinity;
    for (const car of this.cars) {
      // Pursuit: aim at where the player will be, steer toward it.
      const px = gp.x + Math.sin(player.heading) * player.speed * 0.6;
      const pz = gp.z + Math.cos(player.heading) * player.speed * 0.6;
      const dx = px - car.x;
      const dz = pz - car.z;
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));
      const dist = Math.hypot(dx, dz);
      const throttle = dist > 6 ? 1 : 0.4;
      const impact = car.update(dt, { throttle, steer, brake: false });
      if (impact > 0) this.audio.crash(impact / 30);
      const d = Math.hypot(car.x - gp.x, car.z - gp.z);
      if (d < nearest) nearest = d;
      // Ram: touching the player's car damages and shoves it.
      if (player.car && d < 3.4) {
        const rel = car.collideWith(player.car);
        if (rel > 3) {
          player.car.health -= 2;
          this.audio.crash(rel / 25);
          this.render.burst({ x: (car.x + player.car.x) / 2, y: 1, z: (car.z + player.car.z) / 2 }, 8);
        }
      }
      // On foot, a police car that touches the player busts them fast.
      if (!player.car && d < 2.5) {
        this.bustTimer += dt * 2;
      }
    }
    // Bust: slow and cornered with a police car right on top.
    if (player.car && Math.abs(player.speed) < 1 && nearest < CFG.bustDistance) {
      this.bustTimer += dt;
    } else if (!player.car && nearest < CFG.bustDistance) {
      this.bustTimer += dt;
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    if (this.bustTimer >= CFG.bustTime && this.onBusted) {
      this.bustTimer = 0;
      this.onBusted();
    }
    // Wanted decay: no police close for a while, one star at a time.
    if (this.wanted > 0) {
      if (nearest > CFG.wantedDecayGap) {
        this.decayTimer += dt;
        if (this.decayTimer >= CFG.wantedDecayDelay) {
          this.setWanted(this.wanted - 1);
        }
      } else {
        this.decayTimer = 0;
      }
    }
  }

  clearAll() {
    for (const car of this.cars) car.destroy();
    this.cars = [];
    this.wanted = 0;
    this.bustTimer = 0;
  }
}
