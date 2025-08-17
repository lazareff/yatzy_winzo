# ZO Stack

ZO-Stack is a full stack template project for writing both server and web code for server authoritative games at Winzo.

<img width="961" alt="zo_stack" src="https://github.com/user-attachments/assets/a6751a80-f571-48e7-8835-d1fac9ba60af">

## Running on local

- Install nodejs & npm
  - using brew `brew install node@22`
  - using [nvm](https://nodejs.org/en/download/package-manager) 
- Install dependencies - `npm install`
- Running locally
  - server - `npm run dev:server`
  - web - `npm run dev:client` (not needed if making unity based game)

## Setup

1. Create a new folder for your game in the `games` folder in parallel to tic-tac-toe sample game folder.
2. For writing server side code, create a new file `GameServer.ts` inside the newly created folder. Make sure to export a class that implements the `IGameServer` interface.
3. (Skip this if making unity based game) For writing web code, create a new file `WebGame.ts` inside the same newly created game folder. Make sure to export a class that implements the `IWebGame` interface.
4. Add any config that is needed for the game in the `config.ts` file.
5. Point gameToRun to your game in the `config.ts` file.

## Example

There's a sample `Tic-Tac-Toe` game created for reference. Make sure to point gameToRun to `Games.TicTacToe` to run the game.

