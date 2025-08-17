import { IGameSound } from './common';

type WebGameHelper = {
    /* Send client packets to the server */
    sendMessageToServer: (data: any) => void;

    /* Send analytics events for creating product funnel */
    sendAnalytics: (eventName: string) => void;

    /* Send logs for debugging */
    sendLog: (log: string) => void;

    /* To make a player leave the game */
    leaveGame: () => void;

    soundHelper: {
        /* Load an audio clip */
        loadAudio: (sound: string, loop?: boolean, volume?: number) => IGameSound;
        /* Play the already loaded audio clip */
        playAudio: (sound: IGameSound, volume?: number) => void;
    };

    /* Vibrate the device */
    vibrate: (pattern: number[]) => void;

    /* End game and submit the final score of the user */
    submitScore: (score: number) => void;

    /* Forcefully resync the game state from server */
    fetchServerGameState: () => void;
};

export default WebGameHelper;
