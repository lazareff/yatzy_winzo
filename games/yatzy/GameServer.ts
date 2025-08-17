import { GameData } from '../../core/utils/common';
import { GameHelper } from '../../core/utils/GameServerHelper';
import IGameServer from '../../core/utils/IGameServer';
import { PacketType } from './enums';
import YatzyBot from './IBot';

export default class GameServer implements IGameServer {
    private state: {
        dice: number[];
        rollsLeft: number;
        lockedDice: boolean[];
        scores: Record<string, Record<string, number | null>>;
        currentPlayerTurn: string;
        gameOver: boolean;
        gameWinner: string;
        hasRolledThisTurn: boolean;
        roundsPlayed: Record<string, number>;
        roundsPerPlayer: number;
    };
    private players: string[] = [];
    private gameHelper: GameHelper | null = null;
    private categories: string[] = [
        'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
        'ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance', 'Yatzy'
    ];
    private bot: YatzyBot | null = null;
    private turnTimeoutHandle: any = null;
    private turnTimeoutMs: number = 30000;
    async initialise(gameHelper: GameHelper, gameData: GameData) {
        this.gameHelper = gameHelper;
        this.players = gameData.joinedPlayers;
        const roundsPerPlayer = Number(gameData.gameConfig?.roundsPerPlayer || 13);
        this.state = {
            dice: [1, 1, 1, 1, 1],
            rollsLeft: 3,
            lockedDice: [false, false, false, false, false],
            scores: this.players.reduce((acc, p) => ({
                ...acc,
                [p]: {
                    ...this.categories.reduce((cat, c) => ({ ...cat, [c]: null }), {} as Record<string, number | null>),
                    Bonus: null,
                },
            }), {} as Record<string, Record<string, number | null>>),
            currentPlayerTurn: this.players[0] || '',
            gameOver: false,
            gameWinner: '',
            hasRolledThisTurn: false,
            roundsPlayed: this.players.reduce((acc, p) => ({ ...acc, [p]: 0 }), {} as Record<string, number>),
            roundsPerPlayer,
        };
        const difficulty = (gameData.gameConfig?.botDifficulty as any) || 'medium';
        this.turnTimeoutMs = Number(gameData.gameConfig?.turnTimeoutMs || 30000);
        this.bot = new YatzyBot(difficulty);
        this.resetTurnTimer();
    }

    private resetTurnTimer() {
        if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
        if (this.state.gameOver) return;
        this.turnTimeoutHandle = setTimeout(async () => {
            if (this.state.gameOver) return;
            const leaver = this.state.currentPlayerTurn;
            const winner = this.players.find(p => p !== leaver) || '';
            this.state.gameOver = true;
            this.state.gameWinner = winner;
            this.players.forEach((player) => {
                this.gameHelper!.sendMessageToClient(player, {
                    type: PacketType.GAME_OVER,
                    winner: this.state.gameWinner,
                });
            });
            await this.gameHelper!.finishGame(this.state.gameWinner);
        }, this.turnTimeoutMs);
    }

    private rollDice(): number[] {
        return this.state.lockedDice.map((locked, i) =>
            locked ? this.state.dice[i] : Math.floor(Math.random() * 6) + 1
        );
    }

    private calculateScore(dice: number[], category: string): number {
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

    private isGameOver(): boolean {
        // End by rounds per player
        const maxRoundsReached = Object.values(this.state.roundsPlayed).some(r => r >= this.state.roundsPerPlayer);
        if (maxRoundsReached) {
            // winner by total
            const scores = Object.entries(this.state.scores).map(([player, scores]) => ({
                player,
                total: Object.values(scores).reduce((sum, score) => sum + (score || 0), 0)
            }));
            const maxScore = Math.max(...scores.map(s => s.total));
            const winners = scores.filter(s => s.total === maxScore);
            this.state.gameWinner = winners.length === 1 ? winners[0].player : '';
            return true;
        }
        // End by all categories filled
        const allCategoriesFilled = Object.values(this.state.scores).every(playerScores =>
            Object.values(playerScores).every(score => score !== null)
        );
        if (allCategoriesFilled) {
            const scores = Object.entries(this.state.scores).map(([player, scores]) => ({
                player,
                total: Object.values(scores).reduce((sum, score) => sum + (score || 0), 0)
            }));
            const maxScore = Math.max(...scores.map(s => s.total));
            const winners = scores.filter(s => s.total === maxScore);
            this.state.gameWinner = winners.length === 1 ? winners[0].player : '';
            return true;
        }
        return false;
    }

    private async runBotTurn(botId: string): Promise<void> {
        if (!this.bot) this.bot = new YatzyBot();
        while (!this.state.gameOver && this.state.currentPlayerTurn === botId) {
            if (this.state.rollsLeft > 0) {
                if (!this.state.hasRolledThisTurn) {
                    await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'roll' });
                } else {
                    const upperScore = this.getUpperScore(botId);
                    const dummyScorecard = new Array(15).fill(false);
                    const keepers = await this.bot.botDecideKeepers(this.state.dice, this.state.rollsLeft, dummyScorecard, upperScore);
                    const desiredLocks = this.buildDesiredLocks(keepers, this.state.dice);
                    const toggleIndices: number[] = [];
                    desiredLocks.forEach((wantLocked, idx) => {
                        if (wantLocked !== this.state.lockedDice[idx]) toggleIndices.push(idx);
                    });
                    if (toggleIndices.length > 0) {
                        await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'lock', diceIndices: toggleIndices });
                    }
                    await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'roll' });
                }
            } else {
                const availableCategories = this.categories.filter(cat => this.state.scores[botId][cat] === null);
                if (availableCategories.length === 0) return;
                const upper = this.getUpperScore(botId);
                const bestCategory = await this.bot.botChooseCategoryByNames(this.state.dice, this.state.scores[botId], upper);
                await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'score', category: bestCategory });
            }
        }
    }

    private buildDesiredLocks(keepers: number[], diceValues: number[]): boolean[] {
        const countToKeep: Record<number, number> = {};
        keepers.forEach(v => countToKeep[v] = (countToKeep[v] || 0) + 1);
        return diceValues.map(v => {
            const remaining = countToKeep[v] || 0;
            if (remaining > 0) {
                countToKeep[v] = remaining - 1;
                return true;
            }
            return false;
        });
    }

    private getUpperScore(userId: string): number {
        const upperCats = ['Ones','Twos','Threes','Fours','Fives','Sixes'];
        return upperCats.reduce((sum, c) => sum + (this.state.scores[userId][c] || 0), 0);
    }

    async onMessageFromClient(userId: string, data: any) {
        if (userId !== this.state.currentPlayerTurn || this.state.gameOver) {
            return;
        }
        if (data.type !== PacketType.MOVE) {
            return;
        }

        let validMove = false;
        if (data.action === 'roll' && this.state.rollsLeft > 0) {
            this.state.dice = this.rollDice();
            this.state.rollsLeft--;
            this.state.hasRolledThisTurn = true;
            validMove = true;
        } else if (data.action === 'lock' && data.diceIndices) {
            if (!this.state.hasRolledThisTurn) {
                validMove = false;
            } else {
                data.diceIndices.forEach((i: number) => {
                    if (i >= 0 && i < 5) this.state.lockedDice[i] = !this.state.lockedDice[i];
                });
                validMove = true;
            }
        } else if (data.action === 'score' && data.category && this.state.scores[userId][data.category] === null) {
            if (!this.state.hasRolledThisTurn) {
                validMove = false;
            } else {
                this.state.scores[userId][data.category] = this.calculateScore(this.state.dice, data.category);
                const upper = this.getUpperScore(userId);
                if ((this.state.scores[userId]['Bonus'] == null) && upper >= 63) {
                    this.state.scores[userId]['Bonus'] = 35;
                }
                // increment rounds for this player
                this.state.roundsPlayed[userId] = (this.state.roundsPlayed[userId] || 0) + 1;
                this.state.rollsLeft = 3;
                this.state.lockedDice = [false, false, false, false, false];
                this.state.hasRolledThisTurn = false;
                this.state.currentPlayerTurn = this.getNextElement(this.players, userId);
                validMove = true;
                this.state.gameOver = this.isGameOver();
            }
        }

        if (validMove) {
            this.resetTurnTimer();
            this.players.forEach((player) => {
                this.gameHelper!.sendMessageToClient(player, {
                    type: PacketType.CHANGE_TURN,
                    dice: this.state.dice,
                    rollsLeft: this.state.rollsLeft,
                    lockedDice: this.state.lockedDice,
                    scores: this.state.scores,
                    currentPlayerTurn: this.state.currentPlayerTurn,
                    hasRolledThisTurn: this.state.hasRolledThisTurn,
                });
            });

            if (this.state.gameOver) {
                if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
                this.players.forEach((player) => {
                    this.gameHelper!.sendMessageToClient(player, {
                        type: PacketType.GAME_OVER,
                        winner: this.state.gameWinner,
                    });
                });
                await this.gameHelper!.finishGame(this.state.gameWinner);
            }

            const nextPlayer = this.players.find(p => p === this.state.currentPlayerTurn);
            if (nextPlayer && this.state.currentPlayerTurn.includes('bot')) {
                await this.runBotTurn(this.state.currentPlayerTurn);
            }
        }
    }    

    async onInitialGameStateSent() {}

    async getInitialGameState() {
        return {
            dice: this.state.dice,
            rollsLeft: this.state.rollsLeft,
            lockedDice: this.state.lockedDice,
            scores: this.state.scores,
            currentPlayerTurn: this.state.currentPlayerTurn,
            hasRolledThisTurn: this.state.hasRolledThisTurn,
        };
    }

    async getCurrentGameState(userId: string) {
        return {
            dice: this.state.dice,
            rollsLeft: this.state.rollsLeft,
            lockedDice: this.state.lockedDice,
            scores: this.state.scores,
            currentPlayerTurn: this.state.currentPlayerTurn,
            gameOver: this.state.gameOver,
            hasRolledThisTurn: this.state.hasRolledThisTurn,
        };
    }

    async getPlayerScore(userId: string): Promise<number> {
        const playerScores = this.state.scores[userId];
        return Object.values(playerScores).reduce((sum, score) => sum + (score || 0), 0);
    }

    async onGameTimeOver(userId: string) {
        if (this.state.gameOver) return;
        // Treat as leave
        await this.onPlayerLeave(userId);
    }

    async onPlayerLeave(userId: string) {
        if (this.state.gameOver) return;
        this.players = this.players.filter((player) => player !== userId);
        if (this.players.length <= 1) {
            const winner = this.players[0] || '';
            this.state.gameOver = true;
            this.state.gameWinner = winner;
            if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
            this.players.forEach((player) => {
                this.gameHelper!.sendMessageToClient(player, {
                    type: PacketType.GAME_OVER,
                    winner: this.state.gameWinner,
                });
            });
            await this.gameHelper!.finishGame(this.state.gameWinner);
            return;
        }
        if (this.state.currentPlayerTurn === userId) {
            this.state.currentPlayerTurn = this.players[0] || '';
        }
        this.resetTurnTimer();
    }

    private getNextElement(array: string[], currentElement: string): string {
        if (!Array.isArray(array) || array.length === 0) {
            console.error('Массив должен быть непустым');
            return '';
        }
        const index = array.indexOf(currentElement);
        if (index === -1) {
            console.error(`Элемент "${currentElement}" не найден в массиве`);
            return array[0];
        }
        const nextIndex = (index + 1) % array.length;
        return array[nextIndex];
    }
}
