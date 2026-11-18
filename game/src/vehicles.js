// Arcade car physics on the XZ plane: throttle, steering that bites harder
// at speed, handbrake slides, building collisions as circle push-outs.
// One Car owns its mesh; the game loop feeds it input and the city.
import { CFG } from './config.js';

export class Car {
  constructor(render, city, opts) {
    this.render = render;
    this.city = city;
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.type = opts.type || 'sedan';
    this.color = opts.color || 0xd23c2e;
    this.isPolice = !!opts.isPolice;
    this.isPlayer = !!opts.isPlayer;
    this.parked = !!opts.parked;
    this.health = 100;
    this.maxSpeed = this.type === 'sports' ? CFG.sportsMaxSpeed : this.type === 'truck' ? CFG.truckMaxSpeed : CFG.carMaxSpeed;
    this.mesh = this.isPolice ? render.makePoliceMesh() : render.makeCarMesh(this.color, this.type);
    render.scene.add(this.mesh);
    this.syncMesh();
  }

  // input: { throttle: -1..1, steer: -1..1, brake: bool }. Returns impact
  // speed when a wall is hit (0 otherwise) for crash sound and damage.
  update(dt, input) {
    let impact = 0;
    const prevSpeed = this.speed;
    if (input.throttle > 0) {
      this.speed += CFG.carAccel * input.throttle * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= CFG.carBrake * dt;
      else this.speed += CFG.carAccel * 0.7 * input.throttle * dt;
    }
    if (input.brake) {
      this.speed -= Math.sign(this.speed) * CFG.carBrake * 1.4 * dt;
      if (Math.abs(this.speed) < 0.5) this.speed = 0;
    }
    // Drag and rolling resistance.
    this.speed -= this.speed * 0.35 * dt;
    if (Math.abs(this.speed) < 0.05 && input.throttle === 0) this.speed = 0;
    const max = this.maxSpeed;
    if (this.speed > max) this.speed = max;
    if (this.speed < -CFG.carReverseMax) this.speed = -CFG.carReverseMax;
    // Steering: less bite when slow, extra yaw on handbrake.
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 8);
    const steerRate = CFG.carSteer * steerAuthority * (input.brake ? CFG.handbrakeTurn / CFG.carSteer : 1);
    this.heading += input.steer * steerRate * dt * Math.sign(this.speed || 1);
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = this.city.collideCircle(nx, nz, CFG.carRadius);
    if (fixed.hit && Math.abs(this.speed) > 4) impact = Math.abs(this.speed);
    if (fixed.hit) {
      // Scrub speed on a wall hit and bounce back a touch.
      this.speed *= 0.55;
      if (Math.abs(prevSpeed) > 12) this.health -= 4;
    }
    this.x = fixed.x;
    this.z = fixed.z;
    this.syncMesh();
    return impact;
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const wheels = this.mesh.userData.wheels;
    if (wheels) {
      const spin = this.speed * 0.016;
      for (const w of wheels) w.rotation.x += spin;
    }
  }

  // Circle push-out against another car. Returns true when they touched.
  collideWith(other) {
    const dx = other.x - this.x;
    const dz = other.z - this.z;
    const d = Math.hypot(dx, dz);
    const min = CFG.carRadius * 2 - 0.4;
    if (d > 0.001 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      this.x -= nx * push;
      this.z -= nz * push;
      other.x += nx * push;
      other.z += nz * push;
      const rel = Math.abs(this.speed - other.speed);
      this.speed *= 0.8;
      other.speed *= 0.8;
      return rel;
    }
    return 0;
  }

  destroy() {
    this.render.scene.remove(this.mesh);
  }
}
