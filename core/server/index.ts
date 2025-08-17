import express from 'express';
import http from 'http';
import url from 'url';
import WebSocket from 'ws';
import { gamesData, gameToRun } from '../../config';
import { GameHelper } from '../utils/GameServerHelper';
import { LOG_LEVEL, PACKET } from '../utils/enums';
import IGameServer from '../utils/IGameServer';
import IGameList from "../utils/IGameList";
import GameList from "../../games/yatzy/GameList";
import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.PORT || process.env.port || process.argv[2], 10) || 9000;

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

let joinedPlayers = [];

let gameList: GameList[];

let game: IGameServer;

const gameConfig = gamesData[gameToRun].config;

const gameHelper: GameHelper = {
    sendMessageToClient,
    sendEventLogs: async (userId: string, data: any) => {},
    exitPlayerFromGame: async (userId: string) => {},
    sendLog: async (msg: string, level?: LOG_LEVEL) => {
        console.log(msg);
    },
    finishGame,
    sendMessageToAllClient,
    randomHelper: {},
    sendServerGameState: async (userId: string) => {},
};

let joinedPlayersList = [];

const gameData = {
    joinedPlayers,
    gameConfig,
};

async function sendMessageToClient(winzoId: string, data: any) {
    sendPacketToClient(winzoId, {
        code: PACKET.SERVER_TO_CLIENT,
        data,
    });
}

async function finishGame(winner) {
    let res = removeJoinedIdFromArray(winner);
    console.log('res', res);
    if (res) {
        removeGameByKey(res.key);
    }
    console.log('FINISH', winner);
}

async function sendPacketToClient(winzoId: string, message: any) {
    wss.clients.forEach(function each(client: any) {
        if (client.winzoId === winzoId) {
            console.log('gameserver connection response: ' + client.winzoId);
            client.send(JSON.stringify(message));
        }
    });
}

wss.on('connection', async (client: any, req) => {
    const address = url.parse(req.url, true);
    console.log('query param: ' + JSON.stringify(address.query));
    client.winzoId = address.query.winzoId;

    // Read difficulty override from URL query
    const urlDifficulty = typeof address.query.difficulty === 'string' ? String(address.query.difficulty).toLowerCase() : undefined;
    const opponentPref = typeof address.query.opponent === 'string' ? String(address.query.opponent).toLowerCase() : undefined;

    let res = addJoinedIdToArray(client.winzoId);
    console.log('res', res);
    if (res) {
        gameData.joinedPlayers = res.values;
        // Auto-add a bot if only one human joins and game expects 2 players
        if (res.isAdded && gameConfig.noOfPlayers === 2 && gameData.joinedPlayers.length === 1) {
            const wantsBot = opponentPref !== 'human';
            if (wantsBot) {
                const botId = `bot_${res.key}`;
                gameData.joinedPlayers.push(botId);
                res.values = gameData.joinedPlayers;
                res.isFull = true;
            }
        }
        // Apply difficulty override if present
        if (urlDifficulty && ['easy','medium','hard'].includes(urlDifficulty)) {
            // @ts-ignore
            gameData.gameConfig = { ...(gameData.gameConfig || {}), botDifficulty: urlDifficulty };
        }
        if(res.isAdded && res.isFull) {
            game = new (require(`../../games/${gamesData[gameToRun].name}/GameServer.ts`).default)();
            await game.initialise(gameHelper, gameData);
            if (gameList == undefined) {
                gameList = [];
            }
            gameList.push({'key': res.key, 'game': game});
            setTimeout(async () => {
                gameData.joinedPlayers.forEach(async (player) => {
                    await sendPacketToClient(player, {
                        code: PACKET.TABLE_INFO,
                        data: { ...(await game.getInitialGameState(player)) },
                    });
                });
                await game.onInitialGameStateSent();
            }, 1000);
        } else if (res.isFull) {
            let clnt = findJoinedIdInArray(client.winzoId);
            if (clnt && clnt.isFull) {
                let key = clnt.key;
                let game = gameList.find(item => item.key === key)?.game;
                gameData.joinedPlayers = clnt.values;
                // Reconnect: just re-send table info to this client
                setTimeout(async () => {
                    await sendPacketToClient(client.winzoId, {
                        code: PACKET.TABLE_INFO,
                        data: { ...(await game.getInitialGameState(client.winzoId)) },
                    });
                }, 500);
            }
        }
    }

    client.on('message', async (message) => {
        let curGame = findJoinedIdInArray(client.winzoId);
        if (curGame) {
            gameData.joinedPlayers = curGame.values;
        }
        if (gameData.joinedPlayers.length < gameConfig.noOfPlayers) {
            console.log('waiting for players to join');
            return;
        }
        const data = JSON.parse(String(message));
        console.log('on Message from Client: ' + client.winzoId + ' - ' + message);

        if (data.code === PACKET.CLIENT_TO_SERVER) {
            let clnt = findJoinedIdInArray(client.winzoId);
            console.log('clnt', clnt);
            if (clnt && clnt.isFull) {
                let key = clnt.key;
                let game = gameList.find(item => item.key === key)?.game;
                console.log('game', game);
                if (data.data?.type === 'LEAVE') {
                    await game.onPlayerLeave(String(client.winzoId));
                    return;
                }
                await game.onMessageFromClient(client.winzoId, data.data);
            }
        }
    });

    client.on('close', async () => {
        try {
            let clnt = findJoinedIdInArray(client.winzoId);
            if (clnt && clnt.isFull) {
                let key = clnt.key;
                let game = gameList.find(item => item.key === key)?.game;
                await game.onPlayerLeave(String(client.winzoId));
            }
        } catch (e) {
            console.error('on close error', e);
        }
    });

    client.on('error', (err) => {
        console.error('socket error: ' + err);
    });
});

async function sendMessageToAllClient(data: any) {
    gameData.joinedPlayers.forEach(async (player) => {
        sendMessageToClient(player, data);
    });
}

wss.on('error', (err) => {
    console.error('Error: wss: ' + err);
});

// app.use("/", express.static(path.join(__dirname, ".")));
// app.use("/", serveIndex(path.join(__dirname, "."), { icons: true }));

app.route('/node').get((req, res) => {
    res.send('Express');
});

server.listen(port);

console.log(`Listening on http://localhost:${port}`);


/**
 *
 * @param winzoId
 */
function addJoinedIdToArray(winzoId: string | number): { key: string, values: (string | number)[], isFull: boolean, isAdded: boolean} | false {
    // Проверка, что joinedPlayersList — массив
    if (!Array.isArray(joinedPlayersList)) {
        return false;
    }

    // Проверка, что id не null/undefined
    if (winzoId == null) {
        return false;
    }
    // 1. Проверяем, существует ли id в каком-либо массиве
    const existingObj = joinedPlayersList.find(obj => {
        if (!obj || typeof obj !== 'object') return false;
        const values = Object.values(obj)[0];
        return Array.isArray(values) && values.some(value => value != null && String(value) === String(winzoId));
    });

    if (existingObj) {
        const key = Object.keys(existingObj)[0];
        const values = Object.values(existingObj)[0] as (string | number)[];
        return { key, values, isFull: values.length >= gameConfig.noOfPlayers, isAdded: false };
    }

    // 2. Ищем массив с количеством элементов меньше MAX_ARRAY_LENGTH
    const availableObj = joinedPlayersList.find(obj => {
        if (!obj || typeof obj !== 'object') return false;
        const values = Object.values(obj)[0];
        return Array.isArray(values) && values.length < gameConfig.noOfPlayers;
    });

    if (availableObj) {
        const key = Object.keys(availableObj)[0];
        const values = Object.values(availableObj)[0] as (string | number)[];
        values.push(winzoId);
        return { key, values, isFull: values.length >= gameConfig.noOfPlayers, isAdded: true };
    }

    // 3. Создаём новый объект с инкрементированным ключом
    const keys = joinedPlayersList
        .filter(obj => obj && typeof obj === 'object')
        .map(obj => Number(Object.keys(obj)[0]))
        .filter(key => !isNaN(key));
    const newKey = keys.length > 0 ? String(Math.max(...keys) + 1) : '1';
    const newValues: (string | number)[] = [winzoId];
    joinedPlayersList.push({ [newKey]: newValues });
    return { key: newKey, values: newValues, isFull: newValues.length >= gameConfig.noOfPlayers, isAdded: true };
}

/**
 *
 * @param winzoId
 */
function findJoinedIdInArray(winzoId: string | number): { key: string, values: (string | number)[], isFull: boolean } | false {
    // Проверка, что arr — массив
    if (!Array.isArray(joinedPlayersList)) {
        return false;
    }

    // Проверка, что id не null/undefined
    if (winzoId == null) {
        return false;
    }

    // Ищем объект, содержащий id в массиве значений
    const foundObj = joinedPlayersList.find(obj => {
        if (!obj || typeof obj !== 'object') return false;
        const values = Object.values(obj)[0];
        return Array.isArray(values) && values.some(value => value != null && String(value) === String(winzoId));
    });

    if (foundObj) {
        const key = Object.keys(foundObj)[0];
        const values = Object.values(foundObj)[0] as (string | number)[];
        return { key, values, isFull: values.length >= gameConfig.noOfPlayers };
    }

    return false;
}


function removeJoinedIdFromArray(id: string | number): { key: string, values: (string | number)[], isFullyRemoved: boolean } | false {
    // Проверка, что joinedPlayersList — массив
    if (!Array.isArray(joinedPlayersList)) {
        console.error('joinedPlayersList должен быть массивом');
        return false;
    }

    // Проверка, что id не null/undefined
    if (id == null) {
        console.error('id не может быть null или undefined');
        return false;
    }

    // Ищем объект, содержащий id в массиве значений
    const index = joinedPlayersList.findIndex(obj => {
        if (!obj || typeof obj !== 'object') return false;
        const values = Object.values(obj)[0];
        return Array.isArray(values) && values.some(value => value != null && String(value) === String(id));
    });

    if (index === -1) {
        console.error(`id "${id}" не найден в массиве`);
        return false;
    }

    const obj = joinedPlayersList[index];
    const key = Object.keys(obj)[0];
    const values = Object.values(obj)[0] as (string | number)[];

    // Проверяем, был ли массив полностью заполнен
    const wasFull = values.length >= gameConfig.noOfPlayers;

    if (wasFull) {
        // Если массив был заполнен, сохраняем копию элементов и удаляем объект
        const valuesCopy = [...values];
        joinedPlayersList.splice(index, 1);
        return { key, values: valuesCopy, isFullyRemoved: true };
    }

    // Удаляем только id из массива значений
    const newValues = values.filter(value => String(value) !== String(id));

    if (newValues.length === 0) {
        // Если массив стал пустым, удаляем объект
        joinedPlayersList.splice(index, 1);
        return { key, values: [], isFullyRemoved: true };
    }

    // Обновляем массив значений
    joinedPlayersList[index] = { [key]: newValues };

    // Удаляем все объекты с пустыми массивами
    for (let i = joinedPlayersList.length - 1; i >= 0; i--) {
        const values = Object.values(joinedPlayersList[i])[0];
        if (Array.isArray(values) && values.length === 0) {
            joinedPlayersList.splice(i, 1);
        }
    }

    return { key, values: newValues, isFullyRemoved: false };
}


/**
 *
 * @param winzoId
 */
function removeJoinedIdFromArray1(winzoId: string | number): { key: string, values: (string | number)[], isFullyRemoved: boolean } | { key: string, values: (string | number)[], isFull: boolean, isFullyRemoved: boolean } | { isFullyRemoved: boolean } | false {
    // Проверка, что joinedPlayersList — массив
    if (!Array.isArray(joinedPlayersList)) {
        return false;
    }

    // Проверка, что id не null/undefined
    if (winzoId == null) {
        return false;
    }

    // Ищем объект, содержащий id в массиве значений
    const index = joinedPlayersList.findIndex(obj => {
        if (!obj || typeof obj !== 'object') return false;
        const values = Object.values(obj)[0];
        return Array.isArray(values) && values.some(value => value != null && String(value) === String(winzoId));
    });

    if (index === -1) {
        return false;
    }

    const obj = joinedPlayersList[index];
    const key = Object.keys(obj)[0];
    const values = Object.values(obj)[0] as (string | number)[];

    // Проверяем, был ли массив полностью заполнен
    const wasFull = values.length >= gameConfig.noOfPlayers;

    if (wasFull) {
        // Если массив был заполнен, сохраняем копию элементов и удаляем объект
        const valuesCopy = [...values];
        joinedPlayersList.splice(index, 1);
        return { key, values: valuesCopy, isFullyRemoved: true };
    }

    // Удаляем только id из массива значений
    const newValues = values.filter(value => String(value) !== String(winzoId));

    if (newValues.length === 0) {
        // Если массив стал пустым, удаляем объект
        joinedPlayersList.splice(index, 1);
        return { isFullyRemoved: true };
    }

    // Обновляем массив значений
    joinedPlayersList[index] = { [key]: newValues };

    // Удаляем все объекты с пустыми массивами
    for (let i = joinedPlayersList.length - 1; i >= 0; i--) {
        const values = Object.values(joinedPlayersList[i])[0];
        if (Array.isArray(values) && values.length === 0) {
            joinedPlayersList.splice(i, 1);
        }
    }

    return { key, values: newValues, isFull: newValues.length >= gameConfig.noOfPlayers, isFullyRemoved: false };
}

function removeGameByKey(keyToRemove: string): boolean {
    // Проверка, что gameList — массив
    if (!Array.isArray(gameList)) {
        console.error('gameList должен быть массивом');
        return false;
    }

    // Находим индекс объекта с заданным key
    const index = gameList.findIndex(item => item.key === keyToRemove);

    if (index === -1) {
        console.error(`Игра с key = "${keyToRemove}" не найдена`);
        return false;
    }

    // Удаляем объект из массива
    gameList.splice(index, 1);
    return true;
}