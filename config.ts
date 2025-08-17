import { IGameData } from './core/utils/common';

enum Games {
    Yatzy,
}

export const gamesData: { [key: number]: IGameData } = {
    [Games.Yatzy]: {
        name: 'yatzy',
        config: {
            country: 'IN',
            language: 'en',
            currency: '₹',
            totalWinnings: 100,
            menus: ['sound', 'vibration', 'quitGame'],
            noOfPlayers: 2,
            botDifficulty: 'medium'
        },
        playersData: {
            currentPlayerInfo: {
                uid: '1',
                name: 'Player 1',
                profilePic: 'player1.png',
            },
            opponentPlayersInfo: [
                {
                    uid: '2',
                    name: 'Player 2',
                    profilePic: 'player2.png',
                },
            ],
        },
    },
};

export const gameToRun = Games.Yatzy;
