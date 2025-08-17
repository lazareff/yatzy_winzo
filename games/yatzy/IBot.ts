import { GameData } from '../../core/utils/common';
import { GameHelper } from '../../core/utils/GameServerHelper';
import IGameServer from '../../core/utils/IGameServer';
import { PacketType } from './enums';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export default class YatzyBot {
    private difficulty: BotDifficulty;

    constructor(difficulty: BotDifficulty = 'medium') {
        this.difficulty = difficulty;
    }

    // Вспомогательные функции

    // Подсчёт частот в dice (Map: value -> count)
    async getDiceFrequencies(dice: number[]): Promise<Map<number, number>> {
        const freq = new Map<number, number>();
        dice.forEach(val => freq.set(val, (freq.get(val) || 0) + 1));
        return freq;
    }

    // Оценка очков для категории (по индексу - совместимость со старым кодом)
    async calculateScoreForCategory(dice, category) {
        const sortedDice = [...dice].sort((a, b) => a - b);
        const freq = await this.getDiceFrequencies(dice);
        switch (category) {
            case 0:
                return freq.get(1) * 1 || 0; // Ones
            case 1:
                return freq.get(2) * 2 || 0; // Twos
            case 2:
                return freq.get(3) * 3 || 0; // Threes
            case 3:
                return freq.get(4) * 4 || 0; // Fours
            case 4:
                return freq.get(5) * 5 || 0; // Fives
            case 5:
                return freq.get(6) * 6 || 0; // Sixes
            case 6: { // One Pair
                let max = 0;
                freq.forEach((count, val) => {
                    if (count >= 2) max = Math.max(max, val * 2);
                });
                return max;
            }
            case 7: { // Two Pairs
                const pairs = [];
                freq.forEach((count, val) => {
                    if (count >= 2) pairs.push(val * 2);
                });
                return pairs.length >= 2 ? pairs.slice(-2).reduce((a, b) => a + b, 0) : 0;
            }
            case 8: { // Three of a Kind
                let max = 0;
                freq.forEach((count, val) => {
                    if (count >= 3) max = Math.max(max, val * 3);
                });
                return max;
            }
            case 9: { // Four of a Kind
                let max = 0;
                freq.forEach((count, val) => {
                    if (count >= 4) max = Math.max(max, val * 4);
                });
                return max;
            }
            case 10: { // Small Straight (1-5)
                return new Set(sortedDice).size === 5 && sortedDice[4] === 5 ? 15 : 0;
            }
            case 11: { // Large Straight (2-6)
                return new Set(sortedDice).size === 5 && sortedDice[4] === 6 ? 20 : 0;
            }
            case 12: { // Full House
                const hasThree = Array.from(freq.values()).includes(3);
                const hasTwo = Array.from(freq.values()).includes(2);
                return hasThree && hasTwo ? dice.reduce((a, b) => a + b, 0) : 0;
            }
            case 13:
                return dice.reduce((a, b) => a + b, 0); // Chance
            case 14:
                return freq.size === 1 ? 50 : 0; // Yahtzee
            default:
                return 0;
        }
    }

    // Подсчёт по строковому названию категории (совпадает с серверной логикой)
    async calculateScoreForCategoryByName(dice: number[], category: string): Promise<number> {
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

    // Эвристическая оценка EV для комбинации (упрощённо, на основе вероятностей и приоритетов)
    async estimateEVForKeep(keepDice, rollsLeft, openCategories, upperScore) {
        let ev = 0;
        const potential = keepDice.length / 5;
        ev += potential * 10;
        if (upperScore < 63) {
            ev += (63 - upperScore) / 10;
        }
        const freq = await this.getDiceFrequencies(keepDice);
        if (Math.max(0, ...freq.values()) >= 3) ev += 20 * rollsLeft;
        if (this.difficulty === 'easy') ev *= 0.8;
        if (this.difficulty === 'hard') ev *= 1.2;
        return ev;
    }

    // Основная функция: Решить, какие кубики держать
    async botDecideKeepers(dice, rollsLeft, scorecard, upperScore) {
        if (rollsLeft === 0) return [];

        const openCategories = scorecard.map((filled, idx) => !filled ? idx : null).filter(idx => idx !== null);
        const freq = await this.getDiceFrequencies(dice);

        const candidates = [];
        candidates.push({keep: dice, ev: await this.estimateEVForKeep(dice, rollsLeft, openCategories, upperScore)});

        let maxVal = 0, maxCount = 0;
        freq.forEach((count, val) => {
            if (count > maxCount) {
                maxCount = count;
                maxVal = val;
            }
        });
        const keepGroup = dice.filter(v => v === maxVal);
        candidates.push({keep: keepGroup, ev: await this.estimateEVForKeep(keepGroup, rollsLeft, openCategories, upperScore)});

        const uniqueSorted = [...new Set([...dice].sort())];
        if (uniqueSorted.length >= 3) {
            candidates.push({keep: uniqueSorted, ev: await this.estimateEVForKeep(uniqueSorted, rollsLeft, openCategories, upperScore) + 15});
        }

        candidates.push({keep: [], ev: await this.estimateEVForKeep([], rollsLeft, openCategories, upperScore) - 5});

        candidates.sort((a, b) => b.ev - a.ev);

        if (this.difficulty === 'easy') {
            const idx = Math.min(1, candidates.length - 1);
            return candidates[idx].keep;
        }
        if (this.difficulty === 'hard') {
            return candidates[0].keep;
        }
        // medium: иногда ошибается
        return Math.random() < 0.2 && candidates[1] ? candidates[1].keep : candidates[0].keep;
    }

    // Основная функция: Выбрать категорию для записи (по именам категорий)
    async botChooseCategoryByNames(dice: number[], playerScores: Record<string, number | null>, upperScore: number): Promise<string> {
        const openCategories = Object.keys(playerScores).filter(cat => playerScores[cat] == null && cat !== 'Bonus');
        let bestCategory = openCategories[0] || '';
        let bestEV = -Infinity;
        for (const cat of openCategories) {
            const score = await this.calculateScoreForCategoryByName(dice, cat);
            let ev = score;
            if (['Ones','Twos','Threes','Fours','Fives','Sixes'].includes(cat)) {
                const newUpper = upperScore + score;
                if (newUpper >= 63 && upperScore < 63) ev += 35;
                else if (newUpper < 63) ev += (63 - newUpper) / 10;
            } else if (cat === 'Yatzy') {
                ev += 50;
            } else if (cat === 'Chance') {
                ev -= 5;
            }
            if (ev > bestEV) {
                bestEV = ev;
                bestCategory = cat;
            }
        }
        if (this.difficulty === 'easy' && openCategories.length > 1) {
            return Math.random() < 0.4 ? openCategories[Math.floor(Math.random() * openCategories.length)] : bestCategory;
        }
        if (this.difficulty === 'medium' && openCategories.length > 1) {
            return Math.random() < 0.2 ? openCategories[Math.floor(Math.random() * openCategories.length)] : bestCategory;
        }
        return bestCategory;
    }
}