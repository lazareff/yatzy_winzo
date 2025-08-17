import { LOG_LEVEL } from './enums';
export type GameScene = Phaser.Scene;

export interface IGameSound {
    play: () => void;
    playing: () => boolean;
    volume: (volume: number) => void;
}

export interface IGameConfig extends Record<string, any> {
    country: string;
    language: string;
    currency: string;
    totalWinnings: number;
    menus: string[];
    botDifficulty?: 'easy' | 'medium' | 'hard';
    turnTimeoutMs?: number;
}

interface IPlayerInfo {
    uid: string;
    name: string;
    profilePic: string;
}

export interface IPlayersData {
    currentPlayerInfo: IPlayerInfo;
    opponentPlayersInfo: IPlayerInfo[];
}

export interface IGameData {
    name: string;
    config: IGameConfig;
    playersData: IPlayersData;
}

export type GameData = {
    joinedPlayers: string[];
    gameConfig: any;
};
