# ZO Yatzy

ZO-Yatzy is a full stack template project for writing both server and web code for server authoritative games at Winzo.

## Rules of the game

https://desktopgames.com.ua/games/910/yatzy_rules_rus.pdf

 
## Requirements

- Node.js 21+ (recommended via nvm)
- npm

## Install

```bash
npm install
```

## Scripts

- `npm run dev` — run server and client concurrently
- `npm run dev:server` — start server with nodemon at `PORT` (default 9000)
- `npm run dev:client` — start webpack-dev-server on 3000
- `npm run build` — build server (tsc) + client (webpack)
- `npm test` — build then run jest

## Running locally

1) Create `.env` in project root (see `.env.example`):

```env
PORT=9000
WS_URL=ws://127.0.0.1:9000
```

2) Start server and client in two terminals or use `npm run dev`:

```bash
npm run dev:server
npm run dev:client
# or
npm run dev
```

3) Open client in browser: `http://localhost:3000/`

You can pass a custom player id: `http://localhost:3000/?id=1`

## Environment variables

- `PORT` — server port
- `WS_URL` — WebSocket URL (used by client bundle)
- `BOT_DIFFICULTY` — default bot difficulty (`easy|medium|hard`) used by server if URL param is not provided

## Bot and difficulty (Yatzy)

- If only one human joins, a bot can auto-join.
- Control opponent and difficulty via URL params (client forwards them to server):
  - Opponent:
    - `opponent=bot` — second player is a bot (default if only one human)
    - `opponent=human` — wait for a real second player
  - Difficulty:
    - `difficulty=easy|medium|hard`
  - Mode:
    - `mode=sync` — классический пошаговый режим
    - `mode=async` — асинхронный режим: каждый ходит независимо, виден текущий счёт соперника
  - Game grouping:
    - `gameId=<any-string>` — игроки с одинаковым `gameId` попадают за один стол; если не задан, матчмейкинг как раньше

Examples:
- `http://localhost:3000/?id=1&opponent=bot&difficulty=easy&mode=async`
- `http://localhost:3000/?id=1&opponent=human&mode=sync` (open second tab as `?id=2`)
- `http://localhost:3000/?id=7&opponent=human&mode=async&gameId=table42` (вторая вкладка: `?id=8&gameId=table42`)

Default difficulty can be set in `config.ts` under `botDifficulty` or globally via env `BOT_DIFFICULTY`. URL param still takes precedence.

Levels behavior:
- easy: чаще выбирает не оптимальный вариант, допускает ошибки
- medium: периодически ошибается
- hard: стремится к максимально выгодным решениям

## Project structure

- `core/server/index.ts` — WebSocket server and table management
- `core/client/*` — Phaser client bootstrap and scene
- `games/yatzy/*` — Yatzy game server/web logic
- `config.ts` — game config including `botDifficulty`

## Docker (optional)

Build and run via docker-compose:

```bash
docker compose up --build
```

- Binds server to 9000 (mapped to host 9000)
- Uses `docker.env` for environment variables

Note: Dev compose runs `npm install && npm run dev` inside container and mounts source code. For production, you should create a separate Dockerfile/compose with `npm run build` and a proper process manager.

## Tests

```bash
npm test
```

## Troubleshooting

- Client can’t connect to server: ensure `WS_URL` points to reachable ws/wss endpoint
- Port already in use: change `PORT` in `.env` and restart
- White screen: check browser console for errors; verify assets are copied and Phaser bundle loaded

## Setup a new game

1. Create a new folder for your game in the `games` folder in parallel to tic-tac-toe sample game folder.
2. For writing server side code, create a new file `GameServer.ts` inside the newly created folder. Make sure to export a class that implements the `IGameServer` interface.
3. (Skip this if making unity based game) For writing web code, create a new file `WebGame.ts` inside the same newly created game folder. Make sure to export a class that implements the `IWebGame` interface.
4. Add any config that is needed for the game in the `config.ts` file.
5. Point gameToRun to your game in the `config.ts` file.

