import { GameScene } from './GameScene';

const qs = require('querystring');
var url = require('url');

var url_parts = url.parse(window.location.toString(), true);
var query = url_parts.query;

function wsConnect(id) {
    const wss = new WebSocket(`ws://127.0.0.1:9000?winzoId=${id}`);

    wss.onopen = (ws) => {
        console.log('connection opened');
    };

    wss.onerror = (error) => {
        console.log(error);
    };
    window.wss = wss;
}

const userId = query.id || parseInt(String(Math.random() * 1000));
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
