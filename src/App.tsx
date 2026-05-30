import { useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { GameCanvas } from './components/GameCanvas';

export type GameMode = 'menu' | 'solo' | 'multiplayer';

export interface GameConfig {
  mode: GameMode;
  serverUrl?: string;
}

export default function App() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);

  const startGame = (config: GameConfig) => {
    setGameConfig(config);
  };

  const returnToMenu = () => {
    setGameConfig(null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      {!gameConfig && <MainMenu onStart={startGame} />}
      {gameConfig && <GameCanvas config={gameConfig} onReturn={returnToMenu} />}
    </div>
  );
}
