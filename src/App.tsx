import { useEffect, useRef } from 'react';
import { ZombieGame } from './game/ZombieGame';

export default function App() {
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Start the game
    const game = new ZombieGame();
    game.init();

    return () => {
      game.destroy();
    };
  }, []);

  return <div id="game-root" style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }} />;
}
