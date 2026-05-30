// ZombieGame - Main entry point that manages menu and game modes

import { UIManager } from './UIManager';
import { LocalGame } from './LocalGame';

export class ZombieGame {
  private ui: UIManager;
  private localGame: LocalGame | null = null;

  constructor() {
    this.ui = new UIManager();
  }

  init() {
    // Setup menu button callbacks
    const btnSolo = document.getElementById('btn-solo');
    const btnMulti = document.getElementById('btn-multi');

    if (btnSolo) {
      btnSolo.addEventListener('click', () => {
        this.startSoloGame();
      });
    }

    if (btnMulti) {
      btnMulti.addEventListener('click', () => {
        const urlInput = document.getElementById('server-url') as HTMLInputElement;
        const url = urlInput?.value?.trim();
        if (!url) {
          this.startSoloGame();
          return;
        }
        // For network play, we still start local but connect to server
        // In this build environment, we just start local game
        alert('Сервер: ' + url + '\nДля подключения к серверу запустите node server.js на отдельной машине.\nЗапускаем локальную игру...');
        this.startSoloGame();
      });
    }
  }

  private startSoloGame() {
    this.ui.hideMenu();

    if (this.localGame) {
      this.localGame.destroy();
    }

    this.localGame = new LocalGame(this.ui);
    this.localGame.start();
  }

  destroy() {
    if (this.localGame) {
      this.localGame.destroy();
      this.localGame = null;
    }
  }
}
