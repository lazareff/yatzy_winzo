import { GameData } from '../../core/utils/common';
import { GameHelper } from '../../core/utils/GameServerHelper';
import IGameServer from '../../core/utils/IGameServer';
import { PacketType } from './enums';
import YatzyBot from './IBot';

export default class GameServer implements IGameServer {
    private mode: 'sync' | 'async' = 'sync';
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
        pendingJoker: { playerId: string; diceValue: number } | null;
        playersState: Record<string, {
            dice: number[];
            rollsLeft: number;
            lockedDice: boolean[];
            hasRolledThisTurn: boolean;
            pendingJoker: { diceValue: number } | null;
        }>;
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
            dice: [1, 1, 1, 1, 1],
            rollsLeft: 3,
            lockedDice: [false, false, false, false, false],
            scores: this.players.reduce((acc, p) => ({
                ...acc,
                [p]: {
                    ...this.categories.reduce((cat, c) => ({ ...cat, [c]: null }), {} as Record<string, number | null>),
                    Bonus: null,
                    YatzyBonus: null,
                },
            }), {} as Record<string, Record<string, number | null>>),
            currentPlayerTurn: this.players[0] || '',
            gameOver: false,
            gameWinner: '',
            hasRolledThisTurn: false,
            roundsPlayed: this.players.reduce((acc, p) => ({ ...acc, [p]: 0 }), {} as Record<string, number>),
            roundsPerPlayer,
            pendingJoker: null,
            playersState: this.players.reduce((acc, p) => ({
                ...acc,
                [p]: {
                    dice: [1,1,1,1,1],
                    rollsLeft: 3,
                    lockedDice: [false,false,false,false,false],
                    hasRolledThisTurn: false,
                    pendingJoker: null,
                }
            }), {} as Record<string, { dice: number[]; rollsLeft: number; lockedDice: boolean[]; hasRolledThisTurn: boolean; pendingJoker: { diceValue: number } | null }>)
        };
        const difficulty = (gameData.gameConfig?.botDifficulty as any) || 'medium';
        this.turnTimeoutMs = Number(gameData.gameConfig?.turnTimeoutMs || 30000);
        this.bot = new YatzyBot(difficulty);
        if (this.mode === 'sync') {
            this.resetTurnTimer();
        }
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
    private rollDiceForPlayer(userId: string): number[] {
        const ps = this.state.playersState[userId];
        return ps.lockedDice.map((locked, i) => locked ? ps.dice[i] : Math.floor(Math.random() * 6) + 1);
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

    private async runBotTurn(botId: string): Promise<void> {
        if (!this.bot) this.bot = new YatzyBot();
        if (this.mode === 'async') {
            // In async mode, delegate to round runner
            await this.runBotRound(botId);
            return;
        }
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
                // Handle joker if pending
                if (this.state.pendingJoker?.playerId === botId) {
                    const options = this.getJokerOptions(botId);
                    if (options.length > 0) {
                        const choice = options[0]; // Bot picks first available
                        await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'joker', category: choice });
                        return;
                    }
                }
                const availableCategories = this.categories.filter(cat => this.state.scores[botId][cat] === null);
                if (availableCategories.length === 0) return;
                const upper = this.getUpperScore(botId);
                const bestCategory = await this.bot.botChooseCategoryByNames(this.state.dice, this.state.scores[botId], upper);
                await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'score', category: bestCategory });
            }
        }
    }
    private async runBotRound(botId: string): Promise<void> {
        const ps = this.state.playersState[botId];
        if (!this.bot) this.bot = new YatzyBot();
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
        const upper = this.getUpperScore(botId);
        const bestCategory = await this.bot.botChooseCategoryByNames(ps.dice, this.state.scores[botId], upper);
        await this.onMessageFromClient(botId, { type: PacketType.MOVE, action: 'score', category: bestCategory });
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
        if (this.state.gameOver) return;
        if (data.type !== PacketType.MOVE) return;

        if (this.mode === 'sync') {
            if (userId !== this.state.currentPlayerTurn) return;
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
            } else if (data.action === 'joker' && data.category && this.state.pendingJoker?.playerId === userId) {
                const options = this.getJokerOptions(userId);
                if (options.includes(data.category)) {
                    const lower = ['ThreeOfAKind', 'FourOfAKind', 'FullHouse', 'SmallStraight', 'LargeStraight', 'Chance'];
                    if (lower.includes(data.category)) this.state.scores[userId][data.category] = this.calculateScore(this.state.dice, data.category);
                    else this.state.scores[userId][data.category] = 0;
                    this.state.pendingJoker = null;
                    this.state.roundsPlayed[userId] = (this.state.roundsPlayed[userId] || 0) + 1;
                    this.state.rollsLeft = 3;
                    this.state.lockedDice = [false, false, false, false, false];
                    this.state.hasRolledThisTurn = false;
                    this.state.currentPlayerTurn = this.getNextElement(this.players, userId);
                    validMove = true;
                    this.state.gameOver = this.isGameOver();
                }
            } else if (data.action === 'score' && data.category && this.state.scores[userId][data.category] === null) {
                if (!this.state.hasRolledThisTurn) validMove = false; else {
                    const bonusResult = this.handleYatzyBonus(userId, this.state.dice);
                    if (bonusResult.needsJokerChoice) {
                        this.state.pendingJoker = { playerId: userId, diceValue: this.state.dice[0] };
                        const options = this.getJokerOptions(userId);
                        this.gameHelper!.sendMessageToClient(userId, { type: 'JOKER_CHOICE', options, diceValue: this.state.dice[0] });
                        return;
                    }
                    this.state.scores[userId][data.category] = this.calculateScore(this.state.dice, data.category);
                    const upper = this.getUpperScore(userId);
                    if ((this.state.scores[userId]['Bonus'] == null) && upper >= 63) this.state.scores[userId]['Bonus'] = 35;
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
                        pendingJoker: this.state.pendingJoker,
                    });
                });
                if (this.state.gameOver) {
                    if (this.turnTimeoutHandle) clearTimeout(this.turnTimeoutHandle);
                    this.players.forEach((player) => {
                        this.gameHelper!.sendMessageToClient(player, { type: PacketType.GAME_OVER, winner: this.state.gameWinner });
                    });
                    await this.gameHelper!.finishGame(this.state.gameWinner);
                }
                const nextPlayer = this.players.find(p => p === this.state.currentPlayerTurn);
                if (nextPlayer && this.state.currentPlayerTurn.includes('bot')) await this.runBotTurn(this.state.currentPlayerTurn);
            }
            return;
        }

        // async mode
        const ps = this.state.playersState[userId];
        if (!ps) return;
        let valid = false;
        if (data.action === 'roll' && ps.rollsLeft > 0) {
            ps.dice = this.rollDiceForPlayer(userId);
            ps.rollsLeft--;
            ps.hasRolledThisTurn = true;
            valid = true;
        } else if (data.action === 'lock' && data.diceIndices) {
            if (!ps.hasRolledThisTurn) valid = false; else {
                data.diceIndices.forEach((i: number) => { if (i >= 0 && i < 5) ps.lockedDice[i] = !ps.lockedDice[i]; });
                valid = true;
            }
        } else if (data.action === 'score' && data.category && this.state.scores[userId][data.category] === null) {
            if (!ps.hasRolledThisTurn) valid = false; else {
                const score = this.calculateScore(ps.dice, data.category);
                this.state.scores[userId][data.category] = score;
                const upper = this.getUpperScore(userId);
                if ((this.state.scores[userId]['Bonus'] == null) && upper >= 63) this.state.scores[userId]['Bonus'] = 35;
                this.state.roundsPlayed[userId] = (this.state.roundsPlayed[userId] || 0) + 1;
                ps.rollsLeft = 3;
                ps.lockedDice = [false,false,false,false,false];
                ps.hasRolledThisTurn = false;
                valid = true;
                this.state.gameOver = this.isGameOver();
            }
        }
        if (valid) {
            // personalize update per player
            this.players.forEach((pid) => {
                const p = this.state.playersState[pid];
                this.gameHelper!.sendMessageToClient(pid, {
                    type: PacketType.CHANGE_TURN,
                    dice: p.dice,
                    rollsLeft: p.rollsLeft,
                    lockedDice: p.lockedDice,
                    scores: this.state.scores,
                    currentPlayerTurn: pid, // always allow local actions
                    hasRolledThisTurn: p.hasRolledThisTurn,
                    pendingJoker: p.pendingJoker,
                });
            });
            if (this.state.gameOver) {
                this.players.forEach((player) => this.gameHelper!.sendMessageToClient(player, { type: PacketType.GAME_OVER, winner: this.state.gameWinner }));
                await this.gameHelper!.finishGame(this.state.gameWinner);
            }
            if (userId.includes('bot')) return;
            const botId = this.players.find(p => p.includes('bot'));
            if (botId) await this.runBotRound(botId);
        }
    }

    async onInitialGameStateSent() {}

    async getInitialGameState(userId: string) {
        if (this.mode === 'sync') {
            return {
                dice: this.state.dice,
                rollsLeft: this.state.rollsLeft,
                lockedDice: this.state.lockedDice,
                scores: this.state.scores,
                currentPlayerTurn: this.state.currentPlayerTurn,
                hasRolledThisTurn: this.state.hasRolledThisTurn,
                pendingJoker: this.state.pendingJoker,
            };
        }
        const ps = this.state.playersState[userId];
        return {
            dice: ps?.dice || [1,1,1,1,1],
            rollsLeft: ps?.rollsLeft ?? 3,
            lockedDice: ps?.lockedDice || [false,false,false,false,false],
            scores: this.state.scores,
            currentPlayerTurn: userId,
            hasRolledThisTurn: ps?.hasRolledThisTurn ?? false,
            pendingJoker: ps?.pendingJoker || null,
        };
    }

    async getCurrentGameState(userId: string) {
        if (this.mode === 'sync') {
            return {
                dice: this.state.dice,
                rollsLeft: this.state.rollsLeft,
                lockedDice: this.state.lockedDice,
                scores: this.state.scores,
                currentPlayerTurn: this.state.currentPlayerTurn,
                gameOver: this.state.gameOver,
                hasRolledThisTurn: this.state.hasRolledThisTurn,
                pendingJoker: this.state.pendingJoker,
            };
        }
        const ps = this.state.playersState[userId];
        return {
            dice: ps?.dice || [1,1,1,1,1],
            rollsLeft: ps?.rollsLeft ?? 3,
            lockedDice: ps?.lockedDice || [false,false,false,false,false],
            scores: this.state.scores,
            currentPlayerTurn: userId,
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
        if (this.mode === 'sync') {
            if (this.state.currentPlayerTurn === userId) {
                this.state.currentPlayerTurn = this.players[0] || '';
            }
            this.resetTurnTimer();
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
            return array[0];
        }
        const nextIndex = (index + 1) % array.length;
        return array[nextIndex];
    }
}
