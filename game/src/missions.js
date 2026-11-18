// Five missions with a story: Leo Marín works for Tía Rosa in Solmarina.
// Each mission has a target, a timer where it matters, and a completion test
// read from live game state. The game loop owns the overlays and rewards.
import { CFG, MISSIONS } from './config.js';
import { Car } from './vehicles.js';

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.state = 'idle'; // idle | active | done
    this.timer = 0;
    this.target = null;
    this.rams = 0;
    this.ramCooldown = 0;
    this.enemiesSpawned = false;
    this.getaway = null;
    this.getawayWaypoint = null;
    this.onComplete = null;
    this.onStoryComplete = null;
  }

  get def() {
    return MISSIONS[this.index];
  }

  get objective() {
    return this.def ? this.def.objective : '';
  }

  start(index) {
    this.index = index;
    this.state = 'active';
    this.timer = 0;
    this.rams = 0;
    this.ramCooldown = 0;
    this.enemiesSpawned = false;
    const g = this.game;
    const lm = g.city.landmarks;
    if (index === 0) {
      this.target = { x: lm.garage.x, z: lm.garage.z };
    } else if (index === 1) {
      this.timer = CFG.deliveryTime;
      this.target = { x: lm.marina.x, z: lm.marina.z };
    } else if (index === 2) {
      this.timer = CFG.evadeTime;
      g.police.setWanted(2);
      this.target = null;
    } else if (index === 3) {
      this.target = { x: lm.docks.x, z: lm.docks.z };
    } else if (index === 4) {
      this.spawnGetaway();
      this.target = null;
    }
    g.setObjective(this.def.objective, this.target);
    g.hud.showToast(`${this.def.title} — ${this.def.briefing}`);
  }

  spawnGetaway() {
    const g = this.game;
    const car = new Car(g.render, g.city, {
      x: 150, z: -120, heading: Math.PI / 2, color: 0x8a5fc0, type: 'sports',
    });
    car.maxSpeed = 34;
    this.getaway = car;
    this.getawayWaypoint = { x: -150, z: 120 };
  }

  update(dt) {
    if (this.state !== 'active') return;
    const g = this.game;
    const p = g.player;
    if (this.index === 0) {
      if (p.car && Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z) < 12) {
        this.complete();
      }
    } else if (this.index === 1) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail('Waktu habis — paketnya tidak sampai. Coba lagi.');
        return;
      }
      if (p.car && Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z) < 12) {
        this.complete();
      }
    } else if (this.index === 2) {
      if (g.flags.busted) {
        g.flags.busted = false;
        this.fail('Kamu tertangkap. Rosa tidak mau dengar alasan.');
        return;
      }
      if (g.police.wanted === 0) this.complete();
    } else if (this.index === 3) {
      const d = Math.hypot(p.pos.x - this.target.x, p.pos.z - this.target.z);
      if (!this.enemiesSpawned && d < 30) {
        this.enemiesSpawned = true;
        g.combat.spawnEnemies(4, this.target);
        g.hud.showToast('The Sharks are here. Take them out!');
      }
      if (this.enemiesSpawned && g.combat.enemiesAlive() === 0) this.complete();
    } else if (this.index === 4) {
      this.updateGetaway(dt);
      if (this.rams >= 3) this.complete();
    }
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
  }

  updateGetaway(dt) {
    const g = this.game;
    const car = this.getaway;
    if (!car) return;
    const p = g.player;
    // Drive toward the waypoint; pick a new one when reached.
    const wp = this.getawayWaypoint;
    const dx = wp.x - car.x;
    const dz = wp.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      const pt = g.city.randomRoadPoint(g.rng);
      this.getawayWaypoint = { x: pt.x, z: pt.z };
      return;
    }
    const wantHeading = Math.atan2(dx, dz);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const flee = p.car ? 1 : 0.25;
    car.update(dt, { throttle: flee, steer: Math.max(-1, Math.min(1, diff * 1.8)), brake: false });
    this.target = { x: car.x, z: car.z };
    g.setObjective(this.def.objective, this.target);
    // Ram detection: player car hits the getaway hard.
    if (p.car && this.ramCooldown <= 0) {
      const d = Math.hypot(p.car.x - car.x, p.car.z - car.z);
      const rel = Math.abs(p.car.speed - car.speed);
      if (d < 3.8 && rel > 5) {
        this.rams += 1;
        this.ramCooldown = 1.5;
        car.health -= 25;
        g.audio.crash(1);
        g.render.burst({ x: (p.car.x + car.x) / 2, y: 1, z: (p.car.z + car.z) / 2 }, 20);
        g.hud.showToast(`Hit ${this.rams}/3!`);
      }
    }
  }

  complete() {
    this.state = 'done';
    const reward = CFG.missionRewards[this.index];
    this.game.money += reward;
    this.game.missionsDone = Math.max(this.game.missionsDone, this.index + 1);
    this.game.audio.missionComplete();
    this.game.save();
    if (this.onComplete) this.onComplete(this.def, reward);
    if (this.index + 1 >= MISSIONS.length) {
      if (this.onStoryComplete) this.onStoryComplete();
    }
  }

  fail(reason) {
    this.state = 'idle';
    this.game.police.setWanted(0, true);
    this.game.hud.showToast(reason);
    this.game.audio.busted();
    // Restart the same mission after a beat.
    setTimeout(() => {
      if (this.game.state === 'playing') this.start(this.index);
    }, 1500);
  }

  next() {
    if (this.index + 1 < MISSIONS.length) this.start(this.index + 1);
  }
}
