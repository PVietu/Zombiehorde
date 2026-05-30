// InputManager - Handles keyboard, mouse input and pointer lock

export interface InputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  fire: boolean;
  aim: boolean;
  interact: boolean;
  weapon1: boolean;
  weapon2: boolean;
  tab: boolean;
  mouseX: number;
  mouseY: number;
  mouseDX: number;
  mouseDY: number;
}

export class InputManager {
  private keys: Set<string> = new Set();
  private state: InputState = {
    forward: false, backward: false, left: false, right: false,
    jump: false, sprint: false, crouch: false,
    fire: false, aim: false, interact: false,
    weapon1: false, weapon2: false, tab: false,
    mouseX: 0, mouseY: 0, mouseDX: 0, mouseDY: 0,
  };
  private canvas: HTMLElement;
  private isLocked = false;
  private onLockChange?: (locked: boolean) => void;
  private justPressed: Set<string> = new Set();

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    this.setupListeners();
  }

  private setupListeners() {
    document.addEventListener('keydown', (e) => {
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      this.updateState();
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') e.preventDefault();
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.updateState();
      if (e.code === 'Tab') e.preventDefault();
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.state.fire = true;
        this.justPressed.add('MouseBtn0');
      }
      if (e.button === 2) this.state.aim = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.state.fire = false;
      if (e.button === 2) this.state.aim = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.state.mouseDX = e.movementX;
      this.state.mouseDY = e.movementY;
      this.state.mouseX += e.movementX;
      this.state.mouseY += e.movementY;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas ||
                       document.pointerLockElement === document.body;
      if (this.onLockChange) this.onLockChange(this.isLocked);
    });

    // Click to lock
    this.canvas.addEventListener('click', () => {
      if (!this.isLocked) {
        (document.body as any).requestPointerLock?.() || (this.canvas as any).requestPointerLock?.();
      }
    });
  }

  private updateState() {
    this.state.forward = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    this.state.backward = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    this.state.left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    this.state.right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    this.state.jump = this.keys.has('Space');
    this.state.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.state.crouch = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    this.state.interact = this.keys.has('KeyE');
    this.state.weapon1 = this.keys.has('Digit1');
    this.state.weapon2 = this.keys.has('Digit2');
    this.state.tab = this.keys.has('Tab');
  }

  getState(): InputState {
    return this.state;
  }

  isJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  clearJustPressed() {
    this.justPressed.clear();
    // Also reset mouse delta
    this.state.mouseDX = 0;
    this.state.mouseDY = 0;
  }

  setOnLockChange(cb: (locked: boolean) => void) {
    this.onLockChange = cb;
  }

  isPointerLocked(): boolean {
    return this.isLocked;
  }

  requestPointerLock() {
    try {
      (document.body as any).requestPointerLock?.();
    } catch (e) {
      console.warn('Pointer lock failed:', e);
    }
  }

  exitPointerLock() {
    document.exitPointerLock?.();
  }
}
