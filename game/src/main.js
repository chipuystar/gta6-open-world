// SOLMARINA — game boot, loop, state machine and player. The loop runs on a
// fixed 1/60 s step so staged screenshots are reproducible; the renderer
// draws every animation frame. States: title, playing, paused, mission
// (mission-complete card), busted, wasted, victory.
import { CFG, MISSIONS } from './config.js';
import { RNG, hashSeed } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { City } from './world.js';
import { RenderSystem } from './render.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.seedStr = params.get('seed') || 'solmarina';
    this.seed = hashSeed(this.seedStr);
    this.rng = new RNG(this.seed);
    this.canvas = document.getElementById('game');
    this.render = new RenderSystem(this.canvas);
    this.city = new City(this.seed);
    this.render.buildCity(this.city);
    this.input = new Input(this.canvas);
    this.audio = new AudioSys();
    this.hud = new HUD();
    this.traffic = new Traffic(this.render, this.city, this.rng);
    this.peds = new Pedestrians(this.render, this.city, this.rng);
    this.police = new Police(this.render, this.city, this.rng, this.audio);
    this.police.game = this;
    this.combat = new Combat(this.render, this.city, this.rng, this.audio);
    this.missions = new Missions(this);
    this.money = 0;
    this.missionsDone = 0;
    this.best = 0;
    this.state = 'title';
    this.flags = { busted: false };
    this.objective = { text: '', target: null };
    this.player = {
      pos: { x: -100, z: 60 },
      heading: 0,
      speed: 0,
      onFoot: true,
      car: null,
      health: CFG.playerHealth,
      lastDamage: -99,
      phase: 0,
    };
    this.playerMesh = this.render.makePlayerMesh();
    this.render.scene.add(this.playerMesh);
    this.time = 0;
    this.acc = 0;
    this.lastT = 0;
    this.frames = 0;
    this.staged = false;
    this.orbitAngle = 0.6;
    this.lastTrafficHit = -99;
    this.load();
    this.wireCallbacks();
    // Test hooks for the play-test harness and screenshots.
    window.__solmarina = {
      game: this,
      state: () => this.state,
      player: this.player,
      missions: this.missions,
      police: this.police,
      combat: this.combat,
      traffic: this.traffic,
    };
    const shot = params.get('shot');
    if (shot) {
      this.staged = true;
      stageShot(shot, this);
    } else {
      this.hud.showScreen('title-screen');
      this.updateSaveInfo();
    }
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get playerPos() {
    return this.player.pos;
  }

  wireCallbacks() {
    this.hud.onStart = (cont) => this.startGame(cont);
    this.hud.onResume = () => {
      this.state = 'playing';
      this.hud.showScreen(null);
    };
    this.hud.onRestart = () => this.restartCurrent();
    this.hud.onQuit = () => this.quitToTitle();
    this.hud.onMissionContinue = () => {
      this.hud.showScreen(null);
      this.state = 'playing';
      this.missions.next();
    };
    this.hud.onBustedContinue = () => {
      this.hud.showScreen(null);
      this.state = 'playing';
    };
    this.police.onBusted = () => this.onBusted();
    this.combat.onPlayerDamaged = (n) => this.damagePlayer(n);
    this.missions.onComplete = (def, reward) => this.onMissionComplete(def, reward);
    this.missions.onStoryComplete = () => this.onStoryComplete();
  }

  load() {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.money = s.money || 0;
      this.missionsDone = s.missionsDone || 0;
      this.best = s.best || 0;
    } catch {
      // No storage (or corrupt save): play fresh.
    }
  }

  save() {
    this.best = Math.max(this.best, this.money);
    try {
      localStorage.setItem(CFG.saveKey, JSON.stringify({
        money: this.money,
        missionsDone: this.missionsDone,
        best: this.best,
      }));
    } catch {
      // Storage unavailable; the session still plays.
    }
  }

  updateSaveInfo() {
    const el = document.getElementById('save-info');
    if (!el) return;
    el.textContent = this.missionsDone > 0
      ? `Saved progress: ${this.missionsDone}/5 missions · $${this.money.toLocaleString('en-US')} · best $${this.best.toLocaleString('en-US')}`
      : 'No save yet — a new story in Solmarina.';
    document.getElementById('continue-btn').classList.toggle('hidden', this.missionsDone === 0);
  }

  setObjective(text, target) {
    this.objective = { text, target };
    this.render.setBeacon(target ? target.x : 0, target ? target.z : 0, !!target);
  }

  startGame(continueSave) {
    this.audio.ensure();
    if (!continueSave) {
      this.money = 0;
      this.missionsDone = 0;
    }
    this.save();
    this.state = 'playing';
    this.hud.showScreen(null);
    this.putPlayerOnFoot(this.city.landmarks.garage.x + 6, this.city.landmarks.garage.z + 12, 0);
    this.player.health = CFG.playerHealth;
    this.police.clearAll();
    this.combat.clearAll();
    if (this.missionsDone >= MISSIONS.length) {
      this.missions.state = 'idle';
      this.setObjective('', null);
    } else {
      this.missions.start(this.missionsDone);
    }
  }

  // Staged starts (screenshots): same as startGame but no audio gesture needed
  // and the caller places the player afterwards.
  startGameSilent(missionIndex) {
    this.state = 'playing';
    this.hud.showScreen(null);
    this.police.clearAll();
    this.combat.clearAll();
    this.player.health = CFG.playerHealth;
    this.missions.start(missionIndex);
  }

  putPlayerOnFoot(x, z, heading) {
    const p = this.player;
    if (p.car) {
      p.car = null;
    }
    p.onFoot = true;
    p.pos.x = x;
    p.pos.z = z;
    p.heading = heading;
    p.speed = 0;
    this.playerMesh.visible = true;
    this.syncPlayerMesh();
    this.render.snapCamera({ x, y: 1.2, z }, heading, 'foot');
  }

  putPlayerInCar(type, color, x, z, heading) {
    const p = this.player;
    const car = new Car(this.render, this.city, { x, z, heading, color, type, isPlayer: true });
    p.car = car;
    p.onFoot = false;
    p.pos.x = x;
    p.pos.z = z;
    p.heading = heading;
    p.speed = 0;
    this.playerMesh.visible = false;
    this.render.snapCamera({ x, y: 1.2, z }, heading, 'drive');
  }

  syncPlayerMesh() {
    const p = this.player;
    this.playerMesh.position.set(p.pos.x, 0, p.pos.z);
    this.playerMesh.rotation.y = p.heading;
  }

  stealCar(car) {
    this.traffic.removeFromParked(car);
    this.traffic.removeFromTraffic(car);
    car.isPlayer = true;
    car.parked = false;
    const p = this.player;
    p.car = car;
    p.onFoot = false;
    p.speed = car.speed;
    this.playerMesh.visible = false;
    this.render.snapCamera({ x: car.x, y: 1.2, z: car.z }, car.heading, 'drive');
    this.police.addWanted(1);
    this.audio.pickup();
    this.hud.showToast('Car stolen! The cops noticed.');
    // The driver runs off on foot.
    const ped = this.peds.spawnPed();
    ped.x = car.x + 2;
    ped.z = car.z + 2;
    ped.state = 'flee';
    ped.fleeTimer = 3;
  }

  exitCar() {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    car.speed = 0;
    car.isPlayer = false;
    this.traffic.parked.push(car);
    p.car = null;
    p.onFoot = true;
    p.pos.x = car.x - Math.cos(car.heading) * 2.4;
    p.pos.z = car.z + Math.sin(car.heading) * 2.4;
    p.heading = car.heading;
    p.speed = 0;
    this.playerMesh.visible = true;
    this.syncPlayerMesh();
    this.render.snapCamera({ x: p.pos.x, y: 1.2, z: p.pos.z }, p.heading, 'foot');
  }

  damagePlayer(n) {
    if (this.state !== 'playing') return;
    const p = this.player;
    p.health -= n;
    p.lastDamage = this.time;
    this.hud.flashDamage();
    if (p.health <= 0) {
      p.health = 0;
      this.onWasted();
    }
  }

  onBusted() {
    this.flags.busted = true;
    this.money = Math.max(0, this.money - CFG.bustFine);
    this.audio.busted();
    this.save();
    if (this.player.car) {
      this.player.car.speed = 0;
      this.player.car = null;
    }
    this.police.clearAll();
    this.player.health = CFG.playerHealth;
    this.putPlayerOnFoot(this.city.landmarks.garage.x + 6, this.city.landmarks.garage.z + 12, 0);
    this.state = 'busted';
    this.hud.showScreen('busted-screen');
    document.getElementById('busted-text').textContent = `Busted! The cops took $${CFG.bustFine} and dropped you at Rosa's Garage.`;
  }

  onWasted() {
    this.state = 'wasted';
    this.audio.busted();
    this.hud.showScreen('wasted-screen');
  }

  onMissionComplete(def, reward) {
    this.save();
    if (def.id === MISSIONS.length) return; // victory screen follows
    this.state = 'mission';
    document.getElementById('mission-complete-title').textContent = `${def.title} — Complete!`;
    document.getElementById('mission-reward').textContent = `Reward: $${reward} · Total: $${this.money.toLocaleString('en-US')}`;
    this.hud.showScreen('mission-screen');
  }

  onStoryComplete() {
    this.state = 'victory';
    this.save();
    document.getElementById('victory-stats').textContent =
      `All 5 missions done · $${this.money.toLocaleString('en-US')} earned · Best: $${this.best.toLocaleString('en-US')}`;
    this.hud.showScreen('victory-screen');
  }

  restartCurrent() {
    this.state = 'playing';
    this.hud.showScreen(null);
    this.player.health = CFG.playerHealth;
    this.police.clearAll();
    this.combat.clearAll();
    if (this.player.car) {
      this.player.car.destroy();
      this.player.car = null;
    }
    this.putPlayerOnFoot(this.city.landmarks.garage.x + 6, this.city.landmarks.garage.z + 12, 0);
    const idx = this.missions.state === 'active' ? this.missions.index : this.missionsDone;
    this.missions.start(Math.min(idx, MISSIONS.length - 1));
  }

  quitToTitle() {
    this.save();
    this.state = 'title';
    this.updateSaveInfo();
    this.hud.showScreen('title-screen');
  }

  // One fixed step of the live game.
  stepFixed(dt, axes) {
    this.time += dt;
    const p = this.player;
    const flags = this.input.consume();
    if (flags.pauseToggle) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.hud.showScreen('pause-screen');
      }
      return;
    }
    if (flags.muteToggle) this.audio.setMuted(!this.audio.muted);
    if (flags.resetCar && p.car) {
      const pt = this.city.randomRoadPoint(this.rng);
      p.car.x = pt.x;
      p.car.z = pt.z;
      p.car.speed = 0;
      p.pos.x = pt.x;
      p.pos.z = pt.z;
    }
    if (flags.action) {
      if (p.car) this.exitCar();
      else {
        const car = this.traffic.nearestStealable(p.pos.x, p.pos.z, 4.5);
        if (car) this.stealCar(car);
      }
    }
    if (flags.shoot && p.onFoot && this.state === 'playing') {
      this.combat.fireFromCamera(this.render.camera, p.pos);
    }
    if (p.car) {
      const impact = p.car.update(dt, { throttle: axes.forward, steer: axes.strafe, brake: axes.brake });
      p.pos.x = p.car.x;
      p.pos.z = p.car.z;
      p.heading = p.car.heading;
      p.speed = p.car.speed;
      if (impact > 0) {
        this.audio.crash(impact / 30);
        this.render.burst({ x: p.car.x, y: 1, z: p.car.z }, 12);
        this.damagePlayer(Math.max(0, impact - 14));
      }
      // Hit pedestrians.
      for (const ped of this.peds.peds) {
        if (ped.down) continue;
        const d = Math.hypot(ped.x - p.car.x, ped.z - p.car.z);
        if (d < 2.2 && Math.abs(p.car.speed) > 3) {
          this.peds.knockDown(ped);
          this.police.addWanted(1);
          this.audio.crash(0.5);
          this.render.burst({ x: ped.x, y: 1, z: ped.z }, 8);
          this.hud.showToast('You hit a pedestrian!');
        }
      }
      // Parked cars are solid.
      for (const parked of this.traffic.parked) {
        if (parked === p.car) continue;
        const rel = p.car.collideWith(parked);
        if (rel > 4) {
          this.audio.crash(rel / 25);
          this.render.burst({ x: (p.car.x + parked.x) / 2, y: 1, z: (p.car.z + parked.z) / 2 }, 10);
        }
      }
      if (p.car.health <= 0) {
        this.render.burst({ x: p.car.x, y: 1, z: p.car.z }, 40);
        this.audio.crash(1);
        p.car.destroy();
        p.car = null;
        p.onFoot = true;
        p.speed = 0;
        this.playerMesh.visible = true;
        this.police.addWanted(1);
        this.hud.showToast('Your car is wrecked!');
        this.syncPlayerMesh();
      }
    } else {
      // On foot: A/D turn, W/S move, Shift runs.
      p.heading += axes.strafe * 2.4 * dt;
      const speed = axes.sprint ? CFG.runSpeed : CFG.walkSpeed;
      const move = axes.forward * speed;
      p.speed = move;
      const nx = p.pos.x + Math.sin(p.heading) * move * dt;
      const nz = p.pos.z + Math.cos(p.heading) * move * dt;
      const fixed = this.city.collideCircle(nx, nz, CFG.playerRadius);
      p.pos.x = fixed.x;
      p.pos.z = fixed.z;
      p.phase += dt * (4 + Math.abs(move));
      const swing = Math.sin(p.phase) * (Math.abs(move) > 0.1 ? 0.55 : 0);
      this.playerMesh.userData.legL.rotation.x = swing;
      this.playerMesh.userData.legR.rotation.x = -swing;
      this.playerMesh.userData.armL.rotation.x = -swing * 0.7;
      this.playerMesh.userData.armR.rotation.x = swing * 0.7;
      this.syncPlayerMesh();
      // Run over by traffic.
      for (const car of this.traffic.cars) {
        const d = Math.hypot(car.x - p.pos.x, car.z - p.pos.z);
        if (d < 1.9 && Math.abs(car.speed) > 2 && this.time - this.lastTrafficHit > 1) {
          this.lastTrafficHit = this.time;
          this.damagePlayer(15);
          const push = Math.atan2(p.pos.x - car.x, p.pos.z - car.z);
          p.pos.x += Math.sin(push) * 2;
          p.pos.z += Math.cos(push) * 2;
        }
      }
    }
    // Health regen after a quiet spell.
    if (this.time - p.lastDamage > CFG.healthRegenDelay && p.health > 0 && p.health < CFG.playerHealth) {
      p.health = Math.min(CFG.playerHealth, p.health + CFG.healthRegenRate * dt);
    }
    this.traffic.update(dt, p.car, this.police.cars);
    this.peds.update(dt, p.pos, Math.abs(p.speed), !!p.car);
    this.police.update(dt, p);
    this.combat.update(dt, p);
    this.missions.update(dt);
    const carSpeed = p.car ? Math.abs(p.car.speed) : 0;
    const maxSpeed = p.car ? p.car.maxSpeed : CFG.walkSpeed;
    this.audio.update(dt, carSpeed, maxSpeed, this.police.wanted);
    const focus = { x: p.pos.x, y: 1.2, z: p.pos.z };
    this.render.updateCamera(dt, focus, p.heading, p.car ? 'drive' : 'foot', this.input.camYaw, this.input.camPitch);
    this.render.update(dt);
    this.hud.update(this.snapshot());
  }

  // Ambient motion behind the title screen: traffic and pedestrians only.
  stepAmbient(dt) {
    this.time += dt;
    const dummy = { x: 9999, z: 9999 };
    this.traffic.update(dt, null, []);
    this.peds.update(dt, dummy, 0, false);
    this.orbitAngle = this.render.updateOrbitCamera(dt, { x: 0, z: 0 }, 190, this.orbitAngle);
    this.render.update(dt);
  }

  snapshot() {
    const p = this.player;
    const t = this.objective.target;
    const dist = t ? Math.hypot(p.pos.x - t.x, p.pos.z - t.z) : null;
    return {
      money: this.money,
      health: p.health,
      wanted: this.police.wanted,
      speed: p.speed,
      inCar: !!p.car,
      onFoot: p.onFoot,
      missionTitle: this.missions.state === 'active' ? this.missions.def.title : 'Free Roam',
      objective: this.missions.state === 'active' ? this.objective.text : 'Explore Solmarina. Steal a car with E, drive with WASD.',
      target: t,
      targetDist: dist,
      timer: this.missions.index === 1 && this.missions.state === 'active' ? this.missions.timer : 0,
      playerX: p.pos.x,
      playerZ: p.pos.z,
      heading: p.heading,
      traffic: this.traffic.cars,
      police: this.police.cars,
      enemies: this.combat.enemies.filter((e) => e.alive),
    };
  }

  loop(t) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.lastT ? (t - this.lastT) / 1000 : 0.016);
    this.lastT = t;
    if (this.state === 'playing') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.stepFixed(STEP, this.input.axes(null));
        this.acc -= STEP;
        n += 1;
      }
      if (n === 8) this.acc = 0;
    } else if (this.state === 'title') {
      this.stepAmbient(dt);
    } else {
      this.render.update(dt);
    }
    this.render.render();
    this.frames += 1;
    if (this.staged && this.frames >= 3 && !window.__shotReady) {
      window.__shotReady = true;
    }
  }
}

new Game();
