import IWebGame from '../../core/utils/IWebGame';
import { IGameData, GameScene } from '../../core/utils/common';
import WebGameHelper from '../../core/utils/WebGameHelper';
import { INTERNET_STATE, PING_TYPE } from '../../core/utils/enums';
import { PacketType } from './enums';

export class WebGame implements IWebGame {
    gameHelper: WebGameHelper | null = null;
    private headerText: any;
    private gameStarted = false;
    private playerTurn = false;
    private playerId: string | null = null;
    private game: GameScene;
    private diceObjects: { sprite: any }[] = [];
    private scoreTableRows: { categoryText: any; scoreText: any }[] = [];
    private rollButton: { sprite: any } | null = null;
    private playerNames: Record<string, string> = {};
    private categories: string[] = [
        'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
        'ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance', 'Yatzy'
    ];
    private rollsLeft: number = 3;
    private state: any;

    constructor(game: GameScene) {
        this.game = game;
    }

    onInternetStateUpdate(state: INTERNET_STATE) {
        if (state === INTERNET_STATE.DISCONNECTED) {
            this.state = INTERNET_STATE.DISCONNECTED;
            this.headerText.setText('Disconnected...');
        } else if (state === INTERNET_STATE.CONNECTED) {
            this.state = INTERNET_STATE.CONNECTED;
            this.headerText.setText(this.gameStarted ? (this.playerTurn ? `Your turn!` : `${this.getPlayerName(this.playerId!)}'s turn!`) : 'Waiting for game to start');
        }
    }

    static preload(game: GameScene) {
        for (let i = 1; i <= 6; i++) {
            game.load.image(`dice${i}`, `./assets/images/dice${i}.png`);
        }
        game.load.image('rollButton', './assets/images/rollButton.png');
    }

    onPreloadComplete() {
        this.createBoard();
    }

    initialise(gameHelper: WebGameHelper, gameData: IGameData) {
        this.gameHelper = gameHelper;
        this.playerId = window.userId.toString();
        this.gameStarted = true;
        // Извлекаем имена игроков из config.ts
        this.playerNames = {
            [gameData.playersData.currentPlayerInfo.uid]: gameData.playersData.currentPlayerInfo.name,
            ...gameData.playersData.opponentPlayersInfo.reduce((acc, p) => ({
                ...acc,
                [p.uid]: p.name
            }), {})
        };
    }

    onMessageFromServer(data: any) {
        if (data.type === PacketType.CHANGE_TURN) {
            this.updateBoard(data);
            this.setPlayerTurn(data.currentPlayerTurn);
        } else if (data.type === PacketType.GAME_OVER) {            
            this.setGameOver(data.winner);
        }
    }

    setInitialGameState(data: any) {
        this.updateBoard(data);
        this.setPlayerTurn(data.currentPlayerTurn);
        this.gameStarted = true;
    }

    setCurrentGameState(data: any) {
        this.updateBoard(data);
        this.setPlayerTurn(data.currentPlayerTurn);
        if (data.gameOver) {
            this.setGameOver(data.winner);
        }
    }

    onPingUpdate(ping: PING_TYPE) {
        // update UI as per the ping type
        console.log('ping', ping);
    }

    private getPlayerName(uid: string): string {
        return this.playerNames[uid] || uid;
    }

    private updateBoard(data: any) {
        const { dice: diceValues, lockedDice, rollsLeft, scores } = data;
        this.state = data;
        this.rollsLeft = rollsLeft;
        this.diceObjects.forEach((diceObj, index) => {
            diceObj.sprite.setTexture(`dice${diceValues[index] || 1}`);
            diceObj.sprite.setAlpha(lockedDice[index] ? 0.5 : 1.0);
        });
        this.scoreTableRows.forEach((row, index) => {
            const category = this.categories[index];
            const score = scores[this.playerId!]?.[category] ?? '-';
            row.scoreText.setText(score);
        });
        if (this.rollButton) {
            this.rollButton.sprite.setVisible(rollsLeft > 0 && this.playerTurn);
        }
        this.headerText.setText(this.playerTurn ? `Your turn! Rolls left: ${rollsLeft}` : `${this.getPlayerName(data.currentPlayerTurn)}'s turn!`);
    }

    private setPlayerTurn(userTurn) {
        this.playerTurn = this.playerId === userTurn;
        this.headerText.setText(this.playerTurn ? `Your turn! Rolls left: ${this.rollsLeft}` : `${this.getPlayerName(userTurn)}'s turn!`);
        if (this.rollButton) {
            this.rollButton.sprite.setVisible(this.playerTurn && this.rollsLeft > 0);
        }
    }

    private setGameOver(winner) {
        this.gameStarted = false;
        if (winner === this.playerId) {
            this.headerText.setText('You Win!');
        } else if (winner === '') {
            this.headerText.setText('Draw!');
        } else {
            this.headerText.setText(`${this.getPlayerName(winner)} Wins!`);
        }
        if (this.rollButton) {
            this.rollButton.sprite.setVisible(false);
        }
        // Отправляем финальный счёт
        this.gameHelper!.submitScore(
        // @ts-ignore
            Object.values(this.state?.scores[this.playerId!] || {}).reduce((sum, score) => sum + (score || 0), 0)
        );
    }

    private getRollsLeft(): number {
        return this.rollsLeft;
    }

    private createBoard() {
        this.headerText = this.game.add
            .text(window.config.GAME_WIDTH / 2, 50, 'Waiting for game to start', {
                fontFamily: 'Arial',
                fontSize: '36px',
            })
            .setOrigin(0.5);

        const diceWidth = 60;
        const diceSpacing = 10;
        const diceY = 150;
        const startX = (window.config.GAME_WIDTH - (5 * diceWidth + 4 * diceSpacing)) / 2;

        this.diceObjects = [];
        for (let i = 0; i < 5; i++) {
            const sprite = this.game.add
                .image(startX + i * (diceWidth + diceSpacing), diceY, 'dice1')
                .setDisplaySize(diceWidth, diceWidth)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    if (this.playerTurn && this.gameStarted) {
                        this.gameHelper!.sendMessageToServer({
                            type: PacketType.MOVE,
                            action: 'lock',
                            diceIndices: [i],
                        });
                    }
                });
            this.diceObjects.push({ sprite });
        }

        this.rollButton = {
            sprite: this.game.add
                .image(window.config.GAME_WIDTH / 2, diceY + 100, 'rollButton')
                .setDisplaySize(120, 40)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    if (this.playerTurn && this.gameStarted) {
                        this.gameHelper!.sendMessageToServer({
                            type: PacketType.MOVE,
                            action: 'roll',
                        });
                    }
                }),
        };

        const tableY = diceY + 200;
        const tableWidth = 400;
        const rowHeight = 40;
        this.scoreTableRows = [];
        this.categories.forEach((category, index) => {
            const rowY = tableY + index * rowHeight;
            const categoryText = this.game.add
                .text(window.config.GAME_WIDTH / 2 - tableWidth / 2, rowY, category, {
                    fontFamily: 'Arial',
                    fontSize: '20px',
                })
                .setOrigin(0, 0.5)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    if (this.playerTurn && this.gameStarted) {
                        this.gameHelper!.sendMessageToServer({
                            type: PacketType.MOVE,
                            action: 'score',
                            category,
                        });
                    }
                });
            const scoreText = this.game.add
                .text(window.config.GAME_WIDTH / 2 + tableWidth / 2, rowY, '-', {
                    fontFamily: 'Arial',
                    fontSize: '20px',
                })
                .setOrigin(1, 0.5);
            this.scoreTableRows.push({ categoryText, scoreText });
        });
    }
}
