import { useEffect, useRef } from 'react';
import type { GameConfig } from '../App';
import { ZombieGame } from '../game/ZombieGame';

interface GameCanvasProps {
  config: GameConfig;
  onReturn: () => void;
}

export function GameCanvas({ config, onReturn }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ZombieGame | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    (window as any).__GAME_RETURN__ = onReturn;

    let game: ZombieGame | null = null;

    const initGame = () => {
      if (!containerRef.current) return;
      game = new ZombieGame(containerRef.current, config);
      gameRef.current = game;
      (window as any).__game__ = game;
    };

    if (config.mode === 'multiplayer' && !(window as any).io) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js';
      script.onload = () => initGame();
      script.onerror = () => {
        console.warn('Socket.IO load failed, using solo mode');
        initGame();
      };
      document.head.appendChild(script);
    } else {
      initGame();
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy();
        gameRef.current = null;
      }
      (window as any).__game__ = null;
    };
  }, [config, onReturn]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}
    />
  );
}
