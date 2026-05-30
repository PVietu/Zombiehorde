# ☠ Zombie Horde — Multiplayer 3D Browser Shooter

A fully-featured multiplayer zombie survival game built with Three.js, React, and Node.js.

## 🎮 Features

- **10 waves** of increasingly difficult enemies
- **4 zombie types**: Normal, Exploder, Acid, Boss (Shiribazarov)
- **2 weapons**: AK-47 (auto) + Pistol (infinite)
- **Vending Machine**: Buy ammo, medkits, boosts, grenades
- **Mystery Box**: Random weapon upgrades ($200)
- **2 Traps**: Electric field + Flamethrower ($300 each)
- **Barricades**: Build cover ($100, max 3 per player)
- **Grenades**: Explosive throwables
- **Combo system**: 5/10/15 kill combos with special effects
- **Revive system**: Allies can revive downed players
- **Minimap**: Real-time map with enemies, items, players
- **Fireworks** on victory
- **Full particle effects**: Blood, explosions, acid pools, tracers

## 🕹 Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Aim |
| LMB | Shoot |
| RMB | Aim Down Sights |
| Shift | Sprint |
| Ctrl | Crouch |
| Space | Jump |
| E | Interact |
| R | Reload |
| 1 | AK-47 |
| 2 | Pistol |
| B | Place Barricade ($100) |
| G | Throw Grenade |
| Tab | Scoreboard |

## 🚀 Deployment (Google Cloud VM)

### Prerequisites
- Node.js 18+
- npm

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/PVietu/Zombiehorde.git
cd Zombiehorde

# 2. Install dependencies
npm install

# 3. Build the game
npm run build

# 4. Install server dependencies
npm install express ngrok

# 5. Start the server
node server.js
```

The server will output:
```
🎮 Zombie Horde Server
📡 Local: http://localhost:3000
🌐 Public URL: https://xxxx.ngrok.io
```

Share the ngrok URL with friends to play together!

## 📁 Project Structure

```
├── dist/           # Built game files (served by server.js)
│   ├── index.html  # Main HTML (includes Three.js CDN)
│   └── game.js     # Game engine
├── src/            # React source
│   ├── App.tsx     # Main component + HUD
│   ├── index.css   # All styles
│   └── game/
│       └── engine.js  # Three.js game engine
├── public/
│   └── game.js     # Game engine (public assets)
├── server.js       # Express + ngrok server
└── package.json
```

## 🌐 Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **3D Graphics**: Three.js r128 (CDN)
- **Server**: Node.js + Express
- **Tunneling**: ngrok
- **Styling**: CSS (custom game UI)

## 🧠 Architecture

The game runs entirely in the browser using Three.js for 3D rendering. The server.js file serves the static built files and creates an ngrok tunnel for public access. For true multiplayer with synchronized state, Socket.IO integration is structured and ready to extend.

## ⚙️ Configuration

Edit `server.js` to change:
- Port (default: 3000)
- ngrok authtoken

## 🎯 Wave Guide

| Wave | Enemies | Special |
|------|---------|---------|
| 1    | 8 normal | - |
| 2    | 11 (+ exploders) | Exploders appear |
| 3    | 14 (+ acid) | Acid zombies appear |
| 5    | 20 | Increased HP/DMG |
| 10   | 35 + BOSS | **Shiribazarov** |

## 🏆 Tips

- Use the **vending machine** (northwest area) to restock
- The **mystery box** (southeast) gives weapon upgrades for $200
- **Traps** ($300 each) deal massive area damage for 20 seconds
- Build **barricades** to slow zombie advances
- Stay near allies for **revive** support
- **Combo kills** grant powerful temporary buffs
