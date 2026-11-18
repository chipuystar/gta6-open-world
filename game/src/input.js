// Keyboard + mouse input, kept in one place so the game loop and the
// screenshot autopilot read the same shape: { forward, back, left, right,
// sprint, brake, action, shoot } plus a camera orbit offset from mouse drag.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseClicked = false;
    this.camYaw = 0;
    this.camPitch = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.key)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.action = true;
      if (e.code === 'KeyM') this.muteToggle = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pauseToggle = true;
      if (e.code === 'KeyR') this.resetCar = true;
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      }
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
      this._dragging = false;
    };
    this._onMouseMove = (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.camYaw -= dx * 0.005;
      this.camPitch = Math.max(-0.5, Math.min(0.6, this.camPitch + dy * 0.003));
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
      this._dragging = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
    this.action = false;
    this.muteToggle = false;
    this.pauseToggle = false;
    this.resetCar = false;
  }

  // Fresh axis state for this frame. `scripted` overrides come from the
  // screenshot autopilot; live play reads the keyboard.
  axes(scripted) {
    if (scripted) return scripted;
    const k = this.keys;
    return {
      forward: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      strafe: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      brake: k.has('Space'),
    };
  }

  // One-shot flags: read then cleared by the game loop each frame.
  consume() {
    const out = {
      action: this.action,
      muteToggle: this.muteToggle,
      pauseToggle: this.pauseToggle,
      resetCar: this.resetCar,
      shoot: this.mouseClicked,
    };
    this.action = false;
    this.muteToggle = false;
    this.pauseToggle = false;
    this.resetCar = false;
    this.mouseClicked = false;
    return out;
  }
}
