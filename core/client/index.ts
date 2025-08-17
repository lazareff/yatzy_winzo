import { GameScene } from './GameScene';

const urlObj = new URL(window.location.href);
const query = Object.fromEntries(urlObj.searchParams.entries());

function wsConnect(id) {
    const WS_URL = (process.env.WS_URL as string) || 'ws://127.0.0.1:9000';
    const params = new URLSearchParams({ winzoId: String(id) });
    const rawDiff = (query as any).difficulty || (query as any).botDifficulty;
    if (typeof rawDiff === 'string' && rawDiff.trim() !== '') {
        params.set('difficulty', rawDiff.toLowerCase());
    }
    const opponent = (query as any).opponent;
    if (typeof opponent === 'string' && opponent.trim() !== '') {
        params.set('opponent', opponent.toLowerCase());
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

const userId = typeof query.id === 'string' && query.id.trim() !== '' ? query.id : String(Math.floor(Math.random() * 1000));
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
