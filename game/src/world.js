// Solmarina, the city: a 6x6 grid of blocks on 72 m pitch, roads between
// them, a beach and the sea to the east, a marina and docks. Generates the
// layout from a seed, the ground texture canvas, building colliders, palms,
// lamps and the mission landmarks. Pure data — render.js turns it into meshes.
import { CFG } from './config.js';
import { RNG } from './random.js';

export const ROADS = [-216, -144, -72, 0, 72, 144, 216];

export class City {
  constructor(seed) {
    this.rng = new RNG(seed);
    this.buildings = [];
    this.parks = [];
    this.parkingLots = [];
    this.palms = [];
    this.lamps = [];
    this.parkedCars = [];
    this.groundCanvas = null;
    this.landmarks = {
      garage: { x: -108, z: 66, name: 'Rosa\u2019s Garage' },
      marina: { x: 228, z: -60, name: 'Marina' },
      docks: { x: 180, z: 180, name: 'Docks' },
      hideout: { x: -180, z: -180, name: 'Sharks Hideout' },
    };
    this.generate();
  }

  blockRect(i, j) {
    return {
      x0: ROADS[i] + CFG.roadWidth / 2,
      x1: ROADS[i + 1] - CFG.roadWidth / 2,
      z0: ROADS[j] + CFG.roadWidth / 2,
      z1: ROADS[j + 1] - CFG.roadWidth / 2,
    };
  }

  generate() {
    const rng = this.rng;
    // Two parks and two parking lots, never on the landmark blocks.
    const special = new Set(['1,2', '5,5']);
    const parkKeys = new Set();
    while (parkKeys.size < 2) parkKeys.add(`${rng.int(0, 5)},${rng.int(0, 5)}`);
    const lotKeys = new Set();
    while (lotKeys.size < 2) {
      const k = `${rng.int(0, 5)},${rng.int(0, 5)}`;
      if (!parkKeys.has(k)) lotKeys.add(k);
    }
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 6; j += 1) {
        const key = `${i},${j}`;
        const r = this.blockRect(i, j);
        if (parkKeys.has(key) || special.has(key)) {
          if (parkKeys.has(key)) this.parks.push(r);
          continue;
        }
        if (lotKeys.has(key)) {
          this.parkingLots.push(r);
          continue;
        }
        this.buildBlock(r, i, j);
      }
    }
    // Landmark buildings: garage, docks warehouse, hideout.
    this.addBuilding({ x0: -132, x1: -96, z0: 18, z1: 54, h: 9, color: 0xd2702e });
    this.addBuilding({ x0: 156, x1: 204, z0: 156, z1: 192, h: 12, color: 0x7a6a58 });
    this.addBuilding({ x0: -204, x1: -162, z0: -204, z1: -168, h: 14, color: 0x8a5fc0 });
    this.placePalms();
    this.placeLamps();
    this.placeParkedCars();
    this.groundCanvas = this.paintGround();
  }

  buildBlock(r, i, j) {
    const rng = this.rng;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const distCentre = Math.max(Math.abs(cx), Math.abs(cz));
    const tall = distCentre < 80 ? 1.5 : 1;
    const split = rng.next();
    const color = () => rng.pick(CFG.buildingPalette);
    const plots = [];
    if (split < 0.35) {
      plots.push({ x0: r.x0 + 4, x1: r.x1 - 4, z0: r.z0 + 4, z1: r.z1 - 4 });
    } else if (split < 0.7) {
      if (rng.chance(0.5)) {
        plots.push({ x0: r.x0 + 4, x1: cx - 3, z0: r.z0 + 4, z1: r.z1 - 4 });
        plots.push({ x0: cx + 3, x1: r.x1 - 4, z0: r.z0 + 4, z1: r.z1 - 4 });
      } else {
        plots.push({ x0: r.x0 + 4, x1: r.x1 - 4, z0: r.z0 + 4, z1: cz - 3 });
        plots.push({ x0: r.x0 + 4, x1: r.x1 - 4, z0: cz + 3, z1: r.z1 - 4 });
      }
    } else {
      plots.push({ x0: r.x0 + 4, x1: cx - 3, z0: r.z0 + 4, z1: cz - 3 });
      plots.push({ x0: cx + 3, x1: r.x1 - 4, z0: r.z0 + 4, z1: cz - 3 });
      plots.push({ x0: r.x0 + 4, x1: cx - 3, z0: cz + 3, z1: r.z1 - 4 });
      plots.push({ x0: cx + 3, x1: r.x1 - 4, z0: cz + 3, z1: r.z1 - 4 });
    }
    for (const p of plots) {
      const h = Math.round(rng.range(8, 26) * tall + rng.range(0, 14));
      this.addBuilding({ ...p, h: Math.min(46, h), color: color() });
    }
  }

  addBuilding(b) {
    this.buildings.push(b);
  }

  placePalms() {
    const rng = this.rng;
    for (let z = -210; z <= 210; z += 24) {
      this.palms.push({ x: 228 + rng.range(-2, 2), z: z + rng.range(-4, 4), s: rng.range(0.85, 1.25) });
    }
    for (let i = 0; i < 14; i += 1) {
      const r = ROADS[rng.int(0, 6)];
      const along = rng.range(-200, 200);
      this.palms.push({ x: r + (rng.chance(0.5) ? 8.5 : -8.5), z: along, s: rng.range(0.8, 1.1) });
    }
    for (const p of this.parks) {
      for (let i = 0; i < 5; i += 1) {
        this.palms.push({
          x: this.rng.range(p.x0 + 6, p.x1 - 6),
          z: this.rng.range(p.z0 + 6, p.z1 - 6),
          s: this.rng.range(0.9, 1.3),
        });
      }
    }
  }

  placeLamps() {
    for (let i = 0; i < ROADS.length; i += 1) {
      for (let j = 0; j < ROADS.length; j += 1) {
        if ((i + j) % 2 === 0) {
          this.lamps.push({ x: ROADS[i] + 7.5, z: ROADS[j] + 7.5 });
        }
      }
    }
  }

  placeParkedCars() {
    const rng = this.rng;
    const spots = [];
    for (let k = 0; k < 12; k += 1) {
      const vertical = rng.chance(0.5);
      const road = rng.pick(ROADS);
      const along = rng.range(-200, 200);
      const side = rng.chance(0.5) ? 4.2 : -4.2;
      spots.push({
        x: vertical ? road + side : along,
        z: vertical ? along : road + side,
        // Face along the road, not across it: vertical roads run along z
        // (heading 0 / PI), horizontal roads along x (heading +/-PI/2).
        heading: vertical ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2),
        color: rng.pick(CFG.carPalette),
        type: rng.pick(['sedan', 'sedan', 'sports', 'truck']),
      });
    }
    this.parkedCars = spots;
  }

  // The ground seen from above: base, blocks, roads with dashes, crosswalks,
  // parks, beach, water edge and marina piers. 1024 px covers -300..300 m.
  // px() maps a world coordinate to pixels; sc() maps a world LENGTH.
  paintGround() {
    const S = 1024;
    const span = 600;
    const px = (v) => ((v + span / 2) / span) * S;
    const sc = (v) => (v / span) * S;
    const cv = document.createElement('canvas');
    cv.width = S;
    cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#a89a80';
    g.fillRect(0, 0, S, S);
    // Water (east) and beach.
    g.fillStyle = '#2e7fa8';
    g.fillRect(px(CFG.waterX), 0, S - px(CFG.waterX), S);
    g.fillStyle = '#e8d5a3';
    g.fillRect(px(CFG.beachX), 0, sc(CFG.waterX - CFG.beachX), S);
    // City ground.
    g.fillStyle = '#b5a88f';
    g.fillRect(0, 0, px(CFG.beachX), S);
    // Blocks as sidewalk slabs.
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 6; j += 1) {
        const r = this.blockRect(i, j);
        g.fillStyle = '#c9b896';
        g.fillRect(px(r.x0 - 3), px(r.z0 - 3), sc(r.x1 - r.x0 + 6), sc(r.z1 - r.z0 + 6));
      }
    }
    // Parks.
    for (const p of this.parks) {
      g.fillStyle = '#6f9e5a';
      g.fillRect(px(p.x0), px(p.z0), sc(p.x1 - p.x0), sc(p.z1 - p.z0));
    }
    // Roads.
    g.fillStyle = '#46464f';
    for (const r of ROADS) {
      g.fillRect(px(r - 6), 0, sc(12), S);
      g.fillRect(0, px(r - 6), S, sc(12));
    }
    // Centre dashes.
    g.fillStyle = '#e8c85a';
    for (const r of ROADS) {
      for (let v = -216; v <= 216; v += 12) {
        g.fillRect(px(v), px(r - 0.5), sc(6), sc(1));
        g.fillRect(px(r - 0.5), px(v), sc(1), sc(6));
      }
    }
    // Crosswalks at every intersection.
    g.fillStyle = '#d8d8d0';
    for (const rx of ROADS) {
      for (const rz of ROADS) {
        for (let k = -2; k <= 2; k += 1) {
          g.fillRect(px(rx + k * 2.2 - 0.8), px(rz - 6), sc(1.6), sc(3));
          g.fillRect(px(rx + k * 2.2 - 0.8), px(rz + 3), sc(1.6), sc(3));
          g.fillRect(px(rx - 6), px(rz + k * 2.2 - 0.8), sc(3), sc(1.6));
          g.fillRect(px(rx + 3), px(rz + k * 2.2 - 0.8), sc(3), sc(1.6));
        }
      }
    }
    // Marina piers.
    g.fillStyle = '#7a5c3e';
    g.fillRect(px(232), px(-84), sc(20), sc(6));
    g.fillRect(px(232), px(-48), sc(14), sc(6));
    g.fillRect(px(232), px(-12), sc(20), sc(6));
    return cv;
  }

  // Circle vs building AABBs + world bounds. Returns corrected position and
  // whether a hit happened (for crash sound / damage).
  collideCircle(x, z, r) {
    let hit = false;
    for (const b of this.buildings) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = x - b.x0 + r;
          const pr = b.x1 - x + r;
          const pt = z - b.z0 + r;
          const pb = b.z1 - z + r;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.x0 - r;
          else if (m === pr) x = b.x1 + r;
          else if (m === pt) z = b.z0 - r;
          else z = b.z1 + r;
        }
      }
    }
    const lim = CFG.worldHalf - 2;
    if (x < -lim) { x = -lim; hit = true; }
    if (x > lim) { x = lim; hit = true; }
    if (z < -lim) { z = -lim; hit = true; }
    if (z > lim) { z = lim; hit = true; }
    return { x, z, hit };
  }

  insideBuilding(x, z) {
    for (const b of this.buildings) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
    }
    return false;
  }

  // Cheap line-of-sight test for enemy shots: sample the segment.
  rayBlocked(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (this.insideBuilding(x0 + dx * t, z0 + dz * t)) return true;
    }
    return false;
  }

  nearestRoad(v) {
    let best = ROADS[0];
    let bd = Infinity;
    for (const r of ROADS) {
      const d = Math.abs(r - v);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  randomRoadPoint(rng) {
    const vertical = rng.chance(0.5);
    const road = rng.pick(ROADS);
    const along = rng.range(-204, 204);
    const lane = rng.chance(0.5) ? 2.8 : -2.8;
    return vertical
      ? { x: road + lane, z: along, heading: lane > 0 ? 0 : Math.PI }
      : { x: along, z: road + lane, heading: lane > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
}
