import { GameData } from '../../core/utils/common';
import { GameHelper } from '../../core/utils/GameServerHelper';
import IGameServer from '../../core/utils/IGameServer';
import { PacketType } from './enums';

export default class GameServer implements IGameServer {
    private state: {
        dice: number[];
        rollsLeft: number;
        lockedDice: boolean[];
        scores: Record<string, Record<string, number | null>>;
        currentPlayerTurn: string;
        gameOver: boolean;
        gameWinner: string;
    };
    private players: string[] = [];
    private gameHelper: GameHelper | null = null;
    private categories: string[] = [
        'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
        'ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance', 'Yatzy'
    ];
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
        };
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
            validMove = true;
        } else if (data.action === 'lock' && data.diceIndices) {
            data.diceIndices.forEach((i: number) => {
                if (i >= 0 && i < 5) this.state.lockedDice[i] = !this.state.lockedDice[i];
            });
            validMove = true;
        } else if (data.action === 'score' && data.category && this.state.scores[userId][data.category] === null) {
            this.state.scores[userId][data.category] = this.calculateScore(this.state.dice, data.category);
            this.state.rollsLeft = 3;
            this.state.lockedDice = [false, false, false, false, false];
            this.state.dice = [1, 1, 1, 1, 1];
            this.state.currentPlayerTurn = this.getNextElement(this.players, userId);
            validMove = true;
            this.state.gameOver = this.isGameOver();
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
            if (nextPlayer && this.players.some(p => p.includes('bot')) && this.state.currentPlayerTurn.includes('bot')) {
                const botMove = this.botMove(this.state.currentPlayerTurn);
                if (botMove) {
                    await this.onMessageFromClient(this.state.currentPlayerTurn, botMove);
                }
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
