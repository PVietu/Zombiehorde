import { useState } from 'react';
import type { GameConfig } from '../App';

interface MainMenuProps {
  onStart: (config: GameConfig) => void;
}

export function MainMenu({ onStart }: MainMenuProps) {
  const [showServerInput, setShowServerInput] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  const startSolo = () => {
    onStart({ mode: 'solo' });
  };

  const startMultiplayer = () => {
    if (showServerInput && serverUrl.trim()) {
      onStart({ mode: 'multiplayer', serverUrl: serverUrl.trim() });
    } else {
      setShowServerInput(true);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 40%, #0f1a0a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Courier New', monospace", color: '#e0e0e0', zIndex: 1000,
      overflow: 'hidden'
    }}>
      {/* Animated background particles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: `${Math.random() * 3 + 1}px`,
            height: `${Math.random() * 3 + 1}px`,
            background: i % 3 === 0 ? '#ff3333' : i % 3 === 1 ? '#33ff55' : '#ffaa00',
            borderRadius: '50%',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
            opacity: 0.4
          }} />
        ))}
      </div>

      {/* Blood splatter effects */}
      <div style={{ position: 'absolute', top: '10%', left: '5%', opacity: 0.08, fontSize: '200px', color: '#ff0000', userSelect: 'none' }}>💀</div>
      <div style={{ position: 'absolute', bottom: '10%', right: '5%', opacity: 0.08, fontSize: '150px', color: '#ff0000', userSelect: 'none' }}>🧟</div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '50px', position: 'relative' }}>
        <div style={{
          fontSize: 'clamp(36px, 8vw, 72px)',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          background: 'linear-gradient(180deg, #ff4444 0%, #cc0000 50%, #880000 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: 'none',
          filter: 'drop-shadow(0 0 20px rgba(255,50,50,0.7))',
          lineHeight: 1.1
        }}>
          ZOMBIE
        </div>
        <div style={{
          fontSize: 'clamp(24px, 5vw, 48px)',
          fontWeight: 'bold',
          letterSpacing: '0.3em',
          color: '#88ff44',
          textShadow: '0 0 20px rgba(136,255,68,0.8)',
          textTransform: 'uppercase'
        }}>
          HORDE
        </div>
        <div style={{
          fontSize: 'clamp(10px, 2vw, 14px)',
          color: '#666',
          letterSpacing: '0.5em',
          marginTop: '8px',
          textTransform: 'uppercase'
        }}>
          ★ MULTIPLAYER SURVIVAL ★
        </div>

        {/* Decorative line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px', justifyContent: 'center' }}>
          <div style={{ width: '80px', height: '2px', background: 'linear-gradient(to right, transparent, #ff4444)' }} />
          <div style={{ color: '#ff4444', fontSize: '20px' }}>☣</div>
          <div style={{ width: '80px', height: '2px', background: 'linear-gradient(to left, transparent, #ff4444)' }} />
        </div>
      </div>

      {/* Game info */}
      <div style={{
        display: 'flex', gap: '40px', marginBottom: '40px',
        fontSize: 'clamp(10px, 1.5vw, 12px)', color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em'
      }}>
        <span>⚔ 10 Волн</span>
        <span>🧟 3 типа зомби</span>
        <span>👑 Босс Ширибазаров</span>
        <span>🤝 Мультиплеер</span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: 'clamp(280px, 40vw, 400px)' }}>
        {/* Solo button */}
        <button
          onClick={startSolo}
          style={{
            padding: '16px 32px',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '2px solid #ff4444',
            borderRadius: '4px',
            color: '#ff8888',
            fontSize: '18px',
            fontFamily: 'inherit',
            fontWeight: 'bold',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 0 15px rgba(255,68,68,0.3)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.background = 'linear-gradient(135deg, #2a1a1a 0%, #3a1616 100%)';
            (e.target as HTMLButtonElement).style.boxShadow = '0 0 30px rgba(255,68,68,0.6)';
            (e.target as HTMLButtonElement).style.color = '#ffffff';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
            (e.target as HTMLButtonElement).style.boxShadow = '0 0 15px rgba(255,68,68,0.3)';
            (e.target as HTMLButtonElement).style.color = '#ff8888';
          }}
        >
          🎮 Одиночная игра
        </button>

        {/* Multiplayer button */}
        <button
          onClick={startMultiplayer}
          style={{
            padding: '16px 32px',
            background: 'linear-gradient(135deg, #0a1a0a 0%, #0d1f0d 100%)',
            border: '2px solid #44ff88',
            borderRadius: '4px',
            color: '#88ff88',
            fontSize: '18px',
            fontFamily: 'inherit',
            fontWeight: 'bold',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 0 15px rgba(68,255,136,0.3)',
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.background = 'linear-gradient(135deg, #0a2a0a 0%, #0d3a0d 100%)';
            (e.target as HTMLButtonElement).style.boxShadow = '0 0 30px rgba(68,255,136,0.6)';
            (e.target as HTMLButtonElement).style.color = '#ffffff';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.background = 'linear-gradient(135deg, #0a1a0a 0%, #0d1f0d 100%)';
            (e.target as HTMLButtonElement).style.boxShadow = '0 0 15px rgba(68,255,136,0.3)';
            (e.target as HTMLButtonElement).style.color = '#88ff88';
          }}
        >
          🌐 Подключиться к серверу
        </button>

        {/* Server URL input */}
        {showServerInput && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              WebSocket URL сервера:
            </div>
            <input
              type="text"
              placeholder="wss://your-server.ngrok-free.dev/ws/"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startMultiplayer()}
              style={{
                padding: '12px 16px',
                background: '#0a0a0f',
                border: '1px solid #44ff88',
                borderRadius: '4px',
                color: '#88ff88',
                fontSize: '13px',
                fontFamily: 'monospace',
                outline: 'none',
                boxShadow: 'inset 0 0 10px rgba(68,255,136,0.1)'
              }}
            />
            <div style={{ fontSize: '10px', color: '#555', letterSpacing: '0.05em' }}>
              Формат: wss://hostname/ws/ или ws://hostname/ws/
            </div>
            <button
              onClick={startMultiplayer}
              style={{
                padding: '10px',
                background: '#44ff88',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                fontSize: '14px',
                fontFamily: 'inherit',
                fontWeight: 'bold',
                cursor: 'pointer',
                letterSpacing: '0.1em',
                textTransform: 'uppercase'
              }}
            >
              ▶ Подключиться
            </button>
          </div>
        )}
      </div>

      {/* Controls info */}
      <div style={{
        marginTop: '50px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        maxWidth: '600px',
        width: '90%',
        fontSize: '11px',
        color: '#555',
        textAlign: 'center'
      }}>
        <div><span style={{ color: '#888' }}>WASD</span><br />Движение</div>
        <div><span style={{ color: '#888' }}>ЛКМ</span><br />Стрельба</div>
        <div><span style={{ color: '#888' }}>E</span><br />Взаимодействие</div>
        <div><span style={{ color: '#888' }}>1/2</span><br />АК-47 / Пистолет</div>
        <div><span style={{ color: '#888' }}>Shift</span><br />Спринт</div>
        <div><span style={{ color: '#888' }}>Tab</span><br />Лидерборд</div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.2); }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
