import { GameScene } from './GameScene';

const urlObj = new URL(window.location.href);
const query = Object.fromEntries(urlObj.searchParams.entries());

function wsConnect(id) {
    const WS_URL = (process.env.WS_URL as string) || 'ws://127.0.0.1:9000';
    const params = new URLSearchParams({ winzoId: String(id) });
    const diffFromQuery = (query as any).difficulty || (query as any).botDifficulty;
    const storedDiff = window.localStorage?.getItem('difficulty') || '';
    const finalDiff = (typeof diffFromQuery === 'string' && diffFromQuery.trim() !== '') ? diffFromQuery.toLowerCase() : storedDiff;
    if (finalDiff) {
        params.set('difficulty', finalDiff);
        try { window.localStorage?.setItem('difficulty', finalDiff); } catch {}
    }
    const oppFromQuery = (query as any).opponent;
    const storedOpp = window.localStorage?.getItem('opponent') || '';
    const finalOpp = (typeof oppFromQuery === 'string' && oppFromQuery.trim() !== '') ? oppFromQuery.toLowerCase() : storedOpp;
    if (finalOpp) {
        params.set('opponent', finalOpp);
        try { window.localStorage?.setItem('opponent', finalOpp); } catch {}
    }
    const modeFromQuery = (query as any).mode;
    const storedMode = window.localStorage?.getItem('mode') || '';
    const finalMode = (typeof modeFromQuery === 'string' && modeFromQuery.trim() !== '') ? modeFromQuery.toLowerCase() : storedMode;
    if (finalMode) {
        params.set('mode', finalMode);
        try { window.localStorage?.setItem('mode', finalMode); } catch {}
    }
    const wss = new WebSocket(`${WS_URL}?${params.toString()}`);

    wss.onopen = (ws) => {
        console.log('connection opened');
    };

    wss.onerror = (error) => {
        console.log(error);
    };
    window.wss = wss;
}

const USER_ID_KEY = 'winzo_user_id';
const queryId = (typeof (query as any).id === 'string' && (query as any).id.trim() !== '') ? String((query as any).id) : '';
const storedId = window.localStorage?.getItem(USER_ID_KEY) || '';
const userId = queryId || storedId || String(Math.floor(Math.random() * 1000));
try { if (queryId || !storedId) window.localStorage?.setItem(USER_ID_KEY, userId); } catch {}
wsConnect(userId);
window.userId = userId;

window.onload = () => {
    const SCREEN_WIDTH = () => window.innerWidth;
    const SCREEN_HEIGHT = () => window.innerHeight;
    const GAME_WIDTH = 1080;
    const GAME_HEIGHT = SCREEN_HEIGHT() * (GAME_WIDTH / SCREEN_WIDTH());

    const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        scene: [GameScene],
        antialias: true,
        scale: {
            mode: Phaser.Scale.ScaleModes.WIDTH_CONTROLS_HEIGHT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
    };

    new Phaser.Game(config);

    window.config = {
        GAME_WIDTH,
        GAME_HEIGHT,
    };
};
