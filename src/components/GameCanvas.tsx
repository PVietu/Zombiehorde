import { useEffect, useRef } from 'react';
import type { GameConfig } from '../App';
import { ZombieGame } from '../game/ZombieGame';

interface Props {
  config: GameConfig;
  onReturn: () => void;
}

// Three.js CDN URL
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const SOCKETIO_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }

    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export function GameCanvas({ config, onReturn }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ZombieGame | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    (window as any).__GAME_RETURN__ = onReturn;

    let destroyed = false;

    const init = async () => {
      try {
        // Load Three.js first
        if (typeof (window as any).THREE === 'undefined') {
          await loadScript(THREE_CDN);
        }

        // Load Socket.IO if multiplayer
        if (config.mode === 'multiplayer' && typeof (window as any).io === 'undefined') {
          try {
            await loadScript(SOCKETIO_CDN);
          } catch {
            console.warn('Socket.IO failed to load, continuing without multiplayer');
          }
        }

        if (destroyed || !containerRef.current) return;

        const game = new ZombieGame(containerRef.current, config);
        gameRef.current = game;
        (window as any).__game__ = game;
      } catch (err) {
        console.error('Failed to initialize game:', err);
      }
    };

    init();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        gameRef.current.destroy();
        gameRef.current = null;
      }
      (window as any).__game__ = null;
      (window as any).__GAME_RETURN__ = null;
    };
  }, [config, onReturn]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#000',
        position: 'relative',
      }}
    />
  );
}
