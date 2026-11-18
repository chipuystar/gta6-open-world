// HUD: wanted stars, money, health, speed, mission tracker, canvas minimap,
// toasts and every menu screen. DOM lives in index.html; this class owns it.
import { ROADS } from './world.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.last = {};
    this.toastTimer = null;
    this.bindButtons();
  }

  bindButtons() {
    const click = (id, fn) => {
      const b = this.el(id);
      if (b) b.addEventListener('click', () => fn && fn());
    };
    click('start-btn', () => this.onStart && this.onStart());
    click('continue-btn', () => this.onStart && this.onStart(true));
    click('resume-btn', () => this.onResume && this.onResume());
    click('restart-btn', () => this.onRestart && this.onRestart());
    click('quit-btn', () => this.onQuit && this.onQuit());
    click('mission-continue-btn', () => this.onMissionContinue && this.onMissionContinue());
    click('busted-continue-btn', () => this.onBustedContinue && this.onBustedContinue());
    click('wasted-restart-btn', () => this.onRestart && this.onRestart());
    click('victory-restart-btn', () => this.onRestart && this.onRestart());
  }

  setText(id, value) {
    if (this.last[id] === value) return;
    this.last[id] = value;
    const el = this.el(id);
    if (el) el.textContent = value;
  }

  show(id) {
    const el = this.el(id);
    if (el) el.classList.remove('hidden');
  }

  hide(id) {
    const el = this.el(id);
    if (el) el.classList.add('hidden');
  }

  showScreen(name) {
    for (const s of ['title-screen', 'pause-screen', 'mission-screen', 'busted-screen', 'wasted-screen', 'victory-screen']) {
      this.hide(s);
    }
    if (name) this.show(name);
    this.el('hud').classList.toggle('hidden', name === 'title-screen' || name === 'victory-screen');
  }

  showToast(text, ms) {
    const t = this.el('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms || 4200);
  }

  flashDamage() {
    const d = this.el('damage-flash');
    d.classList.add('on');
    setTimeout(() => d.classList.remove('on'), 180);
  }

  // One call per frame with the live state; DOM writes are cached.
  update(s) {
    this.setText('money', `$${Math.floor(s.money).toLocaleString('en-US')}`);
    this.setText('health-num', `${Math.max(0, Math.ceil(s.health))}`);
    this.el('health-fill').style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    this.el('health-fill').style.background = s.health > 50 ? '#37c978' : s.health > 25 ? '#e8b13c' : '#d23c2e';
    this.setText('speed', s.inCar ? `${Math.round(Math.abs(s.speed) * 3.6)} km/h` : s.onFoot ? 'ON FOOT' : '');
    const stars = this.el('wanted-stars');
    const starHtml = '★★★★★'.split('').map((ch, i) => `<span class="${i < s.wanted ? 'lit' : ''}">${ch}</span>`).join('');
    if (this.last.stars !== starHtml) {
      this.last.stars = starHtml;
      stars.innerHTML = starHtml;
    }
    this.el('wanted-box').classList.toggle('hot', s.wanted > 0);
    this.setText('mission-title', s.missionTitle || 'Free Roam');
    this.setText('mission-objective', s.objective || 'Explore Solmarina. Steal a car with E, drive with WASD.');
    this.setText('mission-dist', s.targetDist != null ? `${Math.round(s.targetDist)} m` : '');
    this.setText('mission-timer', s.timer > 0 ? `⏱ ${Math.ceil(s.timer)}s` : '');
    this.el('crosshair').classList.toggle('hidden', !s.onFoot || s.inCar);
    this.el('hint').textContent = s.inCar
      ? 'WASD drive · Space handbrake · E exit car · P pause'
      : 'WASD move · Shift run · E enter car · Click shoot · P pause';
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const g = this.mm;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const scale = W / 600;
    const toX = (x) => (x + 300) * scale;
    const toY = (z) => (z + 300) * scale;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12, 16, 24, 0.85)';
    g.fillRect(0, 0, W, H);
    // Water + beach.
    g.fillStyle = '#2e7fa8';
    g.fillRect(toX(252), 0, W - toX(252), H);
    g.fillStyle = '#e8d5a3';
    g.fillRect(toX(222), 0, toX(252) - toX(222), H);
    // Roads.
    g.strokeStyle = '#5a5a62';
    g.lineWidth = 12 * scale;
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(toX(r), 0); g.lineTo(toX(r), H); g.stroke();
      g.beginPath(); g.moveTo(0, toY(r)); g.lineTo(W, toY(r)); g.stroke();
    }
    // Mission marker.
    if (s.target) {
      const pulse = 5 + Math.sin(Date.now() / 200) * 2;
      g.fillStyle = '#ffc93c';
      g.beginPath();
      g.moveTo(toX(s.target.x), toY(s.target.z) - pulse);
      g.lineTo(toX(s.target.x) + pulse, toY(s.target.z));
      g.lineTo(toX(s.target.x), toY(s.target.z) + pulse);
      g.lineTo(toX(s.target.x) - pulse, toY(s.target.z));
      g.closePath();
      g.fill();
    }
    // Traffic dots.
    g.fillStyle = '#d8d8d0';
    for (const c of s.traffic || []) {
      g.fillRect(toX(c.x) - 1.5, toY(c.z) - 1.5, 3, 3);
    }
    // Police dots.
    g.fillStyle = '#ff4040';
    for (const c of s.police || []) {
      g.beginPath(); g.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2); g.fill();
    }
    // Enemies.
    g.fillStyle = '#ff2020';
    for (const e of s.enemies || []) {
      g.fillRect(toX(e.x) - 2, toY(e.z) - 2, 4, 4);
    }
    // Player arrow.
    g.save();
    g.translate(toX(s.playerX), toY(s.playerZ));
    g.rotate(Math.PI - s.heading);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.restore();
    // Border.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
  }
}
