import { useState } from 'react';
import type { GameConfig } from '../App';

interface Props {
  onStart: (config: GameConfig) => void;
}

export function MainMenu({ onStart }: Props) {
  const [showServerInput, setShowServerInput] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [error, setError] = useState('');

  const startSolo = () => {
    onStart({ mode: 'solo' });
  };

  const startMultiplayer = () => {
    if (!serverUrl.trim()) {
      setError('Введите URL сервера');
      return;
    }
    setError('');
    onStart({ mode: 'multiplayer', serverUrl: serverUrl.trim() });
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'linear-gradient(135deg, #050a05 0%, #0a1a0a 50%, #050505 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace",
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Animated background particles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 2, height: 2,
            background: `rgba(${Math.random() > 0.5 ? '68,255,68' : '255,68,68'},0.4)`,
            borderRadius: '50%',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 4}s`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0) scale(1);opacity:0.4} 50%{transform:translateY(-20px) scale(1.5);opacity:1} }
        @keyframes titlePulse { 0%,100%{text-shadow:0 0 20px #ff4444,0 0 40px #ff2222} 50%{text-shadow:0 0 40px #ff4444,0 0 80px #ff2222,0 0 120px #ff0000} }
        @keyframes menuFadeIn { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes btnGlow { 0%,100%{box-shadow:0 0 10px rgba(68,255,68,0.3)} 50%{box-shadow:0 0 25px rgba(68,255,68,0.6),0 0 40px rgba(68,255,68,0.3)} }
        .menu-btn {
          width: 100%; padding: 16px 24px;
          background: rgba(0, 30, 0, 0.8);
          border: 1px solid #44ff44;
          border-radius: 6px;
          color: #44ff44; font-size: 16px; font-weight: bold;
          font-family: 'Courier New', monospace;
          cursor: pointer; letter-spacing: 2px;
          transition: all 0.2s;
          animation: btnGlow 2s infinite;
          position: relative; overflow: hidden;
        }
        .menu-btn:hover {
          background: rgba(68,255,68,0.15);
          transform: translateY(-2px);
          box-shadow: 0 0 30px rgba(68,255,68,0.5);
        }
        .menu-btn:active { transform: translateY(0); }
        .menu-btn.danger {
          border-color: #ff4444; color: #ff4444;
          animation: none;
          box-shadow: 0 0 10px rgba(255,68,68,0.3);
        }
        .menu-btn.danger:hover {
          background: rgba(255,68,68,0.15);
          box-shadow: 0 0 30px rgba(255,68,68,0.5);
        }
        .server-input {
          width: 100%; padding: 12px 16px;
          background: rgba(0,0,0,0.7);
          border: 1px solid rgba(68,255,136,0.5);
          border-radius: 4px; color: #88ff88;
          font-size: 13px; font-family: 'Courier New', monospace;
          outline: none;
          box-shadow: inset 0 0 10px rgba(68,255,136,0.1);
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .server-input:focus { border-color: #44ff88; }
        .connect-btn {
          width: 100%; padding: 12px;
          background: rgba(68,255,136,0.15);
          border: 1px solid #44ff88;
          border-radius: 4px; color: #44ff88;
          font-size: 14px; font-family: 'Courier New', monospace;
          cursor: pointer; font-weight: bold; letter-spacing: 1px;
          transition: all 0.2s;
        }
        .connect-btn:hover { background: rgba(68,255,136,0.3); }
      `}</style>

      <div style={{
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(68,255,68,0.3)',
        borderRadius: '12px',
        padding: '48px 56px',
        width: '480px',
        animation: 'menuFadeIn 0.5s ease',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 0 60px rgba(68,255,68,0.1), inset 0 0 60px rgba(0,0,0,0.5)',
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🧟</div>
          <h1 style={{
            color: '#ff4444', margin: 0,
            fontSize: '36px', fontWeight: 'bold',
            letterSpacing: '4px',
            animation: 'titlePulse 2s infinite',
          }}>ZOMBIE HORDE</h1>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', letterSpacing: '3px', marginTop: '8px' }}>
            MULTIPLAYER 3D SURVIVAL
          </div>
        </div>

        {/* Version & credits */}
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '10px', marginBottom: '32px' }}>
          v2.0.0 | Three.js r128 | Socket.IO
        </div>

        {/* Feature highlights */}
        <div style={{ marginBottom: '28px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {['10 Волн', '5 Типов врагов', 'Мультиплеер', 'Апгрейды', 'Ловушки'].map(tag => (
            <span key={tag} style={{
              padding: '3px 10px',
              background: 'rgba(68,255,68,0.08)',
              border: '1px solid rgba(68,255,68,0.2)',
              borderRadius: '20px',
              color: 'rgba(68,255,68,0.7)',
              fontSize: '10px', letterSpacing: '1px',
            }}>{tag}</span>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="menu-btn" onClick={startSolo}>
            ⚔️ ОДИНОЧНАЯ ИГРА
          </button>

          <button
            className="menu-btn danger"
            onClick={() => setShowServerInput(!showServerInput)}
          >
            🌐 ПОДКЛЮЧИТЬСЯ К СЕРВЕРУ
          </button>

          {showServerInput && (
            <div style={{
              background: 'rgba(0,20,0,0.6)',
              border: '1px solid rgba(68,255,136,0.2)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              <label style={{ color: 'rgba(68,255,136,0.7)', fontSize: '12px', letterSpacing: '1px' }}>
                WebSocket URL сервера:
              </label>
              <input
                className="server-input"
                placeholder="wss://xxxx.ngrok-free.dev"
                value={serverUrl}
                onChange={e => { setServerUrl(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && startMultiplayer()}
                autoFocus
              />
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>
                Формат: wss://hostname или ws://localhost:3000
              </div>
              {error && (
                <div style={{ color: '#ff4444', fontSize: '12px' }}>❌ {error}</div>
              )}
              <button className="connect-btn" onClick={startMultiplayer}>
                🔗 ПОДКЛЮЧИТЬСЯ
              </button>
            </div>
          )}
        </div>

        {/* Controls reference */}
        <div style={{
          marginTop: '28px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '20px',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '6px',
        }}>
          {[
            ['WASD', 'Движение'], ['Shift', 'Спринт'],
            ['ЛКМ', 'Стрельба'], ['ПКМ', 'Прицел'],
            ['1/2', 'АК / Пистолет'], ['R', 'Перезарядка'],
            ['E', 'Взаимодействие'], ['G', 'Граната'],
            ['F', 'Баррикада'], ['Tab', 'Лидерборд'],
            ['M', 'Мини-карта'], ['Space', 'Прыжок'],
          ].map(([key, action]) => (
            <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '3px', padding: '2px 6px',
                color: '#ffdd44', fontSize: '10px', fontWeight: 'bold',
                minWidth: '32px', textAlign: 'center',
              }}>{key}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
