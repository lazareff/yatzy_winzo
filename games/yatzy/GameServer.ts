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
    };
    private players: string[] = [];
    private gameHelper: GameHelper | null = null;
    private categories: string[] = [
        'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
        'ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance', 'Yatzy'
    ];
    private bot: YatzyBot | null = null;
    async initialise(gameHelper: GameHelper, gameData: GameData) {
        this.gameHelper = gameHelper;
        this.players = gameData.joinedPlayers;
        this.state = {
            dice: [1, 1, 1, 1, 1],
            rollsLeft: 3,
            lockedDice: [false, false, false, false, false],
            scores: this.players.reduce((acc, p) => ({
                ...acc,
                [p]: this.categories.reduce((cat, c) => ({ ...cat, [c]: null }), {})
            }), {}),
            currentPlayerTurn: this.players[0] || '',
            gameOver: false,
            gameWinner: '',
            hasRolledThisTurn: false,
        };
        const difficulty = (gameData.gameConfig?.botDifficulty as any) || 'medium';
        this.bot = new YatzyBot(difficulty);
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

    private botMove(playerId: string): { type: number; action: string; diceIndices?: number[]; category?: string } | null {
        if (this.state.rollsLeft > 0) {
            return { type: PacketType.MOVE, action: 'roll' };
        }
        const availableCategories = this.categories.filter(
            cat => this.state.scores[playerId][cat] === null
        );
        if (availableCategories.length === 0) return null;
        const bestCategory = availableCategories.reduce((best, cat) => {
            const score = this.calculateScore(this.state.dice, cat);
            return score > this.calculateScore(this.state.dice, best) ? cat : best;
        }, availableCategories[0]);
        return { type: PacketType.MOVE, action: 'score', category: bestCategory };
    }

    private async runBotTurn(botId: string): Promise<void> {
        if (!this.bot) this.bot = new YatzyBot();
        // Play until bot finishes the turn (scores a category) or game is over
        while (!this.state.gameOver && this.state.currentPlayerTurn === botId) {
            if (this.state.rollsLeft > 0) {
                // First action in a turn: roll without locking
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
                const bestCategory = availableCategories.reduce((best, cat) => {
                    return this.calculateScore(this.state.dice, cat) > this.calculateScore(this.state.dice, best) ? cat : best;
                }, availableCategories[0]);
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
            // Disallow locking before first roll in the turn
            if (!this.state.hasRolledThisTurn) {
                validMove = false;
            } else {
                data.diceIndices.forEach((i: number) => {
                    if (i >= 0 && i < 5) this.state.lockedDice[i] = !this.state.lockedDice[i];
                });
                validMove = true;
            }
        } else if (data.action === 'score' && data.category && this.state.scores[userId][data.category] === null) {
            // Require at least one roll in the current turn before scoring
            if (!this.state.hasRolledThisTurn) {
                validMove = false;
            } else {
                this.state.scores[userId][data.category] = this.calculateScore(this.state.dice, data.category);
                this.state.rollsLeft = 3;
                this.state.lockedDice = [false, false, false, false, false];
                // keep current dice values; UI handles blanking before first roll
                this.state.hasRolledThisTurn = false;
                this.state.currentPlayerTurn = this.getNextElement(this.players, userId);
                validMove = true;
                this.state.gameOver = this.isGameOver();
            }
        }

        if (validMove) {
            this.players.forEach((player) => {
                this.gameHelper!.sendMessageToClient(player, {
                    type: PacketType.CHANGE_TURN,
                    dice: this.state.dice,
                    rollsLeft: this.state.rollsLeft,
                    lockedDice: this.state.lockedDice,
                    scores: this.state.scores,
                    currentPlayerTurn: this.state.currentPlayerTurn,
                });
            });

            if (this.state.gameOver) {
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
        };
    }

    async getPlayerScore(userId: string): Promise<number> {
        const playerScores = this.state.scores[userId];
        return Object.values(playerScores).reduce((sum, score) => sum + (score || 0), 0);
    }

    async onGameTimeOver(userId: string) {
        throw new Error('Method not implemented since this is not a time based game.');
    }

    async onPlayerLeave(userId: string) {
        this.players = this.players.filter((player) => player !== userId);
        this.state.currentPlayerTurn = this.players[0] || '';
        if (this.players.length === 0) {
            this.state.gameOver = true;
            this.state.gameWinner = '';
        }
    }

    private getNextElement(array: string[], currentElement: string): string {
        if (!Array.isArray(array) || array.length === 0) {
            console.error('Массив должен быть непустым');
            return '';
        }
        const index = array.indexOf(currentElement);
        if (index === -1) {
            console.error(`Элемент "${currentElement}" не найден в массиве`);
            return '';
        }
        const nextIndex = (index + 1) % array.length;
        return array[nextIndex];
    }
}
