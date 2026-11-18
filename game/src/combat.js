// On-foot combat: hitscan pistol with tracers, enemy gunmen who strafe and
// shoot back when they can see the player. Enemies are simple humanoids;
// the ray test is a sphere test against each enemy plus a building check.
import * as THREE from 'three';
import { CFG } from './config.js';

export class Combat {
  constructor(render, city, rng, audio) {
    this.render = render;
    this.city = city;
    this.rng = rng;
    this.audio = audio;
    this.enemies = [];
    this.cooldown = 0;
    this.onPlayerDamaged = null;
  }

  spawnEnemies(n, centre) {
    for (let i = 0; i < n; i += 1) {
      let x = centre.x;
      let z = centre.z;
      for (let tries = 0; tries < 20; tries += 1) {
        x = centre.x + this.rng.range(-14, 14);
        z = centre.z + this.rng.range(-14, 14);
        if (!this.city.insideBuilding(x, z)) break;
      }
      const mesh = this.render.makeEnemyMesh();
      mesh.position.set(x, 0, z);
      this.render.scene.add(mesh);
      this.enemies.push({
        x, z, heading: this.rng.range(0, Math.PI * 2),
        hp: CFG.enemyHealth, mesh, shootTimer: this.rng.range(0.8, 2), alive: true,
        strafeDir: this.rng.chance(0.5) ? 1 : -1, deathTimer: 0,
      });
    }
  }

  enemiesAlive() {
    return this.enemies.filter((e) => e.alive).length;
  }

  // Fire from the camera through the crosshair. The aim point is where the
  // camera ray lands (up to 50 m, or the first building); the shot itself
  // travels from the player's gun to that point, so the crosshair stays true
  // at any range instead of dropping into the ground. Returns true on a hit.
  fireFromCamera(camera, playerPos) {
    if (this.cooldown > 0) return false;
    this.cooldown = CFG.fireRate;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    // Aim point along the camera ray, stopped by the first building.
    let aimT = 50;
    for (let t = 2; t <= 50; t += 1) {
      if (this.city.rayBlocked(from.x, from.z, from.x + dir.x * t, from.z + dir.z * t)) {
        aimT = t;
        break;
      }
    }
    const aim = {
      x: from.x + dir.x * aimT,
      y: from.y + dir.y * aimT,
      z: from.z + dir.z * aimT,
    };
    // The bullet leaves the gun, nearly level, toward the aim point.
    const gun = { x: playerPos.x, y: 1.35, z: playerPos.z };
    const gl = Math.hypot(aim.x - gun.x, aim.y - gun.y, aim.z - gun.z) || 1;
    const sdir = { x: (aim.x - gun.x) / gl, y: (aim.y - gun.y) / gl, z: (aim.z - gun.z) / gl };
    this.audio.gunshot();
    this.render.muzzleFlash(gun);
    // Nearest enemy whose body sphere the bullet passes within 1.1 m.
    let best = null;
    let bestT = CFG.gunRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const cx = e.x - gun.x;
      const cy = 1.2 - gun.y;
      const cz = e.z - gun.z;
      const t = cx * sdir.x + cy * sdir.y + cz * sdir.z;
      if (t < 0 || t > CFG.gunRange) continue;
      const px = gun.x + sdir.x * t - e.x;
      const py = gun.y + sdir.y * t - 1.2;
      const pz = gun.z + sdir.z * t - e.z;
      const d = Math.hypot(px, py, pz);
      if (d < 1.1 && t < bestT) { best = e; bestT = t; }
    }
    let hitPoint = { x: gun.x + sdir.x * Math.min(aimT, CFG.gunRange), y: gun.y + sdir.y * Math.min(aimT, CFG.gunRange), z: gun.z + sdir.z * Math.min(aimT, CFG.gunRange) };
    if (best) {
      hitPoint = { x: gun.x + sdir.x * bestT, y: gun.y + sdir.y * bestT, z: gun.z + sdir.z * bestT };
      // A building between gun and target blocks the shot.
      if (this.city.rayBlocked(gun.x, gun.z, hitPoint.x, hitPoint.z)) best = null;
    }
    this.render.shootTracer(gun, hitPoint);
    if (best) {
      best.hp -= CFG.gunDamage;
      best.mesh.children.forEach((c) => {
        if (c.material && c.material.emissive) c.material.emissive.setHex(0x881111);
      });
      setTimeout(() => {
        best.mesh.children.forEach((c) => {
          if (c.material && c.material.emissive) c.material.emissive.setHex(0x000000);
        });
      }, 120);
      this.render.burst({ x: best.x, y: 1.2, z: best.z }, 6);
      if (best.hp <= 0) {
        best.alive = false;
        best.deathTimer = 2;
        best.mesh.rotation.x = -Math.PI / 2;
        best.mesh.position.y = 0.25;
      }
      return true;
    }
    return false;
  }

  update(dt, player) {
    if (this.cooldown > 0) this.cooldown -= dt;
    for (const e of this.enemies) {
      if (!e.alive) {
        if (e.deathTimer > 0) {
          e.deathTimer -= dt;
          if (e.deathTimer <= 0) {
            this.render.scene.remove(e.mesh);
            e.mesh = null;
          }
        }
        continue;
      }
      // Any damage source can finish an enemy, not just a direct shot.
      if (e.hp <= 0) {
        e.alive = false;
        e.deathTimer = 2;
        e.mesh.rotation.x = -Math.PI / 2;
        e.mesh.position.y = 0.25;
        continue;
      }
      const dx = player.pos.x - e.x;
      const dz = player.pos.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      // Strafe sideways, slowly closing in.
      if (dist > 8 && dist < 45) {
        const strafe = e.heading + (Math.PI / 2) * e.strafeDir;
        e.x += Math.sin(strafe) * 1.6 * dt;
        e.z += Math.cos(strafe) * 1.6 * dt;
        if (this.rng.chance(dt * 0.3)) e.strafeDir *= -1;
      }
      const fixed = this.city.collideCircle(e.x, e.z, 0.5);
      e.x = fixed.x;
      e.z = fixed.z;
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      // Shoot back when close enough with line of sight.
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 40 && !this.city.rayBlocked(e.x, e.z, player.pos.x, player.pos.z)) {
        e.shootTimer = CFG.enemyShotDelay * this.rng.range(0.8, 1.4);
        const from = { x: e.x, y: 1.3, z: e.z };
        const to = { x: player.pos.x, y: 1.2, z: player.pos.z };
        this.render.shootTracer(from, to);
        this.audio.gunshot();
        if (this.rng.chance(CFG.enemyHitChance) && this.onPlayerDamaged) {
          this.onPlayerDamaged(CFG.enemyDamage);
        }
      }
    }
  }

  clearAll() {
    for (const e of this.enemies) {
      if (e.mesh) this.render.scene.remove(e.mesh);
    }
    this.enemies = [];
  }
}
