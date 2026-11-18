// Traffic: cars that follow the road grid in lanes, slow for the car ahead,
// and turn onto a new road at the city edge. Parked cars from the city are
// stealable — taking one is a crime, so the driver runs off on foot.
import { CFG } from './config.js';
import { Car } from './vehicles.js';
import { ROADS } from './world.js';

export class Traffic {
  constructor(render, city, rng) {
    this.render = render;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    for (const spot of city.parkedCars) {
      const car = new Car(render, city, { x: spot.x, z: spot.z, heading: spot.heading, color: spot.color, type: spot.type, parked: true });
      this.parked.push(car);
    }
    for (let i = 0; i < CFG.trafficCount; i += 1) this.spawnCar();
  }

  spawnCar() {
    const p = this.city.randomRoadPoint(this.rng);
    const car = new Car(this.render, this.city, {
      x: p.x,
      z: p.z,
      heading: p.heading,
      color: this.rng.pick(CFG.carPalette),
      type: this.rng.pick(['sedan', 'sedan', 'sedan', 'sports', 'truck', 'taxi']),
    });
    car.vertical = Math.abs(Math.sin(p.heading)) < 0.5;
    car.axis = car.vertical ? 'z' : 'x';
    car.dir = car.vertical ? (Math.cos(p.heading) > 0 ? 1 : -1) : (Math.sin(p.heading) > 0 ? 1 : -1);
    car.lane = p;
    car.speed = CFG.trafficSpeed * this.rng.range(0.8, 1.2);
    car.cruise = car.speed;
    this.cars.push(car);
    return car;
  }

  update(dt, playerCar, policeCars) {
    for (const car of this.cars) {
      // Slow for the car ahead on the same lane.
      let target = car.cruise;
      for (const other of this.cars) {
        if (other === car || other.axis !== car.axis) continue;
        const along = car.axis === 'z' ? (other.z - car.z) * car.dir : (other.x - car.x) * car.dir;
        const side = car.axis === 'z' ? Math.abs(other.x - car.x) : Math.abs(other.z - car.z);
        if (along > 0 && along < 9 && side < 3) target = 0;
      }
      if (playerCar && car.axis === 'z' && Math.abs(playerCar.x - car.x) < 3) {
        const along = (playerCar.z - car.z) * car.dir;
        if (along > 0 && along < 10) target = 0;
      }
      if (playerCar && car.axis === 'x' && Math.abs(playerCar.z - car.z) < 3) {
        const along = (playerCar.x - car.x) * car.dir;
        if (along > 0 && along < 10) target = 0;
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 2);
      const nx = car.axis === 'z' ? car.x : car.x + car.dir * car.speed * dt;
      const nz = car.axis === 'z' ? car.z + car.dir * car.speed * dt : car.z;
      car.x = nx;
      car.z = nz;
      // At the city edge, turn onto a perpendicular road.
      const atEdge = car.axis === 'z' ? Math.abs(car.z) > 208 : Math.abs(car.x) > 208;
      if (atEdge) {
        const newRoad = this.rng.pick(ROADS);
        const lane = this.rng.chance(0.5) ? 2.8 : -2.8;
        if (car.axis === 'z') {
          car.axis = 'x';
          car.z = newRoad + lane;
          car.x = Math.max(-204, Math.min(204, car.x));
          car.dir = lane > 0 ? -1 : 1;
          car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.axis = 'z';
          car.x = newRoad + lane;
          car.z = Math.max(-204, Math.min(204, car.z));
          car.dir = lane > 0 ? 1 : -1;
          car.heading = car.dir > 0 ? 0 : Math.PI;
        }
      }
      car.syncMesh();
      // Bump the player / police apart.
      if (playerCar) playerCar.collideWith(car);
      for (const pc of policeCars || []) pc.collideWith(car);
    }
    // Traffic bumps itself apart.
    for (let i = 0; i < this.cars.length; i += 1) {
      for (let j = i + 1; j < this.cars.length; j += 1) {
        this.cars[i].collideWith(this.cars[j]);
      }
    }
  }

  // The closest stealable car (parked or traffic, stopped or slow) to a point.
  nearestStealable(x, z, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const car of [...this.parked, ...this.cars]) {
      if (car.isPlayer) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  removeFromParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
  }

  removeFromTraffic(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }
}
