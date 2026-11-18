// The three.js scene: golden-hour sun, sky dome, instanced city, water,
// mission beacon, vehicle and pedestrian mesh factories, chase camera,
// tracers and spark bursts. Only this file imports three.
import * as THREE from 'three';
import { CFG } from './config.js';

const SKY_VERT = `
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
varying vec3 vPos;
void main() {
  float h = normalize(vPos).y;
  vec3 c = mix(horizonColor, topColor, smoothstep(-0.05, 0.45, h));
  gl_FragColor = vec4(c, 1.0);
}`;

export class RenderSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(CFG.fogColor, 120, 520);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.clock = new THREE.Clock();
    this.camPos = new THREE.Vector3(0, 20, 40);
    this.camLook = new THREE.Vector3(0, 0, 0);
    this.time = 0;
    this.tracers = [];
    this.particles = null;
    this.particleVel = [];
    this.particleLife = [];
    this.beacon = null;
    this.sun = null;
    this.water = null;
    this.clouds = [];
    this.buildSky();
    this.buildLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          topColor: { value: new THREE.Color(CFG.skyTop) },
          horizonColor: { value: new THREE.Color(CFG.skyHorizon) },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.scene.add(sky);
    // Low sun disc on the western horizon.
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(34, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
    );
    sun.position.set(-700, 70, -260);
    sun.lookAt(0, 40, 0);
    this.scene.add(sun);
    this.sun = sun;
    // A few drifting clouds.
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff2dd, transparent: true, opacity: 0.75, fog: false });
    for (let i = 0; i < 7; i += 1) {
      const c = new THREE.Group();
      for (let k = 0; k < 3; k += 1) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(14 + k * 6, 10, 8), cloudMat);
        s.position.set(k * 16 - 16, k % 2 === 0 ? 2 : -1, 0);
        s.scale.y = 0.45;
        c.add(s);
      }
      c.position.set(-500 + i * 160, 130 + (i % 3) * 22, -420 + (i % 4) * 130);
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(CFG.hemiSky, CFG.hemiGround, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(CFG.sunColor, CFG.sunIntensity);
    sun.position.set(-140, 110, -80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sunLight = sun;
    this.flash = new THREE.PointLight(0xffc860, 0, 18);
    this.scene.add(this.flash);
  }

  buildCity(city) {
    // Ground from the city's painted canvas.
    const tex = new THREE.CanvasTexture(city.groundCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // Water plane to the east.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 600),
      new THREE.MeshLambertMaterial({ color: 0x2e7fa8, transparent: true, opacity: 0.92 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(322, 0.15, 0);
    this.scene.add(water);
    this.water = water;
    // Buildings: one instanced box with a window texture, tinted per instance.
    const win = document.createElement('canvas');
    win.width = 128;
    win.height = 256;
    const g = win.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#2c3542';
    for (let y = 12; y < 244; y += 22) {
      for (let x = 10; x < 118; x += 24) g.fillRect(x, y, 14, 12);
    }
    const winTex = new THREE.CanvasTexture(win);
    winTex.colorSpace = THREE.SRGBColorSpace;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const boxMat = new THREE.MeshLambertMaterial({ map: winTex });
    const inst = new THREE.InstancedMesh(boxGeo, boxMat, city.buildings.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    city.buildings.forEach((b, i) => {
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      m.compose(
        new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2),
        q,
        new THREE.Vector3(w, b.h, d),
      );
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.setHex(b.color));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
    // Palms: instanced trunks and foliage cones.
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 4.5, 6);
    trunkGeo.translate(0, 2.25, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5c3e }), city.palms.length);
    const leafGeo = new THREE.ConeGeometry(2.1, 2.6, 7);
    leafGeo.translate(0, 5.4, 0);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0x3f8f4f }), city.palms.length);
    city.palms.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      trunks.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    });
    trunks.castShadow = true;
    leaves.castShadow = true;
    this.scene.add(trunks);
    this.scene.add(leaves);
    // Street lamps.
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 5, 5);
    poleGeo.translate(0, 2.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), city.lamps.length);
    const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
    bulbGeo.translate(0, 5.1, 0);
    const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), city.lamps.length);
    city.lamps.forEach((l, i) => {
      m.compose(new THREE.Vector3(l.x, 0, l.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m);
      bulbs.setMatrixAt(i, m);
    });
    this.scene.add(poles);
    this.scene.add(bulbs);
    // Mission beacon: tall glowing pillar + ring at the target.
    const beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 30;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.28, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc93c }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    beacon.add(pillar);
    beacon.add(ring);
    beacon.visible = false;
    this.scene.add(beacon);
    this.beacon = beacon;
    // Spark particles pool.
    const pGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i += 1) pos[i * 3 + 1] = -999;
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xffc860, size: 0.35, sizeAttenuation: true }));
    this.scene.add(this.particles);
    for (let i = 0; i < 240; i += 1) {
      this.particleVel.push(new THREE.Vector3());
      this.particleLife.push(0);
    }
    // Tracer lines pool.
    for (let i = 0; i < 10; i += 1) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  makeCarMesh(color, type) {
    const group = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
    const tyre = new THREE.MeshLambertMaterial({ color: 0x14161a });
    let len = 4.2;
    let wid = 1.9;
    let bodyH = 0.55;
    let bodyY = 0.55;
    if (type === 'sports') { len = 4.4; wid = 2.0; bodyH = 0.45; bodyY = 0.48; }
    if (type === 'truck') { len = 5.2; wid = 2.1; bodyH = 0.7; bodyY = 0.62; }
    const body = new THREE.Mesh(new THREE.BoxGeometry(wid, bodyH, len), paint);
    body.position.y = bodyY;
    body.castShadow = true;
    group.add(body);
    if (type === 'truck') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.92, 0.8, 1.4), paint);
      cab.position.set(0, 1.2, 1.2);
      cab.castShadow = true;
      group.add(cab);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.35, 2.2), glass);
      bed.position.set(0, 1.05, -1.3);
      group.add(bed);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.88, 0.5, len * 0.45), glass);
      cabin.position.set(0, bodyY + bodyH / 2 + 0.22, -len * 0.06);
      cabin.castShadow = true;
      group.add(cabin);
    }
    if (type === 'sports') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.08, 0.3), tyre);
      spoiler.position.set(0, 1.0, -len / 2 + 0.15);
      group.add(spoiler);
    }
    if (type === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
      sign.position.set(0, bodyY + bodyH + 0.55, 0);
      group.add(sign);
    }
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    for (const [wx, wz] of [[-wid / 2, len / 2 - 0.85], [wid / 2, len / 2 - 0.85], [-wid / 2, -len / 2 + 0.85], [wid / 2, -len / 2 + 0.85]]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.position.set(wx, 0.35, wz);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    for (const hx of [-wid / 2 + 0.3, wid / 2 - 0.3]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), lightMat);
      hl.position.set(hx, bodyY, len / 2 + 0.01);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xd21f1f }));
      tl.position.set(hx, bodyY, -len / 2 - 0.01);
      group.add(tl);
    }
    group.userData.wheels = wheels;
    return group;
  }

  makePoliceMesh() {
    const group = this.makeCarMesh(0xe8e4da, 'sedan');
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bar.position.set(0, 1.32, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.32), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.28, 1.32, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.32), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.28, 1.32, -0.2);
    group.add(blue);
    return group;
  }

  makePedMesh(shirtColor, skinColor) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
    const skin = new THREE.MeshLambertMaterial({ color: skinColor || 0xc98d64 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), pants);
    legL.position.set(-0.11, 0.28, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt);
    torso.position.y = 0.86;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    head.position.y = 1.38;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), shirt);
    armL.position.set(-0.33, 0.86, 0);
    const armR = armL.clone();
    armR.position.x = 0.33;
    for (const part of [legL, legR, torso, head, armL, armR]) part.castShadow = true;
    group.add(legL, legR, torso, head, armL, armR);
    group.userData = { legL, legR, armL, armR };
    return group;
  }

  makePlayerMesh() {
    const group = this.makePedMesh(0x2e6fd2, 0xc98d64);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.44), new THREE.MeshLambertMaterial({ color: 0xd23c2e }));
    cap.position.y = 1.56;
    group.add(cap);
    return group;
  }

  makeEnemyMesh() {
    const group = this.makePedMesh(0xc22e2e, 0x8a5a3a);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x14161a }));
    gun.position.set(0.33, 0.95, 0.3);
    group.add(gun);
    return group;
  }

  // Snap the chase camera behind the player (after teleports and car
  // entry/exit) so it never has to swing halfway around the world.
  snapCamera(focus, heading, mode) {
    const dist = mode === 'drive' ? 10.5 : 6.5;
    const height = mode === 'drive' ? 4.2 : 3.2;
    const ang = heading + Math.PI;
    this.camPos.set(focus.x + Math.sin(ang) * dist, focus.y + height, focus.z + Math.cos(ang) * dist);
    const lookDist = mode === 'drive' ? 5 : 12;
    const lookY = mode === 'drive' ? 1.4 : 1.6;
    this.camLook.set(focus.x + Math.sin(heading) * lookDist, lookY, focus.z + Math.cos(heading) * lookDist);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  // Chase camera: behind the heading, smoothed; mouse drag orbits around.
  updateCamera(dt, focus, heading, mode, camYaw, camPitch) {
    const dist = mode === 'drive' ? 10.5 : 6.5;
    const height = mode === 'drive' ? 4.2 : 3.2;
    const ang = heading + Math.PI + camYaw;
    const tx = focus.x + Math.sin(ang) * dist;
    const tz = focus.z + Math.cos(ang) * dist;
    const desired = new THREE.Vector3(tx, focus.y + height + camPitch * 4, tz);
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(desired, k);
    // On foot the camera looks further ahead so the crosshair ray stays near
    // chest height at combat range; driving keeps a closer look point.
    const lookDist = mode === 'drive' ? 5 : 12;
    const lookY = mode === 'drive' ? 1.4 : 1.6;
    const look = new THREE.Vector3(focus.x + Math.sin(heading) * lookDist, lookY, focus.z + Math.cos(heading) * lookDist);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 7));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    // Shadow frustum follows the player.
    this.sunLight.position.set(focus.x - 140, 110, focus.z - 80);
    this.sunLight.target.position.set(focus.x, 0, focus.z);
  }

  updateOrbitCamera(dt, centre, radius, angle) {
    const a = angle + dt * 0.05;
    this.camera.position.set(centre.x + Math.sin(a) * radius, 26, centre.z + Math.cos(a) * radius);
    this.camera.lookAt(centre.x, 6, centre.z);
    return a;
  }

  shootTracer(from, to) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }

  muzzleFlash(pos) {
    this.flash.position.set(pos.x, pos.y, pos.z);
    this.flash.intensity = 60;
  }

  burst(pos, count) {
    const attr = this.particles.geometry.attributes.position;
    let spawned = 0;
    for (let i = 0; i < 240 && spawned < count; i += 1) {
      if (this.particleLife[i] > 0) continue;
      attr.setXYZ(i, pos.x, pos.y + 0.5, pos.z);
      this.particleVel[i].set((Math.random() - 0.5) * 9, Math.random() * 7 + 2, (Math.random() - 0.5) * 9);
      this.particleLife[i] = 0.6;
      spawned += 1;
    }
    attr.needsUpdate = true;
  }

  setBeacon(x, z, visible) {
    if (!this.beacon) return;
    this.beacon.visible = visible;
    this.beacon.position.set(x, 0, z);
  }

  update(dt) {
    this.time += dt;
    if (this.water) this.water.position.y = 0.15 + Math.sin(this.time * 0.7) * 0.12;
    if (this.beacon && this.beacon.visible) {
      const s = 1 + Math.sin(this.time * 3) * 0.12;
      this.beacon.scale.set(s, 1, s);
    }
    for (const c of this.clouds) c.position.x += dt * 1.2;
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * 500);
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    const attr = this.particles.geometry.attributes.position;
    let dirty = false;
    for (let i = 0; i < 240; i += 1) {
      if (this.particleLife[i] <= 0) continue;
      this.particleLife[i] -= dt;
      const v = this.particleVel[i];
      v.y -= 14 * dt;
      attr.setXYZ(i, attr.getX(i) + v.x * dt, attr.getY(i) + v.y * dt, attr.getZ(i) + v.z * dt);
      if (this.particleLife[i] <= 0) attr.setXYZ(i, 0, -999, 0);
      dirty = true;
    }
    if (dirty) attr.needsUpdate = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
