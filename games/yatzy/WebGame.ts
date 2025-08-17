import IWebGame from '../../core/utils/IWebGame';
import { IGameData, GameScene } from '../../core/utils/common';
import WebGameHelper from '../../core/utils/WebGameHelper';
import { INTERNET_STATE, PING_TYPE, PACKET } from '../../core/utils/enums';
import { PacketType } from './enums';

export class WebGame implements IWebGame {
    gameHelper: WebGameHelper | null = null;
    private headerText: any;
    private gameStarted = false;
    private playerTurn = false;
    private playerId: string | null = null;
    private game: GameScene;
    private diceObjects: { sprite: any }[] = [];
    private scoreTableRows: { categoryText: any; scoreText: any; previewText: any }[] = [];
    private rollButton: { sprite: any } | null = null;
    private playerNames: Record<string, string> = {};
    private categories: string[] = [
        'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
        'ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance', 'Yatzy'
    ];
    private rollsLeft: number = 3;
    private state: any;
    private lastState: any = null;
    private actionLog: string[] = [];
    private actionLogText: any;
    private scoreBoardText: any;
    private hasRolledThisTurn: boolean = false;

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
        game.load.image('diceBlank', './assets/images/-.png');
        game.load.image('rollButton', './assets/images/rollButton.png');
    }

    onPreloadComplete() {
        this.createBoard();
    }

    initialise(gameHelper: WebGameHelper, gameData: IGameData) {
        this.gameHelper = gameHelper;
        this.playerId = window.userId.toString();
        this.gameStarted = true;
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
        } else if (data.type === 'JOKER_CHOICE') {
            this.showJokerChoice(data.options, data.diceValue);
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
        console.log('ping', ping);
    }

    private getPlayerName(uid: string): string {
        return this.playerNames[uid] || (uid.startsWith('bot') ? 'Bot' : uid);
    }

    private calculatePreviewScore(dice: number[], category: string): number {
        const freq: Record<number, number> = {};
        dice.forEach(d => freq[d] = (freq[d] || 0) + 1);
        const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0);
        switch (category) {
            case 'Ones': return (freq[1] || 0) * 1;
            case 'Twos': return (freq[2] || 0) * 2;
            case 'Threes': return (freq[3] || 0) * 3;
            case 'Fours': return (freq[4] || 0) * 4;
            case 'Fives': return (freq[5] || 0) * 5;
            case 'Sixes': return (freq[6] || 0) * 6;
            case 'ThreeOfAKind': return Object.values(freq).some(c => c >= 3) ? sum(dice) : 0;
            case 'FourOfAKind': return Object.values(freq).some(c => c >= 4) ? sum(dice) : 0;
            case 'FullHouse': {
                const hasThree = Object.values(freq).includes(3);
                const hasTwo = Object.values(freq).includes(2);
                return hasThree && hasTwo ? 25 : 0;
            }
            case 'SmallStraight': {
                const sorted = [...new Set(dice)].sort();
                return sorted.join('').includes('1234') || sorted.join('').includes('2345') || sorted.join('').includes('3456') ? 30 : 0;
            }
            case 'LargeStraight': {
                const sorted = [...new Set(dice)].sort();
                return sorted.join('') === '12345' || sorted.join('') === '23456' ? 40 : 0;
            }
            case 'Chance': return sum(dice);
            case 'Yatzy': return dice.every(d => d === dice[0]) ? 50 : 0;
            default: return 0;
        }
    }

    private showJokerChoice(options: string[], diceValue: number) {
        const overlay = this.game.add.rectangle(window.config.GAME_WIDTH / 2, window.config.GAME_HEIGHT / 2, window.config.GAME_WIDTH, window.config.GAME_HEIGHT, 0x000000, 0.7);
        const title = this.game.add.text(window.config.GAME_WIDTH / 2, window.config.GAME_HEIGHT / 2 - 100, `Yatzy Bonus! +100 points!\nChoose category for dice value ${diceValue}:`, {
            fontFamily: 'Arial',
            fontSize: '24px',
            align: 'center',
        }).setOrigin(0.5);
        
        options.forEach((option, index) => {
            const button = this.game.add.text(window.config.GAME_WIDTH / 2, window.config.GAME_HEIGHT / 2 - 20 + index * 40, option, {
                fontFamily: 'Arial',
                fontSize: '20px',
                backgroundColor: 'rgba(255,255,255,0.8)',
                color: '#000',
            })
            .setPadding(8, 4, 8, 4)
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                this.gameHelper!.sendMessageToServer({
                    type: PacketType.MOVE,
                    action: 'joker',
                    category: option,
                });
                overlay.destroy();
                title.destroy();
                options.forEach((_, i) => {
                    // Clean up all buttons
                });
            });
        });
    }

    private updateBoard(data: any) {
        const { dice: diceValues, lockedDice, rollsLeft, scores } = data;
        this.state = data;
        this.rollsLeft = rollsLeft;
        const hasRolled = !!data.hasRolledThisTurn;

        this.detectAndLogOpponentAction(this.lastState, data);
        this.updateScoreBoard(scores);
        this.lastState = JSON.parse(JSON.stringify(data));

        this.diceObjects.forEach((diceObj, index) => {
            const showBlank = !hasRolled;
            if (showBlank) {
                diceObj.sprite.setTexture('diceBlank');
                diceObj.sprite.setAlpha(1.0);
            } else {
                diceObj.sprite.setTexture(`dice${diceValues[index] || 1}`);
                diceObj.sprite.setAlpha(lockedDice[index] ? 0.5 : 1.0);
            }
        });
        this.scoreTableRows.forEach((row, index) => {
            const category = this.categories[index];
            const score = scores[this.playerId!]?.[category] ?? '-';
            row.scoreText.setText(score);
            // Show preview score if category is open and dice are available
            const preview = (score === '-' && hasRolled) ? this.calculatePreviewScore(diceValues, category) : '';
            row.previewText.setText(preview);
        });
        if (this.rollButton) {
            this.rollButton.sprite.setVisible(rollsLeft > 0 && this.playerTurn);
        }
        const turnText = this.playerTurn
            ? (hasRolled ? `Your turn! Rolls left: ${rollsLeft}` : 'Your turn! Press Roll to start')
            : `${this.getPlayerName(data.currentPlayerTurn)}'s turn!`;
        this.headerText.setText(turnText);
    }

    private detectAndLogOpponentAction(prev: any, curr: any) {
        if (!prev) return;
        const myId = this.playerId!;
        const players = Object.keys(curr.scores || {});
        const opponentId = players.find((p) => p !== myId);
        if (!opponentId) return;

        if (prev.currentPlayerTurn !== curr.currentPlayerTurn) {
            const prevActor = prev.currentPlayerTurn;
            if (prevActor === opponentId) {
                const prevScores = prev.scores?.[opponentId] || {};
                const currScores = curr.scores?.[opponentId] || {};
                let scoredCat: string | null = null;
                let scoredVal = 0;
                for (const cat of this.categories) {
                    const before = prevScores[cat];
                    const after = currScores[cat];
                    if ((before == null || before === undefined) && typeof after === 'number') {
                        scoredCat = cat;
                        scoredVal = after;
                        break;
                    }
                }
                if (scoredCat) {
                    this.appendOpponentAction(`${this.getPlayerName(opponentId)} scored ${scoredCat}: ${scoredVal}`);
                } else {
                    this.appendOpponentAction(`${this.getPlayerName(opponentId)} finished turn`);
                }
            }
        } else if (curr.currentPlayerTurn === opponentId) {
            if (typeof prev.rollsLeft === 'number' && typeof curr.rollsLeft === 'number' && curr.rollsLeft < prev.rollsLeft) {
                this.appendOpponentAction(`${this.getPlayerName(opponentId)} rolled (rolls left: ${curr.rollsLeft})`);
            }
            const prevLocks: boolean[] = prev.lockedDice || [];
            const currLocks: boolean[] = curr.lockedDice || [];
            const locked: number[] = [];
            const unlocked: number[] = [];
            for (let i = 0; i < Math.max(prevLocks.length, currLocks.length); i++) {
                if (prevLocks[i] !== currLocks[i]) {
                    if (currLocks[i]) locked.push(i + 1); else unlocked.push(i + 1);
                }
            }
            if (locked.length) {
                this.appendOpponentAction(`${this.getPlayerName(opponentId)} locked dice ${locked.join(', ')}`);
            }
            if (unlocked.length) {
                this.appendOpponentAction(`${this.getPlayerName(opponentId)} unlocked dice ${unlocked.join(', ')}`);
            }
        }
    }

    private updateScoreBoard(scores: Record<string, Record<string, number | null>>) {
        const myId = this.playerId!;
        const players = Object.keys(scores || {});
        const opponentId = players.find((p) => p !== myId);
        const myTotal = this.sumScores(scores[myId]);
        const oppTotal = opponentId ? this.sumScores(scores[opponentId]) : 0;
        if (this.scoreBoardText) {
            this.scoreBoardText.setText(`You: ${myTotal}  |  ${opponentId ? this.getPlayerName(opponentId) : 'Opponent'}: ${oppTotal}`);
        }
    }

    private sumScores(scoreMap: Record<string, number | null> | undefined): number {
        if (!scoreMap) return 0;
        return Object.values(scoreMap).reduce((sum, v) => sum + (v || 0), 0);
    }

    private appendOpponentAction(text: string) {
        this.actionLog.push(text);
        if (this.actionLog.length > 5) this.actionLog.shift();
        if (this.actionLogText) {
            this.actionLogText.setText(this.actionLog.join('\n'));
        }
    }

    private setPlayerTurn(userTurn) {
        const wasMyTurn = this.playerTurn;
        this.playerTurn = this.playerId === userTurn;
        if (this.playerTurn && !wasMyTurn) {
            this.hasRolledThisTurn = false;
        }
        const turnText = this.playerTurn
            ? (this.hasRolledThisTurn ? `Your turn! Rolls left: ${this.rollsLeft}` : 'Your turn! Press Roll to start')
            : `${this.getPlayerName(userTurn)}'s turn!`;
        this.headerText.setText(turnText);
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
                .image(startX + i * (diceWidth + diceSpacing), diceY, 'diceBlank')
                .setDisplaySize(diceWidth, diceWidth)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    if (this.playerTurn && this.gameStarted && this.hasRolledThisTurn) {
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
                        this.hasRolledThisTurn = true;
                        this.gameHelper!.sendMessageToServer({
                            type: PacketType.MOVE,
                            action: 'roll',
                        });
                    }
                }),
        };

        // Quit button (top-left)
        const quit = this.game.add
            .text(16, 16, 'Quit', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#f44',
                backgroundColor: 'rgba(255,255,255,0.6)'
            })
            .setPadding(6, 4, 6, 4)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
                try {
                    window.wss?.send(JSON.stringify({ code: PACKET.CLIENT_TO_SERVER, data: { type: 'LEAVE' } }));
                    window.wss?.close();
                } catch {}
            });

        const tableY = diceY + 200;
        const tableWidth = 500;
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
                    if (this.playerTurn && this.gameStarted && this.hasRolledThisTurn) {
                        this.gameHelper!.sendMessageToServer({
                            type: PacketType.MOVE,
                            action: 'score',
                            category,
                        });
                    }
                });
            const scoreText = this.game.add
                .text(window.config.GAME_WIDTH / 2, rowY, '-', {
                    fontFamily: 'Arial',
                    fontSize: '20px',
                })
                .setOrigin(0.5, 0.5);
            const previewText = this.game.add
                .text(window.config.GAME_WIDTH / 2 + tableWidth / 2, rowY, '', {
                    fontFamily: 'Arial',
                    fontSize: '18px',
                    color: '#888',
                })
                .setOrigin(1, 0.5);
            this.scoreTableRows.push({ categoryText, scoreText, previewText });
        });

        this.scoreBoardText = this.game.add
            .text(window.config.GAME_WIDTH / 2, 100, 'You: 0  |  Opponent: 0', {
                fontFamily: 'Arial',
                fontSize: '18px',
            })
            .setOrigin(0.5);

        this.actionLogText = this.game.add
            .text(window.config.GAME_WIDTH - 16, 140, '', {
                fontFamily: 'Arial',
                fontSize: '16px',
                align: 'right',
            })
            .setOrigin(1, 0);
    }

    private onBlur() {}

    private onFocus() {}
}
