// UI Manager - Handles all HUD elements, menus, and overlays

export class UIManager {
  private container: HTMLElement;
  private hud: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private leaderboard: HTMLElement | null = null;
  private crosshair: HTMLElement | null = null;
  private hitMarker: HTMLElement | null = null;
  private hitMarkerTimer = 0;
  private deathScreen: HTMLElement | null = null;
  private victoryScreen: HTMLElement | null = null;
  private gameOverScreen: HTMLElement | null = null;

  constructor() {
    this.container = document.getElementById('game-root') || document.body;
    this.injectCSS();
    this.createMenu();
  }

  private injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #000; overflow: hidden; }
      #game-root { width: 100vw; height: 100vh; position: relative; }
      
      .ui-overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 10;
      }
      
      /* MENU */
      #main-menu {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: linear-gradient(135deg, #0a0a0a 0%, #1a0505 50%, #0a0a0a 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        z-index: 100; pointer-events: all;
        font-family: 'Courier New', monospace;
      }
      .menu-title {
        font-size: 64px; font-weight: 900; letter-spacing: 4px;
        color: #ff2200; text-shadow: 0 0 20px #ff4400, 0 0 40px #ff2200;
        margin-bottom: 8px; text-transform: uppercase;
        animation: pulse-glow 2s infinite;
      }
      .menu-subtitle {
        font-size: 20px; color: #ff8800; letter-spacing: 8px;
        margin-bottom: 60px; text-shadow: 0 0 10px #ff6600;
      }
      @keyframes pulse-glow {
        0%, 100% { text-shadow: 0 0 20px #ff4400, 0 0 40px #ff2200; }
        50% { text-shadow: 0 0 30px #ff6600, 0 0 60px #ff4400, 0 0 80px #ff2200; }
      }
      .menu-btn {
        background: linear-gradient(135deg, #1a0505, #3a0a0a);
        border: 2px solid #ff3300; color: #ff8800;
        font-family: 'Courier New', monospace; font-size: 20px; font-weight: bold;
        padding: 16px 48px; margin: 8px; cursor: pointer;
        letter-spacing: 3px; text-transform: uppercase;
        transition: all 0.2s; min-width: 280px;
        clip-path: polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%);
      }
      .menu-btn:hover {
        background: linear-gradient(135deg, #3a0a0a, #6a1010);
        border-color: #ff6600; color: #ffcc00;
        box-shadow: 0 0 20px #ff3300, inset 0 0 10px rgba(255,50,0,0.2);
        transform: scale(1.05);
      }
      .menu-input-row {
        display: flex; gap: 8px; margin: 8px; align-items: center;
      }
      .menu-input {
        background: #0a0505; border: 2px solid #ff3300; color: #ff8800;
        font-family: 'Courier New', monospace; font-size: 16px;
        padding: 14px 20px; outline: none; min-width: 320px;
        clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
      }
      .menu-input::placeholder { color: #663300; }
      .menu-input:focus { border-color: #ff6600; box-shadow: 0 0 10px #ff3300; }
      .menu-hint { color: #663300; font-size: 14px; margin-top: 20px; letter-spacing: 2px; }
      .menu-version { color: #440000; font-size: 12px; margin-top: 40px; }
      
      /* HUD */
      #hud {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 10;
        font-family: 'Courier New', monospace;
      }
      .hud-health-bar {
        position: absolute; bottom: 80px; left: 24px;
        width: 220px;
      }
      .hud-label { color: #aaa; font-size: 11px; letter-spacing: 2px; margin-bottom: 4px; text-transform: uppercase; }
      .hud-bar-bg {
        width: 100%; height: 12px; background: rgba(0,0,0,0.6);
        border: 1px solid #333; position: relative; overflow: hidden;
      }
      .hud-bar-fill {
        height: 100%; transition: width 0.2s;
        background: linear-gradient(90deg, #00cc44, #00ff66);
        box-shadow: 0 0 8px #00ff44;
      }
      .hud-bar-fill.critical {
        background: linear-gradient(90deg, #cc0000, #ff3300);
        box-shadow: 0 0 8px #ff0000;
        animation: critical-pulse 0.5s infinite;
      }
      @keyframes critical-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
      .hud-bar-text {
        position: absolute; right: 0; top: -18px;
        color: #fff; font-size: 14px; font-weight: bold;
      }
      
      .hud-ammo {
        position: absolute; bottom: 80px; right: 24px;
        text-align: right;
      }
      .hud-ammo-main {
        font-size: 42px; font-weight: bold; color: #ffcc00;
        text-shadow: 0 0 10px #ff8800; line-height: 1;
      }
      .hud-ammo-reserve {
        font-size: 20px; color: #aa8800;
      }
      .hud-weapon-name {
        font-size: 14px; color: #888; letter-spacing: 3px; text-transform: uppercase;
      }
      .hud-reload-bar {
        width: 120px; height: 4px; background: rgba(0,0,0,0.6);
        border: 1px solid #ff8800; margin-top: 4px; margin-left: auto;
        overflow: hidden;
      }
      .hud-reload-fill {
        height: 100%; background: #ff8800;
        transition: width 0.05s linear;
        box-shadow: 0 0 6px #ff6600;
      }
      
      .hud-money {
        position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
        font-size: 20px; color: #ffcc00; letter-spacing: 2px;
        text-shadow: 0 0 8px #ff8800;
        background: rgba(0,0,0,0.5); padding: 6px 20px;
        border: 1px solid #664400;
        clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
      }
      .hud-money-icon { color: #ff8800; }
      
      .hud-wave {
        position: absolute; top: 16px; right: 24px;
        font-size: 16px; color: #ff4400; letter-spacing: 2px;
        background: rgba(0,0,0,0.5); padding: 6px 16px;
        border: 1px solid #440000;
      }
      .hud-wave span { color: #fff; font-size: 22px; font-weight: bold; }
      
      .hud-kills {
        position: absolute; top: 60px; right: 24px;
        font-size: 14px; color: #888; letter-spacing: 2px;
      }
      .hud-kills span { color: #ff6600; font-weight: bold; }
      
      /* Crosshair */
      #crosshair {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        pointer-events: none; z-index: 11;
      }
      .ch-line {
        position: absolute; background: rgba(255,255,255,0.8);
        box-shadow: 0 0 2px rgba(0,0,0,0.8);
      }
      .ch-top    { width: 2px; height: 10px; top: -18px; left: -1px; }
      .ch-bottom { width: 2px; height: 10px; top:   8px; left: -1px; }
      .ch-left   { width: 10px; height: 2px; top: -1px; left: -18px; }
      .ch-right  { width: 10px; height: 2px; top: -1px; left:   8px; }
      .ch-dot    { width: 3px; height: 3px; border-radius: 50%; top: -1.5px; left: -1.5px; background: rgba(255,255,255,0.9); }
      
      /* Hit marker */
      #hit-marker {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        pointer-events: none; z-index: 12; opacity: 0;
        transition: opacity 0.05s;
      }
      #hit-marker .hm-line {
        position: absolute; background: #ff3300;
        box-shadow: 0 0 4px #ff0000;
      }
      .hm-tl { width: 8px; height: 2px; top: -10px; left: -10px; transform: rotate(45deg); }
      .hm-tr { width: 8px; height: 2px; top: -10px; right: -10px; transform: rotate(-45deg); }
      .hm-bl { width: 8px; height: 2px; bottom: -10px; left: -10px; transform: rotate(-45deg); }
      .hm-br { width: 8px; height: 2px; bottom: -10px; right: -10px; transform: rotate(45deg); }
      
      /* Interact prompt */
      #interact-prompt {
        position: absolute; top: 55%; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.8); border: 1px solid #ff8800;
        color: #ff8800; font-size: 14px; padding: 8px 20px;
        letter-spacing: 2px; pointer-events: none;
        display: none;
      }
      #interact-prompt kbd {
        background: #ff8800; color: #000; padding: 1px 6px;
        font-weight: bold; border-radius: 2px;
      }
      
      /* Wave announcement */
      #wave-announce {
        position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%);
        text-align: center; pointer-events: none; z-index: 15;
        opacity: 0; transition: opacity 0.5s;
      }
      .wave-announce-wave { font-size: 16px; color: #ff8800; letter-spacing: 6px; text-transform: uppercase; }
      .wave-announce-num { font-size: 72px; font-weight: 900; color: #ff2200; 
        text-shadow: 0 0 30px #ff4400; letter-spacing: 4px; }
      .wave-announce-sub { font-size: 14px; color: #888; letter-spacing: 4px; margin-top: 8px; }
      
      /* Combo */
      #combo-display {
        position: absolute; top: 120px; left: 24px;
        pointer-events: none; opacity: 0; transition: opacity 0.3s;
      }
      .combo-count { font-size: 36px; font-weight: bold; color: #ffcc00;
        text-shadow: 0 0 15px #ff8800; letter-spacing: 2px; }
      .combo-label { font-size: 12px; color: #ff8800; letter-spacing: 4px; }
      .combo-bonus { font-size: 13px; color: #00ffcc; margin-top: 2px; letter-spacing: 1px; }
      
      /* Kill feed */
      #killfeed {
        position: absolute; top: 120px; right: 24px;
        pointer-events: none; z-index: 10; max-width: 300px;
      }
      .killfeed-entry {
        background: rgba(0,0,0,0.7); border-left: 3px solid #ff3300;
        color: #ccc; font-size: 13px; padding: 4px 10px;
        margin-bottom: 4px; animation: killfeed-in 0.2s ease-out;
        letter-spacing: 1px;
      }
      @keyframes killfeed-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
      .killfeed-killer { color: #ff8800; font-weight: bold; }
      .killfeed-victim { color: #ff4400; }
      .killfeed-weapon { color: #888; font-size: 11px; }
      
      /* Leaderboard */
      #leaderboard {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(5,5,15,0.95); border: 2px solid #ff3300;
        min-width: 500px; padding: 20px; z-index: 50; pointer-events: none;
        display: none; font-family: 'Courier New', monospace;
      }
      .lb-title { color: #ff4400; font-size: 18px; letter-spacing: 4px; text-align: center;
        margin-bottom: 16px; text-transform: uppercase; }
      .lb-row { display: grid; grid-template-columns: 30px 1fr 80px 80px 80px;
        gap: 8px; padding: 6px 8px; border-bottom: 1px solid #1a0505; }
      .lb-row.header { color: #664400; font-size: 11px; letter-spacing: 2px; border-bottom: 2px solid #330000; }
      .lb-row.data { color: #ccc; }
      .lb-row.data:hover { background: rgba(255,50,0,0.1); }
      .lb-rank { color: #ff6600; font-weight: bold; }
      .lb-name { color: #fff; }
      .lb-kills { color: #ff4400; text-align: right; }
      .lb-money { color: #ffcc00; text-align: right; }
      .lb-health { text-align: right; }
      
      /* Death / Downed screen */
      #death-screen {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(100,0,0,0.3);
        display: none; flex-direction: column; align-items: center; justify-content: center;
        z-index: 20; pointer-events: none;
      }
      #death-screen.active { display: flex; }
      .death-title { font-size: 48px; font-weight: 900; color: #ff0000;
        text-shadow: 0 0 20px #ff0000; letter-spacing: 4px; animation: death-pulse 1s infinite; }
      @keyframes death-pulse { 0%,100%{opacity:1;} 50%{opacity:0.6;} }
      .death-sub { font-size: 18px; color: #ff8800; letter-spacing: 2px; margin-top: 8px; }
      .death-timer { font-size: 14px; color: #888; margin-top: 16px; letter-spacing: 2px; }
      
      /* Revive bar */
      #revive-bar {
        position: absolute; top: 60%; left: 50%; transform: translateX(-50%);
        width: 200px; display: none; z-index: 21; pointer-events: none;
      }
      .revive-label { color: #00ff88; font-size: 13px; text-align: center; margin-bottom: 4px; letter-spacing: 2px; }
      .revive-bg { width: 100%; height: 8px; background: rgba(0,0,0,0.7); border: 1px solid #00ff88; }
      .revive-fill { height: 100%; background: #00ff88; box-shadow: 0 0 8px #00ff44; width: 0%; transition: width 0.05s; }
      
      /* Victory / Game Over */
      #victory-screen, #gameover-screen {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        display: none; flex-direction: column; align-items: center; justify-content: center;
        z-index: 30; pointer-events: all;
        font-family: 'Courier New', monospace;
      }
      #victory-screen { background: radial-gradient(ellipse at center, #001a33 0%, #000510 100%); }
      #gameover-screen { background: radial-gradient(ellipse at center, #1a0000 0%, #050000 100%); }
      #victory-screen.active, #gameover-screen.active { display: flex; }
      .end-title { font-size: 64px; font-weight: 900; letter-spacing: 4px; margin-bottom: 8px; }
      .victory-title { color: #00ffcc; text-shadow: 0 0 30px #00ffcc, 0 0 60px #0088ff; }
      .gameover-title { color: #ff2200; text-shadow: 0 0 30px #ff4400; }
      .end-sub { font-size: 20px; color: #888; letter-spacing: 4px; margin-bottom: 40px; }
      .end-btn {
        background: linear-gradient(135deg, #0a0a1a, #1a1a3a);
        border: 2px solid #0088ff; color: #00aaff;
        font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold;
        padding: 14px 40px; cursor: pointer; letter-spacing: 3px; text-transform: uppercase;
        transition: all 0.2s;
      }
      .end-btn:hover { background: #1a1a4a; box-shadow: 0 0 20px #0088ff; transform: scale(1.05); }
      
      /* Low health overlay */
      #low-health-overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 5;
        background: radial-gradient(ellipse at center, transparent 40%, rgba(180,0,0,0.4) 100%);
        opacity: 0; transition: opacity 0.3s;
      }
      
      /* Damage flash */
      #damage-flash {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 6;
        background: rgba(255,0,0,0.3); opacity: 0;
        transition: opacity 0.1s;
      }
      
      /* Boss HP bar */
      #boss-bar {
        position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
        width: 500px; display: none; pointer-events: none;
      }
      .boss-name { color: #ff4400; font-size: 13px; text-align: center; letter-spacing: 3px; margin-bottom: 4px; text-transform: uppercase; }
      .boss-bar-bg { width: 100%; height: 16px; background: rgba(0,0,0,0.7); border: 2px solid #ff0000; }
      .boss-bar-fill { height: 100%; background: linear-gradient(90deg, #660000, #ff0000);
        box-shadow: 0 0 10px #ff0000; transition: width 0.1s; }
      .boss-bar-text { text-align: right; color: #ff4400; font-size: 12px; margin-top: 2px; }
      
      /* Notifications */
      #notifications {
        position: absolute; bottom: 180px; left: 50%; transform: translateX(-50%);
        pointer-events: none; z-index: 15; text-align: center;
      }
      .notification {
        background: rgba(0,0,0,0.8); border: 1px solid #ff8800; color: #ffcc00;
        font-size: 14px; padding: 8px 24px; margin-bottom: 6px;
        letter-spacing: 2px; animation: notif-in 0.3s ease-out;
      }
      @keyframes notif-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      
      /* Downed */
      #downed-screen {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(80,0,0,0.5);
        display: none; flex-direction: column; align-items: center; justify-content: center;
        z-index: 20; pointer-events: none;
        filter: saturate(0.3);
      }
      #downed-screen.active { display: flex; }
      #downed-screen .death-title { color: #ff8800; }
      
      /* Trap activation effect */
      .trap-active-glow {
        animation: trap-glow 0.5s infinite;
      }
      @keyframes trap-glow {
        0%,100% { box-shadow: 0 0 5px #00ffff; }
        50% { box-shadow: 0 0 20px #00ffff, 0 0 40px #0088ff; }
      }
      
      /* Speed boost indicator */
      .hud-boost {
        position: absolute; bottom: 140px; left: 24px;
        font-size: 12px; letter-spacing: 2px; padding: 4px 12px;
        border: 1px solid; margin-bottom: 4px; opacity: 0;
        transition: opacity 0.3s;
      }
      .hud-boost.active { opacity: 1; }
      .boost-speed { color: #00ffcc; border-color: #00ffcc; background: rgba(0,255,200,0.1); }
      .boost-damage { color: #ff8800; border-color: #ff8800; background: rgba(255,136,0,0.1); }
    `;
    document.head.appendChild(style);
  }

  createMenu() {
    this.menu = document.createElement('div');
    this.menu.id = 'main-menu';
    this.menu.innerHTML = `
      <div class="menu-title">☣ ZOMBIE HORDE ☣</div>
      <div class="menu-subtitle">BASE DEFENSE</div>
      <button class="menu-btn" id="btn-solo">⚔ Одиночная игра</button>
      <div class="menu-input-row">
        <input class="menu-input" id="server-url" type="text" placeholder="ws://server-url:3000" />
        <button class="menu-btn" id="btn-multi" style="min-width:180px;">🌐 Мультиплеер</button>
      </div>
      <div class="menu-hint">WASD — движение &nbsp;|&nbsp; ЛКМ — стрельба &nbsp;|&nbsp; E — взаимодействие &nbsp;|&nbsp; TAB — лидерборд</div>
      <div class="menu-version">v1.0.0 — Zombie Horde: Base Defense</div>
    `;
    this.container.appendChild(this.menu);
  }

  createHUD() {
    if (this.hud) return;
    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    this.hud.innerHTML = `
      <!-- Health -->
      <div class="hud-health-bar">
        <div class="hud-label">Здоровье</div>
        <div class="hud-bar-bg">
          <div class="hud-bar-fill" id="hud-hp-fill" style="width:100%"></div>
        </div>
        <div class="hud-bar-text" id="hud-hp-text">100 / 100</div>
      </div>
      
      <!-- Ammo -->
      <div class="hud-ammo">
        <div class="hud-weapon-name" id="hud-weapon-name">AK-47</div>
        <div class="hud-ammo-main" id="hud-ammo-mag">30</div>
        <div class="hud-ammo-reserve" id="hud-ammo-res">/ 90</div>
        <div class="hud-reload-bar" id="hud-reload-bar" style="display:none">
          <div class="hud-reload-fill" id="hud-reload-fill" style="width:0%"></div>
        </div>
      </div>
      
      <!-- Money -->
      <div class="hud-money"><span class="hud-money-icon">$</span> <span id="hud-money">0</span></div>
      
      <!-- Wave -->
      <div class="hud-wave">ВОЛНА <span id="hud-wave-num">1</span>/10</div>
      
      <!-- Kills -->
      <div class="hud-kills">УБИЙСТВА: <span id="hud-kills">0</span></div>
      
      <!-- Boosts -->
      <div class="hud-boost boost-speed" id="boost-speed">⚡ УСКОРЕНИЕ</div>
      <div class="hud-boost boost-damage" id="boost-damage">🔥 ДВОЙНОЙ УРОН</div>
      
      <!-- Wave announce -->
      <div id="wave-announce">
        <div class="wave-announce-wave">— ВОЛНА —</div>
        <div class="wave-announce-num" id="wave-announce-num">1</div>
        <div class="wave-announce-sub" id="wave-announce-sub">ПРИГОТОВЬТЕСЬ</div>
      </div>
      
      <!-- Combo -->
      <div id="combo-display">
        <div class="combo-count" id="combo-count">5x</div>
        <div class="combo-label">КОМБО</div>
        <div class="combo-bonus" id="combo-bonus"></div>
      </div>
      
      <!-- Kill feed -->
      <div id="killfeed"></div>
      
      <!-- Boss bar -->
      <div id="boss-bar">
        <div class="boss-name">☠ ШИРИБАЗАРОВ — ПОВЕЛИТЕЛЬ МЁРТВЫХ ☠</div>
        <div class="boss-bar-bg">
          <div class="boss-bar-fill" id="boss-bar-fill" style="width:100%"></div>
        </div>
        <div class="boss-bar-text" id="boss-bar-text">3000 / 3000</div>
      </div>
      
      <!-- Notifications -->
      <div id="notifications"></div>
      
      <!-- Interact prompt -->
      <div id="interact-prompt">Нажмите <kbd>E</kbd> — <span id="interact-text">взаимодействие</span></div>
      
      <!-- Low health overlay -->
      <div id="low-health-overlay"></div>
      <div id="damage-flash"></div>
    `;
    this.container.appendChild(this.hud);

    // Crosshair
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'crosshair';
    this.crosshair.innerHTML = `
      <div class="ch-line ch-top"></div>
      <div class="ch-line ch-bottom"></div>
      <div class="ch-line ch-left"></div>
      <div class="ch-line ch-right"></div>
      <div class="ch-line ch-dot"></div>
    `;
    this.container.appendChild(this.crosshair);

    // Hit marker
    this.hitMarker = document.createElement('div');
    this.hitMarker.id = 'hit-marker';
    this.hitMarker.innerHTML = `
      <div class="hm-line hm-tl"></div>
      <div class="hm-line hm-tr"></div>
      <div class="hm-line hm-bl"></div>
      <div class="hm-line hm-br"></div>
    `;
    this.container.appendChild(this.hitMarker);

    // Death screen
    this.deathScreen = document.createElement('div');
    this.deathScreen.id = 'death-screen';
    this.deathScreen.innerHTML = `
      <div class="death-title">ВЫ МЕРТВЫ</div>
      <div class="death-sub">ВОЗРОЖДЕНИЕ ПОСЛЕ ВОЛНЫ</div>
      <div class="death-timer" id="death-timer"></div>
    `;
    this.container.appendChild(this.deathScreen);

    // Downed screen
    const downedScreen = document.createElement('div');
    downedScreen.id = 'downed-screen';
    downedScreen.innerHTML = `
      <div class="death-title">☠ ПРИ СМЕРТИ</div>
      <div class="death-sub">ЗОВИТЕ НА ПОМОЩЬ!</div>
      <div class="death-timer" id="downed-timer">15с</div>
    `;
    this.container.appendChild(downedScreen);

    // Revive bar
    const reviveBar = document.createElement('div');
    reviveBar.id = 'revive-bar';
    reviveBar.innerHTML = `
      <div class="revive-label">РЕАНИМАЦИЯ...</div>
      <div class="revive-bg"><div class="revive-fill" id="revive-fill"></div></div>
    `;
    this.container.appendChild(reviveBar);

    // Leaderboard
    this.leaderboard = document.createElement('div');
    this.leaderboard.id = 'leaderboard';
    this.leaderboard.innerHTML = `
      <div class="lb-title">⚔ Таблица лидеров ⚔</div>
      <div class="lb-row header">
        <div>#</div><div>Игрок</div><div class="lb-kills">Убийств</div>
        <div class="lb-money">Деньги</div><div class="lb-health">HP</div>
      </div>
      <div id="lb-body"></div>
    `;
    this.container.appendChild(this.leaderboard);

    // Victory screen
    this.victoryScreen = document.createElement('div');
    this.victoryScreen.id = 'victory-screen';
    this.victoryScreen.innerHTML = `
      <div class="end-title victory-title">✦ ПОБЕДА ✦</div>
      <div class="end-sub">ШИРИБАЗАРОВ ПОВЕРЖЕН!</div>
      <div id="victory-stats" style="color:#ccc;margin-bottom:30px;text-align:center;letter-spacing:2px;"></div>
      <button class="end-btn" id="btn-play-again">↺ ИГРАТЬ СНОВА</button>
    `;
    this.container.appendChild(this.victoryScreen);

    // Game over screen
    this.gameOverScreen = document.createElement('div');
    this.gameOverScreen.id = 'gameover-screen';
    this.gameOverScreen.innerHTML = `
      <div class="end-title gameover-title">☠ ИГРА ОКОНЧЕНА</div>
      <div class="end-sub" id="gameover-wave">База пала на волне 1</div>
      <button class="end-btn" id="btn-play-again-go" style="border-color:#ff3300;color:#ff6600;">↺ ИГРАТЬ СНОВА</button>
    `;
    this.container.appendChild(this.gameOverScreen);

  }

  hideMenu() {
    if (this.menu) this.menu.style.display = 'none';
  }

  showMenu() {
    if (this.menu) this.menu.style.display = 'flex';
  }

  updateHUD(data: {
    health: number;
    maxHealth: number;
    ammoMag: number;
    ammoRes: number;
    weapon: string;
    money: number;
    wave: number;
    kills: number;
    isReloading: boolean;
    reloadProgress: number;
    speedBoost: boolean;
    doubleDamage: boolean;
    combo: number;
  }) {
    const hp = document.getElementById('hud-hp-fill');
    const hpText = document.getElementById('hud-hp-text');
    const ammoMag = document.getElementById('hud-ammo-mag');
    const ammoRes = document.getElementById('hud-ammo-res');
    const weapName = document.getElementById('hud-weapon-name');
    const money = document.getElementById('hud-money');
    const waveNum = document.getElementById('hud-wave-num');
    const kills = document.getElementById('hud-kills');
    const reloadBar = document.getElementById('hud-reload-bar');
    const reloadFill = document.getElementById('hud-reload-fill');
    const boostSpeed = document.getElementById('boost-speed');
    const boostDamage = document.getElementById('boost-damage');
    const lowHpOverlay = document.getElementById('low-health-overlay');

    if (!hp) return;

    const hpPct = (data.health / data.maxHealth) * 100;
    hp.style.width = hpPct + '%';
    hp.className = 'hud-bar-fill' + (hpPct < 25 ? ' critical' : '');
    if (hpText) hpText.textContent = `${Math.max(0, Math.ceil(data.health))} / ${data.maxHealth}`;

    if (ammoMag) ammoMag.textContent = data.weapon === 'pistol' ? `${data.ammoMag}` : `${data.ammoMag}`;
    if (ammoRes) {
      if (data.weapon === 'ak47') ammoRes.textContent = `/ ${data.ammoRes}`;
      else ammoRes.textContent = '∞';
    }
    if (weapName) weapName.textContent = data.weapon === 'ak47' ? 'AK-47 [7.62MM]' : 'PISTOL [9MM]';
    if (money) money.textContent = data.money.toFixed(0);
    if (waveNum) waveNum.textContent = String(data.wave);
    if (kills) kills.textContent = String(data.kills);

    if (reloadBar && reloadFill) {
      if (data.isReloading) {
        reloadBar.style.display = 'block';
        reloadFill.style.width = (data.reloadProgress * 100) + '%';
      } else {
        reloadBar.style.display = 'none';
      }
    }

    if (boostSpeed) boostSpeed.classList.toggle('active', data.speedBoost);
    if (boostDamage) boostDamage.classList.toggle('active', data.doubleDamage);
    if (lowHpOverlay) lowHpOverlay.style.opacity = hpPct < 30 ? String((1 - hpPct / 30) * 0.8) : '0';

    this.updateCombo(data.combo, data.speedBoost, data.doubleDamage);
  }

  private updateCombo(combo: number, speedBoost: boolean, doubleDamage: boolean) {
    const display = document.getElementById('combo-display');
    const count = document.getElementById('combo-count');
    const bonus = document.getElementById('combo-bonus');
    if (!display || !count || !bonus) return;

    if (combo >= 5) {
      display.style.opacity = '1';
      count.textContent = `${combo}x`;
      let bonusText = '';
      if (speedBoost) bonusText += '⚡ УСКОРЕНИЕ';
      if (doubleDamage) bonusText += (bonusText ? ' | ' : '') + '🔥 ×2 УРОН';
      bonus.textContent = bonusText;
    } else {
      display.style.opacity = '0';
    }
  }

  showHitMarker() {
    const hm = document.getElementById('hit-marker');
    if (!hm) return;
    hm.style.opacity = '1';
    this.hitMarkerTimer = 150;
  }

  showDamageFlash() {
    const flash = document.getElementById('damage-flash');
    if (!flash) return;
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 100);
  }

  setInteractPrompt(visible: boolean, text = '') {
    const el = document.getElementById('interact-prompt');
    const textEl = document.getElementById('interact-text');
    if (!el || !textEl) return;
    el.style.display = visible ? 'block' : 'none';
    if (text) textEl.textContent = text;
  }

  showWaveAnnounce(wave: number, isBoss = false) {
    const el = document.getElementById('wave-announce');
    const numEl = document.getElementById('wave-announce-num');
    const subEl = document.getElementById('wave-announce-sub');
    if (!el || !numEl || !subEl) return;
    numEl.textContent = String(wave);
    subEl.textContent = isBoss ? '⚠ ФИНАЛЬНАЯ ВОЛНА — ШИРИБАЗАРОВ ⚠' : 'ПРИГОТОВЬТЕСЬ';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  addKillfeed(killer: string, victim: string, weapon: string) {
    const container = document.getElementById('killfeed');
    if (!container) return;
    const entry = document.createElement('div');
    entry.className = 'killfeed-entry';
    entry.innerHTML = `<span class="killfeed-killer">${killer}</span> <span class="killfeed-weapon">[${weapon}]</span> <span class="killfeed-victim">${victim}</span>`;
    container.prepend(entry);
    setTimeout(() => { entry.style.opacity = '0'; entry.style.transition = 'opacity 0.5s'; setTimeout(() => entry.remove(), 500); }, 4000);
  }

  showNotification(msg: string, duration = 3000) {
    const container = document.getElementById('notifications');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, duration);
  }

  updateLeaderboard(players: Array<{ name: string; kills: number; money: number; health: number }>) {
    const body = document.getElementById('lb-body');
    if (!body) return;
    const sorted = [...players].sort((a, b) => b.kills - a.kills);
    body.innerHTML = sorted.map((p, i) => `
      <div class="lb-row data">
        <div class="lb-rank">${i + 1}</div>
        <div class="lb-name">${p.name}</div>
        <div class="lb-kills">${p.kills}</div>
        <div class="lb-money">$${p.money}</div>
        <div class="lb-health" style="color:${p.health > 50 ? '#00cc44' : '#ff4400'}">${Math.max(0, p.health)}</div>
      </div>
    `).join('');
  }

  showLeaderboard(show: boolean) {
    const lb = document.getElementById('leaderboard');
    if (lb) lb.style.display = show ? 'block' : 'none';
  }

  showDeathScreen(show: boolean, timer = 0) {
    const el = document.getElementById('death-screen');
    if (!el) return;
    el.classList.toggle('active', show);
    if (show && timer > 0) {
      const timerEl = document.getElementById('death-timer');
      if (timerEl) timerEl.textContent = `Возрождение через ${timer.toFixed(0)}с`;
    }
  }

  showDownedScreen(show: boolean, timer = 0) {
    const el = document.getElementById('downed-screen');
    if (!el) return;
    el.classList.toggle('active', show);
    if (show) {
      const timerEl = document.getElementById('downed-timer');
      if (timerEl) timerEl.textContent = `${timer.toFixed(1)}с`;
    }
  }

  showReviveBar(progress: number) {
    const bar = document.getElementById('revive-bar');
    const fill = document.getElementById('revive-fill');
    if (bar) bar.style.display = progress > 0 ? 'block' : 'none';
    if (fill) fill.style.width = (progress * 100) + '%';
  }

  updateBossBar(health: number, maxHealth: number, show: boolean) {
    const bar = document.getElementById('boss-bar');
    const fill = document.getElementById('boss-bar-fill');
    const text = document.getElementById('boss-bar-text');
    if (!bar) return;
    bar.style.display = show ? 'block' : 'none';
    if (show && fill && text) {
      fill.style.width = Math.max(0, (health / maxHealth) * 100) + '%';
      text.textContent = `${Math.max(0, Math.ceil(health))} / ${maxHealth}`;
    }
  }

  showVictory(kills: number, money: number) {
    const el = document.getElementById('victory-screen');
    const stats = document.getElementById('victory-stats');
    if (el) el.classList.add('active');
    if (stats) stats.innerHTML = `Убийств: ${kills} &nbsp;|&nbsp; Заработано: $${money}`;
  }

  showGameOver(wave: number) {
    const el = document.getElementById('gameover-screen');
    const waveEl = document.getElementById('gameover-wave');
    if (el) el.classList.add('active');
    if (waveEl) waveEl.textContent = `База пала на волне ${wave}`;
  }

  update(dt: number) {
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt * 1000;
      if (this.hitMarkerTimer <= 0) {
        const hm = document.getElementById('hit-marker');
        if (hm) hm.style.opacity = '0';
      }
    }
  }
}
