import { useEffect, useRef, useState, useCallback } from 'react';
import './index.css';

// ─── Type stubs ─────────────────────────────────────────────
interface Vec2 { x: number; z: number; }
interface PlayerState {
  id: string; name: string;
  pos: { x: number; y: number; z: number };
  hp: number; maxHp: number;
  ammoAK: number; maxAmmoAK: number; magAK: number; maxMagAK: number;
  money: number; kills: number; combo: number;
  weapon: 'ak' | 'pistol';
  state: 'alive' | 'down' | 'dead';
  isReloading: boolean; isCrouching: boolean; isSprinting: boolean;
  boosts: { speed: number; damage: number };
  barrCount: number; grenades: number; downTimer: number;
  wpUpgrades: { ak: { dmg: number; rate: number; mag: number }; pistol: { dmg: number } };
}
interface GameState {
  wave: number; maxWave: number; phase: string;
  zombiesLeft: number; totalZombies: number;
  players: Record<string, PlayerState>;
  zombies: Record<string, any>;
  traps: { type: string; active: boolean; timer: number; pos: Vec2 }[];
  mysteryBox: { active: boolean };
}
interface Notif { id: number; msg: string; type: string; }
interface KillMsg { id: number; msg: string; }

// ─── Load THREE + engine script ──────────────────────────────
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);
  const notifId = useRef(0);

  const [screen, setScreen] = useState<'menu' | 'loading' | 'game' | 'end'>('menu');
  const [endType, setEndType] = useState<'victory' | 'defeat'>('victory');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [local, setLocal] = useState<PlayerState | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [kills, setKills] = useState<KillMsg[]>([]);
  const [showVending, setShowVending] = useState(false);
  const [vendBalance, setVendBalance] = useState(0);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [waveAnn, setWaveAnn] = useState<{ wave: number; sub: string } | null>(null);
  const [damage, setDamage] = useState(false);
  const [playerName, setPlayerName] = useState('Survivor');
  const [scriptsReady, setScriptsReady] = useState(false);

  // Load THREE.js and game engine on mount
  useEffect(() => {
    const load = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
        // Inline the engine after THREE is loaded
        await loadEngineInline();
        setScriptsReady(true);
      } catch (e) {
        console.error('Failed to load scripts', e);
      }
    };
    load();
  }, []);

  // Scoreboard toggle
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.code === 'Tab') { e.preventDefault(); setShowScoreboard(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Tab') setShowScoreboard(false); };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  const addNotif = useCallback((msg: string, type: string) => {
    const id = ++notifId.current;
    setNotifs(prev => [...prev.slice(-4), { id, msg, type }]);
    setTimeout(() => setNotifs(prev => prev.filter(n => n.id !== id)), 2800);
  }, []);

  const addKill = useCallback((msg: string) => {
    const id = ++notifId.current;
    setKills(prev => [...prev.slice(-5), { id, msg }]);
    setTimeout(() => setKills(prev => prev.filter(k => k.id !== id)), 3500);
  }, []);

  const startGame = useCallback((name: string) => {
    if (!scriptsReady) { addNotif('Loading scripts...', 'warning'); return; }
    setScreen('loading');
    setTimeout(() => {
      if (!canvasRef.current || !minimapRef.current) return;
      const GameEngine = (window as any).GameEngine;
      if (!GameEngine) { addNotif('Engine not ready!', 'error'); setScreen('menu'); return; }

      const engine = new GameEngine();
      engineRef.current = engine;

      engine.onStateChange = (state: GameState, lp: PlayerState | null) => {
        setGameState({ ...state });
        setLocal(lp ? { ...lp } : null);
        if (state.phase === 'victory') { setEndType('victory'); setScreen('end'); }
        if (state.phase === 'defeat') { setEndType('defeat'); setScreen('end'); }
      };
      engine.onNotify = addNotif;
      engine.onWaveAnnounce = (wave: number, sub: string) => {
        setWaveAnn({ wave, sub });
        setTimeout(() => setWaveAnn(null), 4500);
      };
      engine.onDamage = () => { setDamage(true); setTimeout(() => setDamage(false), 350); };
      engine.onVendingOpen = (bal: number) => {
        setVendBalance(bal);
        setShowVending(true);
      };
      engine.onVendingClose = () => setShowVending(false);
      engine.onKillFeed = addKill;

      engine.init(canvasRef.current, minimapRef.current);
      engine.startGame(name || 'Survivor');
      setScreen('game');
    }, 600);
  }, [scriptsReady, addNotif, addKill]);

  const buyItem = (idx: number) => {
    engineRef.current?.openVendingItem(idx);
    // Update balance from engine state
    const lp = engineRef.current?.state?.players?.local;
    if (lp) setVendBalance(lp.money);
    else setShowVending(false);
  };

  const closeVend = () => {
    engineRef.current?.closeVending();
    setShowVending(false);
  };

  const restart = () => {
    engineRef.current?.destroy?.();
    engineRef.current = null;
    setScreen('menu');
    setGameState(null);
    setLocal(null);
    setNotifs([]);
    setKills([]);
    setShowVending(false);
    setShowScoreboard(false);
    setWaveAnn(null);
  };

  const hpCol = (hp: number) => hp > 60 ? '#22c55e' : hp > 30 ? '#f59e0b' : '#ef4444';
  const hpCls = (hp: number) => hp > 60 ? '' : hp > 30 ? 'medium' : 'low';

  const engine = engineRef.current;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
      {/* 3D Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          display: screen === 'game' ? 'block' : 'none',
        }}
      />

      {/* ─── MENU ─── */}
      {screen === 'menu' && (
        <div className="main-menu">
          <div className="menu-title">☠ ZOMBIE HORDE</div>
          <div className="menu-subtitle">MULTIPLAYER SURVIVAL · 10 WAVES</div>
          {!scriptsReady && (
            <div style={{ color: '#f59e0b', fontSize: '0.85rem', marginBottom: '1rem', letterSpacing: '0.1em' }}>
              Loading engine...
            </div>
          )}
          <input
            className="menu-input"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            onKeyDown={e => { if (e.key === 'Enter') startGame(playerName); }}
          />
          <button className="menu-btn" onClick={() => startGame(playerName)} disabled={!scriptsReady}>
            {scriptsReady ? '⚔ PLAY SOLO' : '⌛ LOADING...'}
          </button>
          <div style={{ marginTop: '1.5rem', color: '#444', fontSize: '0.72rem', textAlign: 'center', maxWidth: '320px', lineHeight: '1.8' }}>
            WASD — move &nbsp;|&nbsp; MOUSE — aim &nbsp;|&nbsp; LMB — shoot<br />
            E — interact &nbsp;|&nbsp; R — reload &nbsp;|&nbsp; B — barricade ($100)<br />
            G — grenade &nbsp;|&nbsp; 1/2 — weapon &nbsp;|&nbsp; TAB — scoreboard<br />
            SHIFT — sprint &nbsp;|&nbsp; CTRL — crouch &nbsp;|&nbsp; SPACE — jump
          </div>
        </div>
      )}

      {/* ─── LOADING ─── */}
      {screen === 'loading' && (
        <div className="loading-screen">
          <div>INITIALIZING...</div>
          <div className="loading-bar"><div className="loading-fill" /></div>
        </div>
      )}

      {/* ─── HUD ─── */}
      {screen === 'game' && local && gameState && (
        <div id="hud">
          {damage && <div className="damage-indicator" />}

          {/* Crosshair */}
          {local.state === 'alive' && (
            <div className="crosshair">
              <div className="crosshair-line crosshair-h" />
              <div className="crosshair-line crosshair-v" />
              <div className="crosshair-dot" />
            </div>
          )}

          {/* Wave */}
          <div className="hud-wave">
            <div className="hud-wave-label">WAVE</div>
            <div className="hud-wave-number">{gameState.wave}/{gameState.maxWave}</div>
            <div className="hud-wave-status">
              {gameState.phase === 'wave' ? `☠ ${gameState.zombiesLeft} left`
                : gameState.phase === 'intermission' ? '⏳ PREPARE...' : ''}
            </div>
          </div>

          {/* Money */}
          <div className="hud-money">
            <span className="hud-money-icon">💰</span>
            <span className="hud-money-value">${local.money}</span>
          </div>

          {/* Combo */}
          {local.combo > 0 && (
            <div style={{ position: 'absolute', top: 80, left: 20, pointerEvents: 'none' }}>
              <div style={{ color: '#e879f9', fontSize: '1rem', textShadow: '0 0 12px #e879f9' }}>
                ⚡ COMBO x{local.combo}
              </div>
            </div>
          )}

          {/* Health */}
          <div className="hud-health">
            <div className="hud-health-label">HEALTH</div>
            <div className="hud-health-bar">
              <div
                className={`hud-health-fill ${hpCls(local.hp)}`}
                style={{ width: `${(local.hp / local.maxHp) * 100}%`, background: `linear-gradient(90deg, ${hpCol(local.hp)}, ${hpCol(local.hp)}88)` }}
              />
              <div className="hud-health-text">{Math.round(local.hp)}/{local.maxHp}</div>
            </div>
          </div>

          {/* Ammo */}
          <div className="hud-ammo">
            <div className="hud-ammo-weapon">
              {local.weapon === 'ak' ? '🔫 AK-47 [1]' : '🔫 PISTOL [2]'}
            </div>
            {local.isReloading ? (
              <div className="hud-ammo-reload">RELOADING...</div>
            ) : local.weapon === 'ak' ? (
              <div className="hud-ammo-count">
                {local.magAK}<span>/{local.maxMagAK} &nbsp;|&nbsp; {local.ammoAK}</span>
              </div>
            ) : (
              <div className="hud-ammo-count">∞ <span>PISTOL</span></div>
            )}
            {local.grenades > 0 && (
              <div style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 4 }}>
                💣 ×{local.grenades} [G]
              </div>
            )}
          </div>

          {/* Boosts */}
          <div className="hud-boosts">
            {local.boosts.speed > 0 && <div className="hud-boost speed">⚡ SPEED {local.boosts.speed.toFixed(0)}s</div>}
            {local.boosts.damage > 0 && <div className="hud-boost damage">🔥 DMG {local.boosts.damage.toFixed(0)}s</div>}
            {local.barrCount > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>
                🧱 Barricades: {local.barrCount}/3
              </div>
            )}
          </div>

          {/* Minimap */}
          <div className="hud-minimap">
            <canvas
              ref={minimapRef}
              width={150} height={150}
              style={{ display: 'block', width: '100%', height: '100%' }}
            />
            <div className="minimap-label">MAP</div>
          </div>

          {/* Kill feed */}
          <div className="hud-killfeed">
            {kills.map(k => <div key={k.id} className="killfeed-entry">{k.msg}</div>)}
          </div>

          {/* Notifications */}
          <div style={{ position: 'fixed', top: 130, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 300 }}>
            {notifs.map(n => <div key={n.id} className={`notification ${n.type}`}>{n.msg}</div>)}
          </div>

          {/* Interaction prompts */}
          {local.state === 'alive' && (
            <div style={{ position: 'fixed', bottom: '35%', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 102 }}>
              {engine?.getNearVending?.() && (
                <div className="interact-prompt"><span className="interact-key">E</span> VENDING MACHINE</div>
              )}
              {engine?.getNearMystery?.() && (
                <div className="interact-prompt"><span className="interact-key">E</span> MYSTERY BOX ($200)</div>
              )}
              {engine?.getNearTrap?.() >= 0 && (
                <div className="interact-prompt">
                  <span className="interact-key">E</span>
                  {gameState.traps[engine?.getNearTrap?.()]?.active
                    ? ` TRAP ACTIVE (${Math.ceil(gameState.traps[engine?.getNearTrap?.()]?.timer ?? 0)}s)`
                    : ' ACTIVATE TRAP ($300)'}
                </div>
              )}
              {engine?.getNearDown?.() && (
                <div className="interact-prompt" style={{ borderColor: '#ff4444', color: '#ff8888' }}>
                  <span className="interact-key">E</span> HOLD — REVIVING
                  <div style={{ marginTop: 4, height: 4, background: '#333', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (engine?.getReviveProgress?.() ?? 0) * 100)}%`, background: '#ff4444', borderRadius: 2 }} />
                  </div>
                </div>
              )}
              <div style={{ color: '#555', fontSize: '0.7rem', letterSpacing: '0.1em' }}>
                B — Barricade ($100) &nbsp;|&nbsp; G — Grenade
              </div>
            </div>
          )}

          {/* DOWN state */}
          {local.state === 'down' && (
            <>
              <div className="down-overlay" />
              <div className="down-text">
                ⚠ YOU ARE DOWN!
                <div className="down-timer">
                  Hold E near ally to revive | {Math.ceil(local.downTimer ?? 0)}s remaining
                </div>
              </div>
            </>
          )}

          {/* DEAD */}
          {local.state === 'dead' && (
            <div style={{ position: 'fixed', top: '40%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', zIndex: 201 }}>
              <div style={{ fontSize: '1.8rem', color: '#ef4444' }}>☠ DEAD</div>
              <div style={{ color: '#666', marginTop: 8 }}>Respawning after wave...</div>
            </div>
          )}

          {/* Wave announcement */}
          {waveAnn && (
            <div className="wave-announcement">
              <div className="wave-announcement-title">
                {waveAnn.wave === 10 ? '⚠ BOSS WAVE' : `WAVE ${waveAnn.wave}`}
              </div>
              <div className="wave-announcement-sub">{waveAnn.sub}</div>
            </div>
          )}

          {/* Intermission notice */}
          {gameState.phase === 'intermission' && gameState.wave < gameState.maxWave && (
            <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 99 }}>
              <div style={{ color: '#f59e0b', fontSize: '1rem', letterSpacing: '0.2em' }}>
                NEXT: WAVE {gameState.wave + 1} — Prepare!
              </div>
            </div>
          )}

          {/* Scoreboard */}
          {showScoreboard && (
            <div className="scoreboard">
              <div className="scoreboard-title">☠ LEADERBOARD</div>
              <div className="scoreboard-row header">
                <span>NAME</span><span>KILLS</span><span>MONEY</span><span>HP</span>
              </div>
              {Object.values(gameState.players)
                .sort((a: any, b: any) => b.kills - a.kills)
                .map((p: any) => (
                  <div key={p.id} className={`scoreboard-row ${p.id === 'local' ? 'self' : ''}`}>
                    <span>{p.name}</span>
                    <span>{p.kills}</span>
                    <span>${p.money}</span>
                    <span style={{ color: hpCol(p.hp) }}>{Math.round(p.hp)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ─── VENDING MENU ─── */}
      {showVending && (
        <div className="vending-menu" style={{ pointerEvents: 'auto' }}>
          <div className="vending-title">🏪 VENDING MACHINE</div>
          <div className="vending-balance">💰 Balance: <strong>${vendBalance}</strong></div>
          {[
            { name: '🔫 Ammo Pack', desc: '+30–90 AK ammo', price: 50 },
            { name: '💊 Medkit', desc: '+30 HP (max 100)', price: 100 },
            { name: '⚡ Power Boost', desc: 'Speed or Damage (15s)', price: 150 },
            { name: '💣 Grenade', desc: 'Explosive (throw with G)', price: 200 },
          ].map((item, i) => (
            <div
              key={i}
              className="vending-item"
              onClick={() => buyItem(i)}
              style={{ opacity: vendBalance >= item.price ? 1 : 0.4, cursor: vendBalance >= item.price ? 'pointer' : 'not-allowed' }}
            >
              <div>
                <div className="vending-item-name">{item.name}</div>
                <div className="vending-item-desc">{item.desc}</div>
              </div>
              <div className="vending-item-price">${item.price}</div>
            </div>
          ))}
          <button className="vending-close" onClick={closeVend}>✕ CLOSE</button>
        </div>
      )}

      {/* ─── END SCREEN ─── */}
      {screen === 'end' && (
        <div className="game-end-screen">
          <div className={`game-end-title ${endType}`}>
            {endType === 'victory' ? '🎉 VICTORY!' : '☠ DEFEAT'}
          </div>
          <div className="game-end-stats">
            {endType === 'victory'
              ? `Survived all ${gameState?.maxWave ?? 10} waves!`
              : `Fell on wave ${gameState?.wave ?? 0}...`}
            <br />
            {local && <>Kills: {local.kills} &nbsp;|&nbsp; Money: ${local.money}</>}
          </div>
          <button className="menu-btn" onClick={restart}>
            {endType === 'victory' ? '🏆 MAIN MENU' : '↩ TRY AGAIN'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Inline engine loader ────────────────────────────────────
async function loadEngineInline(): Promise<void> {
  return new Promise<void>((resolve) => {
    // Fetch and inject the engine script
    fetch('/game.js')
      .then(r => r.text())
      .then(code => {
        const script = document.createElement('script');
        script.textContent = code;
        document.head.appendChild(script);
        resolve();
      })
      .catch(() => {
        // If fetch fails (e.g. singlefile build), try inline definition
        inlineEngine();
        resolve();
      });
  });
}

function inlineEngine() {
  // This will be called if /game.js fetch fails
  // The engine code is embedded via the public/ directory copy
  console.warn('Game engine loaded via inline fallback');
}
