import { GameData } from '../../core/utils/common';
import { GameHelper } from '../../core/utils/GameServerHelper';
import IGameServer from '../../core/utils/IGameServer';
import { PacketType } from './enums';
import YatzyBot from './IBot';

export default class GameServer implements IGameServer {
    private mode: 'sync' | 'async' = 'sync';
    private state: {
        // Global scoreboard by player
        scores: Record<string, Record<string, number | null>>;
        // Per-player async state
        playersState: Record<string, {
            dice: number[];
            rollsLeft: number;
            lockedDice: boolean[];
            hasRolledThisTurn: boolean;
            pendingJoker: { diceValue: number } | null;
        }>;
        gameOver: boolean;
        gameWinner: string;
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
        this.mode = (gameData.gameConfig?.mode === 'async') ? 'async' : 'sync';
        const roundsPerPlayer = Number(gameData.gameConfig?.roundsPerPlayer || 13);
        this.state = {
            scores: this.players.reduce((acc, p) => ({
                ...acc,
                [p]: {
                    ...this.categories.reduce((cat, c) => ({ ...cat, [c]: null }), {} as Record<string, number | null>),
                    Bonus: null,
                    YatzyBonus: null,
                },
            }), {} as Record<string, Record<string, number | null>>),
            playersState: this.players.reduce((acc, p) => ({
                ...acc,
                [p]: {
                    dice: [1, 1, 1, 1, 1],
                    rollsLeft: 3,
                    lockedDice: [false, false, false, false, false],
                    hasRolledThisTurn: false,
                    pendingJoker: null,
                },
            }), {} as Record<string, { dice: number[]; rollsLeft: number; lockedDice: boolean[]; hasRolledThisTurn: boolean; pendingJoker: { diceValue: number } | null }>),
            gameOver: false,
            gameWinner: '',
            roundsPlayed: this.players.reduce((acc, p) => ({ ...acc, [p]: 0 }), {} as Record<string, number>),
            roundsPerPlayer,
        };
        const difficulty = (gameData.gameConfig?.botDifficulty as any) || 'medium';
        this.turnTimeoutMs = Number(gameData.gameConfig?.turnTimeoutMs || 30000);
        this.bot = new YatzyBot(difficulty);
        if (this.mode === 'async') {
            // If there is a bot, start its first round automatically
            const botId = this.players.find(p => p.includes('bot'));
            if (botId) {
                setTimeout(() => this.runBotRound(botId).catch(() => {}), 200);
            }
        } else {
            // sync mode fallback: initialize a shared turn to first player, legacy timers
            this.legacyInitTurn();
        }
    }

    private resetTurnTimer() {}

    // --- Legacy sync-mode helpers (minimal for compatibility) ---
    private legacy: any = { currentPlayerTurn: '' };
    private legacyInitTurn() {
        this.legacy.currentPlayerTurn = this.players[0] || '';
        if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
        this.turnTimeoutHandle = setTimeout(async () => {
            const leaver = this.legacy.currentPlayerTurn;
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

    private rollDiceForPlayer(userId: string): number[] {
        const ps = this.state.playersState[userId];
        return ps.lockedDice.map((locked, i) =>
            locked ? ps.dice[i] : Math.floor(Math.random() * 6) + 1
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

    private isYatzy(dice: number[]): boolean {
        return dice.every(d => d === dice[0]);
    }

    private getUpperCategoryForValue(value: number): string {
        const map = { 1: 'Ones', 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes' };
        return map[value] || '';
    }

    private handleYatzyBonus(userId: string, dice: number[]): { handled: boolean; needsJokerChoice: boolean } {
        if (!this.isYatzy(dice)) return { handled: false, needsJokerChoice: false };
        if (this.state.scores[userId]['Yatzy'] !== 50) return { handled: false, needsJokerChoice: false };
        
        // Award +100 bonus
        const currentBonus = this.state.scores[userId]['YatzyBonus'] || 0;
        this.state.scores[userId]['YatzyBonus'] = currentBonus + 100;
        
        // Joker logic: try to fill upper category for dice value
        const diceValue = dice[0];
        const upperCat = this.getUpperCategoryForValue(diceValue);
        if (upperCat && this.state.scores[userId][upperCat] == null) {
            this.state.scores[userId][upperCat] = diceValue * 5;
            return { handled: true, needsJokerChoice: false };
        }
        
        // Upper is filled, need to choose from lower or zero upper
        return { handled: false, needsJokerChoice: true };
    }

    private getJokerOptions(userId: string): string[] {
        const lower = ['ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance'];
        const upper = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'];
        const openLower = lower.filter(cat => this.state.scores[userId][cat] == null);
        if (openLower.length > 0) return openLower;
        return upper.filter(cat => this.state.scores[userId][cat] == null);
    }

    private isGameOver(): boolean {
        // End by rounds per player
        const allRoundsReached = Object.values(this.state.roundsPlayed).every(r => r >= this.state.roundsPerPlayer);
        if (allRoundsReached) {
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

    private async runBotRound(botId: string): Promise<void> {
        if (!this.bot) this.bot = new YatzyBot();
        const ps = this.state.playersState[botId];
        if (!ps) return;
        while (!this.state.gameOver && ps.rollsLeft > 0) {
            if (!ps.hasRolledThisTurn) {
                await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'roll' });
            } else {
                const upperScore = this.getUpperScore(botId);
                const dummyScorecard = new Array(15).fill(false);
                const keepers = await this.bot.botDecideKeepers(ps.dice, ps.rollsLeft, dummyScorecard, upperScore);
                const desiredLocks = this.buildDesiredLocks(keepers, ps.dice);
                const toggleIndices: number[] = [];
                desiredLocks.forEach((wantLocked, idx) => {
                    if (wantLocked !== ps.lockedDice[idx]) toggleIndices.push(idx);
                });
                if (toggleIndices.length > 0) {
                    await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'lock', diceIndices: toggleIndices });
                }
                await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'roll' });
            }
        }
        if (this.state.gameOver) return;
        if (ps.pendingJoker) {
            const options = this.getJokerOptions(botId);
            if (options.length > 0) {
                const choice = options[0];
                await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'joker', category: choice });
                return;
            }
        }
        const upper = this.getUpperScore(botId);
        const bestCategory = await this.bot.botChooseCategoryByNames(ps.dice, this.state.scores[botId], upper);
        await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'score', category: bestCategory });
        // If still not game over, queue next round soon
        if (!this.state.gameOver && this.state.roundsPlayed[botId] < this.state.roundsPerPlayer) {
            setTimeout(() => this.runBotRound(botId).catch(() => {}), 400);
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
        if (this.state.gameOver) {
            return;
        }
        if (data.type !== PacketType.MOVE) {
            return;
        }

        let validMove = false;
        const ps = this.state.playersState[userId];
        if (!ps) return;
        if (data.action === 'roll' && ps.rollsLeft > 0) {
            ps.dice = this.rollDiceForPlayer(userId);
            ps.rollsLeft--;
            ps.hasRolledThisTurn = true;
            validMove = true;
        } else if (data.action === 'lock' && data.diceIndices) {
            if (!ps.hasRolledThisTurn) {
                validMove = false;
            } else {
                data.diceIndices.forEach((i: number) => {
                    if (i >= 0 && i < 5) ps.lockedDice[i] = !ps.lockedDice[i];
                });
                validMove = true;
            }
        } else if (data.action === 'joker' && data.category && ps.pendingJoker) {
            // Handle joker choice
            const options = this.getJokerOptions(userId);
            if (options.includes(data.category)) {
                const lower = ['ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance'];
                if (lower.includes(data.category)) {
                    // Lower categories get full points for Yatzy joker
                    this.state.scores[userId][data.category] = this.calculateScore(ps.dice, data.category);
                } else {
                    // Upper categories get 0 (forced)
                    this.state.scores[userId][data.category] = 0;
                }
                ps.pendingJoker = null;
                this.state.roundsPlayed[userId] = (this.state.roundsPlayed[userId] || 0) + 1;
                ps.rollsLeft = 3;
                ps.lockedDice = [false, false, false, false, false];
                ps.hasRolledThisTurn = false;
                validMove = true;
                this.state.gameOver = this.isGameOver();
            }
        } else if (data.action === 'score' && data.category && this.state.scores[userId][data.category] === null) {
            if (!ps.hasRolledThisTurn) {
                validMove = false;
            } else {
                // Check for Yatzy bonus first
                const bonusResult = this.handleYatzyBonus(userId, ps.dice);
                if (bonusResult.needsJokerChoice) {
                    ps.pendingJoker = { diceValue: ps.dice[0] };
                    // Send joker options to client
                    const options = this.getJokerOptions(userId);
                    this.gameHelper!.sendMessageToClient(userId, {
                        type: 'JOKER_CHOICE',
                        options,
                        diceValue: ps.dice[0],
                    });
                    return;
                }
                
                this.state.scores[userId][data.category] = this.calculateScore(ps.dice, data.category);
                const upper = this.getUpperScore(userId);
                if ((this.state.scores[userId]['Bonus'] == null) && upper >= 63) {
                    this.state.scores[userId]['Bonus'] = 35;
                }
                this.state.roundsPlayed[userId] = (this.state.roundsPlayed[userId] || 0) + 1;
                ps.rollsLeft = 3;
                ps.lockedDice = [false, false, false, false, false];
                ps.hasRolledThisTurn = false;
                validMove = true;
                this.state.gameOver = this.isGameOver();
            }
        }

        if (validMove) {
            this.players.forEach((player) => {
                const p = this.state.playersState[player];
                const payload: any = {
                    type: PacketType.CHANGE_TURN,
                    dice: p.dice,
                    rollsLeft: p.rollsLeft,
                    lockedDice: p.lockedDice,
                    scores: this.state.scores,
                    hasRolledThisTurn: p.hasRolledThisTurn,
                    pendingJoker: p.pendingJoker,
                };
                if (this.mode === 'sync') {
                    payload.currentPlayerTurn = this.legacy.currentPlayerTurn;
                }
                this.gameHelper!.sendMessageToClient(player, payload);
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
            if (this.mode === 'async') {
                // If a bot exists and it was this bot's action, continue its round
                const botId = userId.includes('bot') ? userId : this.players.find(p => p.includes('bot'));
                if (botId) {
                    const psBot = this.state.playersState[botId];
                    if (psBot && !this.state.gameOver && (botId === userId || psBot.rollsLeft === 3)) {
                        setTimeout(() => this.runBotRound(botId).catch(() => {}), 200);
                    }
                }
            } else {
                // sync: rotate turn after scoring
                if (data.action === 'score' || data.action === 'joker') {
                    const idx = this.players.indexOf(this.legacy.currentPlayerTurn);
                    const nextIndex = (idx + 1) % this.players.length;
                    this.legacy.currentPlayerTurn = this.players[nextIndex];
                }
            }
        }
    }    

    async onInitialGameStateSent() {}

    async getInitialGameState(userId: string) {
        const ps = this.state.playersState[userId];
        return {
            dice: ps?.dice || [1,1,1,1,1],
            rollsLeft: ps?.rollsLeft ?? 3,
            lockedDice: ps?.lockedDice || [false,false,false,false,false],
            scores: this.state.scores,
            hasRolledThisTurn: ps?.hasRolledThisTurn ?? false,
            pendingJoker: ps?.pendingJoker || null,
        };
    }

    async getCurrentGameState(userId: string) {
        const ps = this.state.playersState[userId];
        return {
            dice: ps?.dice || [1,1,1,1,1],
            rollsLeft: ps?.rollsLeft ?? 3,
            lockedDice: ps?.lockedDice || [false,false,false,false,false],
            scores: this.state.scores,
            gameOver: this.state.gameOver,
            hasRolledThisTurn: ps?.hasRolledThisTurn ?? false,
            pendingJoker: ps?.pendingJoker || null,
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
        // No turn switching in async mode
    }

    private getNextElement(array: string[], currentElement: string): string { return currentElement; }
}
