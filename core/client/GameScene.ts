import { gamesData, gameToRun } from '../../config';
import Phaser from 'phaser';
import WebGameHelper from '../utils/WebGameHelper';
import IWebGame from '../utils/IWebGame';
import { Howl } from 'howler';
import { IGameData, IGameSound } from '../utils/common';
import { PACKET } from '../utils/enums';

declare global {
    interface Window {
        wss: WebSocket;
        userId: number;
        config: {
            GAME_WIDTH: number;
            GAME_HEIGHT: number;
        };
    }
}

export class GameScene extends Phaser.Scene {
    gameInstance: IWebGame | null = null;
    isGameInFocus: boolean = true;
    uid: string = '';
    currentPlayerIndex: number = 0;
    syncInProgess: boolean = false;
    isResumeGamePacketRequested: boolean = false;
    isGamePreloaded: boolean = false;
    currentGame: IGameData = gamesData[gameToRun];
    gameHelper: WebGameHelper = {
        sendMessageToServer: this.sendMessageToServer,
        sendAnalytics: this.sendAnalytics,
        sendLog: this.sendLog,
        leaveGame: this.leaveGame,
        soundHelper: {
            loadAudio: this.loadAudio,
            playAudio: this.playAudio,
        },
        vibrate: this.vibrate,
        submitScore: this.submitScore,
        fetchServerGameState: this.fetchServerGameState,
    };

    constructor() {
        super();
    }

    async loadGame() {
        let module = await require(`../../games/${gamesData[gameToRun].name}/WebGame`);
        const Game = module['WebGame'];
        Game.preload(this, this.gameHelper);
        this.gameInstance = new Game(this);

        let event = this.load.on(Phaser.Loader.Events.COMPLETE, () => {
            if (!this.isGamePreloaded) {
                this.gameInstance.onPreloadComplete();
                this.isGamePreloaded = true;
                event.off(Phaser.Loader.Events.COMPLETE);

                // call initialise game after some delay
                setTimeout(() => {
                    this.initialiseGame();
                }, 500);
            }
        });
        this.load.start();
    }

    leaveGame() {
        console.log('Leave Game Called!');
    }

    preload() {
        this.loadGame();
    }

    sendMessageToServer(data) {
        window.wss.send(JSON.stringify({
            code: PACKET.CLIENT_TO_SERVER,
            data
        }));
    }

    initialiseGame() {
        this.gameInstance!.initialise(this.gameHelper, this.currentGame);
    }

    create() {
        this.createSocketConnection();
    }

    sendAnalytics(eventName: string) {
        console.log('Event >>>', eventName);
    }

    sendLog(message: string) {
        console.log('Log >>>', message);
    }

    createSocketConnection() {
        window.wss.onmessage = (event) => {
            try {
                var data = JSON.parse(event.data);
                console.log('on Message From Server', data);

                if (data.code === PACKET.TABLE_INFO) {
                    this.gameInstance!.setInitialGameState(data.data);
                } else if (data.code == PACKET.SERVER_TO_CLIENT) {
                    this.gameInstance!.onMessageFromServer(data.data);
                }
            } catch (e: any) {
                console.log(e.message);
                return;
            }
        };
    }

    vibrate(pattern: number[]) {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(pattern);
        }
    }

    loadAudio(src: string, loop: boolean = false, volume: number = 1.0) {
        return new Howl({
            src: [src],
            onplayerror: function (e) {
                console.error('WebGame', 'onplayerror', e);
            },
            volume: volume,
            loop: loop,
        });
    }

    playAudio(sound: IGameSound | null, volume: number = 1.0) {
        if (sound && !sound.playing()) {
            sound.volume(volume);
            sound.play();
        }
    }

    submitScore(score: number) {
        console.log('Score >>>', score);
    }

    fetchServerGameState() {
        console.log('Get Current Game State Form Server');
    }

    private onBlur() {}

    private onFocus() {}
}
